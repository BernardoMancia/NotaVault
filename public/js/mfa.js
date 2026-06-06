var currentStep = 1;
var mfaSecret = '';
var backupCodes = [];

document.addEventListener('DOMContentLoaded', function() {
  redirectIfNotAuthenticated();
  checkMfaStatus();
  setupEventListeners();
});

function checkMfaStatus() {
  api('/api/user/mfa/status').then(function(data) {
    if (data.mfa_enabled) {
      document.getElementById('step-indicator').classList.add('hidden');
      document.getElementById('mfa-step-1').classList.add('hidden');
      document.getElementById('mfa-step-2').classList.add('hidden');
      document.getElementById('mfa-step-3').classList.add('hidden');
      document.getElementById('mfa-success').classList.add('hidden');
      document.getElementById('mfa-disable-section').classList.remove('hidden');
    } else {
      document.getElementById('mfa-step-1').classList.remove('hidden');
      document.getElementById('mfa-disable-section').classList.add('hidden');
    }
  }).catch(function(err) {
    showToast(err.message || 'Erro ao verificar status MFA', 'error');
  });
}

function setupEventListeners() {
  document.getElementById('btn-step1-next').addEventListener('click', function() {
    goToStep(2);
    initSetup();
  });

  document.getElementById('btn-step2-back').addEventListener('click', function() {
    goToStep(1);
  });

  document.getElementById('btn-step2-next').addEventListener('click', function() {
    goToStep(3);
  });

  document.getElementById('btn-copy-secret').addEventListener('click', function() {
    copyToClipboard(mfaSecret);
    showToast('Código copiado!', 'success');
  });

  document.getElementById('btn-activate-mfa').addEventListener('click', function() {
    activateMfa();
  });

  document.getElementById('btn-copy-codes').addEventListener('click', function() {
    copyBackupCodes();
  });

  document.getElementById('btn-download-codes').addEventListener('click', function() {
    downloadBackupCodes();
  });

  document.getElementById('btn-show-disable').addEventListener('click', function() {
    var form = document.getElementById('disable-form');
    form.classList.toggle('hidden');
  });

  document.getElementById('btn-confirm-disable').addEventListener('click', function() {
    disableMfa();
  });

  document.getElementById('btn-regen-codes').addEventListener('click', function() {
    regenerateBackupCodes();
  });

  setupDigitInputs(document.querySelectorAll('#mfa-code-inputs .mfa-digit'));
  setupDigitInputs(document.querySelectorAll('#disable-mfa-digits input'));
}

