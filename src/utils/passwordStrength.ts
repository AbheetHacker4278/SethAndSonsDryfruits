export interface PasswordStrength {
  valid: boolean;
  score: number;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Royal Shield';
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels: PasswordStrength['label'][] = [
    'Very Weak',
    'Weak',
    'Weak',
    'Fair',
    'Strong',
    'Royal Shield',
  ];

  return {
    valid: score === 5,
    score,
    label: labels[score] || 'Very Weak',
    checks,
  };
}

