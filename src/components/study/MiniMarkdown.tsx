import { Fragment, type ReactNode } from "react";

/**
 * A tiny, safe Markdown subset for Tuck's answers: paragraphs, "- " / "* " bullets, "1." steps,
 * **bold**, *italic* / _italic_ and `code`. It builds React elements only (no innerHTML), so model output
 * can never inject markup.
 */
// italics need a non-space right after the opening marker and before the closing one, and no word
// character just outside, so "2 * 3 * 4", "a*b" and snake_case stay plain text. No lookbehind (older
// Safari can't parse it): the character before an italic is captured and kept as text instead.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)|(^|[^\w*])(\*(?=\S)[^*\n]*?\S\*)(?![\w*])|(^|[^\w_])(_(?=\S)[^_\n]*?\S_)(?![\w_])/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    const prefix = m[2] ?? m[4] ?? "";
    const tok = m[1] ?? m[3] ?? m[5];
    const start = m.index + prefix.length;
    if (start > last) out.push(text.slice(last, start));
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k} className="font-medium">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const step = /^\d+[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (!line) { blocks.push({ kind: "p", lines: [] }); continue; }
    if (bullet) { if (last?.kind === "ul") last.items.push(bullet[1]); else blocks.push({ kind: "ul", items: [bullet[1]] }); continue; }
    if (step) { if (last?.kind === "ol") last.items.push(step[1]); else blocks.push({ kind: "ol", items: [step[1]] }); continue; }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const text = heading ? `**${heading[1]}**` : line;
    if (last?.kind === "p" && last.lines.length) last.lines.push(text); else blocks.push({ kind: "p", lines: [text] });
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0));
}

export function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="prose-tuck">
      {parseBlocks(text).map((b, i) =>
        b.kind === "p" ? <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${i}-${j}`)}</Fragment>)}</p>
          : b.kind === "ul" ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ul>
          : <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ol>,
      )}
    </div>
  );
}
