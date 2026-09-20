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
    
    loadPendingArtists();
    loadBookings();
    fetchSystemStatus(); 
    initFeedbackUI(); 
    loadFeedback();   
    loadCRMGallery(); 
    loadCrmUsers(); // NEW: Load Staff Accounts
    
    // 4. Configure Role-Based Access
    document.getElementById('active-role-badge').innerText = user.role;
    
    if (user.role === 'admin') {
        document.getElementById('menu-admin').style.display = 'block';
    } else if (user.role === 'developer') {
        document.getElementById('menu-dev').style.display = 'block';
        document.getElementById('menu-admin').style.display = 'block'; // FIXED: Developer gets Admin tab access
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
let activeSubFilter = 'all'; // NEW: Tracks the active sub-filter

// Global function to trigger the sub-filters
window.setSubFilter = function(filter) {
    activeSubFilter = filter;
    renderBookingGrid('confirmed');
};

async function loadBookings() {
    showLoader();
    try {
        const res = await fetch(`${API_BASE_URL}/bookings`);
        const data = await res.json();
        
        crmBookingData = { pending: [], quotation_sent: [], confirmed: [], completed: [] }; 

        if (data.success && data.data && data.data.length > 0) {
            data.data.forEach(booking => {
                let rawStatus = booking.status ? booking.status.toLowerCase().trim() : 'pending';
                
                // FIXED: 'artist_left' is now correctly routed to the Confirmed tab!
                if (['confirmed', 'artist_arrived', 'artist_left', 'final_paid'].includes(rawStatus)) {
                    crmBookingData['confirmed'].push(booking);
                } else if (['pending', 'quotation_sent', 'completed'].includes(rawStatus)) {
                    crmBookingData[rawStatus].push(booking);
                } else {
                    crmBookingData['pending'].push(booking);
                }
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
    
    // Reset sub-filter if we switch main tabs
    if (statusFilter !== 'confirmed' && activeSubFilter !== 'all') {
        activeSubFilter = 'all';
    }

    const grid = document.getElementById('bookings-dynamic-grid');
    if (!grid) return;
    
    // Update Main Filter Button Styles
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

    // NEW: Force 1-Column Layout for Desktop (Centered)
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.alignItems = 'center';
    grid.innerHTML = '';

    let bookingsToRender = crmBookingData[statusFilter] || [];

    // Update Tab Counters
    if (document.getElementById('count-pending')) document.getElementById('count-pending').innerText = crmBookingData.pending.length;
    if (document.getElementById('count-quotation_sent')) document.getElementById('count-quotation_sent').innerText = crmBookingData.quotation_sent.length;
    if (document.getElementById('count-confirmed')) document.getElementById('count-confirmed').innerText = crmBookingData.confirmed.length;
    if (document.getElementById('count-completed')) document.getElementById('count-completed').innerText = crmBookingData.completed.length;

    // INJECT SUB-FILTER UI (Only visible inside the Confirmed tab)
    if (statusFilter === 'confirmed') {
        grid.innerHTML += `
            <div style="display: flex; gap: 10px; margin-bottom: 20px; width: 100%; max-width: 1000px; overflow-x: auto; padding-bottom: 10px; justify-content: start;">
                <button onclick="setSubFilter('all')" style="padding: 8px 16px; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: 0.3s; ${activeSubFilter === 'all' ? 'background: var(--accent-color); color: #0f0f10; border: none; font-weight:bold;' : 'background: white; color: #333; border: 1px solid #ddd;'}">All Stages</button>
                <button onclick="setSubFilter('upcoming')" style="padding: 8px 16px; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: 0.3s; ${activeSubFilter === 'upcoming' ? 'background: #3498db; color: #fff; border: none; font-weight:bold;' : 'background: white; color: #333; border: 1px solid #ddd;'}">Upcoming</button>
                <button onclick="setSubFilter('artist_arrived')" style="padding: 8px 16px; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: 0.3s; ${activeSubFilter === 'artist_arrived' ? 'background: #27ae60; color: #fff; border: none; font-weight:bold;' : 'background: white; color: #333; border: 1px solid #ddd;'}">At Location</button>
                <button onclick="setSubFilter('artist_left')" style="padding: 8px 16px; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: 0.3s; ${activeSubFilter === 'artist_left' ? 'background: #e74c3c; color: #fff; border: none; font-weight:bold;' : 'background: white; color: #333; border: 1px solid #ddd;'}">Final Billing</button>
                <button onclick="setSubFilter('final_paid')" style="padding: 8px 16px; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: 0.3s; ${activeSubFilter === 'final_paid' ? 'background: #8e44ad; color: #fff; border: none; font-weight:bold;' : 'background: white; color: #333; border: 1px solid #ddd;'}">Ready to Dispatch</button>
            </div>
        `;

        // Apply the Sub-Filter logic
        if (activeSubFilter !== 'all') {
            if (activeSubFilter === 'upcoming') {
                bookingsToRender = bookingsToRender.filter(b => b.status === 'confirmed');
            } else {
                bookingsToRender = bookingsToRender.filter(b => b.status === activeSubFilter);
            }
        }
    }

    if (bookingsToRender.length === 0) {
        grid.innerHTML += `<p style="opacity: 0.7; width: 100%; text-align: center; padding: 15px;">No ${activeSubFilter !== 'all' ? activeSubFilter.replace('_', ' ') : statusFilter.replace('_', ' ')} bookings found.</p>`;
        return;
    }

    bookingsToRender.forEach(booking => {
        const startDate = booking.start_date ? new Date(booking.start_date).toLocaleDateString() : 'TBD';
        const endDate = booking.end_date ? new Date(booking.end_date).toLocaleDateString() : 'TBD';
        const dates = `${startDate} to ${endDate}`;
        
        const formatDateTime = (isoString) => {
            if (!isoString) return '<span style="color:#aaa;">Pending</span>';
            const d = new Date(isoString);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        };

        const totalQuote = parseFloat(booking.quotation_amount) || 0;
        const advance = parseFloat(booking.advance_amount) || 0;
        const discount = parseFloat(booking.discount) || 0;
        const balanceDue = totalQuote - advance; 

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

        const timelineHTML = `
            <div style="font-size: 0.85rem; line-height: 1.6; color: #555;">
                <div style="margin-bottom: 5px;"><strong>🗓️ Requested:</strong> ${formatDateTime(booking.created_at)}</div>
                <div style="margin-bottom: 5px;"><strong>📄 Quoted:</strong> ${formatDateTime(booking.quoted_at)}</div>
                <div style="margin-bottom: 5px;"><strong>💰 Confirmed (Adv Paid):</strong> ${formatDateTime(booking.confirmed_at)}</div>
                
                <div style="margin-bottom: 5px;"><strong>📸 Arrived:</strong> ${formatDateTime(booking.artist_arrived_at)} 
                    ${booking.arrival_photo_url ? `<a href="${booking.arrival_photo_url}" target="_blank" style="color:var(--accent-color); font-weight:bold; font-size:0.8rem; text-decoration:none; margin-left:5px;">[Photo]</a>` : ''}
                    ${booking.arrival_lat ? `<a href="https://www.google.com/maps?q=${booking.arrival_lat},${booking.arrival_lng}" target="_blank" style="color:#27ae60; font-weight:bold; font-size:0.8rem; text-decoration:none; margin-left:5px;">[Map Pin]</a>` : ''}
                </div>

                <div style="margin-bottom: 5px;"><strong>🏁 Job Finished (Left):</strong> ${formatDateTime(booking.artist_left_at)} 
                    ${booking.left_photo_url ? `<a href="${booking.left_photo_url}" target="_blank" style="color:var(--accent-color); font-weight:bold; font-size:0.8rem; text-decoration:none; margin-left:5px;">[Photo]</a>` : ''}
                    ${booking.left_lat ? `<a href="https://www.google.com/maps?q=${booking.left_lat},${booking.left_lng}" target="_blank" style="color:#27ae60; font-weight:bold; font-size:0.8rem; text-decoration:none; margin-left:5px;">[Map Pin]</a>` : ''}
                </div>

                <div style="margin-bottom: 5px;"><strong>💳 Final Payment:</strong> ${formatDateTime(booking.final_payment_at)}</div>
                <div style="margin-bottom: 5px;"><strong>📦 Completed:</strong> ${formatDateTime(booking.completed_at)}</div>
                
                <hr style="border: 0; border-top: 1px dashed #ddd; margin: 10px 0;">
                
                <div><strong>📍 Location:</strong> ${booking.landmark || 'N/A'} 
                    ${booking.latitude ? `<a href="https://www.google.com/maps?q=${booking.latitude},${booking.longitude}" target="_blank" style="color:var(--accent-color); font-weight:bold;">(Open Map)</a>` : ''}
                </div>
                <div style="margin-top: 5px;"><strong>📝 Notes:</strong> ${booking.event_details || 'None'}</div>
            </div>
        `;
        
        let actionBtn = '';
        let borderColor = 'var(--accent-color)';

        // DYNAMIC BUTTON LOGIC
        if (statusFilter === 'pending') {
            actionBtn = `<button class="btn-action-small btn-quote" style="width:100%; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="openQuotationModal('${booking.ticket_id}')">Generate Quote</button>`;
        } else if (statusFilter === 'quotation_sent') {
            actionBtn = `<button class="btn-action-small" style="background:#27ae60; color:white; width:100%; padding:10px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;" onclick="confirmBookingPayment('${booking.ticket_id}')">Mark Advance Paid (₹${advance})</button>`;
        } else if (statusFilter === 'confirmed') {
            let currentStatus = booking.status || 'confirmed';
            
            if (currentStatus === 'confirmed') {
                borderColor = '#3498db';
                actionBtn = `<div style="text-align:center; padding:10px; font-weight:bold; color:#3498db; background:#ebf5fb; border-radius:6px;">Waiting for Artist to Arrive</div>`;
            } else if (currentStatus === 'artist_arrived') {
                borderColor = '#27ae60';
                actionBtn = `<div style="text-align:center; padding:10px; font-weight:bold; color:#27ae60; background:#e9f7ef; border-radius:6px;">Artist is currently at location</div>`;
            } else if (currentStatus === 'artist_left') {
                borderColor = '#e74c3c'; // Red for missing payment
                actionBtn = `<button class="btn-action-small" style="background:#e74c3c; color:white; width:100%; padding:10px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;" onclick="sendFinalPaymentLink('${booking.ticket_id}', ${balanceDue}, '${booking.customer_email}', '${booking.customer_name}')">Send Final Payment Link (₹${balanceDue})</button>`;
            } else if (currentStatus === 'final_paid') {
                borderColor = '#8e44ad'; // Purple for dispatch
                actionBtn = `<button class="btn-action-small" style="background:#8e44ad; color:white; width:100%; padding:10px; border-radius:6px; font-weight:bold; border:none; cursor:pointer;" onclick="openDispatchModal('${booking.ticket_id}', '${booking.customer_name}', '${booking.customer_email}')">Dispatch Deliverables</button>`;
            }
        } else if (statusFilter === 'completed') {
            borderColor = '#8e44ad';
            actionBtn = `
                <div style="text-align:center; font-weight:bold; color:#8e44ad;">Delivered via ${booking.courier_partner || 'N/A'}</div>
                <div style="text-align:center; font-size:0.8rem; opacity:0.8; font-family: monospace;">Tracker: ${booking.tracking_id || 'N/A'}</div>
            `;
        }

        // NEW: Max-Width 700px ensures it looks like mobile on Desktop
        grid.innerHTML += `
            <div class="crm-card" style="width: 100%; max-width: 1000px; border-left: 4px solid ${borderColor}; margin-bottom: 20px; padding:20px; background:white; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                <div class="crm-ticket-header" onclick="toggleCrmTimeline('${booking.ticket_id}')">
                    <div style="flex:1;">
                        <h4 style="color: var(--primary-color); margin:0 0 5px 0; font-size: 1.2rem;">${booking.customer_name || 'Customer'}</h4>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <span style="font-family: monospace; color: var(--accent-color); font-weight: bold; background: #fcf9f6; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">${booking.ticket_id}</span>
                        <span class="crm-chevron" id="crm-chev-${booking.ticket_id}">▼</span>
                    </div>
                </div>

                <div style="opacity: 0.8; margin-top: 5px; line-height: 1.6; font-size: 0.95rem;">
                    <strong>Artist:</strong> ${booking.pro_name || 'N/A'} (${booking.artist_type || 'N/A'})<br>
                    <strong>Dates:</strong> ${dates}<br>
                    <strong>Category:</strong> ${booking.category || 'N/A'}
                </div>

                <div id="crm-timeline-${booking.ticket_id}" class="crm-timeline-container">
                    ${financialsHTML}
                    ${timelineHTML}
                </div>

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

// ==========================================
// SYSTEM CONTROLS: MIGRATE LEGACY IMAGES
// ==========================================
async function migrateLegacyGallery() {
    if(!confirm("This will scan all artist profiles and push their existing Cloudinary images into the Pending Approvals queue. Proceed?")) return;

    const btn = document.getElementById('btn-migrate');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const res = await fetch('https://api.momentoo.in/api/crm/system/migrate-gallery', { method: 'POST' });
        const data = await res.json();

        if(data.success) {
            alert(`Migration Complete! ${data.count} existing Cloudinary images were pushed to your Pending queue.`);
            loadCRMGallery(); // Refresh the gallery data automatically
        } else {
            alert("Migration failed: " + data.error);
        }
    } catch (e) {
        alert("Network error. Check console.");
        console.error("Migration trigger error:", e);
    } finally {
        btn.innerText = "Migrate";
        btn.disabled = false;
    }
}

function openQuotationModal(ticketId) {
    const booking = crmBookingData.pending.find(b => b.ticket_id === ticketId);
    if (!booking) return alert("Booking data not found.");

    document.getElementById('quote-ticket-display').innerText = `Ticket: ${ticketId} | Client: ${booking.customer_name}`;
    document.getElementById('quote-ticket-id').value = ticketId;
    document.getElementById('quote-cust-name').value = booking.customer_name;
    document.getElementById('quote-cust-email').value = booking.customer_email;
    
    // 1. AUTO-CALCULATE NUMBER OF DAYS
    let calcDays = 1;
    if (booking.start_date && booking.end_date) {
        const start = new Date(booking.start_date);
        const end = new Date(booking.end_date);
        // Calculate difference in time, convert to days, and add 1 (so same day = 1, 20th to 23rd = 4)
        const timeDiff = end.getTime() - start.getTime();
        calcDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
        if (isNaN(calcDays) || calcDays < 1) calcDays = 1;
    }
    document.getElementById('quote-days').value = calcDays;
    
    // 2. SMART ARTIST DROPDOWN
    const artistSelect = document.getElementById('quote-pro-name');
    artistSelect.innerHTML = ''; // Clear previous options
    
    // Filter your live artists by the required profession (e.g., Makeup Artist)
    const availablePros = crmArtistData.approved.filter(pro => pro.pro_type === booking.artist_type);
    
    let requestedFound = false;
    availablePros.forEach(pro => {
        const isSelected = pro.name === booking.pro_name ? 'selected' : '';
        if (isSelected) requestedFound = true;
        artistSelect.innerHTML += `<option value="${pro.name}" ${isSelected}>${pro.name} (Live)</option>`;
    });

    // If the requested artist isn't verified or deleted, still show them as an option at the top
    if (!requestedFound) {
        artistSelect.innerHTML = `<option value="${booking.pro_name}" selected>${booking.pro_name} (Requested - Not Live)</option>` + artistSelect.innerHTML;
    }

    // 3. AUTO-POPULATE RATE
    let autoRate = '';
    if (booking.pricing && booking.category) {
        autoRate = booking.pricing[booking.category] || '';
    }
    document.getElementById('quote-rate').value = autoRate;
    document.getElementById('quote-discount').value = '';
    document.getElementById('quote-advance').value = '';
    
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

async function sendFinalPaymentLink(ticketId, balanceDue, customerEmail, customerName) {
    if(!confirm(`Send an automated Razorpay link to collect the final balance of ₹${balanceDue}?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/send-final-payment`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ ticketId, balanceDue, customerEmail, customerName })
        });
        const data = await res.json();
        if(data.success) {
            alert("Final payment link dispatched to customer!");
        } else alert("Error: " + data.error);
    } catch(e) { alert("Error sending payment link."); }
}

async function sendFinalPaymentLink(ticketId, balanceDue, customerEmail, customerName) {
    if(!confirm(`Send an automated Razorpay link to collect the final balance of ₹${balanceDue}?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/send-final-payment`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ ticketId, balanceDue, customerEmail, customerName })
        });
        const data = await res.json();
        if(data.success) {
            alert("Final payment link dispatched to customer!");
            loadBookings(); // Automatically refresh the UI
        } else alert("Error: " + data.error);
    } catch(e) { alert("Error sending payment link."); }
}


// ==========================================
// CUSTOMER FEEDBACK ENGINE
// ==========================================
let crmFeedbackData = { new: [], reviewed: [] };
let currentFeedbackTab = 'new';

function initFeedbackUI() {
    const container = document.getElementById('tab-feedback');
    if(!container) return; // Failsafe
    
    // Inject Filter Buttons and Grid
    if(!container.querySelector('.feedback-controls')) {
        container.innerHTML = `
            <div class="feedback-controls" style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="btn-feed-new" onclick="renderFeedbackGrid('new')" style="padding: 10px 20px; border-radius: 20px; border: none; font-weight: bold; cursor: pointer;">New Reviews (<span id="count-feed-new">0</span>)</button>
                <button id="btn-feed-reviewed" onclick="renderFeedbackGrid('reviewed')" style="padding: 10px 20px; border-radius: 20px; border: 1px solid #ccc; background: transparent; cursor: pointer;">All Reviewed (<span id="count-feed-reviewed">0</span>)</button>
            </div>
            <div id="feedback-dynamic-grid" style="display: flex; flex-direction: column; align-items: center; gap: 20px;"></div>
        `;
    }

    // Inject the Warning Email Modal invisibly into the body
    if(!document.getElementById('modal-warning')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-warning" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
                <div class="modal-content auth-box" style="background:white; padding:30px; border-radius:15px; width:90%; max-width:500px; margin: 10vh auto; text-align: left;">
                    <h3 style="color:#e74c3c; margin-top:0;">Send Warning to Artist</h3>
                    <p id="warning-pro-name" style="font-weight:bold; margin-bottom: 15px;"></p>
                    <textarea id="warning-text" placeholder="Type your warning/feedback message to the artist here..." style="width:100%; height:120px; padding:10px; border-radius:8px; border:1px solid #ddd; margin-bottom:15px; resize:vertical; font-family: inherit;"></textarea>
                    <input type="hidden" id="warning-ticket-id">
                    <input type="hidden" id="warning-pro-email">
                    <input type="hidden" id="warning-pro-name-hidden">
                    <div style="display:flex; gap:10px;">
                        <button onclick="document.getElementById('modal-warning').style.display='none'" style="flex:1; padding:12px; border-radius:8px; background:#f0f0f0; border:none; cursor:pointer; font-weight:bold;">Cancel</button>
                        <button id="btn-send-warning" onclick="submitWarning()" style="flex:2; padding:12px; border-radius:8px; background:#e74c3c; color:white; border:none; cursor:pointer; font-weight:bold;">Send Email & Mark Reviewed</button>
                    </div>
                </div>
            </div>
        `);
    }
}

async function loadFeedback() {
    try {
        const res = await fetch(`${API_BASE_URL}/feedback`);
        const data = await res.json();
        
        crmFeedbackData = { new: [], reviewed: [] };
        
        if (data.success && data.data) {
            data.data.forEach(item => {
                // If it has an admin's name attached, it goes to "Reviewed"
                if (item.crm_reviewed_by) {
                    crmFeedbackData.reviewed.push(item);
                } else {
                    crmFeedbackData.new.push(item);
                }
            });
        }
        renderFeedbackGrid(currentFeedbackTab);
    } catch (e) {
        console.error("Feedback fetch error:", e);
    }
}

function renderFeedbackGrid(filter) {
    currentFeedbackTab = filter;
    const grid = document.getElementById('feedback-dynamic-grid');
    if(!grid) return;

    // Update Counters
    document.getElementById('count-feed-new').innerText = crmFeedbackData.new.length;
    document.getElementById('count-feed-reviewed').innerText = crmFeedbackData.reviewed.length;

    // Update Button Styles
    const btnNew = document.getElementById('btn-feed-new');
    const btnRev = document.getElementById('btn-feed-reviewed');

    if(filter === 'new') {
        btnNew.style.background = 'var(--primary-color)'; btnNew.style.color = 'white'; btnNew.style.border = 'none';
        btnRev.style.background = 'transparent'; btnRev.style.color = '#333'; btnRev.style.border = '1px solid #ccc';
    } else {
        btnRev.style.background = 'var(--primary-color)'; btnRev.style.color = 'white'; btnRev.style.border = 'none';
        btnNew.style.background = 'transparent'; btnNew.style.color = '#333'; btnNew.style.border = '1px solid #ccc';
    }

    grid.innerHTML = '';
    const data = crmFeedbackData[filter];

    if(data.length === 0) {
        grid.innerHTML = `<p style="opacity:0.6; padding: 20px;">No ${filter} feedback found.</p>`;
        return;
    }

    data.forEach(item => {
        // Generate Star UI
        const starsHtml = '<span style="color:#f39c12; font-size:1.4rem;">★</span>'.repeat(item.rating) + '<span style="color:#ddd; font-size:1.4rem;">★</span>'.repeat(5 - item.rating);
        const borderColor = item.rating >= 4 ? '#27ae60' : (item.rating == 3 ? '#f39c12' : '#e74c3c');
        
        let reviewFooter = '';
        
        // NEW REVIEWS: Show action buttons
        if(filter === 'new') {
            reviewFooter = `
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button onclick="markFeedbackReviewed('${item.ticket_id}')" style="flex:1; background:#27ae60; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">✅ Mark as Reviewed</button>
                    <button onclick="openWarningModal('${item.ticket_id}', '${item.pro_name}', '${item.pro_email}')" style="flex:1; background:#e74c3c; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">⚠️ Send Warning Mail</button>
                </div>
            `;
        } 
        // ALREADY REVIEWED: Show the audit trail
        else {
            reviewFooter = `
                <div style="margin-top:15px; padding:15px; background:#f9f9f9; border-radius:8px; font-size:0.9rem; color:#555; border: 1px solid #eee;">
                    <strong>Admin Audit Trail:</strong><br>
                    <span style="display:inline-block; margin-top: 5px;">Reviewed By: <strong>${item.crm_reviewed_by}</strong> on ${new Date(item.crm_reviewed_at).toLocaleDateString()}</span><br>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd;">
                        ${item.crm_warning_sent ? `<strong style="color:#e74c3c;">⚠️ Warning Sent:</strong><br><em>"${item.crm_warning_text}"</em>` : '<strong style="color:#27ae60;">✅ Marked as OK (No Action Required)</strong>'}
                    </div>
                </div>
            `;
        }

        grid.innerHTML += `
            <div class="crm-card" style="width: 100%; max-width: 1000px; padding:25px; background:white; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.05); border-left: 4px solid ${borderColor}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h3 style="margin:0 0 5px 0; color:var(--primary-color);">${item.pro_name}</h3>
                        <p style="margin:0; font-size:0.9rem; opacity:0.8;">Client: <strong>${item.customer_name}</strong> | ${item.customer_email}</p>
                    </div>
                    <span style="font-family: monospace; color: var(--accent-color); font-weight: bold; background: #fcf9f6; padding: 6px 12px; border-radius: 6px; font-size: 0.9rem;">${item.ticket_id}</span>
                </div>
                
                <div style="margin: 20px 0 10px 0;">${starsHtml}</div>
                
                <div style="font-style:italic; color:#444; background:#fcf9f6; padding:20px; border-radius:8px; border-left:3px solid #d4af37; margin:0; line-height: 1.6; font-size: 1.05rem;">
                    "${item.review_text}"
                </div>
                
                ${reviewFooter}
            </div>
        `;
    });
}

async function markFeedbackReviewed(ticketId) {
    const user = JSON.parse(localStorage.getItem('crmUser'));
    if(!confirm("Mark this feedback as reviewed? No warning email will be sent.")) return;
    try {
        const res = await fetch(`${API_BASE_URL}/feedback/review`, {
            method: 'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ ticketId, adminName: user.username })
        });
        const data = await res.json();
        if(data.success) loadFeedback();
    } catch(e) { alert("Network error."); }
}

function openWarningModal(ticketId, proName, proEmail) {
    document.getElementById('warning-ticket-id').value = ticketId;
    document.getElementById('warning-pro-name-hidden').value = proName;
    document.getElementById('warning-pro-email').value = proEmail;
    document.getElementById('warning-pro-name').innerText = `Artist: ${proName}`;
    document.getElementById('warning-text').value = '';
    document.getElementById('modal-warning').style.display = 'flex';
}

async function submitWarning() {
    const ticketId = document.getElementById('warning-ticket-id').value;
    const proName = document.getElementById('warning-pro-name-hidden').value;
    const proEmail = document.getElementById('warning-pro-email').value;
    const text = document.getElementById('warning-text').value.trim();
    const user = JSON.parse(localStorage.getItem('crmUser'));

    if(!text) return alert("Please type a warning message.");

    const btn = document.getElementById('btn-send-warning');
    btn.innerText = 'Sending...'; btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}/feedback/warning`, {
            method: 'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ ticketId, adminName: user.username, warningText: text, proEmail, proName })
        });
        const data = await res.json();
        if(data.success) {
            document.getElementById('modal-warning').style.display='none';
            loadFeedback(); // Instantly moves it to the "Reviewed" tab
        } else alert("Error: "+data.error);
    } catch(e) { alert("Network error"); }
    finally { btn.innerText = 'Send Email & Mark Reviewed'; btn.disabled = false; }
}

// ==========================================
// CRM GALLERY MODERATION ENGINE
// ==========================================
let crmGalleryData = { pending: [], approved: [] };
let currentGalleryTab = 'pending';

async function loadCRMGallery() {
    const container = document.getElementById('tab-gallery');
    if (!container) return;

    if (!document.getElementById('crm-gallery-grid')) {
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div>
                    <h2 style="font-size: 1.8rem; color: var(--primary-color);">Gallery Moderation</h2>
                    <p style="opacity: 0.8; font-size: 0.9rem; margin:0;">Approve images to push them to the public View.html gallery.</p>
                </div>
                <button class="btn-primary" style="width: auto; padding: 10px 20px;" onclick="loadCRMGallery()">↻ Refresh</button>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 25px; border-bottom: 2px solid #eaddd7; padding-bottom: 15px;">
                <button id="btn-gal-pending" class="btn-primary" style="background: var(--primary-color); border-radius: 20px; padding: 8px 15px;" onclick="renderGalleryGrid('pending')">Pending Approvals (<span id="count-gal-pending">0</span>)</button>
                <button id="btn-gal-approved" class="btn-primary" style="background: transparent; color: #333; border: 1px solid #ccc; border-radius: 20px; padding: 8px 15px;" onclick="renderGalleryGrid('approved')">Approved Gallery (<span id="count-gal-approved">0</span>)</button>
            </div>
            <div id="crm-gallery-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;"></div>
        `;
    }

    const grid = document.getElementById('crm-gallery-grid');
    grid.innerHTML = '<p style="opacity: 0.6; grid-column: 1/-1;">Loading images...</p>';

    try {
        const res = await fetch('https://api.momentoo.in/api/crm/gallery/all');
        const data = await res.json();

        // NEW: If the backend throws an error, print it directly to the CRM screen
        if (!data.success) {
            grid.innerHTML = `<p style="color: red; grid-column: 1/-1; padding: 20px;">Database Error: ${data.error}</p>`;
            return;
        }

        crmGalleryData = { pending: [], approved: [] };

        if (data.data) {
            data.data.forEach(item => {
                if (item.is_approved) {
                    crmGalleryData.approved.push(item);
                } else {
                    crmGalleryData.pending.push(item);
                }
            });
        }
        renderGalleryGrid(currentGalleryTab);
    } catch (e) {
        grid.innerHTML = `<p style="color: red; grid-column: 1/-1;">Network/Fetch Crash: ${e.message}</p>`;
    }
}

function renderGalleryGrid(filter) {
    currentGalleryTab = filter;
    const grid = document.getElementById('crm-gallery-grid');
    if (!grid) return;

    // Update Counters
    document.getElementById('count-gal-pending').innerText = crmGalleryData.pending.length;
    document.getElementById('count-gal-approved').innerText = crmGalleryData.approved.length;

    // Update Button Styles
    const btnPen = document.getElementById('btn-gal-pending');
    const btnApp = document.getElementById('btn-gal-approved');

    if (filter === 'pending') {
        btnPen.style.background = 'var(--primary-color)'; btnPen.style.color = 'white'; btnPen.style.border = 'none';
        btnApp.style.background = 'transparent'; btnApp.style.color = '#333'; btnApp.style.border = '1px solid #ccc';
    } else {
        btnApp.style.background = 'var(--primary-color)'; btnApp.style.color = 'white'; btnApp.style.border = 'none';
        btnPen.style.background = 'transparent'; btnPen.style.color = '#333'; btnPen.style.border = '1px solid #ccc';
    }

    grid.innerHTML = '';
    const data = crmGalleryData[filter];

    if (data.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; background: white; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);"><h3 style="color: #27ae60; margin-bottom: 5px;">All caught up!</h3><p style="opacity: 0.6; margin: 0;">There are no ${filter} images to review.</p></div>`;
        return;
    }

    data.forEach(item => {
        let actionFooter = '';
        const artistName = item.pro_name ? item.pro_name : '<span style="color:#e74c3c;">Artist Quit/Deleted</span>';
        const dpImg = item.dp_url ? `<img src="${item.dp_url}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd;">` : '❌';

        if (filter === 'pending') {
            actionFooter = `
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button onclick="approveGalleryImage(${item.id})" style="flex: 1; background: #27ae60; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">✅ Approve</button>
                    <button onclick="rejectGalleryImage(${item.id})" style="flex: 1; background: #e74c3c; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s;">🗑️ Reject</button>
                </div>
            `;
        } else {
            actionFooter = `
                <div style="margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 8px; font-size: 0.85rem; color: #555; border: 1px solid #eee;">
                    <strong>Approved By:</strong> ${item.approved_by}<br>
                    <strong>Date:</strong> ${new Date(item.approved_at).toLocaleDateString()}
                </div>
                <button onclick="rejectGalleryImage(${item.id})" style="width: 100%; margin-top: 10px; background: transparent; color: #e74c3c; border: 1px solid #e74c3c; padding: 8px; border-radius: 8px; font-weight: bold; cursor: pointer;">🗑️ Remove from Gallery</button>
            `;
        }

        grid.innerHTML += `
            <div class="crm-card" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eee; display: flex; flex-direction: column;">
                <div style="position: relative;">
                    <img src="${item.image_url}" style="width: 100%; height: 250px; object-fit: cover; cursor: pointer; border-bottom: 1px solid #eee;" onclick="window.open('${item.image_url}', '_blank')">
                    <span style="position: absolute; top: 10px; right: 10px; background: var(--accent-color); color: #0f0f10; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">${item.category}</span>
                </div>
                <div style="padding: 15px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${dpImg}
                        <span style="font-weight: bold; color: var(--primary-color);">${artistName}</span>
                    </div>
                    ${actionFooter}
                </div>
            </div>
        `;
    });
}

async function approveGalleryImage(id) {
    const user = JSON.parse(localStorage.getItem('crmUser')) || { username: 'Admin' };
    try {
        // FIXED: Absolute URL
        const res = await fetch('https://api.momentoo.in/api/crm/gallery/approve', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, adminName: user.username })
        });
        const data = await res.json();
        if (data.success) loadCRMGallery();
    } catch(e) { alert('Network error while approving.'); }
}

