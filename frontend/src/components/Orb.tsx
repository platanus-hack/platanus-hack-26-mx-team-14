import { motion } from 'motion/react';
import type { OrbState } from '../types';

interface OrbProps {
  state: OrbState;
  size?: number;
}

const stateLabel: Record<OrbState, string> = {
  idle: 'Asistente listo',
  listening: 'Escuchando tu consulta',
  thinking: 'Procesando',
  speaking: 'Respondiendo',
};

const STATES: OrbState[] = ['idle', 'listening', 'thinking', 'speaking'];

export default function Orb({ state, size = 280 }: OrbProps) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="status"
      aria-label={stateLabel[state]}
      aria-live="polite"
    >
      {/* Rings for listening state */}
      {state === 'listening' && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
        >
          <span className="orb-ring absolute inset-0 rounded-full" />
          <span className="orb-ring orb-ring-2 absolute inset-0 rounded-full" />
          <span className="orb-ring orb-ring-3 absolute inset-0 rounded-full" />
        </div>
      )}

      {/* Waves for speaking state */}
      {state === 'speaking' && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ inset: '-8%' }}
        >
          <span className="orb-wave absolute inset-0 rounded-full" />
          <span className="orb-wave orb-wave-2 absolute inset-0 rounded-full" />
        </div>
      )}

      {/* Orb layers – cross-fade between states */}
      <div className="absolute inset-0 rounded-full overflow-hidden">
        {STATES.map((s) => (
          <motion.div
            key={s}
            className={`orb-${s} absolute inset-0 rounded-full`}
            animate={{ opacity: state === s ? 1 : 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          />
        ))}
        {/* Specular highlight – always visible */}
        <div className="orb-highlight" aria-hidden="true" />
      </div>

      {/* Screen-reader text for each state */}
      <span className="sr-only">{stateLabel[state]}</span>
    </div>
  );
}
