// ============ CONFIGURATION ============
const API_URL = 'https://john-dbfu.onrender.com';
let adminToken = null;
let currentChildId = null;
let currentTab = 'dashboard';

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
            showDashboard();
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
    setupNavigation();
    loadAllData();
}

window.logout = function() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
};

// ============ NAVIGATION ============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            if (tab) switchTab(tab);
        });
    });
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.section').forEach(section => section.style.display = 'none');
    if (tab === 'dashboard') {
        document.getElementById('childrenSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Tableau de bord';
    } else if (tab === 'children') {
        document.getElementById('childrenSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Gestion des enfants';
        loadChildren();
    } else if (tab === 'rules') {
        document.getElementById('rulesSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Règles de blocage';
        loadRules();
    } else if (tab === 'notifications') {
        document.getElementById('notificationsSection').style.display = 'block';
        document.getElementById('pageTitle').innerText = 'Notifications';
        loadNotifications();
    }
}

// ============ ENFANTS ============
async function loadChildren() {
    if (!adminToken) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        const children = data.children || [];
        const container = document.getElementById('childrenList');
        const select = document.getElementById('childSelect');
        if (select) {
            select.innerHTML = '<option value="">Sélectionner un enfant</option>' +
                children.map(c => `<option value="${c.id}">${c.device_name}</option>`).join('');
        }
        if (container) {
            if (!children.length) {
                container.innerHTML = '<div class="empty-state">Aucun enfant appairé</div>';
                return;
            }
            container.innerHTML = children.map(c => `
                <div class="child-card" onclick="selectChild('${c.id}')">
                    <div><strong>${c.device_name}</strong></div>
                    <div>ID: ${c.id.substring(0,8)}</div>
                    <div><button onclick="event.stopPropagation(); deleteChild('${c.id}')">Supprimer</button></div>
                </div>
            `).join('');
        }
        document.getElementById('totalChildren').innerText = children.length;
    } catch (err) { console.error(err); }
}

window.selectChild = function(id) {
    currentChildId = id;
    localStorage.setItem('selectedChildId', id);
    alert('Enfant sélectionné');
    if (currentTab === 'rules') loadRules();
    if (currentTab === 'notifications') loadNotifications();
};

window.deleteChild = async function(childId) {
    if (!confirm('Supprimer cet enfant ?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${childId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) {
            if (currentChildId === childId) currentChildId = null;
            loadChildren();
        } else alert('Erreur suppression');
    } catch (err) { alert('Erreur réseau'); }
};

// ============ MODAL AJOUT ENFANT ============
window.showAddChildModal = function() {
    document.getElementById('addChildModal').style.display = 'flex';
};
window.closeAddChildModal = function() {
    document.getElementById('addChildModal').style.display = 'none';
};
window.generatePairingCode = async function() {
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
        const res = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        const rules = data.rules || [];
        const container = document.getElementById('rulesList');
        if (!rules.length) {
            container.innerHTML = '<div class="empty-state">Aucune règle</div>';
            return;
        }
        container.innerHTML = rules.map(r => `
            <div class="rule-item">
                <div>Jour ${r.day_of_week} ${r.start_hour}:${r.start_minute} → ${r.end_hour}:${r.end_minute} ${r.app_package ? '('+r.app_package+')' : ''}</div>
                <div><button onclick="deleteRule(${r.id})">Supprimer</button></div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}
window.deleteRule = async function(ruleId) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/rules/${ruleId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) loadRules();
        else alert('Erreur');
    } catch (err) { alert('Erreur réseau'); }
};
window.showAddRuleModal = function() {
    if (!currentChildId) return alert('Sélectionnez un enfant');
    document.getElementById('ruleModal').style.display = 'flex';
};
window.closeRuleModal = function() {
    document.getElementById('ruleModal').style.display = 'none';
};
window.submitRule = async function() {
    const childId = document.getElementById('ruleChildId').value;
    const dayOfWeek = parseInt(document.getElementById('ruleDay').value);
    const start = document.getElementById('ruleStart').value;
    const end = document.getElementById('ruleEnd').value;
    if (!start || !end) return alert('Heures requises');
    const startHour = parseInt(start.split(':')[0]), startMinute = parseInt(start.split(':')[1]);
    const endHour = parseInt(end.split(':')[0]), endMinute = parseInt(end.split(':')[1]);
    const appPackage = document.getElementById('ruleApp').value || null;
    try {
        const res = await fetch(`${API_URL}/api/admin/rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ childId, dayOfWeek, startHour, startMinute, endHour, endMinute, appPackage })
        });
        if (res.ok) {
            closeRuleModal();
            loadRules();
        } else alert('Erreur');
    } catch (err) { alert('Erreur réseau'); }
};

// ============ NOTIFICATIONS ============
async function loadNotifications() {
    if (!currentChildId) {
        document.getElementById('notificationsList').innerHTML = '<div class="empty-state">Sélectionnez un enfant</div>';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=50`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        const notifs = data.notifications || [];
        const container = document.getElementById('notificationsList');
        if (!notifs.length) {
            container.innerHTML = '<div class="empty-state">Aucune notification</div>';
            return;
        }
        container.innerHTML = notifs.map(n => `
            <div class="notification-item">
                <strong>${n.app_name}</strong><br>
                ${n.content || ''}<br>
                <small>${new Date(n.timestamp).toLocaleString()}</small>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

// ============ CHARGEMENT INITIAL ============
async function loadAllData() {
    await loadChildren();
    const savedChild = localStorage.getItem('selectedChildId');
    if (savedChild) {
        currentChildId = savedChild;
        if (currentTab === 'rules') await loadRules();
        if (currentTab === 'notifications') await loadNotifications();
    }
}

window.onload = () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
        adminToken = token;
        showDashboard();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboardScreen').style.display = 'none';
    }
};
