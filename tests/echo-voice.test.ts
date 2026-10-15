import { describe, it, expect, vi, afterEach } from "vitest";
import { canListen, listen, speakableSentences } from "../app/(dashboard)/dashboard/echo/voice";

describe("speakableSentences", () => {
  it("splits a reply into sentences without list numbers or markup", () => {
    expect(
      speakableSentences("Open Availability.\n\n1. Pick a Date.\n2. Tick “Closed all day”, then press Add! Done?\n- **Remove** deletes one."),
    ).toEqual(["Open Availability.", "Pick a Date.", "Tick “Closed all day”, then press Add!", "Done?", "Remove deletes one."]);
  });

  it("drops lines with nothing to say", () => {
    expect(speakableSentences("Hi.\n\n---\n")).toEqual(["Hi."]);
  });
});

// A stand-in for the browser's speech recognition, driven by the test.
class FakeRecognition {
  static last: FakeRecognition;
  lang = "";
  interimResults = false;
  continuous = true;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  }
  hear(parts: [string, boolean][]) {
    this.onresult?.({ resultIndex: 0, results: parts.map(([t, isFinal]) => ({ isFinal, 0: { transcript: t } })) });
  }
}

describe("listen", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("isn't offered without browser speech recognition", () => {
    vi.stubGlobal("window", {});
    expect(canListen()).toBe(false);
    expect(listen({ onInterim() {}, onEnd() {}, onError() {} })).toBeNull();
  });

  it("shows words as they're heard and hands over the final text, in South African English", () => {
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    const interim: string[] = [];
    const onEnd = vi.fn();
    listen({ onInterim: (t) => interim.push(t), onEnd, onError() {} });
    const rec = FakeRecognition.last;
    expect(rec.started).toBe(true);
    expect(rec.lang).toBe("en-ZA");
    expect(rec.continuous).toBe(false);

    rec.hear([["how do I", false]]);
    rec.hear([["how do I close early", true]]);
    rec.stop();
    expect(interim).toEqual(["how do I", "how do I close early"]);
    expect(onEnd).toHaveBeenCalledWith("how do I close early");
  });

  it("sends nothing when aborted, and reports a blocked mic", () => {
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
    const onEnd = vi.fn();
    const onError = vi.fn();
    const listener = listen({ onInterim() {}, onEnd, onError })!;
    FakeRecognition.last.hear([["never mind", true]]);
    listener.abort();
    expect(onEnd).toHaveBeenCalledWith("");
    expect(onError).not.toHaveBeenCalled();

    listen({ onInterim() {}, onEnd, onError });
    FakeRecognition.last.onerror?.({ error: "not-allowed" });
    expect(onError).toHaveBeenCalledWith("blocked");
  });
});