async function rejectGalleryImage(id) {
    if(!confirm("Are you sure you want to permanently delete this image from the server?")) return;
    try {
        // FIXED: Absolute URL
        const res = await fetch('https://api.momentoo.in/api/crm/gallery/reject', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) loadCRMGallery();
    } catch(e) { alert('Network error while rejecting.'); }
}

// ==========================================
// CRM USER MANAGEMENT ENGINE
// ==========================================
let allCrmUsers = [];

async function loadCrmUsers() {
    const container = document.getElementById('tab-admin');
    if (!container) return;

    // Build the structural UI if it doesn't exist yet
    if (!document.getElementById('crm-users-grid')) {
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h2 style="font-size: 1.8rem; color: var(--primary-color);">User Management</h2>
                    <p style="opacity: 0.8; font-size: 0.9rem; margin:0;">Create staff accounts and manage system permissions.</p>
                </div>
                <button class="btn-primary" style="width: auto; padding: 10px 20px; background: #27ae60;" onclick="openUserModal()">+ Create User</button>
            </div>
            <div id="crm-users-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;"></div>
        `;
        
        // Inject the Create/Edit Modal into the body
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-manage-user" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
                <div class="modal-content auth-box" style="background:white; padding:30px; border-radius:15px; width:90%; max-width:500px; max-height: 90vh; overflow-y: auto; text-align: left;">
                    <h3 id="user-modal-title" style="color:var(--primary-color); margin-top:0;">Create Staff Account</h3>
                    
                    <input type="hidden" id="manage-user-id">
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <div>
                            <label style="font-size: 0.8rem; opacity: 0.8;">Username (Login ID)</label>
                            <input type="text" id="manage-user-username" class="crm-input" placeholder="e.g. staff_john" autocomplete="off">
                        </div>
                        <div>
                            <label style="font-size: 0.8rem; opacity: 0.8;">Full Name</label>
                            <input type="text" id="manage-user-fullname" class="crm-input" placeholder="John Doe">
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <div>
                            <label style="font-size: 0.8rem; opacity: 0.8;">Email</label>
                            <input type="email" id="manage-user-email" class="crm-input" placeholder="john@example.com">
                        </div>
                        <div>
                            <label style="font-size: 0.8rem; opacity: 0.8;">Gender</label>
                            <select id="manage-user-gender" class="crm-input" style="padding: 12px; height: auto;">
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="background: #fcf9f6; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 0.95rem; color: var(--primary-color);">Module Access Permissions</h4>
                        <label style="display: block; margin-bottom: 8px; cursor: pointer;"><input type="checkbox" id="perm-ver" checked> Artist Verification</label>
                        <label style="display: block; margin-bottom: 8px; cursor: pointer;"><input type="checkbox" id="perm-book" checked> Booking Pipeline</label>
                        <label style="display: block; margin-bottom: 8px; cursor: pointer;"><input type="checkbox" id="perm-feed" checked> Customer Feedback</label>
                        <label style="display: block; margin-bottom: 8px; cursor: pointer;"><input type="checkbox" id="perm-gal" checked> Gallery Moderation</label>
                    </div>

                    <p id="user-modal-notice" style="font-size: 0.8rem; color: #e74c3c; margin-bottom: 15px;">New accounts will be created with the default password: <strong>B00T.ME</strong></p>

                    <div style="display:flex; gap:10px;">
                        <button onclick="document.getElementById('modal-manage-user').style.display='none'" style="flex:1; padding:12px; border-radius:8px; background:#f0f0f0; border:none; cursor:pointer; font-weight:bold;">Cancel</button>
                        <button id="btn-save-user" onclick="saveCrmUser()" style="flex:2; padding:12px; border-radius:8px; background:var(--accent-color); color:#0f0f10; border:none; cursor:pointer; font-weight:bold;">Save User</button>
                    </div>
                </div>
            </div>
        `);
    }

    const grid = document.getElementById('crm-users-grid');
    grid.innerHTML = '<p style="opacity: 0.6; grid-column: 1/-1;">Loading users...</p>';

    try {
        const res = await fetch(`${API_BASE_URL}/users`);
        const data = await res.json();
        
        if (data.success) {
            allCrmUsers = data.data;
            grid.innerHTML = '';
            
            allCrmUsers.forEach(u => {
                const isAdmin = u.role === 'admin' || u.role === 'developer';
                const avatar = u.full_name ? u.full_name.substring(0, 2).toUpperCase() : u.username.substring(0, 2).toUpperCase();
                
                // Build visual tags for permissions
                let permsHtml = '';
                if (isAdmin) {
                    permsHtml = '<span style="background: #27ae60; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;">Full System Access</span>';
                } else {
                    if(u.p_verification) permsHtml += '<span style="background: #eef2f5; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; margin-right: 5px;">Verification</span>';
                    if(u.p_bookings) permsHtml += '<span style="background: #eef2f5; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; margin-right: 5px;">Bookings</span>';
                    if(u.p_feedback) permsHtml += '<span style="background: #eef2f5; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; margin-right: 5px;">Feedback</span>';
                    if(u.p_gallery) permsHtml += '<span style="background: #eef2f5; color: #333; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; margin-right: 5px;">Gallery</span>';
                }

                grid.innerHTML += `
                    <div class="crm-card" style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-left: 4px solid ${isAdmin ? '#e74c3c' : '#3498db'};">
                        <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 15px;">
                            <div style="width: 45px; height: 45px; border-radius: 50%; background: ${isAdmin ? '#fdf0f0' : '#ebf5fb'}; color: ${isAdmin ? '#e74c3c' : '#3498db'}; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">${avatar}</div>
                            <div>
                                <h3 style="margin: 0; color: var(--primary-color);">${u.full_name || u.username}</h3>
                                <p style="margin: 0; font-size: 0.8rem; opacity: 0.7; font-family: monospace;">@${u.username} | ${u.role.toUpperCase()}</p>
                            </div>
                        </div>
                        <div style="font-size: 0.85rem; line-height: 1.6; margin-bottom: 15px;">
                            <strong>Email:</strong> ${u.email || 'N/A'}<br>
                            <strong>Gender:</strong> ${u.gender || 'N/A'}<br>
                            <div style="margin-top: 10px;">${permsHtml}</div>
                        </div>
                        
                        ${!isAdmin ? `
                        <div style="display: flex; gap: 8px; border-top: 1px dashed #ddd; padding-top: 15px;">
                            <button onclick="openUserModal(${u.id})" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #3498db; background: transparent; color: #3498db; cursor: pointer; font-weight: bold;">Edit Access</button>
                            <button onclick="resetUserPass(${u.id})" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #f39c12; background: transparent; color: #f39c12; cursor: pointer; font-weight: bold;">Reset Pass</button>
                            <button onclick="deleteUser(${u.id})" style="padding: 8px 12px; border-radius: 6px; border: none; background: #e74c3c; color: white; cursor: pointer;">🗑️</button>
                        </div>
                        ` : '<p style="margin:0; text-align:center; opacity:0.5; font-size:0.8rem; border-top: 1px dashed #ddd; padding-top: 15px;">System Core Account</p>'}
                    </div>
                `;
            });
        }
    } catch (e) {
        grid.innerHTML = '<p style="color: red; grid-column: 1/-1;">Failed to fetch users.</p>';
    }
}

