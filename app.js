const API_URL = 'http://localhost:3000';
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
async function login() {
    const password = document.getElementById('adminPassword').value;
    if (!password) { alert('Veuillez entrer le mot de passe'); return; }
    try {
        const response = await fetch(`${API_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (response.ok) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            showDashboard();
            setupNavigation();
            loadAllData();
        } else { alert('Mot de passe incorrect'); }
    } catch (error) {
        console.error(error);
        alert('Impossible de se connecter au serveur');
    }
}

function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');
}

function logout() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    currentChildId = null;
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('dashboardScreen').classList.remove('active');
    document.getElementById('adminPassword').value = '';
}

// ============ NAVIGATION ============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.tab === tab) item.classList.add('active');
        else item.classList.remove('active');
    });
    document.getElementById('childrenSection').style.display = 'none';
    document.getElementById('rulesSection').style.display = 'none';
    document.getElementById('notificationsSection').style.display = 'none';

    if (tab === 'dashboard') {
        document.getElementById('childrenSection').style.display = 'block';
        document.getElementById('pageTitle').textContent = 'Tableau de bord';
        document.getElementById('pageSubtitle').textContent = 'Sélectionnez un enfant';
        document.getElementById('actionButton').innerHTML = '<span>+</span> Ajouter un enfant';
        document.getElementById('actionButton').onclick = () => showAddChildModal();
        if (currentChildId) {
            loadRealTimeStats();
            loadTopApps();
            updateChartWithRealData();
        } else showNoChildSelectedMessage();
    } else if (tab === 'children') {
        document.getElementById('childrenSection').style.display = 'block';
        document.getElementById('pageTitle').textContent = 'Gestion des enfants';
        document.getElementById('pageSubtitle').textContent = 'Ajoutez et supervisez les appareils';
        document.getElementById('actionButton').innerHTML = '<span>+</span> Ajouter un enfant';
        document.getElementById('actionButton').onclick = () => showAddChildModal();
        loadChildren();
    } else if (tab === 'rules') {
        document.getElementById('rulesSection').style.display = 'block';
        document.getElementById('pageTitle').textContent = 'Règles de blocage';
        document.getElementById('pageSubtitle').textContent = 'Définissez les plages horaires';
        document.getElementById('actionButton').innerHTML = '<span>+</span> Nouvelle règle';
        document.getElementById('actionButton').onclick = () => {
            if (currentChildId) showAddRuleModal();
            else { alert('Sélectionnez d\'abord un enfant'); switchTab('children'); }
        };
        loadRules();
    } else if (tab === 'notifications') {
        document.getElementById('notificationsSection').style.display = 'block';
        document.getElementById('pageTitle').textContent = 'Flux de notifications';
        document.getElementById('pageSubtitle').textContent = 'Consultez l\'activité';
        document.getElementById('actionButton').innerHTML = '⟳ Rafraîchir';
        document.getElementById('actionButton').onclick = () => {
            if (currentChildId) loadNotifications();
            else alert('Sélectionnez d\'abord un enfant');
        };
        if (currentChildId) loadNotifications();
    }
}

function showNoChildSelectedMessage() {
    const container = document.getElementById('topAppsList');
    if (container) container.innerHTML = `<div class="empty-state"><span class="empty-icon">👶</span><p>Aucun enfant sélectionné</p><button onclick="switchTab('children')" class="btn-outline">Gérer les enfants</button></div>`;
    document.getElementById('totalScreenTime').textContent = '0h';
    document.getElementById('totalRules').textContent = '0';
    document.getElementById('totalNotifs').textContent = '0';
    if (screenTimeChart) screenTimeChart.data.datasets[0].data = [0,0,0,0,0,0,0];
}

function onChildSelect() {
    const select = document.getElementById('childSelect');
    currentChildId = select.value;
    if (currentChildId) {
        localStorage.setItem('selectedChildId', currentChildId);
        loadRealTimeStats();
        loadRules();
        loadNotifications();
        loadTopApps();
        updateChartWithRealData();
    } else showNoChildSelectedMessage();
}

// ============ STATS & GRAPHIQUES ============
async function loadRealTimeStats() {
    if (!currentChildId) return;
    try {
        const notifRes = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=1`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const notifData = await notifRes.json();
        const unreadCount = (notifData.notifications || []).filter(n => !n.is_read).length;
        document.getElementById('totalNotifs').textContent = unreadCount;

        const rulesRes = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const rulesData = await rulesRes.json();
        document.getElementById('totalRules').textContent = (rulesData.rules || []).length;

        const childRes = await fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const childData = await childRes.json();
        const child = childData.children.find(c => c.id === currentChildId);
        if (child && child.screen_time !== undefined) {
            const screenTimeHours = (child.screen_time / 3600).toFixed(1);
            document.getElementById('totalScreenTime').textContent = `${screenTimeHours}h`;
        } else {
            document.getElementById('totalScreenTime').textContent = '0h';
        }
    } catch (error) { console.error(error); }
}

function initChart() {
    const ctx = document.getElementById('screenTimeChart').getContext('2d');
    screenTimeChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: realScreenTimeData.labels, datasets: [{ label: "Temps d'écran (heures)", data: realScreenTimeData.daily, backgroundColor: 'rgba(102,126,234,0.7)' }] },
        options: { responsive: true, plugins: { legend: { labels: { color: '#e5e7eb' } } }, scales: { y: { beginAtZero: true, grid: { color: '#1f2937' }, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af' } } } }
    });
}

function switchGraph(type) {
    currentGraphType = type;
    document.querySelectorAll('.graph-tab').forEach(t => t.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    if (type === 'daily') {
        screenTimeChart.data.datasets[0].data = realScreenTimeData.daily;
        screenTimeChart.data.labels = realScreenTimeData.labels;
    } else if (type === 'weekly') {
        const weeklyTotal = realScreenTimeData.daily.reduce((a,b)=>a+b,0);
        screenTimeChart.data.datasets[0].data = [weeklyTotal];
        screenTimeChart.data.labels = ['Cette semaine'];
    } else if (type === 'apps') {
        if (realScreenTimeData.apps.length) {
            screenTimeChart.data.datasets[0].data = realScreenTimeData.apps.map(a=>a.hours);
            screenTimeChart.data.labels = realScreenTimeData.apps.map(a=>`${a.icon} ${a.name}`);
        } else { screenTimeChart.data.datasets[0].data = [0]; screenTimeChart.data.labels = ['Aucune donnée']; }
    }
    screenTimeChart.update();
}

function updateChartWithRealData() {
    if (!screenTimeChart) return;
    if (currentGraphType === 'daily') screenTimeChart.data.datasets[0].data = realScreenTimeData.daily;
    else if (currentGraphType === 'apps' && realScreenTimeData.apps.length) {
        screenTimeChart.data.datasets[0].data = realScreenTimeData.apps.map(a=>a.hours);
        screenTimeChart.data.labels = realScreenTimeData.apps.map(a=>`${a.icon} ${a.name}`);
    }
    screenTimeChart.update();
}

// ============ TOP APPLICATIONS ============
async function loadTopApps() {
    const container = document.getElementById('topAppsList');
    if (!currentChildId) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">📱</span><p>Sélectionnez un enfant</p><button onclick="switchTab('children')" class="btn-outline">Gérer les enfants</button></div>`;
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=200`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        const notifications = data.notifications || [];
        if (!notifications.length) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">📱</span><p>Aucune activité détectée</p></div>`;
            return;
        }
        const appStats = {};
        notifications.forEach(n => { appStats[n.app_name] = (appStats[n.app_name] || 0) + 1; });
        const sortedApps = Object.entries(appStats).map(([name, count]) => ({ name, count, estimatedHours: (count*5/60).toFixed(1), icon: getAppIcon(name) }))
            .sort((a,b)=>b.count-a.count).slice(0,5);
        const totalNotif = notifications.length;
        const totalHours = (totalNotif*5/60).toFixed(1);
        realScreenTimeData.apps = sortedApps.map(a=>({ name: a.name, hours: parseFloat(a.estimatedHours), icon: a.icon, color: getAppColor(a.name) }));
        if (screenTimeChart && currentGraphType === 'apps') updateChartWithRealData();
        container.innerHTML = `<div style="padding:8px;">${sortedApps.map(app => `<div style="margin-bottom:20px;"><div style="display:flex;justify-content:space-between;"><span>${app.icon} ${app.name}</span><span>${app.estimatedHours}h (${((app.count/totalNotif)*100).toFixed(1)}%)</span></div><div style="background:#1a1f2e;border-radius:10px;"><div style="width:${(app.count/totalNotif*100)}%;background:${getAppColor(app.name)};height:8px;border-radius:10px;"></div></div><div style="font-size:11px;color:#6b7280;">${app.count} notifications</div></div>`).join('')}
        <div style="margin-top:20px;border-top:1px solid #1a1f2e;display:flex;justify-content:space-between;"><span>Total notifications</span><strong>${totalNotif}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;"><span>Temps estimé</span><strong>${totalHours}h</strong></div></div>`;
        updateDailyData(notifications);
    } catch (error) { console.error(error); container.innerHTML = `<div class="empty-state"><span>⚠️ Erreur</span></div>`; }
}

