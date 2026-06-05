// ============ CONFIGURATION ============
const API_URL = 'https://john-dbfu.onrender.com';
let adminToken = null;
let currentChildId = null;
let currentTab = 'dashboard';
let screenTimeChart = null;
let currentGraphType = 'daily';
let currentEditRuleId = null;

let realScreenTimeData = {
    daily: [0, 0, 0, 0, 0, 0, 0],
    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    apps: []
};

// ============ AUTHENTIFICATION ============
window.login = async function() {
    const password = document.getElementById('adminPassword').value;
    if (!password) return alert('Mot de passe requis');
    try {
        const res = await fetch(`${API_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            // Passer au dashboard
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'block';
            setupNavigation();
            initChart();
            loadAllData();
        } else {
            alert('Mot de passe incorrect');
        }
    } catch (err) {
        console.error(err);
        alert('Erreur réseau');
    }
};

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';
}

window.logout = function() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
};

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
    
    // Cacher toutes les sections
    document.getElementById('childrenSection').style.display = 'none';
    document.getElementById('rulesSection').style.display = 'none';
    document.getElementById('notificationsSection').style.display = 'none';
    
    if (tab === 'dashboard') {
        document.getElementById('childrenSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Tableau de bord';
        document.getElementById('pageSubtitle').innerText = 'Analyse du temps d\'écran et activités';
        if (currentChildId) {
            loadStats();
            loadTopApps();
        }
    } else if (tab === 'children') {
        document.getElementById('childrenSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Gestion des enfants';
        document.getElementById('pageSubtitle').innerText = 'Ajoutez et supervisez les appareils';
        loadChildren();
    } else if (tab === 'rules') {
        document.getElementById('rulesSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Règles de blocage';
        document.getElementById('pageSubtitle').innerText = 'Définissez les plages horaires';
        if (currentChildId) loadRules();
        else document.getElementById('rulesList').innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>';
    } else if (tab === 'notifications') {
        document.getElementById('notificationsSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Flux de notifications';
        document.getElementById('pageSubtitle').innerText = 'Consultez l\'activité en temps réel';
        if (currentChildId) loadNotifications();
        else document.getElementById('notificationsList').innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>';
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
        document.getElementById('totalChildren').innerText = childrenData.children.length;
        document.getElementById('totalRules').innerText = (rulesData.rules || []).length;
        document.getElementById('totalScreenTime').innerText = `${screenHours}h`;
        
        const notifRes = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const notifData = await notifRes.json();
        const unread = (notifData.notifications || []).filter(n => !n.is_read).length;
        document.getElementById('totalNotifs').innerText = unread;
    } catch (err) { console.error(err); }
}

// ============ ENFANTS ============
async function loadChildren() {
    if (!adminToken) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        const children = data.children || [];
        const container = document.getElementById('childrenList');
        const select = document.getElementById('childSelect');
        document.getElementById('totalChildren').innerText = children.length;
        
        select.innerHTML = '<option value="">Sélectionner un enfant</option>' + children.map(c => `<option value="${c.id}">${c.device_name}</option>`).join('');
        
        if (!children.length) {
            container.innerHTML = '<div class="empty-state">Aucun enfant appairé</div>';
            return;
        }
        container.innerHTML = children.map(c => `
            <div class="child-card" onclick="selectChild('${c.id}')">
                <div><strong>${c.device_name}</strong><br><small>ID: ${c.id.substring(0,8)}</small></div>
                <div class="child-actions">
                    <button class="btn-icon-small" onclick="event.stopPropagation(); viewChildStats('${c.id}')">📊 Voir stats</button>
                    <button class="btn-icon-small" onclick="event.stopPropagation(); deleteChild('${c.id}')">🗑️ Supprimer</button>
                </div>
            </div>
        `).join('');
        
        const saved = localStorage.getItem('selectedChildId');
        if (saved && children.find(c => c.id === saved)) {
            currentChildId = saved;
            select.value = saved;
            if (currentTab === 'dashboard') { loadStats(); loadTopApps(); }
            if (currentTab === 'rules') loadRules();
            if (currentTab === 'notifications') loadNotifications();
        }
    } catch (err) { console.error(err); }
}

window.selectChild = function(id) {
    currentChildId = id;
    localStorage.setItem('selectedChildId', id);
    document.getElementById('childSelect').value = id;
    if (currentTab === 'dashboard') { loadStats(); loadTopApps(); }
    if (currentTab === 'rules') loadRules();
    if (currentTab === 'notifications') loadNotifications();
    alert('Enfant sélectionné');
};

window.viewChildStats = function(id) {
    selectChild(id);
    switchTab('dashboard');
};

window.deleteChild = async function(childId) {
    if (!confirm('Supprimer cet enfant ?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${childId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
        if (res.ok) {
            if (currentChildId === childId) currentChildId = null;
            loadChildren();
            if (currentTab === 'dashboard') loadStats();
        } else alert('Erreur suppression');
    } catch (err) { alert('Erreur réseau'); }
};

// ============ GÉNÉRATION CODE ============
window.showAddChildModal = function() {
    document.getElementById('addChildModal').style.display = 'flex';
};
window.closeAddChildModal = function() {
    document.getElementById('addChildModal').style.display = 'none';
    document.getElementById('childDeviceName').value = '';
};
window.generatePairingCode = async function(e) {
    if (e) e.preventDefault();
    const deviceName = document.getElementById('childDeviceName').value.trim();
    if (!deviceName) return alert('Nom requis');
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
        } else alert('Erreur: ' + (data.error || 'Code non reçu'));
    } catch (err) { alert('Erreur réseau'); }
};
window.closePairingCodeModal = function() {
    document.getElementById('pairingCodeModal').style.display = 'none';
};
window.copyPairingCode = function() {
    const code = document.getElementById('pairingCodeDisplay').innerText;
    navigator.clipboard.writeText(code);
    alert('Code copié');
};

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
        const container = document.getElementById('rulesList');
        if (!rules.length) {
            container.innerHTML = '<div class="empty-state">Aucune règle configurée</div>';
            return;
        }
        const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
        container.innerHTML = rules.map(r => `
            <div class="rule-item">
                <div>${days[r.day_of_week]} ${String(r.start_hour).padStart(2,'0')}:${String(r.start_minute).padStart(2,'0')} → ${String(r.end_hour).padStart(2,'0')}:${String(r.end_minute).padStart(2,'0')} ${r.app_package ? `(${r.app_package})` : '(toutes les applis)'}</div>
                <div class="child-actions">
                    <button class="btn-icon-small" onclick="editRule(${r.id})">✏️ Modifier</button>
                    <button class="btn-icon-small" onclick="deleteRule(${r.id})">🗑️ Supprimer</button>
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

window.showAddRuleModal = function() {
    if (!currentChildId) return alert('Sélectionnez un enfant');
    currentEditRuleId = null;
    document.getElementById('ruleModalTitle').innerText = 'Ajouter une règle';
    document.getElementById('ruleStart').value = '';
    document.getElementById('ruleEnd').value = '';
    document.getElementById('ruleApp').value = '';
    document.getElementById('ruleModal').style.display = 'flex';
    fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } })
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('ruleChildId');
            select.innerHTML = data.children.map(c => `<option value="${c.id}" ${c.id === currentChildId ? 'selected' : ''}>${c.device_name}</option>`).join('');
        });
};
window.closeRuleModal = function() { document.getElementById('ruleModal').style.display = 'none'; };
window.submitRule = async function(e) {
    if (e) e.preventDefault();
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
            alert(currentEditRuleId ? 'Règle modifiée' : 'Règle ajoutée');
        } else alert('Erreur');
    } catch (err) { alert('Erreur réseau'); }
};
window.editRule = async function(ruleId) {
    currentEditRuleId = ruleId;
    const res = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const data = await res.json();
    const rule = data.rules.find(r => r.id == ruleId);
    if (!rule) return;
    document.getElementById('ruleModalTitle').innerText = 'Modifier la règle';
    document.getElementById('ruleStart').value = `${String(rule.start_hour).padStart(2,'0')}:${String(rule.start_minute).padStart(2,'0')}`;
    document.getElementById('ruleEnd').value = `${String(rule.end_hour).padStart(2,'0')}:${String(rule.end_minute).padStart(2,'0')}`;
    document.getElementById('ruleApp').value = rule.app_package || '';
    document.getElementById('ruleModal').style.display = 'flex';
    fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } })
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('ruleChildId');
            select.innerHTML = data.children.map(c => `<option value="${c.id}" ${c.id === rule.child_id ? 'selected' : ''}>${c.device_name}</option>`).join('');
        });
};
window.deleteRule = async function(ruleId) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/rules/${ruleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
        if (res.ok) loadRules();
        else alert('Erreur');
    } catch (err) { alert('Erreur réseau'); }
};

