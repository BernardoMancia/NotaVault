document.addEventListener('DOMContentLoaded', function() {
  redirectIfNotAuthenticated();
  checkForcePasswordChange();
  init();
});

var state = {
  page: 1,
  per_page: 20,
  sort_by: 'purchase_date',
  sort_order: 'desc',
  filters: {}
};

var currentReceipts = [];
var cameraStream = null;

var TYPE_LABELS = {
  nota_fiscal: 'Nota Fiscal',
  recibo_cartao_credito: 'Cartão Crédito',
  recibo_cartao_debito: 'Cartão Débito',
  outro: 'Outro'
};

var TYPE_BADGES = {
  nota_fiscal: 'badge-cyan',
  recibo_cartao_credito: 'badge-purple',
  recibo_cartao_debito: 'badge-orange',
  outro: 'badge-red'
};

var FILTER_LABELS = {
  date_from: 'Data início',
  date_to: 'Data fim',
  value_min: 'Valor mín.',
  value_max: 'Valor máx.',
  store: 'Estabelecimento',
  type: 'Tipo'
};

async function init() {
  var user = getUser();
  if (!user) return;

  var sidebarUsername = document.getElementById('sidebar-username');
  if (sidebarUsername) sidebarUsername.textContent = user.username;

  var greeting = document.getElementById('greeting');
  if (greeting) greeting.textContent = 'Olá, ' + user.username;

  var avatarEl = document.querySelector('.user-avatar');
  if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();

  var sidebarAvatar = document.querySelector('.sidebar-avatar');
  if (sidebarAvatar) sidebarAvatar.textContent = user.username.charAt(0).toUpperCase();

  if (user.role === 'admin') {
    var adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = '';
  }

  setupEventListeners();
  await loadStats();
  await loadReceipts();
  await loadMfaStatus();
}

async function loadStats() {
  try {
    var dailyRes = await api('/api/receipts/stats/daily');
    var monthlyRes = await api('/api/receipts/stats/monthly');

    var daily = dailyRes.data || {};
    var monthly = monthlyRes.data || {};

    var elDailyCount = document.getElementById('stat-daily-count');
    if (elDailyCount) elDailyCount.textContent = daily.totalReceipts || 0;

    var elDailyValue = document.getElementById('stat-daily-value');
    if (elDailyValue) elDailyValue.textContent = formatCurrency(daily.totalValue || 0);

    var elMonthlyCount = document.getElementById('stat-monthly-count');
    if (elMonthlyCount) elMonthlyCount.textContent = monthly.totalReceipts || 0;

    var elMonthlyValue = document.getElementById('stat-monthly-value');
    if (elMonthlyValue) elMonthlyValue.textContent = formatCurrency(monthly.totalValue || 0);
  } catch (err) {
    showToast('Erro ao carregar estatísticas', 'error');
  }
}

async function loadMfaStatus() {
  try {
    var res = await api('/api/user/mfa/status');
    var badge = document.getElementById('mfa-badge');
    var mfaUserStatus = document.querySelector('.sidebar-user-mfa');

    if (res.data && res.data.mfa_enabled) {
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.classList.add('text-green');
      }
      if (mfaUserStatus) {
        mfaUserStatus.classList.add('active');
        mfaUserStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> MFA Ativo';
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (mfaUserStatus) {
        mfaUserStatus.classList.remove('active');
        mfaUserStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> MFA Inativo';
      }
    }
  } catch (_) {}
}

