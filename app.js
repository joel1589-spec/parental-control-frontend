═══
// CONFIG — LOCAL
// ═══════════════════════════════════════════════════════════
const API_URL = 'https://john-dbfu.onrender.com';
// Pour Render plus tard: const API_URL = 'https://YOUR-APP.onrender.com';
// ═══════════════════════════════════════════════════════════

let token = localStorage.getItem('ps_token') || null;
let currentPage = 'dashboard';
let currentChildId = null;
let chartInstance = null;
let mapInstance = null;
let mapMarker = null;

// ─────────────────────────────────────────
// API
// ─────────────────────────────────────────
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
    if (e.message.includes('Failed to fetch')) {
      showNetworkError();
      return null;
    }
    throw e;
  }
}

function showNetworkError() {
  // Non-blocking toast
  let t = document.getElementById('net-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'net-toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a2332;border:1px solid rgba(248,113,113,0.3);color:#F87171;padding:12px 18px;border-radius:10px;font-size:13px;z-index:9999;';
    t.textContent = '⚠️  Impossible de joindre le backend (localhost:3001)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────
async function login() {
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
}

function logout() {
  token = null;
  localStorage.removeItem('ps_token');
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('login-password').value = '';
}

document.getElementById('login-password')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
async function initApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  await loadChildren();
  showPage('dashboard');
}

async function loadChildren() {
  const children = await api('GET', '/admin/children');
  if (!children) return [];

  // Child selector
  const sel = document.getElementById('child-selector');
  sel.innerHTML = '<option value="">— Enfant —</option>';
  children.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });
  if (children.length && !currentChildId) {
    currentChildId = children[0].id;
    sel.value = currentChildId;
  }

  // Nav badges
  const onlineCount = children.filter(c => c.online).length;
  setBadge('nav-badge-children', onlineCount);

  renderChildrenTable(children);
  return children;
}

function onChildChange() {
  currentChildId = document.getElementById('child-selector').value || null;
  refreshPage();
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) { el.textContent = n; el.classList.add('show'); }
  else { el.classList.remove('show'); }
}

// ─────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  currentPage = page;
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = { dashboard:'Dashboard', children:'Enfants', notifications:'Messages', rules:'Règles de blocage', location:'Localisation' };
  document.getElementById('page-title').textContent = titles[page] || page;
  const needChild = ['notifications','rules','location','dashboard'].includes(page);
  document.getElementById('child-selector-wrap').classList.toggle('hidden', !needChild);
  refreshPage();
  if (window.innerWidth <= 768) closeSidebar();
}

function refreshPage() {
  if (currentPage === 'dashboard') loadDashboard();
  else if (currentPage === 'notifications') loadNotifications();
  else if (currentPage === 'rules') loadRules();
  else if (currentPage === 'location') loadLocation();
}

// ─────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────
async function loadDashboard() {
  const [dash] = await Promise.all([api('GET', '/admin/dashboard')]);
  if (!dash) return;
  document.getElementById('stat-children').textContent = dash.children;
  document.getElementById('stat-rules').textContent = dash.active_rules;
  document.getElementById('stat-unread').textContent = dash.unread_notifications;
  document.getElementById('stat-screen-time').textContent = fmtDuration(dash.screen_time_today);
  setBadge('nav-badge-notif', dash.unread_notifications);
  if (currentChildId) loadChartData('day');
}

async function loadChartData(period) {
  if (!currentChildId) return;
  const stats = await api('GET', `/admin/children/${currentChildId}/stats?period=${period}`);
  if (!stats) return;
  renderChart(stats.screen_time, period);
  renderTopApps(stats.top_apps);
}

function setPeriod(period, btn) {
  document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadChartData(period);
}

function renderChart(data, period) {
  const ctx = document.getElementById('chart-screentime');
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  const byDate = {};
  data.forEach(r => {
    const d = (r.logged_date || '').toString().substring(0,10) || 'N/A';
    byDate[d] = (byDate[d] || 0) + parseInt(r.total || 0);
  });
  const labels = Object.keys(byDate).sort();
  const values = labels.map(l => Math.round(byDate[l] / 60));

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Aucune donnée'],
      datasets: [{
        label: 'Temps (min)',
        data: values.length ? values : [0],
        backgroundColor: 'rgba(200,255,0,0.15)',
        borderColor: 'rgba(200,255,0,0.7)',
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
        hoverBackgroundColor: 'rgba(200,255,0,0.3)',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#0D1117',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#F0F4FF',
        bodyColor: '#8A9BB5',
        padding: 12,
      }},
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A72', font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A72', font: { size: 11 } } }
      }
    }
  });
}

