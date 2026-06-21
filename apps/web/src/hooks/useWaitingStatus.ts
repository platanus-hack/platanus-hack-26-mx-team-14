import { useEffect, useState } from 'react';

const TIERS: { afterMs: number; messages: string[] }[] = [
  { afterMs: 0, messages: ['SATI está pensando…', 'Un momento…', 'Procesando tu consulta…'] },
  {
    afterMs: 7000,
    messages: [
      'Estamos trabajando en tu solicitud…',
      'SATI está revisando tus datos…',
      'Esto tomará solo un segundo…',
    ],
  },
  {
    afterMs: 16000,
    messages: [
      'Consultar el SAT puede tardar un poco…',
      'SATI sigue trabajando en ello…',
      'Gracias por tu paciencia, casi listo…',
    ],
  },
  {
    afterMs: 30000,
    messages: [
      'Seguimos en ello — el SAT a veces es lento…',
      'SATI no se rinde, ya casi terminamos…',
      'Esto está tomando más de lo normal, pero seguimos aquí…',
    ],
  },
];

const ROTATE_MS = 3500;


export function useWaitingStatus(active: boolean): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setMessage(null);
      return;
    }
    const start = Date.now();
    let idx = 0;
    const pick = () => {
      const elapsed = Date.now() - start;
      const tier = [...TIERS].reverse().find((t) => elapsed >= t.afterMs) ?? TIERS[0];
      setMessage(tier.messages[idx % tier.messages.length] ?? null);
      idx += 1;
    };
    pick();
    const id = setInterval(pick, ROTATE_MS);
    return () => clearInterval(id);
  }, [active]);

  return message;
}
