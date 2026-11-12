import { Check, Circle } from 'lucide-react';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = evaluatePasswordStrength(password);

  if (!password) return null;

  const barColors = [
    'bg-red-500',
    'bg-red-500',
    'bg-orange-400',
    'bg-amber-400',
    'bg-emerald-400',
    'bg-emerald-500',
  ];

  const rules = [
    { ok: strength.checks.minLength, label: '8+ characters' },
    { ok: strength.checks.hasUppercase, label: 'Uppercase letter' },
    { ok: strength.checks.hasLowercase, label: 'Lowercase letter' },
    { ok: strength.checks.hasNumber, label: 'Number (0-9)' },
    { ok: strength.checks.hasSpecial, label: 'Special character' },
  ];

  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[#d5c4b4]/70">Password Strength</span>
        <span
          className={`font-semibold ${
            strength.score >= 5
              ? 'text-emerald-400'
              : strength.score >= 4
              ? 'text-emerald-300'
              : strength.score >= 3
              ? 'text-amber-300'
              : 'text-red-400'
          }`}
        >
          {strength.label}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map(step => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              strength.score >= step ? barColors[strength.score] : 'bg-[#251a13]'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5">
        {rules.map(r => (
          <div
            key={r.label}
            className={`flex items-center gap-1.5 text-[11px] ${
              r.ok ? 'text-emerald-300' : 'text-[#d5c4b4]/50'
            }`}
          >
            {r.ok ? <Check className="w-3 h-3 shrink-0" /> : <Circle className="w-2.5 h-2.5 shrink-0" />}
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