function updateDailyData(notifications) {
    const dailyCounts = [0,0,0,0,0,0,0];
    notifications.forEach(n => { const d = new Date(n.timestamp); dailyCounts[d.getDay()]++; });
    realScreenTimeData.daily = dailyCounts.map(c => parseFloat((c*5/60).toFixed(1)));
    const reordered = [...realScreenTimeData.daily];
    realScreenTimeData.daily = [reordered[1]||0, reordered[2]||0, reordered[3]||0, reordered[4]||0, reordered[5]||0, reordered[6]||0, reordered[0]||0];
    if (screenTimeChart && currentGraphType === 'daily') updateChartWithRealData();
}

function getAppIcon(name) {
    const map = { 'WhatsApp':'💬','Telegram':'✈️','Instagram':'📸','TikTok':'🎵','YouTube':'📺','Snapchat':'👻','Facebook':'👍','Twitter':'🐦' };
    for (let [k,v] of Object.entries(map)) if (name.toLowerCase().includes(k.toLowerCase())) return v;
    return '📱';
}
function getAppColor(name) {
    const map = { 'WhatsApp':'#25D366','Telegram':'#26A5E4','Instagram':'#E4405F','TikTok':'#000','YouTube':'#FF0000','Snapchat':'#FFFC00','Facebook':'#1877F2','Twitter':'#1DA1F2' };
    for (let [k,v] of Object.entries(map)) if (name.toLowerCase().includes(k.toLowerCase())) return v;
    return '#667eea';
}

