import type { OrbState } from '../types';
import OwlOrb3D from './OwlOrb3D';

interface OrbProps {
  state: OrbState;
  size?: number;
}

const stateLabel: Record<OrbState, string> = {
  idle:      'Asistente listo',
  listening: 'Escuchando tu consulta',
  thinking:  'Procesando',
  speaking:  'Respondiendo',
};

export default function Orb({ state, size = 280 }: OrbProps) {
  return (
    <div
      role="status"
      aria-label={stateLabel[state]}
      aria-live="polite"
    >
      <OwlOrb3D state={state} size={size} />
      <span className="sr-only">{stateLabel[state]}</span>
    </div>
  );
}
