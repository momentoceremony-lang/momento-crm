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
        
        // Expose the raw text if Railway throws an HTML error page instead of JSON
        const rawText = await res.text(); 
        const data = JSON.parse(rawText);

        if (data.success) {
            localStorage.setItem('crmToken', data.token);
            localStorage.setItem('crmUser', JSON.stringify(data.user));
            sessionStorage.setItem('tempCrmPass', pass); 
            checkCRMAuth();
        } else {
            alert(data.error);
        }
    } catch (e) {
        console.error("Login Crash:", e);
        alert(`Detailed Error: ${e.message}\nCheck Developer Console (F12) for details.`);
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
    
    // 3. Load all dashboard modules
    loadPendingArtists();
    loadBookings();
    fetchSystemStatus(); 

    // 4. Configure Role-Based Access
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
let crmArtistData = { pending: [], rejected: [], approved: [] };
let currentVerificationTab = 'pending';

async function loadPendingArtists() {
    const grid = document.getElementById('verification-dynamic-grid');
    if (!grid) return;
    
    grid.innerHTML = '<p style="opacity: 0.7;">Fetching applications...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/pending-artists`);
        const data = await res.json();

        if (data.success) {
            crmArtistData.pending = data.pending;
            crmArtistData.rejected = data.rejected;
            crmArtistData.approved = data.approved; // NEW
            
            renderVerificationGrid(currentVerificationTab);
        }
    } catch (e) {
        grid.innerHTML = '<p style="color: red;">Failed to load applications. Check server connection.</p>';
    }
}

function renderVerificationGrid(statusFilter) {
    currentVerificationTab = statusFilter;
    const grid = document.getElementById('verification-dynamic-grid');
    
    // Update Button Styles
    ['pending', 'rejected', 'approved'].forEach(tab => {
        const btn = document.getElementById(`btn-filter-${tab}`);
        if (btn) {
            if (tab === statusFilter) {
                btn.style.background = 'var(--primary-color)';
                btn.style.color = 'white';
                btn.style.border = 'none';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#333';
                btn.style.border = '1px solid #ccc';
            }
        }
    });

    // Render Cards
    grid.innerHTML = '';
    const artistsToRender = crmArtistData[statusFilter];

    if (artistsToRender.length === 0) {
        grid.innerHTML = `<p style="opacity: 0.7; grid-column: 1/-1;">No ${statusFilter} artists found.</p>`;
        return;
    }

    artistsToRender.forEach(pro => {
        grid.innerHTML += generateVerificationCard(pro, statusFilter);
    });
}

