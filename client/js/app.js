(() => {
  const AUTH_KEY = 'nexustraffic_auth';
  const API_BASE = window.NEXUS_API_BASE || 'https://traffic-site-1.onrender.com/api';

  const DASHBOARD_BY_ROLE = {
    user: 'pages/user/user_dashboard.html',
    relief_admin: 'pages/relief_center/relief_dashbaord.html',
    field_unit: 'pages/field_unit/field_desktop.html'
  };

  const NAV_BY_ROLE = {
    user: [
      { labels: ['home', 'dashboard'], path: 'pages/user/user_dashboard.html' },
      { labels: ['my reports', 'reports'], path: 'pages/user/user_reports.html' },
      { labels: ['alerts'], path: 'pages/user/user_alerts.html' },
      { labels: ['profile'], path: 'pages/user/user_profile.html' }
    ],
    relief_admin: [
      { labels: ['dashboard'], path: 'pages/relief_center/relief_dashbaord.html' },
      { labels: ['active incidents'], path: 'pages/relief_center/active_incident.html' },
      { labels: ['alerts'], path: 'pages/relief_center/alerts.html' },
      { labels: ['reports'], path: 'pages/relief_center/reports.html' },
      { labels: ['teams'], path: 'pages/relief_center/teams.html' }
    ],
    field_unit: [
      { labels: ['my mission'], path: 'pages/field_unit/field_desktop.html' },
      { labels: ['incidents'], path: 'pages/field_unit/field_incidents.html' },
      { labels: ['updates'], path: 'pages/field_unit/field_updates.html' },
      { labels: ['profile'], path: 'pages/field_unit/field_profile.html' }
    ]
  };

  function normalizeRole(role) {
    if (!role) return '';
    return String(role).trim().toLowerCase().replace(/-/g, '_');
  }

  function clientRootPath() {
    const normalizedPath = window.location.pathname.replace(/\\/g, '/');
    const index = normalizedPath.toLowerCase().lastIndexOf('/client/');
    return index >= 0 ? normalizedPath.slice(0, index + '/client/'.length) : '/';
  }

  function toClientUrl(relativePath) {
    const cleanPath = relativePath.replace(/^\/+/, '');
    const protocol = window.location.protocol;
    if (protocol === 'file:') {
      return `${clientRootPath()}${cleanPath}`;
    }
    return `${window.location.origin}/${cleanPath}`;
  }

  function getAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setAuth(auth) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  }

  let locationWatchId = null;

  function stopLocationTracking() {
    if (locationWatchId !== null) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
      console.log('Location tracking stopped.');
    }
  }

  function startLocationTracking() {
    if (locationWatchId !== null) return;
    const auth = getAuth();
    if (!auth?.user) return;

    const userRole = normalizeRole(auth.user.role);
    // Track both regular users and field units
    if (userRole !== 'user' && userRole !== 'field_unit') return;

    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return;
    }

    // Determine the correct tracking endpoint based on role
    // Regular users go to /users, Field Units go to /members (as requested)
    const trackingEndpoint = userRole === 'field_unit' 
      ? '/members/update-location' 
      : '/users/update-location';

    locationWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        try {
          // Send update to the role-specific endpoint
          await request(trackingEndpoint, {
            method: 'PATCH',
            body: JSON.stringify({ location })
          });
          
          // Update local state to keep profile accurate
          const currentAuth = getAuth();
          if (currentAuth?.user) {
            currentAuth.user.location = location;
            setAuth(currentAuth);
          }
          
          console.log(`[Tracking] ${userRole.toUpperCase()} location updated:`, location);
        } catch (err) {
          console.error('Failed to update tracking location:', err);
        }
      },
      (error) => {
        console.error('Location tracking error:', error);
        
        // If acquisition fails but we have a stored location, we keep the previous state
        // Requirement: Only alert if permission is explicitly denied
        if (error.code === error.PERMISSION_DENIED) {
          alert('Location tracking is required for field operations. Please enable location services to ensure your safety and mission coordination.');
          stopLocationTracking();
        }
      },
      { 
        enableHighAccuracy: userRole === 'field_unit', // Precise tracking for field units
        maximumAge: 10000, 
        timeout: 15000 
      }
    );
    console.log(`Live tracking initiated for ${userRole}. Endpoint: ${trackingEndpoint}`);
  }

  function clearAuth() {
    stopLocationTracking();
    localStorage.removeItem(AUTH_KEY);
  }

  function dashboardPathForRole(role) {
    return DASHBOARD_BY_ROLE[normalizeRole(role)] || 'index.html';
  }

  function redirectToDashboard(role) {
    window.location.href = toClientUrl(dashboardPathForRole(role));
  }

  function redirectToLogin() {
    clearAuth();
    window.location.href = toClientUrl('index.html');
  }

  async function request(path, options = {}) {
    const auth = getAuth();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

    if (auth?.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  async function login(email, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setAuth(data);
    return data;
  }

  async function register(payload) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        role: normalizeRole(payload.role)
      })
    });
    setAuth(data);
    return data;
  }

  async function me() {
    const data = await request('/auth/me');
    const auth = getAuth();
    if (auth?.token) {
      setAuth({ token: auth.token, user: data });
    }
    return data;
  }

  async function updateLocation(location) {
    const data = await request('/auth/update-location', {
      method: 'PATCH',
      body: JSON.stringify({ location })
    });
    // Update local storage user data
    const auth = getAuth();
    if (auth?.user) {
      auth.user.location = location;
      setAuth(auth);
    }
    return data;
  }

  async function promptAndSaveLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation not supported'));
      }

      const confirmed = confirm('Allow location access to set your relief center location? This is required for tactical coordination.');
      if (!confirmed) return reject(new Error('User denied location access'));

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            await updateLocation(location);
            alert('Location synchronized successfully.');
            resolve(location);
            // Refresh page to apply location-based stats
            window.location.reload();
          } catch (err) {
            alert('Failed to save location: ' + err.message);
            reject(err);
          }
        },
        (error) => {
          alert('Error acquiring location: ' + error.message);
          reject(error);
        },
        { enableHighAccuracy: true }
      );
    });
  }

  function wireNavbar(role) {
    const navItems = NAV_BY_ROLE[normalizeRole(role)];
    if (!navItems) return;

    const links = Array.from(document.querySelectorAll('a'));
    for (const link of links) {
      const text = link.textContent.trim().toLowerCase();
      const item = navItems.find((navItem) => navItem.labels.includes(text));
      if (item) {
        link.href = toClientUrl(item.path);
      }
    }

    const brandLinks = Array.from(document.querySelectorAll('.brand, .brand a, a.brand'));
    for (const brand of brandLinks) {
      if (brand.tagName === 'A') {
        brand.href = toClientUrl(dashboardPathForRole(role));
      } else {
        brand.style.cursor = 'pointer';
        brand.addEventListener('click', () => {
          window.location.href = toClientUrl(dashboardPathForRole(role));
        });
      }
    }

    const mobileButtons = Array.from(document.querySelectorAll('.mobile-nav .mob-btn'));
    for (const button of mobileButtons) {
      const text = button.textContent.trim().toLowerCase();
      const item = navItems.find((navItem) => navItem.labels.some((label) => text.includes(label)));
      if (item) {
        button.addEventListener('click', () => {
          window.location.href = toClientUrl(item.path);
        });
      }
    }

    const signOutElements = Array.from(document.querySelectorAll('button, a')).filter((element) => {
      const text = element.textContent.trim().toLowerCase();
      return text.includes('sign out') || text.includes('logout') || text.includes('log out');
    });

    for (const element of signOutElements) {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        redirectToLogin();
      });
    }
  }

  function requiredRoleForCurrentPage() {
    const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
    if (path.includes('/pages/user/')) return 'user';
    if (path.includes('/pages/relief_center/')) return 'relief_admin';
    if (path.includes('/pages/field_unit/')) return 'field_unit';
    return '';
  }

  function isAuthPage() {
    const path = window.location.pathname.replace(/\\/g, '/').toLowerCase();
    return path.endsWith('/index.html') || path.endsWith('/pages/register.html');
  }

  async function bootstrap() {
    const requiredRole = requiredRoleForCurrentPage();
    if (!requiredRole) {
      if (isAuthPage() && getAuth()?.token) {
        try {
          const user = await me();
          redirectToDashboard(user.role);
        } catch {
          clearAuth();
        }
      }
      return;
    }

    const auth = getAuth();
    if (!auth?.token) {
      redirectToLogin();
      return;
    }

    try {
      const user = await me();
      const userRole = normalizeRole(user.role);
      if (userRole !== requiredRole) {
        redirectToDashboard(userRole);
        return;
      }

      // Feature: Auto-capture location for relief_admin if missing
      if (userRole === 'relief_admin' && (!user.location || user.location.lat === null || user.location.lat === 0)) {
        // Delay slightly to allow page load
        setTimeout(() => {
          promptAndSaveLocation().catch(console.error);
        }, 1000);
      }

      // Feature: Real-time location tracking for users and field units
      if (userRole === 'user' || userRole === 'field_unit') {
        startLocationTracking();
      }

      wireNavbar(userRole);
      
      // Inject user profile name
      const nameEls = document.querySelectorAll('.nt-user-name');
      const firstName = user.firstName || (user.name ? user.name.split(' ')[0] : 'Admin');
      for (const el of nameEls) {
        el.textContent = firstName.toUpperCase();
      }

      // Inject initials into avatar and style it
      const avatarEls = document.querySelectorAll('.user-avatar');
      const initials = (user.firstName && user.lastName) 
          ? (user.firstName[0] + user.lastName[0]).toUpperCase()
          : (user.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'UT');
      
      if (avatarEls.length > 0) {
        if (!document.getElementById('nt-avatar-style')) {
          const style = document.createElement('style');
          style.id = 'nt-avatar-style';
          style.textContent = `
            .user-avatar { 
              display: flex !important; 
              align-items: center !important; 
              justify-content: center !important; 
              background: #F97316 !important; 
              color: #FFFFFF !important; 
              font-family: 'Outfit', sans-serif !important; 
              font-weight: 800 !important; 
              font-size: 11px !important; 
              text-transform: uppercase !important; 
              border: none !important; 
              user-select: none !important; 
              box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3) !important;
              overflow: hidden;
            }
            .user-avatar img { display: none !important; }

            /* Notification Tactical Center */
            .notif-container { position: relative; display: inline-flex; align-items: center; justify-content: center; height: 100%; cursor: pointer; }
            .notif-dropdown {
              position: absolute; top: 100%; right: 0; width: 320px;
              z-index: 9999;
              padding-top: 10px;
              text-align: left;
              visibility: hidden;
              opacity: 0;
              pointer-events: none;
              transform: translateY(10px);
              transition: all 0.2s ease-out;
            }
            .notif-container:hover .notif-dropdown {
              visibility: visible;
              opacity: 1;
              pointer-events: auto;
              transform: translateY(0);
            }
            .notif-content {
              background: #000000; border: 1px solid #1E1E24;
              border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
              overflow: hidden;
              backdrop-filter: blur(12px);
              box-shadow: 0 10px 40px rgba(0,0,0,0.9);
            }
            [data-theme="light"] .notif-content { background: #FFFFFF; border-color: #E2E2E6; }
            [data-theme="light"] .notif-header { background: #FFFFFF; border-bottom: 1px solid #F0F0F2; }
            
            .notif-header {
              padding: 14px 16px; border-bottom: 1px solid #1E1E24;
              font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
              text-transform: uppercase; letter-spacing: 0.08em; font-size: 14px;
              color: var(--text-primary);
              display: flex; align-items: center; justify-content: space-between;
              background: #1B1B1E;
            }
            .notif-list { max-height: 380px; overflow-y: auto; scrollbar-width: thin; }
            .notif-item {
              padding: 14px 16px; border-bottom: 1px solid var(--border-subtle);
              cursor: pointer; transition: background 0.2s;
              position: relative;
            }
            .notif-item:hover { background: var(--surface-2); }
            [data-theme="dark"] .notif-item:hover { background: rgba(255,255,255,0.03); }
            .notif-item:last-child { border-bottom: none; }
            .notif-item-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
            .notif-item-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.5; white-space: normal; }
            .notif-item-time { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); margin-top: 8px; text-transform: uppercase; }
            
            .notif-empty { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 12px; font-family: 'Outfit', sans-serif; }
            .notif-badge { width: 6px; height: 6px; background: #F97316; border-radius: 50%; box-shadow: 0 0 8px #F97316; }
            
            .notif-footer { padding: 12px; text-align: center; background: rgba(0,0,0,0.03); }
          `;
          document.head.appendChild(style);
        }
        for (const el of avatarEls) {
          el.innerHTML = initials;
          el.classList.add('nt-avatar-initials');
        }
      }

      // Flexible Notification Detection
      let notifBtn = null;
      const allIcons = document.querySelectorAll('.material-symbols-outlined');
      for (const icon of allIcons) {
        if (icon.textContent.trim() === 'notifications' || icon.innerText.trim() === 'notifications') {
          // Priority 1: A dedicated icon-btn
          // Priority 2: A button wrapper
          // Priority 3: The immediate parent (e.g. div.relative in relief dashboard)
          notifBtn = icon.closest('.icon-btn') || icon.closest('button') || icon.parentElement;
          break;
        }
      }

      if (notifBtn && !notifBtn.parentElement.classList.contains('notif-container')) {
        const container = document.createElement('div');
        container.className = 'notif-container';
        notifBtn.parentNode.insertBefore(container, notifBtn);
        container.appendChild(notifBtn);

        const dropdown = document.createElement('div');
        dropdown.className = 'notif-dropdown';
        dropdown.innerHTML = `
          <div class="notif-content">
            <div class="notif-header">Tactical Alerts</div>
            <div class="notif-list" id="global-notif-list">
              <div class="notif-empty">No new alerts or messages</div>
            </div>
            <div class="p-3 text-center">
              <button id="mark-notifs-done" class="barlow-800 text-[10px] uppercase tracking-wider cursor-pointer p-0" style="color: #F97316; display: flex; align-items: center; justify-content: center; width: 100%; gap: 6px; background: none !important; border: none !important; outline: none !important;">
                <span class="material-symbols-outlined" style="font-size: 16px;">done_all</span>
                Mark as Read
              </button>
            </div>
          </div>
        `;
        container.appendChild(dropdown);

        // Mark as done listener
        document.getElementById('mark-notifs-done')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Save current timestamp as "last read"
          localStorage.setItem('nexustraffic_notifs_read_at', Date.now().toString());
          
          // Instantly refresh UI
          loadGlobalNotifications();
          
          // Force hide dot immediately
          const dot = notifBtn.querySelector('.notif-dot') || notifBtn.querySelector('.absolute');
          if (dot) dot.style.display = 'none';
        });

        // Load content
        loadGlobalNotifications();
        
        // Listen for socket updates if available
        if (window.nexusSocket) {
          window.nexusSocket.on('incident:new', loadGlobalNotifications);
          window.nexusSocket.on('incident:updated', loadGlobalNotifications);
          window.nexusSocket.on('alert:personal', loadGlobalNotifications);
          window.nexusSocket.on('alert:broadcast', loadGlobalNotifications);
        }
      }
    } catch (err) {
      console.error('Bootstrap error:', err);
      redirectToLogin();
    }
  }

  async function loadGlobalNotifications() {
    const list = document.getElementById('global-notif-list');
    if (!list) return;

    const notifBtn = document.getElementById('relief-notif-btn') || document.querySelector('.icon-btn[title="Notifications"]');
    if (!notifBtn) return;

    try {
      const auth = getAuth();
      if (!auth?.token) return;

      // Personal alerts are in /alerts/my, global ones are also now included there
      const alerts = await request('/alerts/my');
      if (!alerts || alerts.length === 0) {
        list.innerHTML = '<div class="notif-empty">No new alerts or messages</div>';
        const dot = notifBtn.querySelector('.notif-dot') || notifBtn.querySelector('.absolute');
        if (dot) dot.style.display = 'none';
        return;
      }

      // Filter by persistent read timestamp
      const readAt = localStorage.getItem('nexustraffic_notifs_read_at');
      const filtered = readAt 
        ? alerts.filter(a => new Date(a.createdAt).getTime() > parseInt(readAt))
        : alerts;

      const dot = notifBtn.querySelector('.notif-dot') || notifBtn.querySelector('.absolute');

      if (filtered.length === 0) {
        list.innerHTML = '<div class="notif-empty">No new alerts or messages</div>';
        if (dot) dot.style.display = 'none';
        return;
      }

      if (dot) dot.style.display = 'flex';

      // Show last 5 new alerts
      const recent = filtered.slice(0, 5);
      list.innerHTML = recent.map(a => {
        const time = new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="notif-item">
            <div class="notif-item-title">
              <span class="notif-badge"></span>
              ${a.type ? a.type.toUpperCase() : 'SYSTEM ALERT'}
            </div>
            <div class="notif-item-desc">${a.message}</div>
            <div class="notif-item-time">${time} // SECTOR_${a.zone || 'GLOBAL'}</div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Failed to load global notifications:', err);
      list.innerHTML = '<div class="notif-empty">No new alerts or messages</div>';
    }
  }

  // Global WebSocket initialization
  function initSocket() {
    if (typeof io === 'undefined') return null;
    const auth = getAuth();
    if (!auth?.token) return null;

    if (window.nexusSocket) return window.nexusSocket;

    const socket = io({
      auth: { token: auth.token }
    });

    socket.on('connect', () => {
      console.log('Tactical link established: WebSocket connected.');
    });

    socket.on('disconnect', () => {
      console.log('Tactical link severed: WebSocket disconnected.');
    });

    window.nexusSocket = socket;
    return socket;
  }

  window.NexusAuth = {
    login,
    register,
    me,
    updateLocation,
    promptAndSaveLocation,
    startLocationTracking,
    stopLocationTracking,
    clearAuth,
    redirectToDashboard,
    normalizeRole,
    initSocket
  };

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