// ============ GESTION DES ENFANTS ============
async function loadChildren() {
    if (!adminToken) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children`, { headers: { Authorization: `Bearer ${adminToken}` } });
        if (!res.ok) { if (res.status===401) logout(); throw new Error(); }
        const data = await res.json();
        const container = document.getElementById('childrenList');
        const select = document.getElementById('childSelect');
        document.getElementById('totalChildren').textContent = data.children.length;
        select.innerHTML = '<option value="">📱 Sélectionner un enfant</option>' + data.children.map(c => `<option value="${c.id}">${c.device_name}${isOnline(c.last_seen)?' (● En ligne)':' (○ Hors ligne)'}</option>`).join('');
        const saved = localStorage.getItem('selectedChildId');
        if (saved && data.children.find(c=>c.id===saved)) { currentChildId = saved; select.value = saved; onChildSelect(); }
        if (!data.children.length) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">👶</span><p>Aucun enfant appairé</p><button onclick="showAddChildModal()" class="btn-outline">➕ Ajouter un enfant</button></div>`;
            return;
        }
        container.innerHTML = data.children.map(c => `
            <div class="child-card" onclick="selectChild('${c.id}')">
                <div class="child-info"><div class="child-name">📱 ${c.device_name} <span class="child-status ${isOnline(c.last_seen)?'status-online':'status-offline'}">${isOnline(c.last_seen)?'● En ligne':'○ Hors ligne'}</span></div>
                <div class="child-details"><span>🆔 ${c.id.substring(0,8)}...</span><span>📅 Appairé: ${new Date(c.paired_at).toLocaleDateString()}</span><span>🕐 Dernière activité: ${c.last_seen && c.last_seen!=='1970-01-01 00:00:00' ? new Date(c.last_seen).toLocaleString() : 'En attente'}</span></div></div>
                <div class="child-actions"><button class="btn-icon-small" onclick="event.stopPropagation(); viewChildStats('${c.id}')">📊 Voir stats</button>
                <button class="btn-icon-small btn-danger" onclick="event.stopPropagation(); deleteChildConfirm('${c.id}', '${c.device_name}')">🗑️ Supprimer</button></div>
            </div>`).join('');
        const ruleSelect = document.getElementById('ruleChildId');
        if (ruleSelect) ruleSelect.innerHTML = '<option value="">Sélectionner un enfant</option>' + data.children.map(c => `<option value="${c.id}">${c.device_name}</option>`).join('');
    } catch (error) { console.error(error); }
}