// ============ NOTIFICATIONS ============
async function loadNotifications() {
    if (!currentChildId) {
        document.getElementById('notificationsList').innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=200`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        let notifs = data.notifications || [];
        if (!notifs.length) {
            document.getElementById('notificationsList').innerHTML = '<div class="empty-state">Aucune notification reçue</div>';
            return;
        }
        notifs.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
        const conversations = {};
        notifs.forEach(n => {
            let contact = n.title || 'Inconnu';
            if (contact.includes(':')) contact = contact.split(':')[1].trim();
            if (!conversations[contact]) conversations[contact] = [];
            conversations[contact].push(n);
        });
        let html = '';
        for (const [contact, msgs] of Object.entries(conversations)) {
            const unread = msgs.filter(m => !m.is_read).length;
            html += `
                <div class="conversation-item">
                    <div class="conversation-header" onclick="toggleConversation('${contact.replace(/'/g, "\\'")}')">
                        <span class="contact-name">👤 ${contact}</span>
                        <span class="msg-count">${msgs.length} message${msgs.length>1?'s':''} ${unread?`(${unread} non lu${unread>1?'s':''})`:''}</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="conversation-messages" id="conv-${contact.replace(/[^a-z0-9]/gi, '_')}" style="display:none;">
                        ${msgs.map(m => `
                            <div class="notification-item" onclick="markAsRead(${m.id})">
                                <div><strong>${m.type === 'outgoing' ? '➡️ Envoyé' : '⬅️ Reçu'} via ${m.app_name}</strong> <small>${new Date(m.timestamp).toLocaleString()}</small></div>
                                <div class="notification-content">${m.content || ''}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        document.getElementById('notificationsList').innerHTML = html;
    } catch (err) { console.error(err); }
}
window.toggleConversation = function(contact) {
    const id = 'conv-' + contact.replace(/[^a-z0-9]/gi, '_');
    const el = document.getElementById(id);
    if (el) {
        if (el.style.display === 'none') {
            el.style.display = 'block';
            const header = el.previousElementSibling;
            if (header) header.querySelector('.toggle-icon').innerHTML = '▲';
        } else {
            el.style.display = 'none';
            const header = el.previousElementSibling;
            if (header) header.querySelector('.toggle-icon').innerHTML = '▼';
        }
    }
};
window.markAsRead = async function(notifId) {
    try {
        await fetch(`${API_URL}/api/admin/notifications/${notifId}/read`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` } });
        loadNotifications();
        if (currentTab === 'dashboard') loadStats();
    } catch (err) { console.error(err); }
};