function openUserModal(id = null) {
    const title = document.getElementById('user-modal-title');
    const notice = document.getElementById('user-modal-notice');
    const usernameInput = document.getElementById('manage-user-username');
    
    if (id) {
        // Edit Mode
        const u = allCrmUsers.find(x => x.id === id);
        if(!u) return;
        
        title.innerText = "Edit Staff Account";
        notice.style.display = 'none';
        
        document.getElementById('manage-user-id').value = u.id;
        usernameInput.value = u.username;
        usernameInput.disabled = true; // Cannot change username after creation
        document.getElementById('manage-user-fullname').value = u.full_name || '';
        document.getElementById('manage-user-email').value = u.email || '';
        document.getElementById('manage-user-gender').value = u.gender || 'Other';
        
        document.getElementById('perm-ver').checked = u.p_verification;
        document.getElementById('perm-book').checked = u.p_bookings;
        document.getElementById('perm-feed').checked = u.p_feedback;
        document.getElementById('perm-gal').checked = u.p_gallery;
    } else {
        // Create Mode
        title.innerText = "Create Staff Account";
        notice.style.display = 'block';
        
        document.getElementById('manage-user-id').value = '';
        usernameInput.value = '';
        usernameInput.disabled = false;
        document.getElementById('manage-user-fullname').value = '';
        document.getElementById('manage-user-email').value = '';
        document.getElementById('manage-user-gender').value = 'Male';
        
        document.getElementById('perm-ver').checked = true;
        document.getElementById('perm-book').checked = true;
        document.getElementById('perm-feed').checked = true;
        document.getElementById('perm-gal').checked = true;
    }
    
    document.getElementById('modal-manage-user').style.display = 'flex';
}

