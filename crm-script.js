const API_BASE_URL = "https://api.momentoo.in/api/crm";
let backPressedOnce = false;

document.addEventListener("DOMContentLoaded", () => {
    checkCRMAuth();
});

// ==========================================
// AUTHENTICATION & LOGIN
// ==========================================
async function loginCRM() {
    const user = document.getElementById('crm-username').value.trim();
    const pass = document.getElementById('crm-password').value.trim();
    const btn = document.getElementById('login-btn');

    if (!user || !pass) return alert("Enter credentials.");
    btn.innerText = "Authenticating...";

    try {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('crmToken', data.token);
            localStorage.setItem('crmUser', JSON.stringify(data.user));
            // Temporarily store the raw password just in case we need to reset it
            sessionStorage.setItem('tempCrmPass', pass); 
            checkCRMAuth();
        } else {
            alert(data.error);
        }
    } catch (e) {
        alert("Connection failed.");
    } finally {
        btn.innerText = "Authenticate";
    }
}

function checkCRMAuth() {
    const userString = localStorage.getItem('crmUser');
    if (!userString) {
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('dashboard-container').style.display = 'none';
        return;
    }

    const user = JSON.parse(userString);

    // 1. Check if forced password reset is required
    if (user.must_reset) {
        document.getElementById('modal-reset-password').style.display = 'block';
        return;
    }

    // 2. Hide login, show dashboard
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('dashboard-container').style.display = 'flex';
    loadPendingArtists();

    // 3. Configure Role-Based Access
    document.getElementById('active-role-badge').innerText = user.role;
    
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
    } else if (user.role === 'developer') {
        document.getElementById('menu-dev').style.display = 'block';
    }

    // Init URL Routing
    if (!window.location.hash) {
        window.history.replaceState({ tab: 'verification' }, "", "#verification");
    } else {
        executeVisualTabSwitch(window.location.hash.replace('#', ''));
    }
}

// ==========================================
// FORCED PASSWORD RESET
// ==========================================
async function submitPasswordReset() {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const user = JSON.parse(localStorage.getItem('crmUser'));
    const oldPass = sessionStorage.getItem('tempCrmPass');

    // Rules
    if (newPass !== confirmPass) return alert("Passwords do not match.");
    if (newPass.length < 6) return alert("Password must be at least 6 characters.");
    if (newPass.toLowerCase() === user.username.toLowerCase()) return alert("Password cannot be your username.");
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPass)) return alert("Password must contain at least one special character.");

    try {
        const res = await fetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, oldPassword: oldPass, newPassword: newPass })
        });
        const data = await res.json();

        if (data.success) {
            alert("Security updated successfully.");
            user.must_reset = false;
            localStorage.setItem('crmUser', JSON.stringify(user));
            sessionStorage.removeItem('tempCrmPass');
            document.getElementById('modal-reset-password').style.display = 'none';
            checkCRMAuth();
        } else {
            alert(data.error);
        }
    } catch (e) {
        alert("Failed to update security.");
    }
}

function logoutCRM() {
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmUser');
    window.location.reload();
}

// ==========================================
// UI & ROUTING LOGIC
// ==========================================
function switchTab(tabName) {
    if (window.location.hash !== `#${tabName}`) {
        window.history.pushState({ tab: tabName }, "", `#${tabName}`);
    }
    executeVisualTabSwitch(tabName);
}

function executeVisualTabSwitch(tabName) {
    const sidebar = document.querySelector('.crm-sidebar');
    if (sidebar.classList.contains('show-menu')) sidebar.classList.remove('show-menu');
    
    document.querySelectorAll('.crm-tab').forEach(tab => tab.classList.remove('active-tab'));
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active-tab');
    
    const targetLink = document.querySelector(`.sidebar-menu li[onclick="switchTab('${tabName}')"]`);
    if (targetLink) targetLink.classList.add('active');

    // Update Header Title
    const titles = { 'verification': 'Artist Verification', 'bookings': 'Booking Pipeline', 'feedback': 'Customer Feedback', 'admin': 'User Management', 'developer': 'System Controls' };
    document.getElementById('tab-title').innerText = titles[tabName] || 'Dashboard';
}

function toggleSidebar() {
    document.querySelector('.crm-sidebar').classList.toggle('show-menu');
}

// ==========================================
// NATIVE APP BACK BUTTON INTERCEPTOR
// ==========================================
window.addEventListener('popstate', function(event) {
    const hash = window.location.hash.replace('#', '');
    
    if (!hash || hash === 'verification') {
        if (!backPressedOnce) {
            backPressedOnce = true;
            window.history.pushState({ tab: 'verification' }, "", "#verification");
            executeVisualTabSwitch('verification');
            
            const toast = document.createElement('div');
            toast.innerText = "Press back again to exit CRM";
            toast.style.cssText = "position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: white; padding: 12px 24px; border-radius: 25px; z-index: 9999; font-size: 0.95rem; opacity: 0; transition: 0.3s ease;";
            document.body.appendChild(toast);
            
            requestAnimationFrame(() => toast.style.opacity = '1');
            
            setTimeout(() => {
                backPressedOnce = false;
                toast.style.opacity = '0';
                setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
            }, 2000);
        } else {
            // Exit functionality (closes tab or goes back to browser depending on environment)
            window.location.href = "about:blank"; 
        }
    } else {
        executeVisualTabSwitch(hash);
    }
});

