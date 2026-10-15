import { safeDashboardLink } from "./tools";

// Models don't always use show_page: some write the link into the reply as
// Markdown ([Open Knowledge](/dashboard/knowledge)) or invent a tag
// (<button label="..." path="..." />), and most add **bold**. The panel shows
// plain text, so this turns any link into a real button (through the same
// check as show_page) and strips the markup. A link to a page the business
// can't open keeps only its words.

export type ReplyLink = { href: string; label: string };

const MARKDOWN_LINK = /\[([^\]\n]{1,60})\]\(([^)\s]+)\)/g;
const BUTTON_TAG = /<button\b([^>]*?)\/?>(?:([^<]{0,60})<\/button>)?/gi;
const attr = (attrs: string, name: string) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs)?.[1];

export function cleanReply(text: string, allowed: Set<string>): { text: string; links: ReplyLink[] } {
  const links: ReplyLink[] = [];
  const keep = (label: string, path: string | undefined) => {
    const href = path ? safeDashboardLink(path, allowed) : null;
    if (href && !links.some((l) => l.href === href)) links.push({ href, label });
    return href ? "" : label;
  };

  const cleaned = text
    .replace(MARKDOWN_LINK, (_, label: string, path: string) => keep(label, path))
    .replace(BUTTON_TAG, (_, attrs: string, inner?: string) => {
      const label = attr(attrs, "label") ?? inner?.trim() ?? "";
      return keep(label, attr(attrs, "path") ?? attr(attrs, "href"));
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    // A bare "[Open Knowledge]" placeholder line, or "(Open Knowledge)" at the
    // end of a sentence, standing in for the button.
    .replace(/^[ \t]*\[[^\]\n]{1,60}\][ \t]*$/gm, "")
    .replace(/[ \t]*\((?:Open|Go to)\b[^()\n]{0,50}\)[ \t]*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    // Lines left empty by a removed button, and the blank runs around them.
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, links };
}
