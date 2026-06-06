document.addEventListener('DOMContentLoaded', () => {
  redirectIfNotAuthenticated();
  const user = getUser();
  if (!user || user.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('sidebar-username').textContent = user.username;
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
    const data = await api('/api/admin/stats');
    document.getElementById('stat-total-users-count').textContent = data.totalUsers || 0;
    document.getElementById('stat-total-receipts-count').textContent = data.totalReceipts || 0;
    document.getElementById('stat-total-value-amount').textContent = formatCurrency(data.totalValueMonth || 0);

    const pendingCount = data.pendingApproval || 0;
    const pendingEl = document.getElementById('stat-pending-count');
    pendingEl.textContent = pendingCount;

    const pendingCard = document.getElementById('stat-pending');
    if (pendingCount > 0) {
      pendingCard.classList.add('badge-orange');
      pendingEl.classList.add('badge-orange');
    } else {
      pendingCard.classList.remove('badge-orange');
      pendingEl.classList.remove('badge-orange');
    }
  } catch (err) {
    showToast('Erro ao carregar estatísticas', 'error');
  }
}

async function loadUsers(status = 'all') {
  try {
    const users = await api(`/api/admin/users?status=${status}`);
    renderUsersTable(users);
  } catch (err) {
    showToast('Erro ao carregar usuários', 'error');
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';

  if (!users || users.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'text-center text-secondary';
    td.textContent = 'Nenhum usuário encontrado';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  users.forEach(u => {
    const tr = document.createElement('tr');

    const tdId = document.createElement('td');
    tdId.textContent = u.id;
    tr.appendChild(tdId);

    const tdUsername = document.createElement('td');
    tdUsername.textContent = u.username;
    tr.appendChild(tdUsername);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = u.email;
    tr.appendChild(tdEmail);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    if (!u.is_approved) {
      statusBadge.className = 'badge badge-orange';
      statusBadge.textContent = 'Pendente';
    } else if (u.is_active) {
      statusBadge.className = 'badge badge-green';
      statusBadge.textContent = 'Ativo';
    } else {
      statusBadge.className = 'badge badge-red';
      statusBadge.textContent = 'Inativo';
    }
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdMfa = document.createElement('td');
    tdMfa.textContent = u.mfa_enabled ? '🔒' : '—';
    tr.appendChild(tdMfa);

    const tdCreated = document.createElement('td');
    tdCreated.textContent = formatDate(u.created_at);
    tr.appendChild(tdCreated);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    if (!u.is_approved && u.is_active) {
      const btnApprove = createActionButton('Aprovar', 'btn-primary btn-sm', () => approveUser(u.id));
      tdActions.appendChild(btnApprove);

      const btnReceipts = createActionButton('Ver Notas', 'btn-secondary btn-sm', () => viewUserReceipts(u.id, u.username));
      tdActions.appendChild(btnReceipts);

      const btnReset = createActionButton('Resetar Senha', 'btn-secondary btn-sm', () => resetPassword(u.id));
      tdActions.appendChild(btnReset);

      const btnDeactivate = createActionButton('Desativar', 'btn-danger btn-sm', () => deactivateUser(u.id));
      tdActions.appendChild(btnDeactivate);
    } else if (u.is_active && u.is_approved) {
      const btnReceipts = createActionButton('Ver Notas', 'btn-secondary btn-sm', () => viewUserReceipts(u.id, u.username));
      tdActions.appendChild(btnReceipts);

      const btnReset = createActionButton('Resetar Senha', 'btn-secondary btn-sm', () => resetPassword(u.id));
      tdActions.appendChild(btnReset);

      const btnEmail = createActionButton('Alterar Email', 'btn-secondary btn-sm', () => changeEmail(u.id));
      tdActions.appendChild(btnEmail);

      const btnDeactivate = createActionButton('Desativar', 'btn-danger btn-sm', () => deactivateUser(u.id));
      tdActions.appendChild(btnDeactivate);
    } else {
      const inactiveText = document.createElement('span');
      inactiveText.className = 'text-secondary';
      inactiveText.textContent = 'Inativo';
      tdActions.appendChild(inactiveText);
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

function createActionButton(text, className, onClick) {
  const btn = document.createElement('button');
  btn.className = `btn ${className}`;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function approveUser(id) {
  showConfirm('Aprovar este usuário?', async () => {
    try {
      await api(`/api/admin/users/${id}/approve`, { method: 'PATCH' });
      showToast('Usuário aprovado com sucesso', 'success');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast('Erro ao aprovar usuário', 'error');
    }
  });
}

function resetPassword(id) {
  showConfirm('Resetar senha deste usuário?', async () => {
    try {
      await api(`/api/admin/users/${id}/reset-password`, { method: 'PATCH' });
      showToast('Nova senha enviada por email', 'success');
      loadUsers(getCurrentFilter());
    } catch (err) {
      showToast('Erro ao resetar senha', 'error');
    }
  });
}

function changeEmail(id) {
  const emailInput = document.getElementById('new-email-input');
  emailInput.value = '';
  openModal('email-modal');

  const btnSave = document.getElementById('btn-save-email');
  const newBtnSave = btnSave.cloneNode(true);
  btnSave.parentNode.replaceChild(newBtnSave, btnSave);

  newBtnSave.addEventListener('click', async () => {
    const newEmail = document.getElementById('new-email-input').value.trim();
    if (!newEmail) {
      showToast('Informe o novo email', 'error');
      return;
    }
    try {
      await api(`/api/admin/users/${id}/email`, {
        method: 'PATCH',
        body: JSON.stringify({ email: newEmail })
      });
      showToast('Email alterado com sucesso', 'success');
      closeModal('email-modal');
      loadUsers(getCurrentFilter());
    } catch (err) {
      showToast('Erro ao alterar email', 'error');
    }
  });
}

function deactivateUser(id) {
  showConfirm('Desativar este usuário?', async () => {
    try {
      await api(`/api/admin/users/${id}`, { method: 'DELETE' });
      showToast('Usuário desativado com sucesso', 'success');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast('Erro ao desativar usuário', 'error');
    }
  });
}

async function viewUserReceipts(id, username) {
  document.getElementById('receipts-modal-title').textContent = `Notas de ${username}`;
  const tbody = document.getElementById('user-receipts-tbody');
  tbody.innerHTML = '';

  try {
    const receipts = await api(`/api/admin/users/${id}/receipts`);
    if (!receipts || receipts.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'text-center text-secondary';
      td.textContent = 'Nenhuma nota encontrada';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      receipts.forEach(r => {
        const tr = document.createElement('tr');

        const tdId = document.createElement('td');
        tdId.textContent = r.id;
        tr.appendChild(tdId);

        const tdStore = document.createElement('td');
        tdStore.textContent = r.store_name || '—';
        tr.appendChild(tdStore);

        const tdValue = document.createElement('td');
        tdValue.className = 'text-mono';
        tdValue.textContent = formatCurrency(r.total_value || 0);
        tr.appendChild(tdValue);

        const tdType = document.createElement('td');
        tdType.textContent = formatReceiptType(r.type);
        tr.appendChild(tdType);

        const tdDate = document.createElement('td');
        tdDate.textContent = r.purchase_date || '—';
        tr.appendChild(tdDate);

        const tdCaptured = document.createElement('td');
        tdCaptured.textContent = formatDate(r.captured_at);
        tr.appendChild(tdCaptured);

        tbody.appendChild(tr);
      });
    }
    openModal('receipts-modal');
  } catch (err) {
    showToast('Erro ao carregar notas', 'error');
  }
}

function formatReceiptType(type) {
  const types = {
    nota_fiscal: 'Nota Fiscal',
    recibo_cartao_credito: 'Cartão Crédito',
    recibo_cartao_debito: 'Cartão Débito',
    outro: 'Outro'
  };
  return types[type] || type || '—';
}

function setupCreateUserForm() {
  document.getElementById('btn-add-user').addEventListener('click', () => {
    document.getElementById('create-user-form').reset();
    openModal('create-user-modal');
  });

  document.getElementById('create-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-username').value.trim();
    const email = document.getElementById('new-user-email').value.trim();

    if (!username || !email) {
      showToast('Preencha todos os campos', 'error');
      return;
    }

    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username, email })
      });
      showToast('Usuário criado. Senha temporária enviada por email.', 'success');
      closeModal('create-user-modal');
      loadUsers(getCurrentFilter());
      loadStats();
    } catch (err) {
      showToast('Erro ao criar usuário', 'error');
    }
  });
}

function setupFilterTabs() {
  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadUsers(tab.dataset.status);
    });
  });
}

function getCurrentFilter() {
  const activeTab = document.querySelector('.filter-tab.active');
  return activeTab ? activeTab.dataset.status : 'all';
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.hidden = false;
  modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.hidden = true;
  modal.style.display = 'none';
}

function showConfirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  openModal('confirm-modal');

  const btnYes = document.getElementById('btn-confirm-yes');
  const newBtnYes = btnYes.cloneNode(true);
  btnYes.parentNode.replaceChild(newBtnYes, btnYes);

  newBtnYes.addEventListener('click', async () => {
    await callback();
    closeModal('confirm-modal');
  });
}

function setupModalOverlays() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}
