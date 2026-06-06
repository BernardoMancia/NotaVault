document.addEventListener('DOMContentLoaded', function() {
  redirectIfNotAuthenticated();
  var user = getUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/login';
    return;
  }

  var usernameEl = document.getElementById('sidebar-username');
  if (usernameEl) usernameEl.textContent = user.username;

  var toggle = document.getElementById('sidebar-toggle');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  if (toggle && sidebar) {
    toggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function() {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  init();
});

function init() {
  loadStats();
  loadUsers();
  setupFilterTabs();
  setupCreateUserForm();
  setupModalOverlays();
}

async function loadStats() {
  try {
    var response = await api('/api/admin/stats');
    var data = response.data || response;
    document.getElementById('stat-total-users-count').textContent = data.totalUsers || 0;
    document.getElementById('stat-pending-count').textContent = data.pendingApproval || 0;
    document.getElementById('stat-total-receipts-count').textContent = data.totalReceipts || 0;
    document.getElementById('stat-total-value-amount').textContent = formatCurrency(data.totalValue || 0);
  } catch (err) {
    showToast('Erro ao carregar estatísticas', 'error');
  }
}

async function loadUsers(status) {
  status = status || 'all';
  try {
    var response = await api('/api/admin/users?status=' + status);
    var users = response.data || response;
    renderUsersTable(users);
  } catch (err) {
    showToast('Erro ao carregar usuários', 'error');
  }
}

function renderUsersTable(users) {
  var tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';

  if (!users || users.length === 0) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'text-center text-muted';
    td.style.padding = '3rem';
    td.textContent = 'Nenhum usuário encontrado';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  users.forEach(function(u) {
    var tr = document.createElement('tr');

    var tdId = document.createElement('td');
    tdId.textContent = u.id;
    tr.appendChild(tdId);

    var tdUser = document.createElement('td');
    tdUser.style.fontWeight = '500';
    tdUser.textContent = u.username;
    tr.appendChild(tdUser);

    var tdEmail = document.createElement('td');
    tdEmail.textContent = u.email;
    tr.appendChild(tdEmail);

    var tdStatus = document.createElement('td');
    var badge = document.createElement('span');
    if (!u.is_approved) {
      badge.className = 'badge badge-orange';
      badge.textContent = 'Pendente';
    } else if (u.is_active) {
      badge.className = 'badge badge-green';
      badge.textContent = 'Ativo';
    } else {
      badge.className = 'badge badge-red';
      badge.textContent = 'Inativo';
    }
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    var tdMfa = document.createElement('td');
    tdMfa.textContent = u.mfa_enabled ? '🔒' : '—';
    tr.appendChild(tdMfa);

    var tdDate = document.createElement('td');
    tdDate.textContent = formatDate(u.created_at);
    tr.appendChild(tdDate);

    var tdActions = document.createElement('td');
    var actionsWrap = document.createElement('div');
    actionsWrap.className = 'actions-wrap';

    if (!u.is_approved && u.is_active) {
      actionsWrap.appendChild(makeBtn('Aprovar', 'btn-success btn-sm', function() { approveUser(u.id); }));
    }
    if (u.is_active) {
      actionsWrap.appendChild(makeBtn('Ver Notas', 'btn-secondary btn-sm', function() { viewUserReceipts(u.id, u.username); }));
      actionsWrap.appendChild(makeBtn('Reenviar Email', 'btn-secondary btn-sm', function() { resendEmail(u.id); }));
      actionsWrap.appendChild(makeBtn('Resetar Senha', 'btn-secondary btn-sm', function() { resetPassword(u.id); }));
      if (u.is_approved) {
        actionsWrap.appendChild(makeBtn('Alterar Email', 'btn-secondary btn-sm', function() { changeEmail(u.id); }));
      }
      actionsWrap.appendChild(makeBtn('Desativar', 'btn-danger btn-sm', function() { deactivateUser(u.id); }));
    } else {
      actionsWrap.appendChild(makeBtn('Reativar', 'btn-success btn-sm', function() { reactivateUser(u.id); }));
      actionsWrap.appendChild(makeBtn('Remover', 'btn-danger btn-sm', function() { deactivateUser(u.id); }));
    }

    tdActions.appendChild(actionsWrap);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

function makeBtn(text, cls, fn) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ' + cls;
  btn.textContent = text;
  btn.addEventListener('click', fn);
  return btn;
}

function approveUser(id) {
  showConfirm('Aprovar este usuário?', async function() {
    try {
      await api('/api/admin/users/' + id + '/approve', { method: 'PATCH' });
      showToast('Usuário aprovado com sucesso', 'success');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast(err.message || 'Erro ao aprovar usuário', 'error');
    }
  });
}

function resetPassword(id) {
  showConfirm('Resetar senha deste usuário?', async function() {
    try {
      var response = await api('/api/admin/users/' + id + '/reset-password', { method: 'PATCH' });
      var msg = 'Senha resetada com sucesso';
      if (response.temp_password) msg += '. Senha temporária: ' + response.temp_password;
      showToast(msg, 'success');
      loadUsers(getCurrentFilter());
    } catch (err) {
      showToast(err.message || 'Erro ao resetar senha', 'error');
    }
  });
}

function changeEmail(id) {
  var input = document.getElementById('new-email-input');
  input.value = '';
  openModal('email-modal');

  var btn = document.getElementById('btn-save-email');
  var newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async function() {
    var email = document.getElementById('new-email-input').value.trim();
    if (!email) {
      showToast('Informe o novo email', 'error');
      return;
    }
    try {
      await api('/api/admin/users/' + id + '/email', { method: 'PATCH', body: { email: email } });
      showToast('Email alterado com sucesso', 'success');
      closeModal('email-modal');
      loadUsers(getCurrentFilter());
    } catch (err) {
      showToast(err.message || 'Erro ao alterar email', 'error');
    }
  });
}

function deactivateUser(id) {
  showConfirm('Desativar este usuário? (Soft Delete)', async function() {
    try {
      await api('/api/admin/users/' + id, { method: 'DELETE' });
      showToast('Usuário desativado com sucesso', 'success');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast(err.message || 'Erro ao desativar usuário', 'error');
    }
  });
}

function resendEmail(id) {
  showConfirm('Reenviar e-mail de credenciais para este usuário?', async function() {
    try {
      await api('/api/admin/users/' + id + '/resend-email', { method: 'POST' });
      showToast('E-mail reenviado com sucesso', 'success');
    } catch (err) {
      showToast(err.message || 'Erro ao reenviar e-mail', 'error');
    }
  });
}

function reactivateUser(id) {
  showConfirm('Reativar este usuário?', async function() {
    try {
      await api('/api/admin/users/' + id + '/reactivate', { method: 'PATCH' });
      showToast('Usuário reativado com sucesso', 'success');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast(err.message || 'Erro ao reativar usuário', 'error');
    }
  });
}

async function viewUserReceipts(id, username) {
  document.getElementById('receipts-modal-title').textContent = 'Notas de ' + username;
  var tbody = document.getElementById('user-receipts-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:2rem">Carregando...</td></tr>';
  openModal('receipts-modal');

  try {
    var response = await api('/api/admin/users/' + id + '/receipts');
    var receipts = response.data || response;
    tbody.innerHTML = '';

    if (!receipts || receipts.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'text-center text-muted';
      td.style.padding = '2rem';
      td.textContent = 'Nenhuma nota encontrada';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    receipts.forEach(function(r) {
      var tr = document.createElement('tr');
      [r.id, r.store_name || '—', formatCurrency(r.total_value || 0), formatReceiptType(r.type), r.purchase_date || '—', formatDate(r.captured_at)].forEach(function(val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '';
    showToast('Erro ao carregar notas', 'error');
    closeModal('receipts-modal');
  }
}

function formatReceiptType(type) {
  var types = { nota_fiscal: 'Nota Fiscal', recibo_cartao_credito: 'Cartão Crédito', recibo_cartao_debito: 'Cartão Débito', outro: 'Outro' };
  return types[type] || type || '—';
}

function setupCreateUserForm() {
  document.getElementById('btn-add-user').addEventListener('click', function() {
    document.getElementById('create-user-form').reset();
    openModal('create-user-modal');
  });

  document.getElementById('create-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var username = document.getElementById('new-username').value.trim();
    var email = document.getElementById('new-user-email').value.trim();

    if (!username || !email) {
      showToast('Preencha todos os campos', 'error');
      return;
    }

    try {
      var response = await api('/api/admin/users', { method: 'POST', body: { username: username, email: email } });
      var msg = 'Usuário criado com sucesso';
      if (response.data && response.data.temp_password) msg += '. Senha temporária: ' + response.data.temp_password;
      showToast(msg, 'success');
      closeModal('create-user-modal');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast(err.message || 'Erro ao criar usuário', 'error');
    }
  });
}

function setupFilterTabs() {
  var tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      loadUsers(tab.getAttribute('data-status'));
    });
  });
}

function getCurrentFilter() {
  var active = document.querySelector('.filter-tab.active');
  return active ? active.getAttribute('data-status') : 'all';
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function showConfirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  openModal('confirm-modal');

  var btn = document.getElementById('btn-confirm-yes');
  var newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async function() {
    await callback();
    closeModal('confirm-modal');
  });
}

function setupModalOverlays() {
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}

function logout() {
  clearToken();
  window.location.href = '/login';
}