function renderTopApps(apps) {
  const ul = document.getElementById('top-apps-list');
  ul.innerHTML = '';
  if (!apps?.length) { ul.innerHTML = '<li class="text-muted" style="padding:12px 0;font-size:13px">Aucune donnée</li>'; return; }
  apps.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="app-name">${appIcon(a.app_name)} ${a.app_name}</span><span class="app-pill">${a.notification_count}</span>`;
    ul.appendChild(li);
  });
}

// ─────────────────────────────────────────
// CHILDREN
// ─────────────────────────────────────────
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
          <button class="btn-icon accent" title="Statistiques" onclick="showChildStats(${c.id},'${c.name}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </button>
          <button class="btn-icon" title="Nouveau code" onclick="showPairingCode(${c.id},'${c.name}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <button class="btn-icon danger" title="Supprimer" onclick="deleteChild(${c.id},'${c.name}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>`;
    document.getElementById('children-tbody').appendChild(tr);
  });
}

function showAddChild() {
  openModal(`
    <div class="modal-title">Ajouter un enfant</div>
    <div class="form-row">
      <label class="form-label">PRÉNOM</label>
      <input class="form-input" id="new-child-name" placeholder="Ex : Lucas" autofocus/>
    </div>
    <button class="modal-btn" onclick="createChild()">Créer & générer le code</button>
  `);
}

async function createChild() {
  const name = document.getElementById('new-child-name')?.value.trim();
  if (!name) return;
  try {
    const data = await api('POST', '/admin/children', { name });
    if (!data) return;
    closeModal();
    await loadChildren();
    showPairingModal(data.pairing_code, name, data.expires_at);
  } catch(e) { alert(e.message); }
}

async function showPairingCode(id, name) {
  const data = await api('POST', `/admin/children/${id}/pairing-code`);
  if (!data) return;
  showPairingModal(data.pairing_code, name, data.expires_at);
}

function showPairingModal(code, name, exp) {
  openModal(`
    <div class="modal-title">Code d'appairage</div>
    <p style="color:var(--text-2);font-size:13px;margin-bottom:4px">Saisir ce code dans l'app Android pour <strong style="color:var(--text)">${name}</strong> :</p>
    <div class="pairing-code-display">${code}</div>
    <p class="pairing-hint">⏱ Expire à ${new Date(exp).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</p>
  `);
}

async function showChildStats(id, name) {
  const stats = await api('GET', `/admin/children/${id}/stats?period=week`);
  if (!stats) return;
  const total = stats.screen_time.reduce((s,r) => s + parseInt(r.total||0), 0);
  const apps = stats.top_apps.map(a => `
    <li style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-2)">${appIcon(a.app_name)} ${a.app_name}</span>
      <span class="app-pill">${a.notification_count} notifs</span>
    </li>`).join('') || '<li style="padding:10px 0;color:var(--text-3)">Aucune donnée</li>';
  openModal(`
    <div class="modal-title">Statistiques — ${name}</div>
    <div style="padding:16px;background:var(--accent-bg);border:1px solid rgba(200,255,0,0.1);border-radius:10px;margin-bottom:20px">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:4px">TEMPS D'ÉCRAN (7 JOURS)</div>
      <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--accent)">${fmtDuration(total)}</div>
    </div>
    <div style="font-size:11px;letter-spacing:1.2px;font-weight:700;color:var(--text-3);margin-bottom:10px">TOP APPLICATIONS</div>
    <ul style="list-style:none">${apps}</ul>
  `);
}

