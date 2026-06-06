function evaluatePassword(password) {
  var checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  var passed = Object.values(checks).filter(Boolean).length;
  var score;

  if (passed <= 1) score = 0;
  else if (passed === 2) score = 1;
  else if (passed === 3) score = 2;
  else if (passed === 4) score = 3;
  else score = 4;

  return { score: score, checks: checks, passed: passed };
}

function updateMeter(meterId, labelId, score) {
  var segments = document.querySelectorAll('#' + meterId + ' .password-meter-segment');
  var label = document.getElementById(labelId);

  var colors = ['#ff3366', '#ff6b35', '#ff6b35', '#00ff88', '#00d4ff'];
  var labels = ['Fraca', 'Fraca', 'Razoável', 'Boa', 'Muito Forte'];

  segments.forEach(function(seg, i) {
    seg.classList.remove('active');
    seg.style.background = 'rgba(255, 255, 255, 0.05)';
    seg.style.color = '';
  });

  var activateCount;
  if (score === 0) activateCount = 1;
  else if (score === 1) activateCount = 1;
  else if (score === 2) activateCount = 2;
  else if (score === 3) activateCount = 3;
  else activateCount = 4;

  for (var i = 0; i < activateCount; i++) {
    if (segments[i]) {
      segments[i].classList.add('active');
      segments[i].style.background = colors[score];
      segments[i].style.color = colors[score];
    }
  }

  if (label) {
    label.textContent = labels[score];
    label.style.color = colors[score];
  }
}

function updateRequirements(requirementsId, checks) {
  var container = document.getElementById(requirementsId);
  if (!container) return;

  var checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  var xIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>';

  var items = container.querySelectorAll('.password-requirement');
  items.forEach(function(item) {
    var checkName = item.getAttribute('data-check');
    var iconEl = item.querySelector('.password-requirement-icon');
    var isMet = checks[checkName];

    item.classList.remove('met', 'unmet');
    item.classList.add(isMet ? 'met' : 'unmet');

    if (iconEl) {
      iconEl.innerHTML = isMet ? checkIcon : xIcon;
    }
  });
}

function initPasswordStrength(passwordInputId, meterId, labelId, requirementsId) {
  var input = document.getElementById(passwordInputId);
  if (!input) return;

  input.addEventListener('input', function() {
    var result = evaluatePassword(input.value);

    if (input.value.length === 0) {
      var segments = document.querySelectorAll('#' + meterId + ' .password-meter-segment');
      segments.forEach(function(seg) {
        seg.classList.remove('active');
        seg.style.background = 'rgba(255, 255, 255, 0.05)';
      });
      var label = document.getElementById(labelId);
      if (label) label.textContent = '';

      var container = document.getElementById(requirementsId);
      if (container) {
        var items = container.querySelectorAll('.password-requirement');
        items.forEach(function(item) {
          item.classList.remove('met', 'unmet');
        });
      }
      return;
    }

    updateMeter(meterId, labelId, result.score);
    updateRequirements(requirementsId, result.checks);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('reg-password')) {
    initPasswordStrength('reg-password', 'password-meter', 'password-meter-label', 'password-requirements');
  }

  if (document.getElementById('new-password')) {
    initPasswordStrength('new-password', 'password-meter', 'password-meter-label', 'password-requirements');
  }
});
