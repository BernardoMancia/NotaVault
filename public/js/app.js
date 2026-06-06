var API_BASE = '';

function getToken() {
  return localStorage.getItem('notavault_token');
}

function setToken(token) {
  localStorage.setItem('notavault_token', token);
}

function clearToken() {
  localStorage.removeItem('notavault_token');
}

function parseJwt(token) {
  try {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function getUser() {
  var token = getToken();
  if (!token) return null;
  return parseJwt(token);
}

function isAuthenticated() {
  var token = getToken();
  if (!token) return false;
  var payload = parseJwt(token);
  if (!payload) return false;
  var now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}

function api(endpoint, options) {
  options = options || {};
  var headers = options.headers || {};
  var token = getToken();

  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  options.headers = headers;

  return fetch(API_BASE + endpoint, options).then(function(res) {
    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      return Promise.reject(new Error('Sessão expirada'));
    }

    return res.json().then(function(data) {
      if (res.status === 403 && data.force_password_change) {
        window.location.href = '/change-password';
        return Promise.reject(new Error('Alteração de senha necessária'));
      }

      if (res.status === 403 && data.mfa_required) {
        return Promise.reject({ mfa_required: true, mfa_token: data.mfa_token });
      }

      if (!res.ok) {
        var err = new Error(data.error || data.message || 'Erro na requisição');
        err.status = res.status;
        err.data = data;
        return Promise.reject(err);
      }

      return data;
    });
  });
}

function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;

  var icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
    '<span class="toast-message">' + message + '</span>' +
    '<span class="toast-close" onclick="this.parentElement.classList.add(\'removing\'); setTimeout(function() { this.remove(); }.bind(this.parentElement), 300);">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
    '</span>';

  container.appendChild(toast);

  setTimeout(function() {
    if (toast.parentElement) {
      toast.classList.add('removing');
      setTimeout(function() {
        if (toast.parentElement) toast.remove();
      }, 300);
    }
  }, 5000);
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'R$ 0,00';
  return 'R$ ' + Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  var parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return dateStr;
  }
}

function redirectIfNotAuthenticated() {
  if (!isAuthenticated()) {
    clearToken();
    window.location.href = '/login';
    return true;
  }
  return false;
}

function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = '/dashboard';
    return true;
  }
  return false;
}

function checkForcePasswordChange() {
  var user = getUser();
  if (user && user.force_password_change) {
    var currentPage = window.location.pathname;
    if (currentPage.indexOf('change-password') === -1) {
      window.location.href = '/change-password';
      return true;
    }
  }
  return false;
}

function debounce(fn, delay) {
  var timer;
  return function() {
    var context = this;
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() {
      fn.apply(context, args);
    }, delay);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
  var path = window.location.pathname;
  var protectedPages = ['/dashboard', '/admin', '/mfa-setup', '/dashboard.html', '/admin.html', '/mfa-setup.html'];
  var isProtected = protectedPages.some(function(p) { return path.indexOf(p) !== -1; });

  if (isProtected) {
    if (redirectIfNotAuthenticated()) return;
    checkForcePasswordChange();
  }

  var sidebarToggle = document.querySelector('.sidebar-toggle');
  var sidebar = document.querySelector('.sidebar');
  var sidebarOverlay = document.querySelector('.sidebar-overlay');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function() {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    });
  }

  document.querySelectorAll('.sidebar-logout').forEach(function(btn) {
    btn.addEventListener('click', function() {
      clearToken();
      window.location.href = '/login';
    });
  });

  var user = getUser();
  document.querySelectorAll('[data-user-name]').forEach(function(el) {
    el.textContent = user ? user.username : '';
  });
  document.querySelectorAll('[data-user-initial]').forEach(function(el) {
    el.textContent = user ? user.username.charAt(0).toUpperCase() : '?';
  });
});
