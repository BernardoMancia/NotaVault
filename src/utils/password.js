const crypto = require('crypto');

function validatePasswordStrength(password) {
  const errors = [];
  let score = 0;

  if (!password || password.length < 12) {
    errors.push('Senha deve ter no mínimo 12 caracteres');
  } else {
    score++;
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra maiúscula');
  } else {
    score++;
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra minúscula');
  } else {
    score++;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Senha deve conter pelo menos um dígito');
  } else {
    score++;
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Senha deve conter pelo menos um caractere especial');
  } else {
    score++;
  }

  let strength;
  if (score <= 1) strength = 'weak';
  else if (score <= 2) strength = 'medium';
  else if (score <= 4) strength = 'strong';
  else strength = 'very_strong';

  return {
    valid: errors.length === 0,
    errors,
    strength
  };
}

function generateTempPassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const specials = '!@#$%^&*()_+-=';
  const all = uppercase + lowercase + digits + specials;

  const randomBytes = crypto.randomBytes(16);
  const password = [];

  password.push(uppercase[randomBytes[0] % uppercase.length]);
  password.push(lowercase[randomBytes[1] % lowercase.length]);
  password.push(digits[randomBytes[2] % digits.length]);
  password.push(specials[randomBytes[3] % specials.length]);

  for (let i = 4; i < 16; i++) {
    password.push(all[randomBytes[i] % all.length]);
  }

  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

function getPasswordStrengthScore(password) {
  if (!password) return 0;

  let score = 0;

  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

  if (password.length >= 16) score++;

  return Math.min(score, 4);
}

module.exports = { validatePasswordStrength, generateTempPassword, getPasswordStrengthScore };