function setupEventListeners() {
  var btnCamera = document.getElementById('btn-camera');
  if (btnCamera) btnCamera.addEventListener('click', openCamera);

  var btnUpload = document.getElementById('btn-upload');
  var fileInput = document.getElementById('file-input');
  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', function() { fileInput.click(); });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) {
        handleUpload(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  var btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.addEventListener('click', exportCSV);

  var btnApplyFilters = document.getElementById('btn-apply-filters');
  if (btnApplyFilters) btnApplyFilters.addEventListener('click', applyFilters);

  var btnClearFilters = document.getElementById('btn-clear-filters');
  if (btnClearFilters) btnClearFilters.addEventListener('click', clearFilters);

  document.querySelectorAll('.date-preset').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      handleDatePreset(e.target.dataset.preset);
    });
  });

  document.querySelectorAll('.sortable').forEach(function(th) {
    th.addEventListener('click', function(e) {
      var target = e.target.closest('th');
      if (target && target.dataset.sort) handleSort(target.dataset.sort);
    });
  });

  var uploadZone = document.getElementById('upload-zone');
  if (uploadZone) {
    uploadZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleUpload(e.dataTransfer.files[0]);
      }
    });
    uploadZone.addEventListener('click', function() {
      var fi = document.getElementById('file-input');
      if (fi) fi.click();
    });
  }

  var modalOverlay = document.getElementById('detail-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) closeModal();
    });
    var modalCloseBtn = modalOverlay.querySelector('.modal-close');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  }

  document.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      var section = item.dataset.section;
      if (!section) return;
      e.preventDefault();

      document.querySelectorAll('.sidebar-nav-item').forEach(function(nav) {
        nav.classList.remove('active');
      });
      item.classList.add('active');

      document.querySelectorAll('.content-section').forEach(function(sec) {
        sec.style.display = 'none';
      });

      if (section === 'receipts') {
        document.getElementById('section-dashboard').style.display = 'block';
        var tableEl = document.getElementById('table-wrapper');
        if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
      } else {
        var target = document.getElementById('section-' + section);
        if (target) target.style.display = 'block';
      }

      var sidebar = document.getElementById('sidebar');
      var overlay = document.getElementById('sidebar-overlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    });
  });

  var filterStore = document.getElementById('filter-store');
  if (filterStore) {
    filterStore.addEventListener('input', debounce(function() {
      applyFilters();
    }, 300));
  }

  var changePasswordForm = document.getElementById('settings-change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', function(e) {
      e.preventDefault();
      handleChangePassword();
    });
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeModal();
      closeCamera();
    }
  });
}

function openCamera() {
  var overlay = document.getElementById('camera-overlay');
  var video = document.getElementById('camera-video');
  if (!overlay || !video) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Câmera não suportada neste navegador', 'error');
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  }).then(function(stream) {
    cameraStream = stream;
    video.srcObject = stream;
    video.play();
    overlay.classList.add('active');
  }).catch(function(err) {
    showToast('Erro ao acessar câmera: ' + err.message, 'error');
  });

  var captureBtn = document.getElementById('camera-capture');
  if (captureBtn) {
    captureBtn.onclick = capturePhoto;
  }
  var closeBtn = document.getElementById('camera-close');
  if (closeBtn) {
    closeBtn.onclick = closeCamera;
  }
}

function capturePhoto() {
  var video = document.getElementById('camera-video');
  var canvas = document.getElementById('camera-canvas');
  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(function(blob) {
    closeCamera();
    if (blob) handleUpload(blob);
  }, 'image/jpeg', 0.92);
}

function closeCamera() {
  var overlay = document.getElementById('camera-overlay');
  var video = document.getElementById('camera-video');

  if (cameraStream) {
    cameraStream.getTracks().forEach(function(track) { track.stop(); });
    cameraStream = null;
  }
  if (video) video.srcObject = null;
  if (overlay) overlay.classList.remove('active');
}

