import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="font-mono text-[0.82em] bg-surface-hi px-1 py-0.5 rounded text-emerald">{p.slice(1, -1)}</code>;
    return p;
  });
}

interface Props {
  children: string;
  className?: string;
  streaming?: boolean;
}

export default function Markdown({ children, className = '', streaming }: Props) {
  const lines = children.split('\n');
  const nodes: ReactNode[] = [];
  let listBuf: string[] = [];
  let listOrdered = false;

  function flushList() {
    if (!listBuf.length) return;
    if (listOrdered) {
      nodes.push(
        <ol key={`ol-${nodes.length}`} className="list-decimal list-inside space-y-0.5 text-sm text-ink/90 leading-relaxed">
          {listBuf.map((item, i) => <li key={i}>{inline(item)}</li>)}
        </ol>
      );
    } else {
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="list-disc list-inside space-y-0.5 text-sm text-ink/90 leading-relaxed">
          {listBuf.map((item, i) => <li key={i}>{inline(item)}</li>)}
        </ul>
      );
    }
    listBuf = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Bullet list
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (listBuf.length > 0 && listOrdered) flushList();
      listOrdered = false;
      listBuf.push(bulletMatch[1]);
      return;
    }

    // Ordered list
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (orderedMatch) {
      if (listBuf.length > 0 && !listOrdered) flushList();
      listOrdered = true;
      listBuf.push(orderedMatch[1]);
      return;
    }

    flushList();

    if (!trimmed) {
      if (nodes.length > 0) nodes.push(<span key={`br-${idx}`} className="block h-1" />);
      return;
    }

    nodes.push(
      <p key={idx} className="text-sm text-ink leading-relaxed">
        {inline(trimmed)}
      </p>
    );
  });

  flushList();

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {nodes}
      {streaming && (
        <span className="inline-block w-0.5 h-3 bg-emerald/60 ml-0.5 align-text-bottom animate-pulse" />
      )}
    </div>
  );
}
