// ============================================================
// CONFIGURATION
// ============================================================
const API_URL = 'https://john-dbfu.onrender.com/api';  // ← préfixe /api inclus
let token = localStorage.getItem('ps_token') || null;
let currentChildId = null;
let currentPage = 'dashboard';
let chartInstance = null;
let mapInstance = null;
let mapMarker = null;

// ============================================================
// API HELPER
// ============================================================
async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API_URL + path, opts);
    if (res.status === 401) { logout(); return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  } catch (e) {
    if (e.message.includes('Failed to fetch')) showNetworkError();
    throw e;
  }
}

function showNetworkError() {
  let t = document.getElementById('net-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'net-toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a2332;border:1px solid rgba(248,113,113,0.3);color:#F87171;padding:12px 18px;border-radius:10px;font-size:13px;z-index:9999;';
    t.textContent = '⚠️  Impossible de joindre le serveur';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }
}

// ============================================================
// AUTHENTIFICATION
// ============================================================
window.login = async function() {
  const pw = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  btn.style.opacity = '0.7';
  btn.disabled = true;
  try {
    const data = await api('POST', '/admin/login', { password: pw });
    if (!data) { btn.style.opacity = '1'; btn.disabled = false; return; }
    token = data.token;
    localStorage.setItem('ps_token', token);
    initApp();
  } catch {
    err.classList.remove('hidden');
    btn.style.opacity = '1'; btn.disabled = false;
  }
};

window.logout = function() {
  token = null;
  localStorage.removeItem('ps_token');
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('login-password').value = '';
};

document.getElementById('login-password')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') window.login();
});

// ============================================================
// INITIALISATION
// ============================================================
async function initApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  await loadChildren();
  showPage('dashboard');
}

async function loadChildren() {
  const data = await api('GET', '/admin/children');
  if (!data || !data.children) return [];
  const children = data.children.map(c => ({
    id: c.id,
    name: c.device_name,
    online: isOnline(c.last_seen),
    last_seen: c.last_seen,
    screen_time: c.screen_time || 0
  }));
  const sel = document.getElementById('child-selector');
  if (sel) {
    sel.innerHTML = '<option value="">— Enfant —</option>';
    children.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    if (children.length && !currentChildId) {
      currentChildId = children[0].id;
      sel.value = currentChildId;
    }
  }
  const onlineCount = children.filter(c => c.online).length;
  setBadge('nav-badge-children', onlineCount);
  renderChildrenTable(children);
  return children;
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000 / 60;
  return diff < 5;
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) { el.textContent = n; el.classList.add('show'); }
  else el.classList.remove('show');
}

window.onChildChange = function() {
  currentChildId = document.getElementById('child-selector').value || null;
  refreshPage();
};

// ============================================================
// PAGES & NAVIGATION
// ============================================================
window.showPage = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  currentPage = page;
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = { dashboard:'Dashboard', children:'Enfants', notifications:'Messages', rules:'Règles de blocage', location:'Localisation', settings:'Paramètres' };
  document.getElementById('page-title').textContent = titles[page] || page;
  const needChild = ['notifications','rules','location','dashboard'].includes(page);
  document.getElementById('child-selector-wrap').classList.toggle('hidden', !needChild);
  refreshPage();
  if (window.innerWidth <= 768) closeSidebar();
};

function refreshPage() {
  if (currentPage === 'dashboard') loadDashboard();
  else if (currentPage === 'notifications') loadNotifications();
  else if (currentPage === 'rules') loadRules();
  else if (currentPage === 'location') loadLocation();
  // settings n'a pas de chargement particulier
}

