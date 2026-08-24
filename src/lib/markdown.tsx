import type { ReactNode } from "react";
import { isSafeLinkHref } from "./url";

/**
 * A deliberately tiny, safe Markdown renderer (Phase 2 — announcements & content).
 *
 * It parses a small allowlisted subset straight into React elements and NEVER
 * produces an HTML string, so `dangerouslySetInnerHTML` is not used and the
 * SECURITY_SPEC §5 ban holds natively — every text node is escaped by React, and
 * link hrefs are scheme-checked. Anything outside the subset (raw HTML, images,
 * scripts, unusual link schemes) renders as inert, escaped text.
 *
 * Supported: #/##/### headings (→ h2–h4), **bold**, *italic*, `code`,
 * [label](url) links (http/https/mailto only), - / * and 1. lists, paragraphs
 * with single-newline → <br/>.
 */

// One token = the earliest of: `code`, **bold**, *italic*, [label](url).
// Bold is listed before italic so `**x**` matches bold at a `**` position.
const INLINE = /(`([^`]+)`)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\(([^)\s]+)\))/;

function parseInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyBase}-${n++}`;
    if (m[1] !== undefined) {
      out.push(<code key={key}>{m[2]}</code>);
    } else if (m[3] !== undefined) {
      out.push(<strong key={key}>{parseInline(m[4], key)}</strong>);
    } else if (m[5] !== undefined) {
      out.push(<em key={key}>{parseInline(m[6], key)}</em>);
    } else {
      const label = m[8];
      const href = m[9];
      if (isSafeLinkHref(href)) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {parseInline(label, key)}
          </a>,
        );
      } else {
        // Unsafe scheme (javascript:, data:, …) → keep as inert text.
        out.push(m[0]);
      }
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const BLOCK_START = /^(#{1,3}\s|[-*]\s|\d+\.\s)/;

export function renderMarkdown(md: string): ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const inner = parseInline(h[2], `h${key}`);
      const level = h[1].length;
      if (level === 1) blocks.push(<h2 key={key++}>{inner}</h2>);
      else if (level === 2) blocks.push(<h3 key={key++}>{inner}</h3>);
      else blocks.push(<h4 key={key++}>{inner}</h4>);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const t = lines[i].replace(/^[-*]\s+/, "");
        items.push(<li key={items.length}>{parseInline(t, `ul${key}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(<ul key={key++}>{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const t = lines[i].replace(/^\d+\.\s+/, "");
        items.push(<li key={items.length}>{parseInline(t, `ol${key}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(<ol key={key++}>{items}</ol>);
      continue;
    }

    // Paragraph: consecutive non-blank, non-block lines; single newline → <br/>.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    const inner: ReactNode[] = [];
    para.forEach((p, idx) => {
      if (idx > 0) inner.push(<br key={`br-${key}-${idx}`} />);
      inner.push(...parseInline(p, `p${key}-${idx}`));
    });
    blocks.push(<p key={key++}>{inner}</p>);
  }

  return blocks;
}