function isOnline(lastSeen) {
    if (!lastSeen || lastSeen === '1970-01-01 00:00:00') return false;
    return (new Date() - new Date(lastSeen)) < 5*60*1000;
}

function selectChild(id) {
    currentChildId = id;
    document.getElementById('childSelect').value = id;
    localStorage.setItem('selectedChildId', id);
    document.querySelectorAll('.child-card').forEach(card => card.classList.remove('selected'));
    const selectedCard = Array.from(document.querySelectorAll('.child-card')).find(card => card.innerText.includes(id));
    if (selectedCard) selectedCard.classList.add('selected');
    loadRealTimeStats(); loadRules(); loadNotifications(); loadTopApps(); updateChartWithRealData();
    showToast('✅ Enfant sélectionné', 'success');
}

function viewChildStats(id) { currentChildId = id; document.getElementById('childSelect').value = id; localStorage.setItem('selectedChildId', id); switchTab('dashboard'); loadTopApps(); updateChartWithRealData(); }

async function deleteChildConfirm(childId, childName) {
    if (confirm(`⚠️ Supprimer "${childName}" ? Toutes ses données seront effacées.`)) await deleteChild(childId);
}

async function deleteChild(childId) {
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${childId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
        if (res.ok) {
            if (currentChildId === childId) { currentChildId = null; localStorage.removeItem('selectedChildId'); document.getElementById('childSelect').value = ''; showNoChildSelectedMessage(); }
            loadChildren();
            showToast('🗑️ Enfant supprimé', 'info');
        } else { throw new Error(); }
    } catch (error) { console.error(error); alert('Erreur suppression'); loadChildren(); }
}

function showToast(msg, type='info') {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:20px;right:20px;background:${type==='success'?'#10b981':'#667eea'};color:white;padding:12px 24px;border-radius:12px;z-index:10000;animation:slideIn 0.3s ease;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOut 0.3s ease'; setTimeout(()=>toast.remove(),300); }, 3000);
}

// Modals pour ajouter enfant
function showAddChildModal() { document.getElementById('addChildModal').style.display = 'flex'; }
function closeAddChildModal() { document.getElementById('addChildModal').style.display = 'none'; document.getElementById('childDeviceName').value = ''; }
async function generatePairingCode(e) {
    e.preventDefault();
    const deviceName = document.getElementById('childDeviceName').value;
    if (!deviceName) { alert('Entrez un nom'); return; }
    try {
        const res = await fetch(`${API_URL}/api/pairing/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceName }) });
        const data = await res.json();
        if (res.ok) {
            closeAddChildModal();
            document.getElementById('pairingCodeDisplay').textContent = data.pairingCode;
            document.getElementById('pairingCodeModal').style.display = 'flex';
            setInterval(() => loadChildren(), 3000);
            setTimeout(() => loadChildren(), 60000);
        } else alert('Erreur: ' + data.error);
    } catch (error) { alert('Erreur réseau'); }
}
function closePairingCodeModal() { document.getElementById('pairingCodeModal').style.display = 'none'; }
function copyPairingCode() { navigator.clipboard.writeText(document.getElementById('pairingCodeDisplay').textContent); showToast('✅ Code copié','success'); }

// ============ RÈGLES DE BLOCAGE (CRUD complet) ============

async function loadRules() {
    const container = document.getElementById('rulesList');
    if (!currentChildId) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Sélectionnez d'abord un enfant</p><button onclick="switchTab('children')" class="btn-outline">👶 Gérer les enfants</button></div>`;
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        const rules = data.rules || [];
        if (!rules.length) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">⏰</span><p>Aucune règle configurée</p><button onclick="showAddRuleModal()" class="btn-outline">Créer une règle</button></div>`;
            document.getElementById('totalRules').textContent = '0';
            return;
        }
        const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
        container.innerHTML = rules.map(rule => `
            <div class="rule-item">
                <div class="rule-info">
                    <span class="rule-time">📅 ${days[rule.day_of_week]} • ${String(rule.start_hour).padStart(2,'0')}:${String(rule.start_minute).padStart(2,'0')} → ${String(rule.end_hour).padStart(2,'0')}:${String(rule.end_minute).padStart(2,'0')}</span>
                    ${rule.app_package ? `<span class="rule-app">📱 ${rule.app_package}</span>` : '<span class="rule-app">🌐 Toutes les applis</span>'}
                </div>
                <div>
                    <button class="rule-edit" onclick="editRule(${rule.id})">✏️ Modifier</button>
                    <button class="rule-delete" onclick="deleteRule(${rule.id})">🗑️ Supprimer</button>
                </div>
            </div>`).join('');
        document.getElementById('totalRules').textContent = rules.length;
    } catch (error) { console.error(error); }
}

