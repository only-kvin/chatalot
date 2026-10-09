import { describe, expect, it, vi } from "vitest";

// DNS is mocked, so these never touch the network.
vi.mock("node:dns", () => ({
  lookup: (host: string, _opts: unknown, cb: (err: Error | null, addrs?: { address: string; family: number }[]) => void) => {
    const table: Record<string, { address: string; family: number }[]> = {
      "public.example": [{ address: "93.184.216.34", family: 4 }],
      "inside.example": [{ address: "10.1.2.3", family: 4 }],
      "mixed.example": [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      "v6local.example": [{ address: "fd00::1", family: 6 }],
    };
    const addrs = table[host];
    if (!addrs) cb(new Error("ENOTFOUND"));
    else cb(null, addrs);
  },
}));

const { BlockedUrlError, checkUrl, guardedLookup, isBlockedIp, safeFetch } = await import("../lib/website/safe-fetch");

const UA = { userAgent: "test" };

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.4.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fd12::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ])("refuses %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
});

describe("checkUrl", () => {
  it.each([
    ["ftp://example.com/", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["http://example.com:8080/", "port"],
    ["https://example.com:22/", "port"],
    ["http://localhost/", "localhost"],
    ["http://127.0.0.1/", "loopback"],
    ["http://169.254.169.254/latest/meta-data", "metadata"],
    ["http://[::1]/", "ipv6 loopback"],
    ["http://user:pass@example.com/", "credentials"],
  ])("refuses %s (%s)", (url) => expect(() => checkUrl(url)).toThrow(BlockedUrlError));

  it("allows ordinary http and https URLs", () => {
    expect(checkUrl("https://example.co.za/about").hostname).toBe("example.co.za");
    expect(checkUrl("http://example.co.za:80/").hostname).toBe("example.co.za");
  });
});

describe("guardedLookup", () => {
  const lookup = (host: string) =>
    new Promise<string>((resolve, reject) =>
      guardedLookup(host, { family: 0 }, (err, address) => (err ? reject(err) : resolve(address as string))),
    );

  it("passes public answers through", async () => expect(await lookup("public.example")).toBe("93.184.216.34"));
  it("refuses a private answer", async () => expect(lookup("inside.example")).rejects.toThrow(BlockedUrlError));
  it("refuses when any answer is private", async () => expect(lookup("mixed.example")).rejects.toThrow(BlockedUrlError));
  it("refuses private IPv6", async () => expect(lookup("v6local.example")).rejects.toThrow(BlockedUrlError));
});

describe("safeFetch redirects", () => {
  const redirectTo = (location: string) => vi.fn(async () => ({ status: 302, contentType: "", location, body: "" }));

  it("refuses a redirect into a private address", async () => {
    await expect(safeFetch("https://public.example/", UA, redirectTo("http://169.254.169.254/latest/meta-data"))).rejects.toThrow(
      BlockedUrlError,
    );
    await expect(safeFetch("https://public.example/", UA, redirectTo("http://10.0.0.1/"))).rejects.toThrow(BlockedUrlError);
  });

  it("refuses a redirect to another scheme or port", async () => {
    await expect(safeFetch("https://public.example/", UA, redirectTo("ftp://public.example/"))).rejects.toThrow(BlockedUrlError);
    await expect(safeFetch("https://public.example/", UA, redirectTo("https://public.example:8443/"))).rejects.toThrow(BlockedUrlError);
  });

  it("stops after 5 redirects", async () => {
    const loop = redirectTo("https://public.example/again");
    await expect(safeFetch("https://public.example/", UA, loop)).rejects.toThrow(/Too many redirects/);
    expect(loop).toHaveBeenCalledTimes(6);
  });

  it("follows a safe redirect and reports where it landed", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ status: 301, contentType: "", location: "/new", body: "" })
      .mockResolvedValueOnce({ status: 200, contentType: "text/html", location: null, body: "<p>hi</p>" });
    const res = await safeFetch("https://public.example/old", UA, transport);
    expect(res).toMatchObject({ url: "https://public.example/new", status: 200, body: "<p>hi</p>" });
  });
});
