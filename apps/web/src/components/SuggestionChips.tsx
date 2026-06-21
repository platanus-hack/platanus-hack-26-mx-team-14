import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, TrendingUp, Search } from 'lucide-react';
import api from '../lib/api';

type Kind = 'history' | 'insight' | 'default';
interface Suggestion {
  text: string;
  kind: Kind;
}

const ICONS: Record<Kind, typeof Clock> = {
  history: Clock,
  insight: TrendingUp,
  default: Search,
};

/**
 * Dashboard query suggestions. Blends the user's recency-ranked past queries,
 * a KG-lite "insight" chip (top client), and curated defaults — served by
 * GET /me/top-queries. Clicking a chip sends it straight to the agent.
 */
export default function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ suggestions: Suggestion[] }>('/me/top-queries')
      .then((r) => alive && setSuggestions(r.data.suggestions ?? []))
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, []);

  if (suggestions.length === 0) return null;

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 max-w-xl px-4">
      {suggestions.map((s, i) => {
        const Icon = ICONS[s.kind];
        return (
          <motion.button
            key={s.text}
            type="button"
            onClick={() => onPick(s.text)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 * i }}
            whileTap={{ scale: 0.96 }}
            className={`group flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full border text-xs transition-colors ${
              s.kind === 'insight'
                ? 'border-emerald/30 bg-emerald-lo text-emerald hover:bg-emerald/15'
                : 'border-border bg-surface text-muted hover:text-ink hover:bg-surface-hi'
            }`}
          >
            <Icon size={12} className={s.kind === 'insight' ? 'opacity-90' : 'opacity-50'} />
            <span className="truncate max-w-[220px]">{s.text}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
