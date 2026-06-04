// ============ CONFIGURATION ============
// À MODIFIER : mettre l'URL de votre backend Render (ex: https://votre-api.onrender.com)
const API_URL = 'https://john-dbfu.onrender.com';  

let adminToken = null;
let currentChildId = null;
let currentTab = 'dashboard';
let screenTimeChart = null;
let currentEditRuleId = null;

// ============ AUTHENTIFICATION ============
async function login() {
    const password = document.getElementById('adminPassword').value;
    if (!password) return alert('Mot de passe requis');
    try {
        const res = await fetch(`${API_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (res.ok) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            showDashboard();
            loadAllData();
        } else alert('Mot de passe incorrect');
    } catch (err) {
        alert('Erreur de connexion au serveur');
    }
}

function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');
    setupNavigation();
    initChart();
}

function logout() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    location.reload();
}

// ============ NAVIGATION ============
function setupNavigation() {
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
    // Modifier le titre et le bouton
    const titles = {
        dashboard: { title: 'Tableau de bord', subtitle: 'Analyse et supervision', btn: '+ Enfant' },
        children: { title: 'Gestion des enfants', subtitle: 'Appareils appairés', btn: '+ Enfant' },
        rules: { title: 'Règles de blocage', subtitle: 'Plages horaires', btn: '+ Règle' },
        notifications: { title: 'Notifications', subtitle: 'Messages entrants', btn: 'Rafraîchir' }
    };
    document.getElementById('pageTitle').innerText = titles[tab].title;
    document.getElementById('pageSubtitle').innerText = titles[tab].subtitle;
    const actionBtn = document.getElementById('actionButton');
    actionBtn.innerText = titles[tab].btn;
    if (tab === 'children') actionBtn.onclick = () => showAddChildModal();
    else if (tab === 'rules') actionBtn.onclick = () => showAddRuleModal();
    else if (tab === 'notifications') actionBtn.onclick = () => loadNotifications();
    else actionBtn.onclick = () => showAddChildModal();
    // Charger le contenu
    renderMainContent();
}

async function renderMainContent() {
    const container = document.getElementById('mainContent');
    if (currentTab === 'dashboard') {
        container.innerHTML = `
            <div class="stats-grid" id="statsGrid"></div>
            <div class="graph-section"><div class="graph-header">Analyse du temps d'écran</div><div class="graph-tabs"><button class="graph-tab active" onclick="switchGraph('daily')">Journalier</button><button class="graph-tab" onclick="switchGraph('weekly')">Hebdo</button><button class="graph-tab" onclick="switchGraph('apps')">Par app</button></div><canvas id="screenTimeChart"></canvas></div>
            <div class="section"><div class="section-header">📱 Applications les plus utilisées</div><div id="topAppsList"></div></div>
        `;
        await loadStats();
        await loadTopApps();
        if (screenTimeChart) screenTimeChart.destroy();
        initChart();
    } else if (currentTab === 'children') {
        container.innerHTML = `<div class="section"><div class="section-header">👶 Enfants appairés</div><div id="childrenList"></div></div>`;
        loadChildren();
    } else if (currentTab === 'rules') {
        container.innerHTML = `<div class="section"><div class="section-header">⏰ Règles de blocage</div><div id="rulesList"></div></div>`;
        loadRules();
    } else if (currentTab === 'notifications') {
        container.innerHTML = `<div class="section"><div class="section-header">📨 Flux de notifications</div><div id="notificationsList"></div></div>`;
        loadNotifications();
    }
}

// ============ STATS ============
async function loadStats() {
    if (!currentChildId) return;
    try {
        const [childrenRes, rulesRes] = await Promise.all([
            fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } }),
            fetch(`${API_URL}/api/admin/rules/${currentChildId}`, { headers: { Authorization: `Bearer ${adminToken}` } })
        ]);
        const childrenData = await childrenRes.json();
        const rulesData = await rulesRes.json();
        const child = childrenData.children.find(c => c.id === currentChildId);
        const screenHours = child?.screen_time ? (child.screen_time / 3600).toFixed(1) : '0';
        const statsHtml = `
            <div class="stat-card"><div class="stat-icon">👶</div><div class="stat-content"><h3>Enfants appairés</h3><p>${childrenData.children.length}</p></div></div>
            <div class="stat-card"><div class="stat-icon">🔒</div><div class="stat-content"><h3>Règles actives</h3><p>${(rulesData.rules || []).length}</p></div></div>
            <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-content"><h3>Temps d'écran</h3><p>${screenHours}h</p></div></div>
            <div class="stat-card"><div class="stat-icon">💬</div><div class="stat-content"><h3>Notifications non lues</h3><p id="unreadCount">0</p></div></div>
        `;
        document.getElementById('statsGrid').innerHTML = statsHtml;
        // Récupérer le nombre de notifications non lues
        const notifRes = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const notifData = await notifRes.json();
        const unread = (notifData.notifications || []).filter(n => !n.is_read).length;
        document.getElementById('unreadCount').innerText = unread;
    } catch (err) { console.error(err); }
}

// ============ ENFANTS ============
async function loadChildren() {
    try {
        const res = await fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        const children = data.children || [];
        const select = document.getElementById('childSelect');
        select.innerHTML = '<option value="">Sélectionner un enfant</option>' + children.map(c => `<option value="${c.id}">${c.device_name}${isOnline(c.last_seen) ? ' ●' : ' ○'}</option>`).join('');
        const container = document.getElementById('childrenList');
        if (!children.length) {
            container.innerHTML = '<div class="empty-state">Aucun enfant</div>';
            return;
        }
        container.innerHTML = children.map(c => `
            <div class="child-card" onclick="selectChild('${c.id}')">
                <div><strong>${c.device_name}</strong> ${isOnline(c.last_seen) ? '🟢' : '🔴'}</div>
                <div><small>ID: ${c.id.substring(0,8)}</small><br><small>Dernière activité: ${c.last_seen ? new Date(c.last_seen).toLocaleString() : 'jamais'}</small></div>
                <div><button class="btn-icon-small" onclick="event.stopPropagation(); deleteChild('${c.id}')">Supprimer</button></div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

function isOnline(lastSeen) {
    if (!lastSeen) return false;
    return (new Date() - new Date(lastSeen)) < 5 * 60 * 1000;
}

function selectChild(id) {
    currentChildId = id;
    localStorage.setItem('selectedChildId', id);
    if (currentTab === 'dashboard') {
        loadStats();
        loadTopApps();
        if (screenTimeChart) updateChartWithRealData();
    } else if (currentTab === 'rules') loadRules();
    else if (currentTab === 'notifications') loadNotifications();
    showToast('Enfant sélectionné');
}

async function deleteChild(childId) {
    if (!confirm('Supprimer cet enfant ?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${childId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
        if (res.ok) {
            if (currentChildId === childId) currentChildId = null;
            loadChildren();
            if (currentTab === 'dashboard') loadStats();
            showToast('Enfant supprimé');
        }
    } catch (err) { alert('Erreur'); }
}

// ============ GÉNÉRATION CODE ============
function showAddChildModal() {
    document.getElementById('addChildModal').style.display = 'flex';
}
function closeAddChildModal() {
    document.getElementById('addChildModal').style.display = 'none';
}
async function generatePairingCode() {
    const deviceName = document.getElementById('childDeviceName').value.trim();
    if (!deviceName) return alert('Veuillez entrer un nom');
    try {
        const res = await fetch(`${API_URL}/api/pairing/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceName })
        });
        const data = await res.json();
        if (res.ok && data.pairingCode) {
            document.getElementById('pairingCodeDisplay').innerText = data.pairingCode;
            document.getElementById('pairingCodeModal').style.display = 'flex';
            closeAddChildModal();
            loadChildren();
        } else {
            alert('Erreur: ' + (data.error || 'Code non reçu'));
        }
    } catch (err) {
        alert('Erreur réseau: ' + err.message);
    }
}
function closePairingCodeModal() {
    document.getElementById('pairingCodeModal').style.display = 'none';
}
function copyPairingCode() {
    const code = document.getElementById('pairingCodeDisplay').innerText;
    navigator.clipboard.writeText(code);
    showToast('Code copié');
}

// ============ RÈGLES ============
async function loadRules() {
    if (!currentChildId) {
        document.getElementById('rulesList').innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        const rules = data.rules || [];
        if (!rules.length) {
            document.getElementById('rulesList').innerHTML = '<div class="empty-state">Aucune règle</div>';
            return;
        }
        const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
        document.getElementById('rulesList').innerHTML = rules.map(r => `
            <div class="rule-item">
                <div>${days[r.day_of_week]} ${r.start_hour.toString().padStart(2,'0')}:${r.start_minute.toString().padStart(2,'0')} → ${r.end_hour.toString().padStart(2,'0')}:${r.end_minute.toString().padStart(2,'0')} ${r.app_package ? `(${r.app_package})` : '(toutes)'}</div>
                <div><button onclick="editRule(${r.id})">✏️</button> <button onclick="deleteRule(${r.id})">🗑️</button></div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

function showAddRuleModal() {
    if (!currentChildId) return alert('Sélectionnez un enfant');
    currentEditRuleId = null;
    document.getElementById('ruleModalTitle').innerText = 'Ajouter une règle';
    document.getElementById('ruleStart').value = '';
    document.getElementById('ruleEnd').value = '';
    document.getElementById('ruleApp').value = '';
    document.getElementById('ruleModal').style.display = 'flex';
    // Peupler la liste des enfants dans le select
    fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } })
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('ruleChildId');
            select.innerHTML = data.children.map(c => `<option value="${c.id}" ${c.id === currentChildId ? 'selected' : ''}>${c.device_name}</option>`).join('');
        });
}
function closeRuleModal() { document.getElementById('ruleModal').style.display = 'none'; }
async function submitRule() {
    const childId = document.getElementById('ruleChildId').value;
    const dayOfWeek = parseInt(document.getElementById('ruleDay').value);
    const start = document.getElementById('ruleStart').value;
    const end = document.getElementById('ruleEnd').value;
    if (!start || !end) return alert('Heures requises');
    const startHour = parseInt(start.split(':')[0]), startMinute = parseInt(start.split(':')[1]);
    const endHour = parseInt(end.split(':')[0]), endMinute = parseInt(end.split(':')[1]);
    const appPackage = document.getElementById('ruleApp').value || null;
    const body = { childId, dayOfWeek, startHour, startMinute, endHour, endMinute, appPackage };
    let url = `${API_URL}/api/admin/rules`;
    let method = 'POST';
    if (currentEditRuleId) {
        url = `${API_URL}/api/admin/rules/${currentEditRuleId}`;
        method = 'PUT';
    }
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            closeRuleModal();
            loadRules();
            showToast(currentEditRuleId ? 'Règle modifiée' : 'Règle ajoutée');
        } else {
            const err = await res.json();
            alert('Erreur: ' + err.error);
        }
    } catch (err) { alert('Erreur réseau'); }
}
async function editRule(ruleId) {
    currentEditRuleId = ruleId;
    const res = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const data = await res.json();
    const rule = data.rules.find(r => r.id == ruleId);
    if (!rule) return;
    document.getElementById('ruleModalTitle').innerText = 'Modifier la règle';
    document.getElementById('ruleStart').value = `${rule.start_hour.toString().padStart(2,'0')}:${rule.start_minute.toString().padStart(2,'0')}`;
    document.getElementById('ruleEnd').value = `${rule.end_hour.toString().padStart(2,'0')}:${rule.end_minute.toString().padStart(2,'0')}`;
    document.getElementById('ruleApp').value = rule.app_package || '';
    document.getElementById('ruleModal').style.display = 'flex';
    // Pré-remplir le select enfant
    const select = document.getElementById('ruleChildId');
    select.value = rule.child_id;
}
async function deleteRule(ruleId) {
    if (!confirm('Supprimer cette règle ?')) return;
    const res = await fetch(`${API_URL}/api/admin/rules/${ruleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
    if (res.ok) {
        loadRules();
        showToast('Règle supprimée');
    }
}

// ============ NOTIFICATIONS ============
async function loadNotifications() {
    if (!currentChildId) {
        document.getElementById('notificationsList').innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=200`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        const notifs = data.notifications || [];
        if (!notifs.length) {
            document.getElementById('notificationsList').innerHTML = '<div class="empty-state">Aucune notification</div>';
            return;
        }
        // Regroupement par contact (titre)
        const groups = {};
        notifs.forEach(n => {
            const contact = n.title || 'Inconnu';
            if (!groups[contact]) groups[contact] = [];
            groups[contact].push(n);
        });
        let html = '';
        for (const [contact, msgs] of Object.entries(groups)) {
            html += `<div class="conversation-item"><div class="conversation-header" onclick="toggleMessages('${contact.replace(/'/g, "\\'")}')">👤 ${contact} (${msgs.length})</div><div class="conversation-messages" id="conv-${contact.replace(/[^a-z0-9]/gi, '_')}" style="display:none;">`;
            msgs.forEach(m => {
                html += `<div class="notification-item">${m.type === 'outgoing' ? '➡️' : '⬅️'} <strong>${m.app_name}</strong>: ${m.content || ''}<br><small>${new Date(m.timestamp).toLocaleString()}</small></div>`;
            });
            html += `</div></div>`;
        }
        document.getElementById('notificationsList').innerHTML = html;
    } catch (err) { console.error(err); }
}
window.toggleMessages = function(contact) {
    const id = 'conv-' + contact.replace(/[^a-z0-9]/gi, '_');
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ============ GRAPHIQUES ============
function initChart() {
    const ctx = document.getElementById('screenTimeChart').getContext('2d');
    screenTimeChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'], datasets: [{ label: 'Heures', data: [0,0,0,0,0,0,0], backgroundColor: '#667eea' }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}
function switchGraph(type) {
    // À implémenter avec des vraies données si besoin
}
async function loadTopApps() {
    if (!currentChildId) return;
    // Pour simplifier, afficher les apps les plus fréquentes dans les notifications
    const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=200`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const data = await res.json();
    const notifs = data.notifications || [];
    const appCount = {};
    notifs.forEach(n => { appCount[n.app_name] = (appCount[n.app_name] || 0) + 1; });
    const sorted = Object.entries(appCount).sort((a,b) => b[1] - a[1]).slice(0,5);
    const html = sorted.map(([app, count]) => `<div>${app}: ${count} notifications</div>`).join('');
    document.getElementById('topAppsList').innerHTML = html || 'Aucune donnée';
}
function updateChartWithRealData() {}
function showToast(msg) {
    const t = document.createElement('div');
    t.innerText = msg;
    t.style.position = 'fixed';
    t.style.bottom = '20px';
    t.style.right = '20px';
    t.style.background = '#10b981';
    t.style.color = 'white';
    t.style.padding = '10px';
    t.style.borderRadius = '8px';
    t.style.zIndex = '9999';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ============ INIT ============
async function loadAllData() {
    await loadChildren();
    const savedChild = localStorage.getItem('selectedChildId');
    if (savedChild) {
        currentChildId = savedChild;
        document.getElementById('childSelect').value = savedChild;
        if (currentTab === 'dashboard') await loadStats();
    }
}
window.onload = () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
        adminToken = token;
        showDashboard();
        loadAllData();
    }
};