function handleUpload(file) {
  var uploadZone = document.getElementById('upload-zone');
  var uploadProgress = document.getElementById('upload-progress');
  var progressFill = document.getElementById('progress-fill');
  var uploadStatus = document.getElementById('upload-status');
  var uploadPercent = document.getElementById('upload-percent');

  if (uploadZone) uploadZone.classList.add('active');
  if (uploadProgress) uploadProgress.classList.add('active');
  if (progressFill) progressFill.style.width = '0%';
  if (uploadStatus) uploadStatus.textContent = 'Enviando...';
  if (uploadPercent) uploadPercent.textContent = '0%';

  var formData = new FormData();
  formData.append('receipt', file, file.name || 'capture.jpg');

  var xhr = new XMLHttpRequest();

  xhr.upload.onprogress = function(e) {
    if (e.lengthComputable) {
      var pct = Math.round((e.loaded / e.total) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (uploadPercent) uploadPercent.textContent = pct + '%';
      if (uploadStatus) {
        if (pct < 100) {
          uploadStatus.textContent = 'Enviando...';
        } else {
          uploadStatus.textContent = 'Processando OCR...';
        }
      }
    }
  };

  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var response = JSON.parse(xhr.responseText);
        var receipt = response.data;
        var storeName = receipt.store_name || 'Comprovante';
        var value = receipt.total_value ? formatCurrency(receipt.total_value) : '';
        var msg = storeName;
        if (value) msg += ' - ' + value;
        showToast('Upload realizado: ' + msg, 'success');
        if (uploadStatus) uploadStatus.textContent = 'Concluído!';
        if (progressFill) progressFill.style.width = '100%';
        loadStats();
        loadReceipts();
      } catch (_) {
        showToast('Upload realizado com sucesso', 'success');
        loadStats();
        loadReceipts();
      }
    } else {
      try {
        var errData = JSON.parse(xhr.responseText);
        showToast(errData.error || 'Erro no upload', 'error');
      } catch (_) {
        showToast('Erro no upload', 'error');
      }
      if (uploadStatus) uploadStatus.textContent = 'Erro no envio';
    }

    setTimeout(function() {
      if (uploadZone) uploadZone.classList.remove('active');
      if (uploadProgress) uploadProgress.classList.remove('active');
      if (progressFill) progressFill.style.width = '0%';
    }, 2000);
  };

  xhr.onerror = function() {
    showToast('Erro de conexão no upload', 'error');
    if (uploadStatus) uploadStatus.textContent = 'Erro de conexão';
    setTimeout(function() {
      if (uploadZone) uploadZone.classList.remove('active');
      if (uploadProgress) uploadProgress.classList.remove('active');
    }, 2000);
  };

  xhr.open('POST', '/api/receipts/upload');
  var token = getToken();
  if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  xhr.send(formData);
}

async function loadReceipts() {
  try {
    var params = [];
    params.push('page=' + state.page);
    params.push('per_page=' + state.per_page);
    params.push('sort_by=' + state.sort_by);
    params.push('sort_order=' + state.sort_order);

    Object.keys(state.filters).forEach(function(key) {
      if (state.filters[key] !== '' && state.filters[key] !== null && state.filters[key] !== undefined) {
        params.push(encodeURIComponent(key) + '=' + encodeURIComponent(state.filters[key]));
      }
    });

    var queryString = params.join('&');
    var res = await api('/api/receipts?' + queryString);

    renderTable(res.data || []);
    renderPagination(res.pagination || { page: 1, per_page: 20, total: 0, total_pages: 0 });

    var resultsCount = document.getElementById('results-count');
    var pagination = res.pagination || {};
    if (resultsCount) {
      resultsCount.innerHTML = 'Exibindo <span>' + (res.data || []).length + '</span> de <span>' + (pagination.total || 0) + '</span> resultados';
    }

    var emptyState = document.getElementById('empty-state');
    var tableWrapper = document.getElementById('table-wrapper');
    if (emptyState && tableWrapper) {
      if (!res.data || res.data.length === 0) {
        emptyState.style.display = 'block';
        tableWrapper.style.display = 'none';
      } else {
        emptyState.style.display = 'none';
        tableWrapper.style.display = 'block';
      }
    }
  } catch (err) {
    showToast('Erro ao carregar comprovantes', 'error');
  }
}

