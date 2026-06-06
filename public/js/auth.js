(function() {
  var mfaToken = null;

  function setupPasswordToggles() {
    document.querySelectorAll('#toggle-password, .toggle-pw').forEach(function(toggle) {
      toggle.addEventListener('click', function() {
        var input = this.closest('.input-with-icon').querySelector('input');
        if (!input) return;

        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        var eyeOpen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        var eyeClosed = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

        this.innerHTML = isPassword ? eyeClosed : eyeOpen;
      });
    });
  }

  function setupMfaInputs(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var inputs = container.querySelectorAll('input');

    inputs.forEach(function(input, index) {
      input.addEventListener('input', function(e) {
        var val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;

        if (val && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }

        if (val) {
          e.target.classList.add('filled');
        } else {
          e.target.classList.remove('filled');
        }
      });

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          inputs[index - 1].focus();
          inputs[index - 1].value = '';
          inputs[index - 1].classList.remove('filled');
        }
      });

      input.addEventListener('paste', function(e) {
        e.preventDefault();
        var pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        for (var i = 0; i < inputs.length && i < pasted.length; i++) {
          inputs[i].value = pasted[i];
          inputs[i].classList.add('filled');
        }
        var focusIdx = Math.min(pasted.length, inputs.length - 1);
        inputs[focusIdx].focus();
      });
    });
  }

  function getMfaCode(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return '';
    var inputs = container.querySelectorAll('input');
    var code = '';
    inputs.forEach(function(input) { code += input.value; });
    return code;
  }

  function handleLoginPage() {
    if (redirectIfAuthenticated()) return;

    var form = document.getElementById('login-form');
    if (!form) return;

    setupPasswordToggles();
    setupMfaInputs('mfa-inputs');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('login-btn');
      var username = document.getElementById('username').value.trim();
      var password = document.getElementById('password').value;

      if (!username || !password) {
        showToast('Preencha todos os campos', 'warning');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Entrando...';

      api('/api/auth/login', {
        method: 'POST',
        body: { username: username, password: password }
      }).then(function(data) {
        if (data.force_password_change) {
          setToken(data.token);
          window.location.href = '/change-password.html';
          return;
        }

        setToken(data.token);
        showToast('Login realizado com sucesso!', 'success');

        var user = getUser();
        setTimeout(function() {
          if (user && user.role === 'admin') {
            window.location.href = '/admin.html';
          } else {
            window.location.href = '/dashboard.html';
          }
        }, 500);
      }).catch(function(err) {
        if (err && err.mfa_required) {
          mfaToken = err.mfa_token;
          form.style.display = 'none';
          document.getElementById('mfa-step').classList.remove('hidden');
          var firstInput = document.querySelector('#mfa-inputs input');
          if (firstInput) firstInput.focus();
          return;
        }
        showToast(err.message || 'Erro ao fazer login', 'error');
      }).finally(function() {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Entrar';
      });
    });

    var mfaVerifyBtn = document.getElementById('mfa-verify-btn');
    if (mfaVerifyBtn) {
      mfaVerifyBtn.addEventListener('click', function() {
        var code = getMfaCode('mfa-inputs');
        if (code.length !== 6) {
          showToast('Digite o código de 6 dígitos', 'warning');
          return;
        }

        mfaVerifyBtn.disabled = true;
        mfaVerifyBtn.innerHTML = '<span class="spinner"></span> Verificando...';

        api('/api/auth/mfa/verify', {
          method: 'POST',
          body: { mfa_token: mfaToken, token: code }
        }).then(function(data) {
          setToken(data.token);
          showToast('Verificação concluída!', 'success');

          var user = getUser();
          setTimeout(function() {
            if (user && user.role === 'admin') {
              window.location.href = '/admin.html';
            } else {
              window.location.href = '/dashboard.html';
            }
          }, 500);
        }).catch(function(err) {
          showToast(err.message || 'Código inválido', 'error');
        }).finally(function() {
          mfaVerifyBtn.disabled = false;
          mfaVerifyBtn.innerHTML = 'Verificar';
        });
      });
    }

    var useBackupLink = document.getElementById('use-backup-code');
    if (useBackupLink) {
      useBackupLink.addEventListener('click', function(e) {
        e.preventDefault();
        var mfaInputs = document.getElementById('mfa-inputs');
        var backupInput = document.getElementById('backup-code-input');
        var verifyBtn = document.getElementById('mfa-verify-btn');

        if (mfaInputs.style.display === 'none') {
          mfaInputs.style.display = '';
          backupInput.classList.add('hidden');
          verifyBtn.style.display = '';
          this.textContent = 'Usar código de backup';
        } else {
          mfaInputs.style.display = 'none';
          backupInput.classList.remove('hidden');
          verifyBtn.style.display = 'none';
          this.textContent = 'Usar código do aplicativo';
          document.getElementById('backup-code').focus();
        }
      });
    }

    var backupVerifyBtn = document.getElementById('backup-verify-btn');
    if (backupVerifyBtn) {
      backupVerifyBtn.addEventListener('click', function() {
        var code = document.getElementById('backup-code').value.trim();
        if (!code) {
          showToast('Digite o código de backup', 'warning');
          return;
        }

        backupVerifyBtn.disabled = true;
        backupVerifyBtn.innerHTML = '<span class="spinner"></span> Verificando...';

        api('/api/auth/mfa/verify', {
          method: 'POST',
          body: { mfa_token: mfaToken, token: code, is_backup: true }
        }).then(function(data) {
          setToken(data.token);
          showToast('Verificação concluída!', 'success');

          var user = getUser();
          setTimeout(function() {
            if (user && user.role === 'admin') {
              window.location.href = '/admin.html';
            } else {
              window.location.href = '/dashboard.html';
            }
          }, 500);
        }).catch(function(err) {
          showToast(err.message || 'Código de backup inválido', 'error');
        }).finally(function() {
          backupVerifyBtn.disabled = false;
          backupVerifyBtn.innerHTML = 'Verificar Backup';
        });
      });
    }
  }

  function handleRegisterPage() {
    var form = document.getElementById('register-form');
    if (!form) return;

    setupPasswordToggles();

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('register-btn');
      var name = document.getElementById('reg-name').value.trim();
      var username = document.getElementById('reg-username').value.trim();
      var email = document.getElementById('reg-email').value.trim();
      var password = document.getElementById('reg-password').value;
      var confirmPassword = document.getElementById('reg-confirm-password').value;

      if (!name || !username || !email || !password || !confirmPassword) {
        showToast('Preencha todos os campos', 'warning');
        return;
      }

      if (password !== confirmPassword) {
        showToast('As senhas não coincidem', 'error');
        return;
      }

      if (typeof evaluatePassword === 'function') {
        var result = evaluatePassword(password);
        if (result.score < 3) {
          showToast('A senha não atende aos requisitos mínimos', 'error');
          return;
        }
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Enviando...';

      api('/api/auth/register-request', {
        method: 'POST',
        body: {
          name: name,
          username: username,
          email: email,
          password: password
        }
      }).then(function() {
        form.style.display = 'none';
        document.getElementById('register-success').classList.add('active');
        showToast('Solicitação enviada com sucesso!', 'success');
      }).catch(function(err) {
        showToast(err.message || 'Erro ao enviar solicitação', 'error');
      }).finally(function() {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> Solicitar Cadastro';
      });
    });
  }

  function handleChangePasswordPage() {
    var form = document.getElementById('change-password-form');
    if (!form) return;

    setupPasswordToggles();

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('change-password-btn');
      var currentPassword = document.getElementById('current-password');
      var newPassword = document.getElementById('new-password').value;
      var confirmPassword = document.getElementById('confirm-new-password').value;

      if (newPassword !== confirmPassword) {
        showToast('As senhas não coincidem', 'error');
        return;
      }

      if (typeof evaluatePassword === 'function') {
        var result = evaluatePassword(newPassword);
        if (result.score < 3) {
          showToast('A nova senha não atende aos requisitos mínimos', 'error');
          return;
        }
      }

      var body = { new_password: newPassword };
      if (currentPassword && currentPassword.value) {
        body.current_password = currentPassword.value;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Alterando...';

      api('/api/auth/change-password', {
        method: 'POST',
        body: body
      }).then(function(data) {
        if (data.token) {
          setToken(data.token);
        }
        showToast('Senha alterada com sucesso!', 'success');
        setTimeout(function() {
          var user = getUser();
          if (user && user.role === 'admin') {
            window.location.href = '/admin.html';
          } else {
            window.location.href = '/dashboard.html';
          }
        }, 1000);
      }).catch(function(err) {
        showToast(err.message || 'Erro ao alterar senha', 'error');
      }).finally(function() {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Alterar Senha';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    var path = window.location.pathname;

    if (path === '/' || path.indexOf('index.html') !== -1) {
      handleLoginPage();
    }

    if (path.indexOf('register.html') !== -1) {
      handleRegisterPage();
    }

    if (path.indexOf('change-password.html') !== -1) {
      handleChangePasswordPage();
    }
  });
})();
