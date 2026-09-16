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

    // 5. INJECT MOBILE PROFILE HEADER INTO DRAWER
    const sidebarBrand = document.querySelector('.sidebar-brand');
    if (!document.getElementById('crm-drawer-profile') && window.innerWidth <= 850) {
        const initials = user.username.substring(0, 2).toUpperCase();
        sidebarBrand.insertAdjacentHTML('afterend', `
            <div id="crm-drawer-profile" class="drawer-profile-header desktop-hide">
                <span class="drawer-close-btn" onclick="toggleSidebar()">&times;</span>
                <div class="avatar">${initials}</div>
                <h3>${user.username}</h3>
                <p style="font-size: 0.8rem; opacity: 0.8; margin: 0; text-transform: uppercase;">${user.role}</p>
            </div>
        `);
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
    const overlay = document.getElementById('mobile-drawer-overlay');
    
    // FIXED: Properly close the sidebar, hide the dark overlay, and unlock scrolling
    if (sidebar && sidebar.classList.contains('show-menu')) {
        sidebar.classList.remove('show-menu');
        if (overlay) overlay.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
    
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
    const sidebar = document.querySelector('.crm-sidebar');
    const overlay = document.getElementById('mobile-drawer-overlay');
    
    sidebar.classList.toggle('show-menu');
    
    if (sidebar.classList.contains('show-menu')) {
        if(overlay) {
            overlay.classList.add('show');
            overlay.setAttribute('onclick', 'toggleSidebar()'); // Close when dark area tapped
        }
        document.body.style.overflow = 'hidden';
    } else {
        if(overlay) overlay.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

// ==========================================
// GLOBAL LOADER LOGIC
// ==========================================
function showLoader() {
    const loader = document.getElementById('crm-loader');
    if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
}

function hideLoader() {
    const loader = document.getElementById('crm-loader');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
}

// ==========================================
// STRICT APP BACK BUTTON INTERCEPTOR
// ==========================================
window.addEventListener('popstate', function(event) {
    const currentTab = document.querySelector('.active-tab');
    if (!currentTab) return;
    
    const currentTabId = currentTab.id.replace('tab-', '');
    
    // If they are on the Main Home Screen (Verification)
    if (currentTabId === 'verification') {
        if (!backPressedOnce) {
            backPressedOnce = true;
            window.history.pushState({ tab: 'verification' }, "", "#verification"); 
            
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
            window.location.href = "about:blank"; // Exits App
        }
    } else {
        // If they hit back from ANY OTHER TAB, force them to the home dashboard
        window.history.pushState({ tab: 'verification' }, "", "#verification");
        executeVisualTabSwitch('verification');
    }
});

// ==========================================
// ARTIST VERIFICATION ENGINE (V2)
// ==========================================
let crmArtistData = { pending: [], rejected: [], approved: [] };
let currentVerificationTab = 'pending';

async function loadPendingArtists() {
    showLoader();
    const grid = document.getElementById('verification-dynamic-grid');
    if (!grid) return;
    
    grid.innerHTML = '<p style="opacity: 0.7;">Fetching applications...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/pending-artists`);
        const data = await res.json();

        if (data.success) {
            // FIXED: Added "|| []" as a fallback so it never becomes 'undefined' and crashes
            crmArtistData.pending = data.pending || [];
            crmArtistData.rejected = data.rejected || [];
            crmArtistData.approved = data.approved || []; 
            
            renderVerificationGrid(currentVerificationTab);
        }
    } catch (e) {
        grid.innerHTML = '<p style="color: red;">Failed to load applications. Check server connection.</p>';
    } finally {
        hideLoader();
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

/// ==========================================
// BOOKING PIPELINE ENGINE
// ==========================================
let crmBookingData = { pending: [], quotation_sent: [], confirmed: [], completed: [] };
let currentBookingTab = 'pending';

async function loadBookings() {
    showLoader();
    try {
        const res = await fetch(`${API_BASE_URL}/bookings`);
        const data = await res.json();
        
        // Reset local memory
        crmBookingData = { pending: [], quotation_sent: [], confirmed: [], completed: [] }; 

        if (data.success && data.data && data.data.length > 0) {
            data.data.forEach(booking => {
                let rawStatus = booking.status ? booking.status.toLowerCase().trim() : 'pending';
                if (!['pending', 'quotation_sent', 'confirmed', 'completed'].includes(rawStatus)) {
                    rawStatus = 'pending';
                }
                crmBookingData[rawStatus].push(booking);
            });
        }
        
        renderBookingGrid(currentBookingTab);
    } catch (e) {
        document.getElementById('bookings-dynamic-grid').innerHTML = `<p style="color:red; padding:15px;">JS Crash: ${e.message}</p>`;
    } finally {
        hideLoader();
    }
}

function renderBookingGrid(statusFilter) {
    currentBookingTab = statusFilter;
    const grid = document.getElementById('bookings-dynamic-grid');
    if (!grid) return;
    
    // Update Filter Button Styles
    ['pending', 'quotation_sent', 'confirmed', 'completed'].forEach(tab => {
        const btn = document.getElementById(`btn-book-${tab}`);
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

    grid.innerHTML = '';
    const bookingsToRender = crmBookingData[statusFilter] || [];

    // Update the numbers in the tabs dynamically (SAFELY)
    if (document.getElementById('count-pending')) document.getElementById('count-pending').innerText = crmBookingData.pending.length;
    if (document.getElementById('count-quotation_sent')) document.getElementById('count-quotation_sent').innerText = crmBookingData.quotation_sent.length;
    if (document.getElementById('count-confirmed')) document.getElementById('count-confirmed').innerText = crmBookingData.confirmed.length;
    if (document.getElementById('count-completed')) document.getElementById('count-completed').innerText = crmBookingData.completed.length;

    if (bookingsToRender.length === 0) {
        grid.innerHTML = `<p style="opacity: 0.7; grid-column: 1/-1; padding: 15px;">No ${statusFilter.replace('_', ' ')} bookings found.</p>`;
        return;
    }

    bookingsToRender.forEach(booking => {
        const startDate = booking.start_date ? new Date(booking.start_date).toLocaleDateString() : 'TBD';
        const endDate = booking.end_date ? new Date(booking.end_date).toLocaleDateString() : 'TBD';
        const dates = `${startDate} to ${endDate}`;
        
        // --- 1. FORMAT TIMESTAMPS ---
        const formatDateTime = (isoString) => {
            if (!isoString) return '<span style="color:#aaa;">Pending</span>';
            const d = new Date(isoString);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        };

        // --- 2. CALCULATE FINANCIALS ---
        const totalQuote = parseFloat(booking.quotation_amount) || 0;
        const advance = parseFloat(booking.advance_amount) || 0;
        const discount = parseFloat(booking.discount) || 0;
        const balanceDue = totalQuote - advance; // The remaining amount

        let financialsHTML = '';
        if (totalQuote > 0) {
            financialsHTML = `
                <div class="financial-box">
                    <div class="financial-row"><span>Total Quoted:</span> <strong>₹${totalQuote}</strong></div>
                    <div class="financial-row"><span>Advance Due/Paid:</span> <strong style="color: #27ae60;">₹${advance}</strong></div>
                    ${discount > 0 ? `<div class="financial-row"><span>Discount:</span> <strong style="color: #e74c3c;">-₹${discount}</strong></div>` : ''}
                    <div class="financial-row" style="border-top: 1px solid #ddd; padding-top: 5px; margin-top: 5px;">
                        <span>Balance Due:</span> <strong style="color: #e74c3c;">₹${balanceDue}</strong>
                    </div>
                </div>
            `;
        }

        // --- 3. BUILD THE TIMELINE HTML ---
        const timelineHTML = `
            <div style="font-size: 0.85rem; line-height: 1.6; color: #555;">
                <div style="margin-bottom: 5px;"><strong>🗓️ Requested:</strong> ${formatDateTime(booking.created_at)}</div>
                <div style="margin-bottom: 5px;"><strong>📄 Quoted:</strong> ${formatDateTime(booking.quoted_at)}</div>
                <div style="margin-bottom: 5px;"><strong>💰 Confirmed (Adv Paid):</strong> ${formatDateTime(booking.confirmed_at)}</div>
                <div style="margin-bottom: 5px;"><strong>📦 Completed:</strong> ${formatDateTime(booking.completed_at)}</div>
                
                <hr style="border: 0; border-top: 1px dashed #ddd; margin: 10px 0;">
                
                <div><strong>📍 Location:</strong> ${booking.landmark || 'N/A'} 
                    ${booking.latitude ? `<a href="https://www.google.com/maps?q=${booking.latitude},${booking.longitude}" target="_blank" style="color:var(--accent-color); font-weight:bold;">(Open Map)</a>` : ''}
                </div>
                <div style="margin-top: 5px;"><strong>📝 Notes:</strong> ${booking.event_details || 'None'}</div>
            </div>
        `;

        // --- 4. DETERMINE BUTTONS BASED ON STATUS ---
        let actionBtn = '';
        let borderColor = 'var(--accent-color)';

        if (statusFilter === 'pending') {
            actionBtn = `<button class="btn-action-small btn-quote" style="width:100%; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="openQuotationModal('${booking.ticket_id}')">Generate Quote</button>`;
        } else if (statusFilter === 'quotation_sent') {
            actionBtn = `<button class="btn-action-small" style="background:#27ae60; color:white; width:100%; padding:10px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;" onclick="confirmBookingPayment('${booking.ticket_id}')">Mark Advance Paid (₹${advance})</button>`;
        } else if (statusFilter === 'confirmed') {
            borderColor = '#27ae60';
            actionBtn = `<button class="btn-action-small" style="background:#8e44ad; color:white; width:100%; padding:10px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;" onclick="openDispatchModal('${booking.ticket_id}', '${booking.customer_name}', '${booking.customer_email}')">Dispatch Deliverables</button>`;
        } else if (statusFilter === 'completed') {
            borderColor = '#8e44ad';
            actionBtn = `
                <div style="text-align:center; font-weight:bold; color:#8e44ad;">Delivered via ${booking.courier_partner || 'N/A'}</div>
                <div style="text-align:center; font-size:0.8rem; opacity:0.8; font-family: monospace;">Tracker: ${booking.tracking_id || 'N/A'}</div>
            `;
        }

        // --- 5. RENDER THE FULL CARD ---
        grid.innerHTML += `
            <div class="crm-card" style="border-left: 4px solid ${borderColor}; margin-bottom:15px; padding:20px; background:white; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                
                <!-- CLICKABLE HEADER -->
                <div class="crm-ticket-header" onclick="toggleCrmTimeline('${booking.ticket_id}')">
                    <div style="flex:1;">
                        <h4 style="color: var(--primary-color); margin:0 0 5px 0; font-size: 1.2rem;">${booking.customer_name || 'Customer'}</h4>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <span style="font-family: monospace; color: var(--accent-color); font-weight: bold; background: #fcf9f6; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">${booking.ticket_id}</span>
                        <span class="crm-chevron" id="crm-chev-${booking.ticket_id}">▼</span>
                    </div>
                </div>

                <!-- QUICK INFO -->
                <div style="opacity: 0.8; margin-top: 5px; line-height: 1.6; font-size: 0.95rem;">
                    <strong>Artist:</strong> ${booking.pro_name || 'N/A'} (${booking.artist_type || 'N/A'})<br>
                    <strong>Dates:</strong> ${dates}<br>
                    <strong>Category:</strong> ${booking.category || 'N/A'}
                </div>

                <!-- HIDDEN ACCORDION DETAILS -->
                <div id="crm-timeline-${booking.ticket_id}" class="crm-timeline-container">
                    ${financialsHTML}
                    ${timelineHTML}
                </div>

                <!-- CONTACT & ACTION BUTTONS -->
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <a href="tel:${booking.customer_phone || ''}" style="flex:1; background:#f0f0f0; color:#333; text-decoration:none; text-align:center; padding:10px; border-radius:6px; font-weight:bold;">📞 Call</a>
                    <a href="mailto:${booking.customer_email || ''}" style="flex:1; background:#f0f0f0; color:#333; text-decoration:none; text-align:center; padding:10px; border-radius:6px; font-weight:bold;">✉️ Email</a>
                </div>
                <div style="margin-top: 15px;">${actionBtn}</div>
            </div>
        `;
    });
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

function openQuotationModal(ticketId) {
    // 1. Find the full booking details from our local CRM memory
    const booking = crmBookingData.pending.find(b => b.ticket_id === ticketId);
    if (!booking) return alert("Booking data not found.");

    // 2. Populate the hidden fields and UI
    document.getElementById('quote-ticket-display').innerText = `Ticket: ${ticketId} | Client: ${booking.customer_name}`;
    document.getElementById('quote-ticket-id').value = ticketId;
    document.getElementById('quote-cust-name').value = booking.customer_name;
    document.getElementById('quote-cust-email').value = booking.customer_email;
    document.getElementById('quote-pro-name').value = booking.pro_name;
    
    // 3. AUTO-POPULATE RATE: Match the category to the artist's pricing JSON
    let autoRate = '';
    if (booking.pricing && booking.category) {
        autoRate = booking.pricing[booking.category] || '';
    }
    
    document.getElementById('quote-rate').value = autoRate;
    document.getElementById('quote-days').value = '1';
    document.getElementById('quote-discount').value = '';
    
    // 4. Run the math and open the modal
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

// Overwrite the existing submitQuotation to include Advance and Artist Override
async function submitQuotation() {
    const ticketId = document.getElementById('quote-ticket-id').value;
    const rate = parseFloat(document.getElementById('quote-rate').value);
    const days = parseInt(document.getElementById('quote-days').value) || 1;
    const discount = parseFloat(document.getElementById('quote-discount').value) || 0;
    const advance = parseFloat(document.getElementById('quote-advance').value) || 0;
    const finalProName = document.getElementById('quote-pro-name').value.trim();

    if (!rate || rate <= 0) return alert("Please enter a valid artist rate.");
    if (!finalProName) return alert("Assigned Artist name cannot be blank.");

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
                advanceAmount: advance, // NEW: Sends the advance amount
                customerEmail: document.getElementById('quote-cust-email').value,
                customerName: document.getElementById('quote-cust-name').value,
                proName: finalProName   // NEW: Sends the potentially changed artist name
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

async function confirmBookingPayment(ticketId) {
    if(!confirm("Has the customer paid the advance? This will lock in the dates and confirm the booking.")) return;
    try {
        const res = await fetch(`${API_BASE_URL}/confirm-booking`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ticketId })
        });
        const data = await res.json();
        if(data.success) loadBookings();
    } catch(e) { alert("Error confirming payment."); }
}

function openDispatchModal(ticketId, custName, custEmail) {
    document.getElementById('dispatch-ticket-display').innerText = `Ticket: ${ticketId} | Client: ${custName}`;
    document.getElementById('dispatch-ticket-id').value = ticketId;
    document.getElementById('dispatch-cust-name').value = custName;
    document.getElementById('dispatch-cust-email').value = custEmail;
    document.getElementById('dispatch-courier').value = '';
    document.getElementById('dispatch-tracking').value = '';
    document.getElementById('modal-dispatch').style.display = 'flex';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function submitDispatch() {
    const ticketId = document.getElementById('dispatch-ticket-id').value;
    const courier = document.getElementById('dispatch-courier').value;
    const trackingId = document.getElementById('dispatch-tracking').value;
    const email = document.getElementById('dispatch-cust-email').value;
    const name = document.getElementById('dispatch-cust-name').value;

    if(!courier || !trackingId) return alert("Please provide Courier Name and Tracking ID.");

    const btn = document.getElementById('btn-send-dispatch');
    btn.innerText = "Dispatching...";

    try {
        const res = await fetch(`${API_BASE_URL}/complete-booking`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, trackingId, courier, customerEmail: email, customerName: name })
        });
        const data = await res.json();
        if (data.success) { document.getElementById('modal-dispatch').style.display = 'none'; loadBookings(); } 
        else alert("Error: " + data.error);
    } catch (e) { alert("Network error."); } 
    finally { btn.innerText = "Complete Job"; }
}

// Toggle expanding details inside the CRM cards
window.toggleCrmTimeline = function(ticketId) {
    const timeline = document.getElementById(`crm-timeline-${ticketId}`);
    const chev = document.getElementById(`crm-chev-${ticketId}`);
    
    if (timeline.classList.contains('show')) {
        timeline.classList.remove('show');
        chev.classList.remove('up');
    } else {
        // Optional: Uncomment the next two lines if you want opening one card to automatically close the others
        // document.querySelectorAll('.crm-timeline-container').forEach(el => el.classList.remove('show'));
        // document.querySelectorAll('.crm-chevron').forEach(el => el.classList.remove('up'));
        
        timeline.classList.add('show');
        chev.classList.add('up');
    }
};