function renderTable(data) {
  currentReceipts = data;
  var tbody = document.getElementById('receipts-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach(function(receipt, index) {
    var rowNum = ((state.page - 1) * state.per_page) + index + 1;
    var tr = document.createElement('tr');
    tr.setAttribute('data-id', receipt.id);

    var typeLabel = TYPE_LABELS[receipt.type] || 'Outro';
    var badgeClass = TYPE_BADGES[receipt.type] || 'badge-red';

    tr.innerHTML =
      '<td class="cell-mono">' + rowNum + '</td>' +
      '<td>' + formatDate(receipt.purchase_date) + '</td>' +
      '<td>' + escapeHtml(receipt.store_name || 'Não identificado') + '</td>' +
      '<td><span class="badge ' + badgeClass + '">' + typeLabel + '</span></td>' +
      '<td class="cell-mono text-right">' + formatCurrency(receipt.total_value || 0) + '</td>' +
      '<td>' + escapeHtml(receipt.payment_method || '-') + '</td>' +
      '<td class="cell-actions">' +
        '<button class="btn-icon btn-view" title="Detalhes">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        '</button>' +
        '<button class="btn-icon btn-delete" title="Excluir">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>' +
      '</td>';

    var viewBtn = tr.querySelector('.btn-view');
    var deleteBtn = tr.querySelector('.btn-delete');

    viewBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openDetail(receipt.id);
    });

    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      deleteReceipt(receipt.id);
    });

    tr.addEventListener('click', function() {
      toggleExpandRow(receipt.id, tr);
    });

    tbody.appendChild(tr);
  });
}

function toggleExpandRow(id, parentRow) {
  var existing = document.getElementById('expand-' + id);
  if (existing) {
    existing.classList.toggle('active');
    return;
  }

  var receipt = currentReceipts.find(function(r) { return r.id === id; });
  if (!receipt) return;

  var expandTr = document.createElement('tr');
  expandTr.id = 'expand-' + id;
  expandTr.className = 'expandable-row active';

  var colCount = parentRow.querySelectorAll('td').length;
  var td = document.createElement('td');
  td.setAttribute('colspan', colCount);

  var textPreview = receipt.transcribed_text
    ? (receipt.transcribed_text.length > 300
      ? receipt.transcribed_text.substring(0, 300) + '...'
      : receipt.transcribed_text)
    : 'Texto não disponível';

  td.innerHTML =
    '<div class="expandable-content">' +
      '<img class="receipt-thumbnail" src="/api/receipts/' + id + '/image" alt="Comprovante" onerror="this.style.display=\'none\'">' +
      '<div class="receipt-details">' +
        '<h4>' + escapeHtml(receipt.store_name || 'Comprovante') + '</h4>' +
        '<p>' + escapeHtml(textPreview) + '</p>' +
      '</div>' +
    '</div>';

  expandTr.appendChild(td);
  parentRow.parentNode.insertBefore(expandTr, parentRow.nextSibling);
}

function renderPagination(pagination) {
  var container = document.getElementById('pagination');
  if (!container) return;
  container.innerHTML = '';

  if (pagination.total_pages <= 1) return;

  var prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.disabled = pagination.page <= 1;
  prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>';
  prevBtn.addEventListener('click', function() {
    state.page = pagination.page - 1;
    loadReceipts();
  });
  container.appendChild(prevBtn);

  var pages = buildPageNumbers(pagination.page, pagination.total_pages);
  pages.forEach(function(p) {
    if (p === '...') {
      var ellipsis = document.createElement('span');
      ellipsis.className = 'pagination-ellipsis';
      ellipsis.textContent = '...';
      container.appendChild(ellipsis);
    } else {
      var pageBtn = document.createElement('button');
      pageBtn.className = 'pagination-btn' + (p === pagination.page ? ' active' : '');
      pageBtn.textContent = p;
      pageBtn.addEventListener('click', function() {
        state.page = p;
        loadReceipts();
      });
      container.appendChild(pageBtn);
    }
  });

  var nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.disabled = pagination.page >= pagination.total_pages;
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>';
  nextBtn.addEventListener('click', function() {
    state.page = pagination.page + 1;
    loadReceipts();
  });
  container.appendChild(nextBtn);
}

