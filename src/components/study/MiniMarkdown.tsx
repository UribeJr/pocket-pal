import { Fragment, type ReactNode } from "react";

/**
 * A tiny, safe Markdown subset for Tuck's answers: paragraphs, "- " / "* " bullets, "1." steps,
 * **bold** and `code`. It builds React elements only (no innerHTML), so model output can never inject markup.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={`${key}-${i++}`} className="font-medium">{tok.slice(2, -2)}</strong> : <code key={`${key}-${i++}`}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
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