function goToStep(step) {
  currentStep = step;

  document.getElementById('mfa-step-1').classList.add('hidden');
  document.getElementById('mfa-step-2').classList.add('hidden');
  document.getElementById('mfa-step-3').classList.add('hidden');

  document.getElementById('mfa-step-' + step).classList.remove('hidden');

  var dots = document.querySelectorAll('.step-dot');
  var lines = document.querySelectorAll('.step-line');

  dots.forEach(function(dot) {
    var dotStep = parseInt(dot.getAttribute('data-step'));
    if (dotStep <= step) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  lines.forEach(function(line) {
    var lineIndex = parseInt(line.getAttribute('data-line'));
    if (lineIndex < step) {
      line.classList.add('active');
    } else {
      line.classList.remove('active');
    }
  });
}

function initSetup() {
  api('/api/user/mfa/setup', { method: 'POST' }).then(function(data) {
    mfaSecret = data.secret;
    document.getElementById('qr-container').innerHTML = '<img src="' + data.qrCode + '" alt="QR Code MFA">';
    document.getElementById('mfa-secret-text').textContent = data.secret;
  }).catch(function(err) {
    showToast(err.message || 'Erro ao iniciar configuração MFA', 'error');
    goToStep(1);
  });
}

function setupDigitInputs(inputs) {
  inputs.forEach(function(input, idx) {
    input.addEventListener('input', function(e) {
      var value = e.target.value;
      if (!/^\d$/.test(value)) {
        e.target.value = '';
        return;
      }
      if (idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    });

    input.addEventListener('paste', function(e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
      var chars = pasted.replace(/\D/g, '').split('');
      for (var i = 0; i < inputs.length && i < chars.length; i++) {
        inputs[i].value = chars[i];
      }
      var lastFilled = Math.min(chars.length, inputs.length) - 1;
      if (lastFilled >= 0) {
        inputs[lastFilled].focus();
      }
    });
  });
}

function activateMfa() {
  var digits = document.querySelectorAll('#mfa-code-inputs .mfa-digit');
  var code = '';
  digits.forEach(function(d) { code += d.value; });

  var errorEl = document.getElementById('mfa-verify-error');

  if (code.length !== 6) {
    errorEl.textContent = 'Digite todos os 6 dígitos.';
    errorEl.classList.remove('hidden');
    return;
  }

  errorEl.classList.add('hidden');

  api('/api/user/mfa/enable', {
    method: 'POST',
    body: { token: code }
  }).then(function(data) {
    backupCodes = data.backupCodes;
    document.getElementById('mfa-step-3').classList.add('hidden');
    document.getElementById('step-indicator').classList.add('hidden');
    document.getElementById('mfa-success').classList.remove('hidden');
    renderBackupCodes();
    showToast('MFA ativado com sucesso!', 'success');
  }).catch(function(err) {
    errorEl.textContent = err.message || 'Código inválido. Tente novamente.';
    errorEl.classList.remove('hidden');
    digits.forEach(function(d) { d.value = ''; });
    digits[0].focus();
  });
}

function renderBackupCodes() {
  var grid = document.getElementById('backup-codes-grid');
  grid.innerHTML = '';
  backupCodes.forEach(function(code) {
    var span = document.createElement('span');
    span.style.fontFamily = "'JetBrains Mono', monospace";
    span.textContent = code;
    grid.appendChild(span);
  });
}

function copyBackupCodes() {
  navigator.clipboard.writeText(backupCodes.join('\n')).then(function() {
    showToast('Códigos copiados!', 'success');
  });
}

function downloadBackupCodes() {
  var now = new Date();
  var dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
  var content = 'NotaVault - Códigos de Backup MFA\n';
  content += 'Gerado em: ' + dateStr + '\n';
  content += '================================\n\n';
  backupCodes.forEach(function(code, i) {
    content += (i + 1) + '. ' + code + '\n';
  });
  content += '\n================================\n';
  content += 'Cada código só pode ser usado uma vez.\n';
  content += 'Guarde em um local seguro.\n';

  var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'notavault-backup-codes.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Download iniciado!', 'success');
}

function disableMfa() {
  var password = document.getElementById('disable-password').value;
  var digits = document.querySelectorAll('#disable-mfa-digits input');
  var code = '';
  digits.forEach(function(d) { code += d.value; });

  if (!password) {
    showToast('Digite sua senha.', 'error');
    return;
  }

  if (code.length !== 6) {
    showToast('Digite todos os 6 dígitos.', 'error');
    return;
  }

  api('/api/user/mfa/disable', {
    method: 'POST',
    body: { password: password, token: code }
  }).then(function() {
    showToast('MFA desativado com sucesso.', 'success');
    setTimeout(function() {
      window.location.href = '/dashboard';
    }, 1500);
  }).catch(function(err) {
    showToast(err.message || 'Erro ao desativar MFA.', 'error');
  });
}

function regenerateBackupCodes() {
  api('/api/user/mfa/backup-codes').then(function(data) {
    backupCodes = data.backupCodes;
    var display = document.getElementById('regen-codes-display');
    display.innerHTML = '';
    display.classList.remove('hidden');
    backupCodes.forEach(function(code) {
      var span = document.createElement('span');
      span.style.fontFamily = "'JetBrains Mono', monospace";
      span.textContent = code;
      display.appendChild(span);
    });
    showToast('Novos códigos de backup gerados!', 'success');
  }).catch(function(err) {
    showToast(err.message || 'Erro ao regenerar códigos.', 'error');
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}