function buildPageNumbers(current, total) {
  var pages = [];
  if (total <= 7) {
    for (var i = 1; i <= total; i++) pages.push(i);
    return pages;
  }

  pages.push(1);

  if (current > 4) {
    pages.push('...');
  }

  var start = Math.max(2, current - 2);
  var end = Math.min(total - 1, current + 2);

  for (var j = start; j <= end; j++) {
    pages.push(j);
  }

  if (current < total - 3) {
    pages.push('...');
  }

  pages.push(total);
  return pages;
}

function handleDatePreset(preset) {
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;
  var fromStr = todayStr;

  if (preset === 'today') {
    fromStr = todayStr;
  } else if (preset === '7d') {
    var d7 = new Date(today);
    d7.setDate(d7.getDate() - 7);
    fromStr = d7.getFullYear() + '-' + String(d7.getMonth() + 1).padStart(2, '0') + '-' + String(d7.getDate()).padStart(2, '0');
  } else if (preset === '30d') {
    var d30 = new Date(today);
    d30.setDate(d30.getDate() - 30);
    fromStr = d30.getFullYear() + '-' + String(d30.getMonth() + 1).padStart(2, '0') + '-' + String(d30.getDate()).padStart(2, '0');
  } else if (preset === 'month') {
    fromStr = yyyy + '-' + mm + '-01';
  }

  var dateFrom = document.getElementById('filter-date-from');
  var dateTo = document.getElementById('filter-date-to');
  if (dateFrom) dateFrom.value = fromStr;
  if (dateTo) dateTo.value = todayStr;

  applyFilters();
}

function applyFilters() {
  var filters = {};

  var dateFrom = document.getElementById('filter-date-from');
  if (dateFrom && dateFrom.value) filters.date_from = dateFrom.value;

  var dateTo = document.getElementById('filter-date-to');
  if (dateTo && dateTo.value) filters.date_to = dateTo.value;

  var valueMin = document.getElementById('filter-value-min');
  if (valueMin && valueMin.value) filters.value_min = valueMin.value;

  var valueMax = document.getElementById('filter-value-max');
  if (valueMax && valueMax.value) filters.value_max = valueMax.value;

  var store = document.getElementById('filter-store');
  if (store && store.value.trim()) filters.store = store.value.trim();

  var type = document.getElementById('filter-type');
  if (type && type.value) filters.type = type.value;

  state.filters = filters;
  state.page = 1;
  loadReceipts();
  renderFilterChips();
}

