interface PasswordStrengthProps {
  password: string;
}

function getStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score === 0) return { score: 0, label: '', color: '' };
  if (score === 1) return { score: 1, label: 'Débil', color: 'bg-red-500' };
  if (score === 2) return { score: 2, label: 'Regular', color: 'bg-amber-400' };
  if (score === 3) return { score: 3, label: 'Buena', color: 'bg-sky-400' };
  return { score: 4, label: 'Excelente', color: 'bg-emerald' };
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const { score, label, color } = getStrength(password);

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1.5" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4} aria-label="Fortaleza de contraseña">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < score ? color : 'bg-border'
            }`}
          />
        ))}
      </div>
      {label && (
        <p className="text-xs text-muted mt-1">{label}</p>
      )}
    </div>
  );
}