function showAddRuleModal() {
    if (!currentChildId) { alert('Sélectionnez d\'abord un enfant'); switchTab('children'); return; }
    currentEditRuleId = null;
    document.getElementById('ruleModalTitle').innerText = 'Ajouter une règle';
    document.getElementById('ruleStart').value = '';
    document.getElementById('ruleEnd').value = '';
    document.getElementById('ruleApp').value = '';
    document.getElementById('ruleModal').style.display = 'flex';
    document.getElementById('ruleChildId').value = currentChildId;
}

async function editRule(ruleId) {
    currentEditRuleId = ruleId;
    const res = await fetch(`${API_URL}/api/admin/rules/${currentChildId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const rule = data.rules.find(r => r.id == ruleId);
    if (rule) {
        document.getElementById('ruleChildId').value = currentChildId;
        document.getElementById('ruleDay').value = rule.day_of_week;
        document.getElementById('ruleStart').value = `${String(rule.start_hour).padStart(2,'0')}:${String(rule.start_minute).padStart(2,'0')}`;
        document.getElementById('ruleEnd').value = `${String(rule.end_hour).padStart(2,'0')}:${String(rule.end_minute).padStart(2,'0')}`;
        document.getElementById('ruleApp').value = rule.app_package || '';
        document.getElementById('ruleModalTitle').innerText = 'Modifier la règle';
        document.getElementById('ruleModal').style.display = 'flex';
    }
}

function closeRuleModal() {
    document.getElementById('ruleModal').style.display = 'none';
}

async function submitRule(event) {
    event.preventDefault();
    const ruleData = {
        childId: document.getElementById('ruleChildId').value,
        dayOfWeek: parseInt(document.getElementById('ruleDay').value),
        startHour: parseInt(document.getElementById('ruleStart').value.split(':')[0]),
        startMinute: parseInt(document.getElementById('ruleStart').value.split(':')[1]),
        endHour: parseInt(document.getElementById('ruleEnd').value.split(':')[0]),
        endMinute: parseInt(document.getElementById('ruleEnd').value.split(':')[1]),
        appPackage: document.getElementById('ruleApp').value || null
    };
    let url = `${API_URL}/api/admin/rules`;
    let method = 'POST';
    if (currentEditRuleId) {
        url = `${API_URL}/api/admin/rules/${currentEditRuleId}`;
        method = 'PUT';
    }
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify(ruleData)
        });
        if (res.ok) {
            showToast(currentEditRuleId ? 'Règle modifiée' : 'Règle ajoutée', 'success');
            closeRuleModal();
            loadRules();
        } else {
            const err = await res.json();
            alert('Erreur: ' + (err.error || 'Inconnue'));
        }
    } catch (error) {
        alert('Erreur réseau');
    }
}

async function deleteRule(ruleId) {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/rules/${ruleId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showToast('Règle supprimée', 'info');
            loadRules();
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error(error);
    }
}

// ============ NOTIFICATIONS avec regroupement par contact ============
async function loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!currentChildId) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Sélectionnez d'abord un enfant</p><button onclick="switchTab('children')" class="btn-outline">👶 Gérer les enfants</button></div>`;
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/admin/children/${currentChildId}/notifications?limit=200`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        let notifs = data.notifications || [];
        if (!notifs.length) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">💬</span><p>Aucune notification reçue</p></div>`;
            document.getElementById('totalNotifs').textContent = '0';
            return;
        }

        notifs.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const conversations = {};
        notifs.forEach(notif => {
            let contact = notif.title || "Inconnu";
            if (contact.includes(':')) contact = contact.split(':')[1].trim();
            if (!conversations[contact]) conversations[contact] = [];
            conversations[contact].push(notif);
        });

        const sortedContacts = Object.keys(conversations).sort((a,b) => {
            const lastA = conversations[a].reduce((max, n) => Math.max(max, new Date(n.timestamp).getTime()), 0);
            const lastB = conversations[b].reduce((max, n) => Math.max(max, new Date(n.timestamp).getTime()), 0);
            return lastB - lastA;
        });

        let unreadCount = 0;
        let html = '';
        for (const contact of sortedContacts) {
            const msgs = conversations[contact];
            const unreadInContact = msgs.filter(m => !m.is_read).length;
            unreadCount += unreadInContact;
            const safeContact = contact.replace(/'/g, "\\'");
            const idSafe = contact.replace(/[^a-zA-Z0-9]/g, '_');
            html += `
                <div class="conversation-item" onclick="toggleConversation('${safeContact}')">
                    <div class="conversation-header">
                        <span class="contact-name">👤 ${contact}</span>
                        <span class="msg-count">${msgs.length} message${msgs.length > 1 ? 's' : ''}${unreadInContact ? `, ${unreadInContact} non lu${unreadInContact > 1 ? 's' : ''}` : ''}</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="conversation-messages" id="conv-${idSafe}" style="display: none;">
                        ${msgs.map(msg => {
                            const direction = msg.type === 'outgoing' ? '➡️ ' : '⬅️ ';
                            return `
                                <div class="notification-item" onclick="event.stopPropagation(); markAsRead(${msg.id})">
                                    <div>
                                        <div class="notification-title">${direction} ${getAppIcon(msg.app_name)} ${msg.app_name}</div>
                                        <div class="notification-content">${msg.content || 'Contenu non disponible'}</div>
                                        <div class="notification-time">📅 ${new Date(msg.timestamp).toLocaleString()}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        document.getElementById('totalNotifs').textContent = unreadCount;
        container.innerHTML = html;
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Erreur de chargement</p></div>`;
    }
}

async function markAsRead(notifId) {
    try {
        await fetch(`${API_URL}/api/admin/notifications/${notifId}/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
        });
        loadNotifications();
        loadRealTimeStats();
    } catch (error) { console.error(error); }
}