function clearFilters() {
  var ids = ['filter-date-from', 'filter-date-to', 'filter-value-min', 'filter-value-max', 'filter-store', 'filter-type'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  state.filters = {};
  state.page = 1;
  loadReceipts();

  var chipsContainer = document.getElementById('filter-chips');
  if (chipsContainer) chipsContainer.innerHTML = '';
}

function renderFilterChips() {
  var container = document.getElementById('filter-chips');
  if (!container) return;
  container.innerHTML = '';

  Object.keys(state.filters).forEach(function(key) {
    var value = state.filters[key];
    if (!value) return;

    var label = FILTER_LABELS[key] || key;
    var displayValue = value;
    if (key === 'type') displayValue = TYPE_LABELS[value] || value;
    if (key === 'date_from' || key === 'date_to') displayValue = formatDate(value);

    var chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML =
      '<span>' + escapeHtml(label) + ': ' + escapeHtml(displayValue) + '</span>' +
      '<span class="chip-remove" data-filter="' + key + '">✕</span>';

    chip.querySelector('.chip-remove').addEventListener('click', function() {
      removeFilter(key);
    });

    container.appendChild(chip);
  });
}

function removeFilter(key) {
  delete state.filters[key];

  var inputMap = {
    date_from: 'filter-date-from',
    date_to: 'filter-date-to',
    value_min: 'filter-value-min',
    value_max: 'filter-value-max',
    store: 'filter-store',
    type: 'filter-type'
  };

  var inputId = inputMap[key];
  if (inputId) {
    var el = document.getElementById(inputId);
    if (el) el.value = '';
  }

  state.page = 1;
  loadReceipts();
  renderFilterChips();
}

function handleSort(column) {
  if (!column) return;

  if (state.sort_by === column) {
    state.sort_order = state.sort_order === 'desc' ? 'asc' : 'desc';
  } else {
    state.sort_by = column;
    state.sort_order = 'desc';
  }

  updateSortIcons();
  loadReceipts();
}

function updateSortIcons() {
  document.querySelectorAll('.sortable').forEach(function(th) {
    var sortKey = th.dataset.sort;
    var icon = th.querySelector('.sort-icon');
    th.classList.remove('asc', 'desc');

    if (sortKey === state.sort_by) {
      th.classList.add(state.sort_order);
      if (icon) icon.textContent = state.sort_order === 'asc' ? '↑' : '↓';
    } else {
      if (icon) icon.textContent = '↕';
    }
  });
}

async function openDetail(id) {
  try {
    var res = await api('/api/receipts/' + id);
    var receipt = res.data;
    if (!receipt) return;

    var modal = document.getElementById('detail-modal');
    if (!modal) return;

    var detailImage = document.getElementById('detail-image');
    if (detailImage) detailImage.src = '/api/receipts/' + id + '/image';

    var detailStore = document.getElementById('detail-store');
    if (detailStore) detailStore.textContent = receipt.store_name || 'Não identificado';

    var detailDate = document.getElementById('detail-date');
    if (detailDate) detailDate.textContent = formatDate(receipt.purchase_date);

    var detailTime = document.getElementById('detail-time');
    if (detailTime) detailTime.textContent = receipt.purchase_time || '-';

    var detailValue = document.getElementById('detail-value');
    if (detailValue) detailValue.textContent = formatCurrency(receipt.total_value || 0);

    var detailType = document.getElementById('detail-type');
    if (detailType) detailType.textContent = TYPE_LABELS[receipt.type] || 'Outro';

    var detailPayment = document.getElementById('detail-payment');
    if (detailPayment) detailPayment.textContent = receipt.payment_method || '-';

    var detailText = document.getElementById('detail-text');
    if (detailText) detailText.textContent = receipt.transcribed_text || 'Texto não disponível';

    var detailStructured = document.getElementById('detail-structured');
    if (detailStructured) {
      detailStructured.innerHTML = '';
      if (receipt.structured_data) {
        try {
          var parsed = typeof receipt.structured_data === 'string'
            ? JSON.parse(receipt.structured_data)
            : receipt.structured_data;

          if (Array.isArray(parsed)) {
            var table = document.createElement('table');
            table.className = 'data-table';
            table.innerHTML = '<thead><tr><th>Item</th><th>Qtd</th><th class="text-right">Valor</th></tr></thead>';
            var tableBody = document.createElement('tbody');
            parsed.forEach(function(item) {
              var row = document.createElement('tr');
              row.innerHTML =
                '<td>' + escapeHtml(item.name || item.description || '-') + '</td>' +
                '<td class="cell-mono">' + (item.quantity || 1) + '</td>' +
                '<td class="cell-mono text-right">' + formatCurrency(item.value || item.price || 0) + '</td>';
              tableBody.appendChild(row);
            });
            table.appendChild(tableBody);
            detailStructured.appendChild(table);
          } else if (typeof parsed === 'object' && parsed !== null) {
            Object.keys(parsed).forEach(function(key) {
              var row = document.createElement('div');
              row.style.cssText = 'display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;';
              row.innerHTML =
                '<span style="color:var(--text-secondary)">' + escapeHtml(key) + '</span>' +
                '<span class="cell-mono">' + escapeHtml(String(parsed[key])) + '</span>';
              detailStructured.appendChild(row);
            });
          }
        } catch (_) {}
      }
    }

    var detailMeta = document.getElementById('detail-meta');
    if (detailMeta) {
      detailMeta.innerHTML =
        '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;font-size:0.75rem;color:var(--text-muted)">' +
          '<span>Capturado em</span><span class="cell-mono">' + formatDateTime(receipt.captured_at) + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;font-size:0.75rem;color:var(--text-muted)">' +
          '<span>Tipo MIME</span><span class="cell-mono">' + escapeHtml(receipt.original_mime_type || '-') + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;font-size:0.75rem;color:var(--text-muted)">' +
          '<span>Tamanho original</span><span class="cell-mono">' + formatBytes(receipt.original_size_bytes) + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;padding:0.35rem 0;font-size:0.75rem;color:var(--text-muted)">' +
          '<span>Tamanho comprimido</span><span class="cell-mono">' + formatBytes(receipt.compressed_size_bytes) + '</span>' +
        '</div>';
    }

    modal.classList.add('active');
  } catch (err) {
    showToast('Erro ao carregar detalhes', 'error');
  }
}

function closeModal() {
  var modal = document.getElementById('detail-modal');
  if (modal) modal.classList.remove('active');
}

async function deleteReceipt(id) {
  var confirmed = confirm('Tem certeza que deseja excluir este comprovante?');
  if (!confirmed) return;

  try {
    await api('/api/receipts/' + id, { method: 'DELETE' });
    showToast('Comprovante removido com sucesso', 'success');
    loadReceipts();
    loadStats();
  } catch (err) {
    showToast('Erro ao excluir comprovante', 'error');
  }
}

function exportCSV() {
  if (!currentReceipts || currentReceipts.length === 0) {
    showToast('Nenhum dado para exportar', 'warning');
    return;
  }

  var headers = ['Data', 'Estabelecimento', 'Tipo', 'Valor', 'Método Pagamento'];
  var rows = [headers.join(';')];

  currentReceipts.forEach(function(r) {
    var row = [
      formatDate(r.purchase_date),
      '"' + (r.store_name || 'Não identificado').replace(/"/g, '""') + '"',
      '"' + (TYPE_LABELS[r.type] || 'Outro') + '"',
      (r.total_value || 0).toFixed(2).replace('.', ','),
      '"' + (r.payment_method || '-').replace(/"/g, '""') + '"'
    ];
    rows.push(row.join(';'));
  });

  var csvContent = '\uFEFF' + rows.join('\r\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);

  var link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'notavault_export_' + new Date().toISOString().split('T')[0] + '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('CSV exportado com sucesso', 'success');
}

async function handleChangePassword() {
  var currentPwd = document.getElementById('settings-current-password');
  var newPwd = document.getElementById('settings-new-password');
  var confirmPwd = document.getElementById('settings-confirm-password');
  var submitBtn = document.getElementById('settings-change-password-btn');

  if (!currentPwd || !newPwd || !confirmPwd) return;

  if (newPwd.value !== confirmPwd.value) {
    showToast('As senhas não coincidem', 'error');
    return;
  }

  if (newPwd.value.length < 8) {
    showToast('A nova senha deve ter pelo menos 8 caracteres', 'error');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: {
        current_password: currentPwd.value,
        new_password: newPwd.value
      }
    });

    showToast('Senha alterada com sucesso', 'success');
    currentPwd.value = '';
    newPwd.value = '';
    confirmPwd.value = '';
  } catch (err) {
    showToast(err.message || 'Erro ao alterar senha', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}
