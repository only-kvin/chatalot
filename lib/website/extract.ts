import { parse, type HTMLElement, type Node } from "node-html-parser";

// Turns a page's HTML into the text the AI reads: the main content with its
// title and headings, as simple Markdown. Navigation, headers, footers,
// scripts and cookie banners are dropped. Links are collected from the whole
// page first (menus are how we find other pages).

export type ExtractedPage = { title: string; text: string; links: string[] };

const DROP = "script, style, noscript, template, svg, iframe, canvas, form, nav, header, footer, aside, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true]";
// Cookie and consent banners, by their usual ids and classes.
const BANNER = /(cookie|consent|gdpr|popia-notice)/i;
const BLOCK = new Set(["p", "div", "section", "article", "main", "li", "tr", "blockquote", "dd", "dt", "figcaption", "address", "td", "th", "pre"]);

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  // Script, style and noscript contents are dropped while parsing ("false"
  // means ignore). <pre> isn't listed, so it's parsed like any element and
  // code inside it comes out as text.
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false } });

  const links: string[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    try {
      links.push(new URL(a.getAttribute("href") ?? "", pageUrl).toString());
    } catch {
      // Not a usable link.
    }
  }

  const titleEl = root.querySelector("title") ?? root.querySelector("h1");
  const title = titleEl ? clean(textOf(titleEl)) : "";

  for (const el of root.querySelectorAll(DROP)) el.remove();
  for (const el of root.querySelectorAll("[id], [class]")) {
    if (BANNER.test(`${el.getAttribute("id") ?? ""} ${el.getAttribute("class") ?? ""}`)) el.remove();
  }

  const main = root.querySelector("main") ?? root.querySelector("[role=main]") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  const blocks: string[] = [];
  walk(main, blocks);

  // Drop repeated lines (e.g. the same call-to-action in every section).
  const seen = new Set<string>();
  const text = blocks
    .filter((b) => {
      if (seen.has(b)) return false;
      seen.add(b);
      return true;
    })
    .join("\n\n");

  return { title, text, links };
}

function walk(node: Node, out: string[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      // Loose text directly inside a container.
      const t = clean(child.text);
      if (t) out.push(t);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    const tag = el.tagName?.toLowerCase() ?? "";
    const heading = tag.match(/^h([1-6])$/);
    if (heading) {
      const t = clean(textOf(el));
      if (t) out.push(`${"#".repeat(Math.min(Number(heading[1]) + 1, 6))} ${t}`);
    } else if (tag === "li" && !hasBlockChild(el)) {
      const t = clean(textOf(el));
      if (t) out.push(`- ${t}`);
    } else if (tag === "li") {
      // A list item with its own headings and paragraphs (e.g. a numbered
      // step): keep its structure instead of running it all together.
      walk(el, out);
    } else if (BLOCK.has(tag) && !hasBlockChild(el)) {
      const t = clean(textOf(el));
      if (t) out.push(t);
    } else if (BLOCK.has(tag) || tag === "ul" || tag === "ol" || tag === "table" || tag === "tbody" || tag === "thead" || tag === "dl") {
      walk(el, out);
    } else {
      // Inline or unknown elements: keep their text as a block if it stands alone.
      if (hasBlockChild(el)) walk(el, out);
      else {
        const t = clean(textOf(el));
        if (t) out.push(t);
      }
    }
  }
}

// An element's text with a space between its parts, so "<span>1</span><h3>Step</h3>"
// reads "1 Step", not "1Step". Entities are decoded.
function textOf(node: Node): string {
  if (node.nodeType === 3) return node.text;
  if (node.nodeType !== 1) return "";
  if ((node as HTMLElement).tagName?.toLowerCase() === "br") return " ";
  return node.childNodes.map(textOf).join(" ");
}

function hasBlockChild(el: HTMLElement): boolean {
  return el.childNodes.some((c) => {
    if (c.nodeType !== 1) return false;
    const tag = (c as HTMLElement).tagName?.toLowerCase() ?? "";
    return BLOCK.has(tag) || /^h[1-6]$/.test(tag) || tag === "ul" || tag === "ol" || tag === "table" || tag === "dl";
  });
}

function clean(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