// ============================================================
// LOCALISATION (CORRIGÉE)
// ============================================================
async function loadLocation() {
  const meta = document.getElementById('loc-meta');
  if (!currentChildId) {
    meta.innerHTML = '<span class="loc-chip">📍 Sélectionnez un enfant</span>';
    if (mapInstance) mapInstance.remove();
    return;
  }

  // Récupère la dernière localisation (stockée dans connection_logs)
  const data = await api('GET', `/child/location/${currentChildId}`);
  if (!data || !data.location) {
    meta.innerHTML = '<span class="loc-chip">📍 Aucune position reçue</span>';
    if (mapInstance) mapInstance.remove();
    return;
  }

  const loc = data.location;
  const lat = parseFloat(loc.latitude);
  const lng = parseFloat(loc.longitude);
  const accuracy = loc.accuracy || 0;
  const battery = loc.battery_level || 0;
  const timestamp = loc.timestamp ? new Date(loc.timestamp) : new Date();

  if (!mapInstance) {
    mapInstance = L.map('map', { zoomControl: true }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '©OpenStreetMap ©CARTO',
      maxZoom: 19
    }).addTo(mapInstance);
  } else {
    mapInstance.setView([lat, lng], 15);
  }

  if (mapMarker) mapMarker.remove();
  const icon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#C8FF00;border-radius:50%;border:3px solid #0D1117;box-shadow:0 0 16px rgba(200,255,0,0.7)"></div>`,
    className: '', iconSize: [14,14], iconAnchor: [7,7]
  });
  mapMarker = L.marker([lat, lng], { icon }).addTo(mapInstance);
  mapMarker.bindPopup(`
    <div style="font-family:'DM Sans',sans-serif;font-size:12px;line-height:1.6">
      <strong>${document.querySelector('#child-selector option:checked')?.textContent || 'Enfant'}</strong><br>
      🕐 ${timestamp.toLocaleString('fr-FR')}<br>
      🔋 ${battery}% · 📡 ±${Math.round(accuracy)}m
    </div>
  `).openPopup();

  meta.innerHTML = `
    <span class="loc-chip">📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
    <span class="loc-chip">🕐 ${timeAgo(timestamp)}</span>
    <span class="loc-chip">🔋 ${battery}%</span>
    <span class="loc-chip">📡 ±${Math.round(accuracy)}m</span>
  `;
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const childrenData = await api('GET', '/admin/children');
  const children = childrenData?.children || [];
  document.getElementById('stat-children').textContent = children.length;

  // Nombre total de règles actives
  let activeRulesCount = 0;
  for (const child of children) {
    const rulesData = await api('GET', `/admin/rules/${child.id}`);
    if (rulesData?.rules) activeRulesCount += rulesData.rules.filter(r => r.is_active).length;
  }
  document.getElementById('stat-rules').textContent = activeRulesCount;

  let unread = 0;
  if (currentChildId) {
    const notifs = await api('GET', `/admin/children/${currentChildId}/notifications?limit=100`);
    if (notifs?.notifications) unread = notifs.notifications.filter(n => !n.is_read).length;
  }
  document.getElementById('stat-unread').textContent = unread;
  setBadge('nav-badge-notif', unread);

  const child = children.find(c => c.id === currentChildId);
  const screenSec = child?.screen_time || 0;
  document.getElementById('stat-screen-time').textContent = fmtDuration(screenSec);

  if (currentChildId) loadChartData();
}

async function loadChartData() {
  if (!currentChildId) return;
  const data = await api('GET', `/admin/children/${currentChildId}/notifications?limit=500`);
  if (!data?.notifications) return;
  const notifs = data.notifications;
  const last7 = new Date();
  last7.setDate(last7.getDate() - 7);
  const filtered = notifs.filter(n => new Date(n.timestamp) >= last7);
  const byDay = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    byDay[key] = 0;
  }
  filtered.forEach(n => {
    const day = n.timestamp.slice(0,10);
    if (byDay[day] !== undefined) byDay[day]++;
  });
  const labels = Object.keys(byDay).sort();
  const values = labels.map(l => byDay[l]);
  renderChart(labels, values);
}

function renderChart(labels, values) {
  const ctx = document.getElementById('chart-screentime');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Aucune donnée'],
      datasets: [{
        label: 'Notifications',
        data: values.length ? values : [0],
        backgroundColor: 'rgba(200,255,0,0.15)',
        borderColor: 'rgba(200,255,0,0.7)',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#4A5A72' } },
        y: { beginAtZero: true, ticks: { color: '#4A5A72' } }
      }
    }
  });
}