function generateVerificationCard(pro, status) {
    const dp = pro.dp_url || 'https://via.placeholder.com/60?text=No+DP';
    const specs = pro.specialties ? pro.specialties.join(', ') : 'None';
    const phone = pro.phone || 'N/A';
    const email = pro.email || 'N/A';
    const galleryCount = pro.gallery ? pro.gallery.length : 0;
    
    // NEW: Safely pull bank details
    const bankAcc = pro.bank_account || '<span style="color:red;">Not Provided</span>';
    const ifsc = pro.ifsc_code || '<span style="color:red;">Not Provided</span>';
    
    let rejectionNote = '';
    if (status === 'rejected') {
        rejectionNote = `<div style="background: #fdf0f0; border-left: 3px solid #e74c3c; padding: 10px; margin-top: 10px; font-size: 0.85rem; color: #c0392b;"><strong>Awaiting Fixes:</strong> ${pro.rejection_reason}</div>`;
    }

    // Dynamic Action Buttons
    let actionButtons = '';
    if (status === 'pending' || status === 'rejected') {
        actionButtons = `
            <button class="btn-reject" onclick="openRejectModal('${pro.id}')">Reject</button>
            <button class="btn-approve" onclick="approveArtist('${pro.id}')">Approve</button>
        `;
    } else if (status === 'approved') {
        actionButtons = `
            <div style="width: 100%; text-align: center; color: #27ae60; font-weight: bold; padding: 10px;">✅ Live on Platform</div>
            <button class="btn-reject" style="width: 100%; margin-top: 5px; background: transparent; color: #e74c3c; border: 1px solid #e74c3c;" onclick="openRejectModal('${pro.id}')">Revoke & Request Fixes</button>
        `;
    }

    return `
        <div class="crm-card" style="${status === 'rejected' ? 'border-color: #e74c3c;' : (status === 'approved' ? 'border-color: #27ae60;' : '')}">
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
                
                <!-- NEW: Bank Details Section -->
                <hr style="border: 0; border-top: 1px dashed #ddd; margin: 12px 0;">
                <p><strong>Bank A/C:</strong> <span style="font-family: monospace; letter-spacing: 1px;">${bankAcc}</span></p>
                <p><strong>IFSC:</strong> <span style="font-family: monospace; letter-spacing: 1px;">${ifsc}</span></p>
                
                ${rejectionNote}
            </div>
            <div class="crm-card-actions" style="${status === 'approved' ? 'flex-direction: column;' : ''}">
                ${actionButtons}
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

// ==========================================
// BOOKING PIPELINE & QUOTATIONS
// ==========================================
async function loadBookings() {
    const colPending = document.getElementById('col-pending');
    const colQuotation = document.getElementById('col-quotation_sent');
    const colConfirmed = document.getElementById('col-confirmed');
    if (!colPending) return;

    colPending.innerHTML = ''; colQuotation.innerHTML = ''; colConfirmed.innerHTML = '';
    document.getElementById('count-pending').innerText = '0';
    document.getElementById('count-quotation_sent').innerText = '0';
    document.getElementById('count-confirmed').innerText = '0';

    try {
        const res = await fetch(`${API_BASE_URL}/bookings`);
        const data = await res.json();

        if (data.success) {
            let pCount = 0, qCount = 0, cCount = 0;

            data.data.forEach(booking => {
                const dates = `${new Date(booking.start_date).toLocaleDateString()} to ${new Date(booking.end_date).toLocaleDateString()}`;
                
                let actionBtn = '';
                if (booking.status === 'pending') {
                    actionBtn = `<button class="btn-action-small btn-quote" onclick="openQuotationModal('${booking.ticket_id}', '${booking.customer_name}', '${booking.customer_email}', '${booking.pro_name}')">Generate Quote</button>`;
                    pCount++;
                } else if (booking.status === 'quotation_sent') {
                    actionBtn = `<div style="text-align:center; font-weight:bold; color:var(--accent-color);">₹${booking.quotation_amount} Quoted</div>`;
                    qCount++;
                } else {
                    actionBtn = `<div style="text-align:center; font-weight:bold; color:#27ae60;">Confirmed</div>`;
                    cCount++;
                }

                const cardHTML = `
                    <div class="booking-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <h4>${booking.customer_name}</h4>
                            <span class="ticket-id">${booking.ticket_id}</span>
                        </div>
                        <div class="booking-card-detail">
                            <strong>Artist:</strong> ${booking.pro_name} (${booking.artist_type})<br>
                            <strong>Dates:</strong> ${dates}<br>
                            <strong>Category:</strong> ${booking.category}<br>
                        </div>
                        <div class="booking-card-actions">
                            <a href="tel:${booking.customer_phone}" class="btn-action-small btn-contact">📞 Call</a>
                            <a href="mailto:${booking.customer_email}" class="btn-action-small btn-contact">✉️ Email</a>
                        </div>
                        <div style="margin-top: 10px;">${actionBtn}</div>
                    </div>
                `;

                if (booking.status === 'pending') colPending.innerHTML += cardHTML;
                else if (booking.status === 'quotation_sent') colQuotation.innerHTML += cardHTML;
                else colConfirmed.innerHTML += cardHTML;
            });

            document.getElementById('count-pending').innerText = pCount;
            document.getElementById('count-quotation_sent').innerText = qCount;
            document.getElementById('count-confirmed').innerText = cCount;
        }
    } catch (e) {
        console.error("Failed to load bookings", e);
    }
}

// ==========================================
// SYSTEM CONTROLS & MAINTENANCE
// ==========================================
async function fetchSystemStatus() {
    try {
        const res = await fetch(`https://api.momentoo.in/api/system/status`);
        const data = await res.json();
        document.getElementById('maintenance-toggle').checked = data.maintenance;
    } catch (e) {
        console.error("Failed to fetch system status");
    }
}