// ==========================================
// ARTIST VERIFICATION ENGINE (V2)
// ==========================================
async function loadPendingArtists() {
    const pendingGrid = document.getElementById('pending-artists-grid');
    const rejectedGrid = document.getElementById('rejected-artists-grid');
    if (!pendingGrid) return;
    
    pendingGrid.innerHTML = '<p style="opacity: 0.7;">Fetching applications...</p>';
    rejectedGrid.innerHTML = '';

    try {
        const res = await fetch(`${API_BASE_URL}/pending-artists`);
        const data = await res.json();

        if (data.success) {
            // Render Pending
            pendingGrid.innerHTML = '';
            if (data.pending.length === 0) {
                pendingGrid.innerHTML = '<p style="opacity: 0.7; grid-column: 1/-1;">No pending applications right now.</p>';
            } else {
                data.pending.forEach(pro => {
                    pendingGrid.innerHTML += generateVerificationCard(pro, 'pending');
                });
            }

            // Render Rejected
            if (data.rejected.length === 0) {
                rejectedGrid.innerHTML = '<p style="opacity: 0.7; grid-column: 1/-1;">No rejected applications currently pending fixes.</p>';
            } else {
                data.rejected.forEach(pro => {
                    rejectedGrid.innerHTML += generateVerificationCard(pro, 'rejected');
                });
            }
        }
    } catch (e) {
        pendingGrid.innerHTML = '<p style="color: red;">Failed to load applications. Check server connection.</p>';
    }
}

function generateVerificationCard(pro, status) {
    const dp = pro.dp_url || 'https://via.placeholder.com/60?text=No+DP';
    const specs = pro.specialties ? pro.specialties.join(', ') : 'None';
    const phone = pro.phone || 'N/A';
    const email = pro.email || 'N/A';
    const galleryCount = pro.gallery ? pro.gallery.length : 0;
    
    let rejectionNote = '';
    if (status === 'rejected') {
        rejectionNote = `<div style="background: #fdf0f0; border-left: 3px solid #e74c3c; padding: 10px; margin-top: 10px; font-size: 0.85rem; color: #c0392b;"><strong>Awaiting Fixes:</strong> ${pro.rejection_reason}</div>`;
    }

    return `
        <div class="crm-card" style="${status === 'rejected' ? 'border-color: #e74c3c; opacity: 0.9;' : ''}">
            <div class="crm-card-header">
                <img src="${dp}" class="crm-card-dp" alt="DP">
                <div>
                    <div class="crm-card-title">${pro.name}</div>
                    <div class="crm-card-subtitle">${pro.pro_type || 'Photographer'}</div>
                </div>
            </div>
            <div class="crm-card-body">
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Specialties:</strong> ${specs}</p>
                <p><strong>Portfolio Items:</strong> ${galleryCount} images</p>
                ${rejectionNote}
            </div>
            <div class="crm-card-actions">
                <button class="btn-reject" onclick="openRejectModal('${pro.id}')">Reject</button>
                <button class="btn-approve" onclick="approveArtist('${pro.id}')">Approve</button>
            </div>
        </div>
    `;
}

async function approveArtist(id) {
    if (!confirm("Are you sure? This will send a Welcome email and push them live on the platform.")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/approve-artist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        
        if (data.success) {
            loadPendingArtists(); 
        } else {
            alert("Error approving artist.");
        }
    } catch (e) {
        alert("Network error.");
    }
}

// Modal Handlers
function openRejectModal(id) {
    document.getElementById('reject-artist-id').value = id;
    document.getElementById('reject-reason-text').value = '';
    document.getElementById('modal-reject-reason').style.display = 'flex';
}

function closeRejectModal() {
    document.getElementById('modal-reject-reason').style.display = 'none';
}

async function submitRejection() {
    const id = document.getElementById('reject-artist-id').value;
    const reason = document.getElementById('reject-reason-text').value.trim();
    
    if (!reason) return alert("Please provide a reason for the artist so they know what to fix.");

    const btn = document.querySelector('.btn-reject[onclick="submitRejection()"]');
    btn.innerText = "Sending Email...";

    try {
        const res = await fetch(`${API_BASE_URL}/reject-artist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, reason })
        });
        const data = await res.json();
        
        if (data.success) {
            closeRejectModal();
            loadPendingArtists(); 
        } else {
            alert("Error rejecting artist.");
        }
    } catch (e) {
        alert("Network error.");
    } finally {
        btn.innerText = "Send Email & Reject";
    }
}

/* ==========================================
   KANBAN PIPELINE
========================================== */
.kanban-board { display: flex; gap: 20px; overflow-x: auto; padding-bottom: 15px; }
.kanban-column { flex: 1; min-width: 300px; background: #eaddd740; border-radius: 12px; display: flex; flex-direction: column; height: 70vh; }
.kanban-header { font-family: 'Playfair Display', serif; font-weight: bold; font-size: 1.2rem; padding: 15px; background: white; border-radius: 12px 12px 0 0; border-top: 4px solid var(--accent-color); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
.kanban-badge { background: var(--accent-color); color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; font-family: 'Lato', sans-serif; }
.kanban-body { padding: 15px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 15px; }

/* Booking Card */
.booking-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border-left: 4px solid var(--accent-color); font-size: 0.9rem; }
.booking-card h4 { color: var(--primary-color); margin-bottom: 5px; font-size: 1.1rem; }
.booking-card .ticket-id { font-family: monospace; color: var(--accent-color); font-weight: bold; background: #fcf9f6; padding: 2px 5px; border-radius: 4px; font-size: 0.8rem; }
.booking-card-detail { opacity: 0.8; margin-top: 8px; line-height: 1.5; }
.booking-card-actions { margin-top: 15px; display: flex; gap: 10px; }
.btn-action-small { padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.8rem; width: 100%; transition: 0.2s; }
.btn-quote { background: var(--primary-color); color: white; }
.btn-quote:hover { background: var(--accent-color); }
.btn-contact { background: #f0f0f0; color: #333; text-decoration: none; text-align: center; }
.btn-contact:hover { background: #e0e0e0; }