// ============================================================
// ENFANTS (TABLEAU)
// ============================================================
function renderChildrenTable(children) {
  const tb = document.getElementById('children-tbody');
  tb.innerHTML = '';
  if (!children.length) {
    tb.innerHTML = `<tr><td colspan="4"><div class="empty-state">Aucun enfant enregistré.<br><br><button class="btn-primary" onclick="showAddChild()">+ Ajouter</button></div></td></tr>`;
    return;
  }
  children.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.name}</td>
      <td><span class="badge ${c.online ? 'badge-online' : 'badge-offline'}">${c.online ? 'En ligne' : 'Hors ligne'}</span></td>
      <td>${c.last_seen ? timeAgo(c.last_seen) : '<span style="color:var(--text-3)">Jamais</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" title="Nouveau code" onclick="showPairingCode('${c.id}','${c.name}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <button class="btn-icon danger" title="Supprimer" onclick="deleteChild('${c.id}','${c.name}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>`;
    tb.appendChild(tr);
  });
}

window.showAddChild = function() {
  openModal(`
    <div class="modal-title">Ajouter un enfant</div>
    <div class="form-row">
      <label class="form-label">PRÉNOM</label>
      <input class="form-input" id="new-child-name" placeholder="Ex : Lucas" autofocus/>
    </div>
    <button class="modal-btn" onclick="createChild()">Générer le code d'appairage</button>
  `);
};

window.createChild = async function() {
  const name = document.getElementById('new-child-name')?.value.trim();
  if (!name) return;
  try {
    const data = await api('POST', '/pairing/generate', { deviceName: name });
    if (!data) return;
    closeModal();
    await loadChildren();
    showPairingModal(data.pairingCode, name, data.expiresIn);
  } catch(e) { alert(e.message); }
};

window.showPairingCode = async function(childId, childName) {
  const data = await api('POST', '/pairing/generate', { deviceName: childName });
  if (!data) return;
  showPairingModal(data.pairingCode, childName, data.expiresIn);
};

function showPairingModal(code, name, expiresIn) {
  openModal(`
    <div class="modal-title">Code d'appairage</div>
    <p style="color:var(--text-2);font-size:13px;margin-bottom:4px">Saisir ce code dans l'app Android pour <strong>${name}</strong> :</p>
    <div class="pairing-code-display">${code}</div>
    <p class="pairing-hint">⏱ Expire dans 10 minutes</p>
  `);
}

window.deleteChild = async function(id, name) {
  if (!confirm(`Supprimer ${name} ? Toutes ses données seront perdues.`)) return;
  await api('DELETE', `/admin/children/${id}`);
  await loadChildren();
  if (currentChildId === id) currentChildId = null;
  refreshPage();
};