async function flipMaintenanceSwitch() {
    const toggle = document.getElementById('maintenance-toggle');
    const isActivating = toggle.checked;

    const confirmMsg = isActivating 
        ? "WARNING: This will instantly kick all users off the live website and show the maintenance screen. Proceed?" 
        : "Turn off Maintenance Mode? The website will instantly become live for the public.";

    if (!confirm(confirmMsg)) {
        toggle.checked = !isActivating; // Revert the switch if they cancel
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/system/maintenance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: isActivating })
        });
        const data = await res.json();
        
        if (!data.success) {
            alert("Error updating system state.");
            toggle.checked = !isActivating;
        }
    } catch (e) {
        alert("Network error.");
        toggle.checked = !isActivating;
    }
}

// Quotation Calculator Logic
function openQuotationModal(ticketId, custName, custEmail, proName) {
    document.getElementById('quote-ticket-display').innerText = `Ticket: ${ticketId} | Client: ${custName}`;
    document.getElementById('quote-ticket-id').value = ticketId;
    document.getElementById('quote-cust-name').value = custName;
    document.getElementById('quote-cust-email').value = custEmail;
    document.getElementById('quote-pro-name').value = proName;
    
    document.getElementById('quote-rate').value = '';
    document.getElementById('quote-days').value = '1';
    document.getElementById('quote-discount').value = '';
    calculateQuotation();
    
    document.getElementById('modal-quotation').style.display = 'flex';
}

function closeQuotationModal() {
    document.getElementById('modal-quotation').style.display = 'none';
}

function calculateQuotation() {
    const rate = parseFloat(document.getElementById('quote-rate').value) || 0;
    const days = parseInt(document.getElementById('quote-days').value) || 1;
    const discount = parseFloat(document.getElementById('quote-discount').value) || 0;

    const artistTotal = rate * days;
    const margin = artistTotal * 0.20; // 20% Momento Hike
    const finalTotal = (artistTotal + margin) - discount;

    document.getElementById('calc-artist').innerText = `₹${artistTotal}`;
    document.getElementById('calc-margin').innerText = `₹${margin}`;
    document.getElementById('calc-discount').innerText = `-₹${discount}`;
    document.getElementById('calc-total').innerText = `₹${Math.max(0, finalTotal)}`;
}

async function submitQuotation() {
    const ticketId = document.getElementById('quote-ticket-id').value;
    const rate = parseFloat(document.getElementById('quote-rate').value);
    const days = parseInt(document.getElementById('quote-days').value) || 1;
    const discount = parseFloat(document.getElementById('quote-discount').value) || 0;

    if (!rate || rate <= 0) return alert("Please enter a valid artist rate.");

    const artistTotal = rate * days;
    const finalTotal = Math.max(0, (artistTotal + (artistTotal * 0.20)) - discount);

    const btn = document.getElementById('btn-send-quote');
    btn.innerText = "Dispatching...";

    try {
        const res = await fetch(`${API_BASE_URL}/send-quotation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticketId: ticketId,
                amount: finalTotal,
                discount: discount,
                customerEmail: document.getElementById('quote-cust-email').value,
                customerName: document.getElementById('quote-cust-name').value,
                proName: document.getElementById('quote-pro-name').value
            })
        });
        const data = await res.json();
        
        if (data.success) {
            closeQuotationModal();
            loadBookings(); 
        } else {
            alert("Error sending quotation.");
        }
    } catch (e) {
        alert("Network error.");
    } finally {
        btn.innerText = "Send Email";
    }
}