// Fonction pour afficher/masquer les messages d'une conversation
window.toggleConversation = function(contact) {
    const idSafe = 'conv-' + contact.replace(/[^a-zA-Z0-9]/g, '_');
    const el = document.getElementById(idSafe);
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

// ============ CHARGEMENT INITIAL ============
async function loadAllData() {
    await loadChildren();
    if (currentChildId) {
        await loadRules();
        await loadNotifications();
        await loadTopApps();
        await loadRealTimeStats();
    }
}

setInterval(() => {
    if (adminToken && currentChildId) {
        loadRealTimeStats();
        if (currentTab === 'notifications') loadNotifications();
        if (currentTab === 'dashboard') loadTopApps();
    }
    if (adminToken && currentTab === 'children') loadChildren();
}, 15000);

window.onload = () => {
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) {
        adminToken = savedToken;
        showDashboard();
        setupNavigation();
        initChart();
        loadAllData();
    }
};

// Rendre les fonctions globales pour les boutons HTML
window.login = login;
window.logout = logout;
window.switchTab = switchTab;
window.showAddChildModal = showAddChildModal;
window.closeAddChildModal = closeAddChildModal;
window.generatePairingCode = generatePairingCode;
window.closePairingCodeModal = closePairingCodeModal;
window.copyPairingCode = copyPairingCode;
window.showAddRuleModal = showAddRuleModal;
window.editRule = editRule;
window.deleteRule = deleteRule;
window.submitRule = submitRule;
window.closeRuleModal = closeRuleModal;
window.markAsRead = markAsRead;
window.deleteChildConfirm = deleteChildConfirm;
window.viewChildStats = viewChildStats;
window.selectChild = selectChild;
window.onChildSelect = onChildSelect;
window.refreshTopApps = refreshTopApps;
window.switchGraph = switchGraph;