async function saveCrmUser() {
    const id = document.getElementById('manage-user-id').value;
    const username = document.getElementById('manage-user-username').value.trim();
    const fullName = document.getElementById('manage-user-fullname').value.trim();
    const email = document.getElementById('manage-user-email').value.trim();
    const gender = document.getElementById('manage-user-gender').value;
    
    const p_ver = document.getElementById('perm-ver').checked;
    const p_book = document.getElementById('perm-book').checked;
    const p_feed = document.getElementById('perm-feed').checked;
    const p_gal = document.getElementById('perm-gal').checked;

    if (!username || !fullName) return alert("Username and Full Name are required.");

    const btn = document.getElementById('btn-save-user');
    btn.innerText = "Saving..."; btn.disabled = true;

    try {
        const endpoint = id ? `${API_BASE_URL}/users/update` : `${API_BASE_URL}/users/create`;
        const payload = { id, username, fullName, email, gender, p_ver, p_book, p_feed, p_gal };

        const res = await fetch(endpoint, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('modal-manage-user').style.display = 'none';
            loadCrmUsers(); // Refresh Grid
        } else alert("Error: " + data.error);
    } catch (e) {
        alert("Network error.");
    } finally {
        btn.innerText = "Save User"; btn.disabled = false;
    }
}

async function resetUserPass(id) {
    if(!confirm("Reset this user's password back to 'B00T.ME'? They will be forced to change it on their next login.")) return;
    try {
        const res = await fetch(`${API_BASE_URL}/users/reset-pass`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
        });
        const data = await res.json();
        if(data.success) alert("Password reset successfully.");
    } catch(e) { alert("Network error."); }
}

async function deleteUser(id) {
    if(!confirm("WARNING: Are you sure you want to permanently delete this staff account?")) return;
    try {
        const res = await fetch(`${API_BASE_URL}/users/delete/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.success) loadCrmUsers();
    } catch(e) { alert("Network error."); }
}
