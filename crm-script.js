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
// ARTIST VERIFICATION ENGINE
// ==========================================
async function loadPendingArtists() {
    const grid = document.getElementById('pending-artists-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="opacity: 0.7;">Fetching pending applications...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/pending-artists`);
        const data = await res.json();

        if (data.success) {
            grid.innerHTML = '';
            if (data.data.length === 0) {
                grid.innerHTML = '<p style="opacity: 0.7; grid-column: 1/-1;">No pending applications right now.</p>';
                return;
            }

            data.data.forEach(pro => {
                const dp = pro.dp_url || 'https://via.placeholder.com/60?text=No+DP';
                const specs = pro.specialties ? pro.specialties.join(', ') : 'None';
                const phone = pro.phone || 'N/A';
                const email = pro.email || 'N/A';
                
                // Count portfolio images to see if they actually set up their account
                const galleryCount = pro.gallery ? pro.gallery.length : 0;

                grid.innerHTML += `
                    <div class="crm-card">
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
                        </div>
                        <div class="crm-card-actions">
                            <button class="btn-reject" onclick="rejectArtist('${pro.id}')">Reject</button>
                            <button class="btn-approve" onclick="approveArtist('${pro.id}')">Approve</button>
                        </div>
                    </div>
                `;
            });
        }
    } catch (e) {
        grid.innerHTML = '<p style="color: red;">Failed to load applications. Check server connection.</p>';
    }
}

async function approveArtist(id) {
    if (!confirm("Are you sure you want to approve this artist? They will instantly appear on the live website.")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/approve-artist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        
        if (data.success) {
            loadPendingArtists(); // Refresh the list
        } else {
            alert("Error approving artist.");
        }
    } catch (e) {
        alert("Network error.");
    }
}

async function rejectArtist(id) {
    if (!confirm("Are you sure you want to REJECT and DELETE this application permanently?")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/reject-artist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        
        if (data.success) {
            loadPendingArtists(); // Refresh the list
        } else {
            alert("Error rejecting artist.");
        }
    } catch (e) {
        alert("Network error.");
    }
}
