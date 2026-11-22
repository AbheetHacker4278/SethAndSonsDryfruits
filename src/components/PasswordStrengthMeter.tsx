import { Check, Circle, ShieldCheck } from 'lucide-react';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = evaluatePasswordStrength(password);

  if (!password) return null;

  const barColors = [
    'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]',
    'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
    'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]',
  ];

  const rules = [
    { ok: strength.checks.minLength, label: '8+ characters' },
    { ok: strength.checks.hasUppercase, label: 'Uppercase letter (A-Z)' },
    { ok: strength.checks.hasLowercase, label: 'Lowercase letter (a-z)' },
    { ok: strength.checks.hasNumber, label: 'Number (0-9)' },
    { ok: strength.checks.hasSpecial, label: 'Special character (!@#$...)' },
  ];

  return (
    <div className="mt-3 p-3.5 rounded-xl bg-[#1a110b] border border-[#422e20] space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#d5c4b4] font-medium flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#dfc471]" />
          <span>Security Strength:</span>
        </span>
        <span
          className={`font-semibold tracking-wide px-2 py-0.5 rounded-md text-[11px] ${
            strength.score >= 5
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
              : strength.score >= 4
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
              : strength.score >= 3
              ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
              : 'bg-red-950/60 text-red-300 border border-red-500/30'
          }`}
        >
          {strength.label}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map(step => (
          <div
            key={step}
            className={`h-2 rounded-full transition-all duration-300 ${
              strength.score >= step
                ? barColors[strength.score]
                : 'bg-[#2b1c13] border border-[#3e2a1d]'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-[#342419]">
        {rules.map(r => (
          <div
            key={r.label}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              r.ok ? 'text-emerald-300 font-medium' : 'text-[#a89584]'
            }`}
          >
            {r.ok ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Circle className="w-2.5 h-2.5 text-[#6e5645] shrink-0" />
            )}
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