// ============================================================
// NOTIFICATIONS
// ============================================================
async function loadNotifications() {
  const container = document.getElementById('convs-list');
  if (!currentChildId) { container.innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>'; return; }
  const data = await api('GET', `/admin/children/${currentChildId}/notifications?limit=200`);
  if (!data?.notifications) { container.innerHTML = '<div class="empty-state">Aucun message</div>'; return; }
  const notifs = data.notifications;
  if (!notifs.length) { container.innerHTML = '<div class="empty-state">Aucun message</div>'; return; }

  const groups = new Map();
  notifs.forEach(n => {
    const contact = n.title || 'Inconnu';
    if (!groups.has(contact)) groups.set(contact, []);
    groups.get(contact).push(n);
  });

  container.innerHTML = '';
  for (let [contact, msgs] of groups.entries()) {
    msgs.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const unreadCount = msgs.filter(m => !m.is_read).length;
    const lastMsg = msgs[msgs.length-1];
    const appName = msgs[0].app_name || 'Application';
    const convDiv = document.createElement('div');
    convDiv.className = 'conv-card';
    convDiv.innerHTML = `
      <div class="conv-header" onclick="toggleConv(this)">
        <div class="conv-avatar">${contact.charAt(0).toUpperCase()}</div>
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(contact)}</div>
          <div class="conv-app">${appIcon(appName)} ${appName}</div>
        </div>
        <div class="conv-right">
          ${unreadCount > 0 ? `<span class="unread-pill">${unreadCount}</span>` : ''}
          <span class="conv-time">${timeAgo(lastMsg.timestamp)}</span>
        </div>
        <svg class="conv-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="conv-messages">
        ${msgs.map(m => `
          <div class="msg ${m.type === 'outgoing' ? 'outgoing' : 'incoming'}">
            <span class="msg-dir">${m.type === 'outgoing' ? '→' : '←'}</span> ${escapeHtml(m.content || '(vide)')}
            <div class="msg-time">${new Date(m.timestamp).toLocaleTimeString()}</div>
          </div>
        `).join('')}
      </div>`;
    container.appendChild(convDiv);
  }
}

window.toggleConv = function(header) {
  const card = header.parentElement;
  card.classList.toggle('open');
};

window.markAllRead = async function() {
  if (!currentChildId) return;
  const data = await api('GET', `/admin/children/${currentChildId}/notifications?limit=200`);
  if (data?.notifications) {
    for (let n of data.notifications.filter(n => !n.is_read)) {
      await api('PUT', `/admin/notifications/${n.id}/read`, {});
    }
  }
  loadNotifications();
  loadDashboard();
};

// ============================================================
// RÈGLES
// ============================================================
async function loadRules() {
  const tb = document.getElementById('rules-tbody');
  if (!currentChildId) { tb.innerHTML='<tr><td colspan="5"><div class="empty-state">Sélectionnez un enfant</div></td></tr>'; return; }
  const data = await api('GET', `/admin/rules/${currentChildId}`);
  if (!data?.rules) { tb.innerHTML='<tr><td colspan="5"><div class="empty-state">Aucune règle</div></td></tr>'; return; }
  const rules = data.rules;
  tb.innerHTML = '';
  if (!rules.length) {
    tb.innerHTML='<tr><td colspan="5"><div class="empty-state">Aucune règle</div></td></tr>';
    return;
  }
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  for (let r of rules) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${days[r.day_of_week]}</td>
      <td>${String(r.start_hour).padStart(2,'0')}:${String(r.start_minute).padStart(2,'0')} → ${String(r.end_hour).padStart(2,'0')}:${String(r.end_minute).padStart(2,'0')}</td>
      <td>${r.app_package ? `<code>${r.app_package}</code>` : 'Toutes'}</td>
      <td><span class="badge ${r.is_active ? 'badge-active' : 'badge-inactive'}">${r.is_active ? 'Actif' : 'Inactif'}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="editRule(${r.id})">✏️</button>
          <button class="btn-icon danger" onclick="deleteRule(${r.id})">🗑️</button>
        </div>
      </td>`;
    tb.appendChild(tr);
  }
}

window.showAddRule = function() {
  if (!currentChildId) return alert('Sélectionnez un enfant d\'abord');
  openModal(`
    <div class="modal-title">Ajouter une règle</div>
    <div class="form-row">
      <label class="form-label">JOUR</label>
      <select id="r-day" class="form-select">
        <option value="0">Dimanche</option><option value="1">Lundi</option><option value="2">Mardi</option>
        <option value="3">Mercredi</option><option value="4">Jeudi</option><option value="5">Vendredi</option>
        <option value="6">Samedi</option>
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-row"><label class="form-label">DÉBUT</label><input class="form-input" type="time" id="r-start"/></div>
      <div class="form-row"><label class="form-label">FIN</label><input class="form-input" type="time" id="r-end"/></div>
    </div>
    <div class="form-row"><label class="form-label">PACKAGE APP (vide = toutes)</label><input class="form-input" id="r-app" placeholder="com.whatsapp"/></div>
    <div class="form-row"><label class="form-check"><input type="checkbox" id="r-active" checked/> Règle active</label></div>
    <button class="modal-btn" onclick="createRule()">Créer la règle</button>
  `);
};

window.editRule = function(ruleId) {
  fetch(`${API_URL}/admin/rules/${currentChildId}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(data => {
      const rule = data.rules.find(r => r.id == ruleId);
      if (!rule) return;
      openModal(`
        <div class="modal-title">Modifier la règle</div>
        <div class="form-row">
          <label class="form-label">JOUR</label>
          <select id="r-day" class="form-select">
            ${[0,1,2,3,4,5,6].map(d => `<option value="${d}" ${rule.day_of_week===d?'selected':''}>${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][d]}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-row"><label class="form-label">DÉBUT</label><input class="form-input" type="time" id="r-start" value="${String(rule.start_hour).padStart(2,'0')}:${String(rule.start_minute).padStart(2,'0')}"/></div>
          <div class="form-row"><label class="form-label">FIN</label><input class="form-input" type="time" id="r-end" value="${String(rule.end_hour).padStart(2,'0')}:${String(rule.end_minute).padStart(2,'0')}"/></div>
        </div>
        <div class="form-row"><label class="form-label">PACKAGE APP</label><input class="form-input" id="r-app" value="${rule.app_package || ''}"/></div>
        <div class="form-row"><label class="form-check"><input type="checkbox" id="r-active" ${rule.is_active?'checked':''}/> Actif</label></div>
        <button class="modal-btn" onclick="updateRule(${rule.id})">Enregistrer</button>
      `);
    });
};

function getRuleFromForm() {
  return {
    dayOfWeek: parseInt(document.getElementById('r-day').value),
    startHour: parseInt(document.getElementById('r-start').value.split(':')[0]),
    startMinute: parseInt(document.getElementById('r-start').value.split(':')[1]),
    endHour: parseInt(document.getElementById('r-end').value.split(':')[0]),
    endMinute: parseInt(document.getElementById('r-end').value.split(':')[1]),
    appPackage: document.getElementById('r-app').value || null,
    is_active: document.getElementById('r-active').checked ? 1 : 0
  };
}

window.createRule = async function() {
  if (!currentChildId) return;
  const body = { ...getRuleFromForm(), childId: currentChildId };
  try {
    await api('POST', '/admin/rules', body);
    closeModal();
    loadRules();
  } catch(e) { alert(e.message); }
};

window.updateRule = async function(ruleId) {
  const body = getRuleFromForm();
  try {
    await api('PUT', `/admin/rules/${ruleId}`, body);
    closeModal();
    loadRules();
  } catch(e) { alert(e.message); }
};

window.deleteRule = async function(ruleId) {
  if (!confirm('Supprimer cette règle ?')) return;
  await api('DELETE', `/admin/rules/${ruleId}`);
  loadRules();
};

// ============================================================
// MODAL
// ============================================================
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ============================================================
// RÉINITIALISATION DES MESSAGES (URL corrigée)
// ============================================================
async function resetMessages() {
  if (!confirm("⚠️ Êtes-vous sûr ?\n\nCette action supprimera TOUS les messages (notifications) de tous les enfants.\n\nLes enfants et les règles de blocage seront conservés.")) return;

  try {
    const res = await fetch(`${API_URL}/admin/reset-messages`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      alert("✅ Tous les messages ont été supprimés.");
      location.reload();
    } else {
      const text = await res.text();
      alert("Erreur : " + text);
    }
  } catch (err) {
    alert("Erreur réseau : " + err.message);
  }
}

window.resetMessages = resetMessages;

// ============================================================
// SIDEBAR
// ============================================================
window.openSidebar = function() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
};
window.closeSidebar = function() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
};

// ============================================================
// UTILS
// ============================================================
function fmtDuration(sec) {
  if (!sec) return '0 min';
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'jamais';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

function appIcon(name) {
  const n = (name||'').toLowerCase();
  if (n.includes('whatsapp')) return '💚';
  if (n.includes('telegram')) return '✈️';
  if (n.includes('sms')) return '💬';
  return '📱';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ============================================================
// AUTO-START
// ============================================================
if (token) initApp();