// ============ TOP APPLICATIONS ============
async function loadTopApps() {
    if (!currentChildId) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=200`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const data = await res.json();
        const notifs = data.notifications || [];
        const appCount = {};
        notifs.forEach(n => { appCount[n.app_name] = (appCount[n.app_name] || 0) + 1; });
        const sorted = Object.entries(appCount).sort((a,b) => b[1] - a[1]).slice(0,5);
        const total = notifs.length;
        const html = sorted.map(([app, count]) => `<div style="margin-bottom:8px;"><strong>${app}</strong> : ${count} notification${count>1?'s':''} (${((count/total)*100).toFixed(1)}%)</div>`).join('');
        document.getElementById('topAppsList').innerHTML = html || '<div>Aucune donnée</div>';
    } catch (err) { console.error(err); }
}
window.refreshTopApps = loadTopApps;

// ============ GRAPHIQUES ============
function initChart() {
    const canvas = document.getElementById('screenTimeChart');
    if (!canvas) return;
    if (screenTimeChart) screenTimeChart.destroy();
    screenTimeChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: realScreenTimeData.labels,
            datasets: [{ label: 'Temps d\'écran (heures)', data: realScreenTimeData.daily, backgroundColor: '#667eea', borderRadius: 8 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: { y: { beginAtZero: true, grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } }
        }
    });
}
window.switchGraph = function(type) {
    currentGraphType = type;
    if (type === 'daily') {
        screenTimeChart.data.datasets[0].data = realScreenTimeData.daily;
        screenTimeChart.data.labels = realScreenTimeData.labels;
    } else if (type === 'weekly') {
        const weekly = [realScreenTimeData.daily.reduce((a,b)=>a+b,0)];
        screenTimeChart.data.datasets[0].data = weekly;
        screenTimeChart.data.labels = ['Cette semaine'];
    } else if (type === 'apps') {
        screenTimeChart.data.datasets[0].data = [0];
        screenTimeChart.data.labels = ['Aucune donnée'];
    }
    screenTimeChart.update();
};
function updateChartWithRealData() {}
function updateDailyData(notifications) {}

// ============ INITIALISATION ============
async function loadAllData() {
    await loadChildren();
    if (currentChildId && currentTab === 'dashboard') {
        await loadStats();
        await loadTopApps();
    }
}

window.onload = () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
        adminToken = token;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'block';
        setupNavigation();
        initChart();
        loadAllData();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboardScreen').style.display = 'none';
    }
};

// Rendre les fonctions globales pour les boutons HTML
window.onChildSelect = function() {
    const id = document.getElementById('childSelect').value;
    if (id) selectChild(id);
};