async function deleteChild(id, name) {
  if (!confirm(`Supprimer ${name} ? Toutes ses données seront perdues.`)) return;
  await api('DELETE', `/admin/children/${id}`);
  await loadChildren();
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────
async function loadNotifications() {
  const list = document.getElementById('convs-list');
  if (!currentChildId) { list.innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>'; return; }
  const convs = await api('GET', `/admin/children/${currentChildId}/notifications`);
  if (!convs) return;
  list.innerHTML = '';
  if (!convs.length) { list.innerHTML = '<div class="empty-state">Aucun message</div>'; return; }
  convs.forEach(conv => {
    const div = document.createElement('div');
    div.className = 'conv-card';
    const unread = parseInt(conv.unread_count) || 0;
    div.innerHTML = `
      <div class="conv-header" onclick="toggleConv(this)">
        <div class="conv-avatar">${(conv.contact||'?').charAt(0).toUpperCase()}</div>
        <div class="conv-info">
          <div class="conv-name">${conv.contact || 'Inconnu'}</div>
          <div class="conv-app">${appIcon(conv.app_name)} ${conv.app_name}</div>
        </div>
        <div class="conv-right">
          ${unread > 0 ? `<span class="unread-pill">${unread}</span>` : ''}
          <span class="conv-time">${timeAgo(conv.last_message_at)}</span>
        </div>
        <svg class="conv-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="conv-messages">
        ${(conv.messages||[]).map(m => `
          <div class="msg ${m.direction}">
            <span class="msg-dir">${m.direction==='incoming'?'←':'→'}</span>${m.content||'(vide)'}
            <div class="msg-time">${new Date(m.received_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>`).join('')}
      </div>`;
    list.appendChild(div);
  });
}

function toggleConv(header) {
  const card = header.parentElement;
  card.classList.toggle('open');
}

async function markAllRead() {
  if (!currentChildId) return;
  await api('PATCH', `/admin/children/${currentChildId}/notifications/read-all`);
  loadNotifications();
  loadDashboard();
}

// ─────────────────────────────────────────
// RULES
// ─────────────────────────────────────────
const DAYS = ['everyday','monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAYS_FR = { everyday:'Tous les jours', monday:'Lundi', tuesday:'Mardi', wednesday:'Mercredi', thursday:'Jeudi', friday:'Vendredi', saturday:'Samedi', sunday:'Dimanche' };

async function loadRules() {
  const tb = document.getElementById('rules-tbody');
  if (!currentChildId) { tb.innerHTML='<tr><td colspan="5"><div class="empty-state">Sélectionnez un enfant</div></td></tr>'; return; }
  const rules = await api('GET', `/admin/children/${currentChildId}/rules`);
  if (!rules) return;
  tb.innerHTML = '';
  if (!rules.length) { tb.innerHTML='<tr><td colspan="5"><div class="empty-state">Aucune règle</div></td></tr>'; return; }
  rules.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${DAYS_FR[r.day_of_week]||r.day_of_week}</td>
      <td>${r.start_time} → ${r.end_time}</td>
      <td>${r.app_package ? `<code style="font-size:11px;color:var(--text-3)">${r.app_package}</code>` : '<span style="color:var(--text-3)">Toutes</span>'}</td>
      <td><span class="badge ${r.is_active?'badge-active':'badge-inactive'}">${r.is_active?'Actif':'Inactif'}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="showEditRule(${r.id},'${r.day_of_week}','${r.start_time?.substring(0,5)}','${r.end_time?.substring(0,5)}','${r.app_package||''}',${r.is_active})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" onclick="deleteRule(${r.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </td>`;
    tb.appendChild(tr);
  });
}

function ruleForm(day='everyday', start='21:00', end='07:00', app='', active=true) {
  return `
    <div class="form-row"><label class="form-label">JOUR</label>
      <select class="form-select" id="r-day">${DAYS.map(d=>`<option value="${d}"${d===day?' selected':''}>${DAYS_FR[d]}</option>`).join('')}</select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-row"><label class="form-label">DÉBUT</label><input class="form-input" type="time" id="r-start" value="${start}"/></div>
      <div class="form-row"><label class="form-label">FIN</label><input class="form-input" type="time" id="r-end" value="${end}"/></div>
    </div>
    <div class="form-row"><label class="form-label">PACKAGE APP (vide = toutes)</label><input class="form-input" id="r-app" placeholder="com.whatsapp" value="${app}"/></div>
    <div class="form-row"><label class="form-check"><input type="checkbox" id="r-active"${active?' checked':''}/> Règle active immédiatement</label></div>
  `;
}

function showAddRule() {
  if (!currentChildId) return alert('Sélectionnez un enfant d\'abord');
  openModal(`<div class="modal-title">Ajouter une règle</div>${ruleForm()}<button class="modal-btn" onclick="createRule()">Créer la règle</button>`);
}

function showEditRule(id, day, start, end, app, active) {
  openModal(`<div class="modal-title">Modifier la règle</div>${ruleForm(day, start, end, app, active)}<button class="modal-btn" onclick="updateRule(${id})">Enregistrer</button>`);
}

function getRuleBody() {
  return {
    day_of_week: document.getElementById('r-day').value,
    start_time:  document.getElementById('r-start').value,
    end_time:    document.getElementById('r-end').value,
    app_package: document.getElementById('r-app').value || null,
    is_active:   document.getElementById('r-active').checked,
  };
}

async function createRule() {
  try { await api('POST', `/admin/children/${currentChildId}/rules`, getRuleBody()); closeModal(); loadRules(); }
  catch(e) { alert(e.message); }
}

async function updateRule(id) {
  try { await api('PUT', `/admin/rules/${id}`, getRuleBody()); closeModal(); loadRules(); }
  catch(e) { alert(e.message); }
}

async function deleteRule(id) {
  if (!confirm('Supprimer cette règle ?')) return;
  await api('DELETE', `/admin/rules/${id}`);
  loadRules();
}

// ─────────────────────────────────────────
// LOCATION
// ─────────────────────────────────────────
async function loadLocation() {
  const meta = document.getElementById('loc-meta');
  if (!currentChildId) { meta.innerHTML = '<span class="loc-chip">Sélectionnez un enfant</span>'; return; }

  if (!mapInstance) {
    mapInstance = L.map('map', { zoomControl: true }).setView([48.8566, 2.3522], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '©OpenStreetMap ©CARTO', maxZoom: 19
    }).addTo(mapInstance);
  }

  const locs = await api('GET', `/admin/children/${currentChildId}/location`);
  if (!locs?.length) { meta.innerHTML = '<span class="loc-chip">📡 Aucune position reçue</span>'; return; }

  const latest = locs[0];
  const ll = [parseFloat(latest.latitude), parseFloat(latest.longitude)];
  mapInstance.setView(ll, 15);

  if (mapMarker) mapMarker.remove();
  const icon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#C8FF00;border-radius:50%;border:3px solid #0D1117;box-shadow:0 0 16px rgba(200,255,0,0.7)"></div>`,
    className: '', iconSize: [14,14], iconAnchor: [7,7]
  });
  mapMarker = L.marker(ll, { icon }).addTo(mapInstance);
  mapMarker.bindPopup(`
    <div style="font-family:'DM Sans',sans-serif;font-size:12px;line-height:1.6">
      <strong>${document.querySelector('#child-selector option:checked')?.textContent||'Enfant'}</strong><br>
      🕐 ${new Date(latest.recorded_at).toLocaleString('fr-FR')}<br>
      🔋 ${latest.battery_level??'?'}% · ${latest.is_connected?'En ligne':'Hors ligne'}
    </div>`).openPopup();

  if (locs.length > 1) {
    const trail = locs.map(l => [parseFloat(l.latitude), parseFloat(l.longitude)]);
    L.polyline(trail, { color:'#C8FF00', weight:2, opacity:0.3 }).addTo(mapInstance);
  }

  meta.innerHTML = `
    <span class="loc-chip">📍 ${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)}</span>
    <span class="loc-chip">🕐 ${timeAgo(latest.recorded_at)}</span>
    <span class="loc-chip">🔋 ${latest.battery_level??'?'}%</span>
    <span class="loc-chip">📡 ±${Math.round(latest.accuracy||0)}m</span>
    <span class="loc-chip ${latest.is_connected?'':''}">📶 ${latest.is_connected?'En ligne':'Dernière position (hors ligne)'}</span>
  `;
}

// ─────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ─────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
function fmtDuration(sec) {
  if (!sec) return '0 min';
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m/60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

function appIcon(name='') {
  const n = (name||'').toLowerCase();
  if (n.includes('whatsapp')) return '💚';
  if (n.includes('telegram')) return '✈️';
  if (n.includes('sms') || n.includes('message')) return '💬';
  if (n.includes('instagram')) return '📷';
  if (n.includes('tiktok')) return '🎵';
  if (n.includes('youtube')) return '▶️';
  return '📱';
}

// ─────────────────────────────────────────
// AUTO-START
// ─────────────────────────────────────────
if (token) initApp();

