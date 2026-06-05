// ============ CONFIGURATION ============
const API_URL = 'https://john-dbfu.onrender.com';

let adminToken = null;
let currentChildId = null;

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
    initChart();
}

function logout() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
}

async function loadAllData() {
    await loadChildren();
}

async function loadChildren() {
    if (!adminToken) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/children`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        const children = data.children || [];
        const select = document.getElementById('childSelect');
        if (select) {
            select.innerHTML = '<option value="">Sélectionner un enfant</option>' +
                children.map(c => `<option value="${c.id}">${c.device_name}</option>`).join('');
        }
        const totalSpan = document.getElementById('totalChildren');
        if (totalSpan) totalSpan.innerText = children.length;
    } catch (err) {
        console.error(err);
    }
}

function initChart() {
    const canvas = document.getElementById('screenTimeChart');
    if (!canvas) return;
    if (window.screenTimeChart) window.screenTimeChart.destroy();
    window.screenTimeChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'], datasets: [{ label: 'Heures', data: [0,0,0,0,0,0,0], backgroundColor: '#667eea' }] },
        options: { responsive: true, maintainAspectRatio: true }
    });
}

// Initialisation au chargement
window.onload = () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
        adminToken = token;
        showDashboard();
        loadAllData();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboardScreen').style.display = 'none';
    }
};

window.logout = logout;
