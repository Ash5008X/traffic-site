/**
 * Self-invoking function to encapsulate the user alerts dashboard logic.
 */
(() => {
  // --- DOM Element Selection ---
  // Select main containers for dynamic alert lists
  const activeAlertsList = document.getElementById('active-alerts-list');
  const activeAlertsCount = document.getElementById('active-alerts-count');
  const pastAlertsList = document.getElementById('past-alerts-list');

  // Select individual statistic counters for incident types
  const statAccident = document.getElementById('stat-accident');
  const statCongestion = document.getElementById('stat-congestion');
  const statRoute = document.getElementById('stat-route');
  const statSystem = document.getElementById('stat-system');

  // Select components for the incident detail panel
  const detailEmpty = document.getElementById('alert-detail-empty');
  const detailPanel = document.getElementById('alert-detail-panel');
  const detailPriority = document.getElementById('alert-detail-priority');
  const detailRef = document.getElementById('alert-detail-ref');
  const detailTitle = document.getElementById('alert-detail-title');
  const detailCoords = document.getElementById('alert-detail-coords');
  const detailDesc = document.getElementById('alert-detail-desc');
  const detailTime = document.getElementById('alert-detail-time');
  const detailDist = document.getElementById('alert-detail-dist');
  const detailSeverity = document.getElementById('alert-detail-severity');
  const detailCloseBtn = document.getElementById('alert-detail-close-btn');

  // --- Filter Chip Interaction ---
  // Handle visual switching of active filter categories
  const chips = document.querySelectorAll('.filter-bar .chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      // Remove active class from all chips
      chips.forEach((c) => c.classList.remove('active'));
      // Add active class to the clicked chip
      chip.classList.add('active');
    });
  });

  // State variable to store the current user's location
  let USER_LOCATION = { lat: 0, lng: 0 };

  // --- Helper Functions ---

  /**
   * Calculates the distance between two geographical points using the Haversine formula.
   * @param {number} lat1 - Latitude of point 1.
   * @param {number} lon1 - Longitude of point 1.
   * @param {number} lat2 - Latitude of point 2.
   * @param {number} lon2 - Longitude of point 2.
   * @returns {number} Distance in kilometers.
   */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Retrieves the authentication token from local storage.
   * @returns {string|null} The token or null.
   */
  const getToken = () => {
    try { return JSON.parse(localStorage.getItem('nexustraffic_auth'))?.token; } catch { return null; }
  };

  /**
   * Retrieves the current user's ID from local storage.
   * @returns {string|null} The user ID or null.
   */
  const getUserId = () => {
    try { return JSON.parse(localStorage.getItem('nexustraffic_auth'))?.user?._id; } catch { return null; }
  };

  /**
   * Formats a date string into a localized time string with UTC suffix.
   * @param {string} dateStr - The ISO date string.
   * @returns {string} Formatted time.
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return '---';
    const d = new Date(dateStr);
    return `${d.toISOString().split('T')[1].substring(0, 8)} UTC`;
  };

  /**
   * Normalizes incident types into fixed categories for logic and styling.
   * @param {string} type - The raw incident type.
   * @returns {string} Normalized category.
   */
  const categorizeType = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('accident')) return 'accident';
    if (t.includes('congestion')) return 'congestion';
    if (t.includes('route')) return 'route';
    return 'system';
  };

  /**
   * Returns a hex color code based on the incident category.
   * @param {string} category - The normalized category.
   * @returns {string} Hex color code.
   */
  const getTypeColor = (category) => {
    switch(category) {
      case 'accident': return '#FF6B35';
      case 'congestion': return '#FFB830';
      case 'route': return '#3A86FF';
      case 'system': return '#BF5AF2';
      default: return '#BF5AF2';
    }
  };

  // State variable to store all alerts that are relevant (nearby or broadcast)
  let allNearbyAlerts = [];

  // --- Main Data Loading Logic ---

  /**
   * Orchestrates the fetching and filtering of all alert-related data.
   */
  const loadAlerts = async () => {
    try {
      // Parallel fetch of user profile, incidents, personal alerts, and active broadcasts
      const [profileRes, incidentRes, myAlertRes, activeAlertRes] = await Promise.all([
        fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch('/api/incidents', { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch('/api/alerts/my', { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch('/api/alerts/active', { headers: { 'Authorization': `Bearer ${getToken()}` } })
      ]);

      // Initialize user location from profile
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.location && profile.location.lat != null) {
          USER_LOCATION = { lat: profile.location.lat, lng: profile.location.lng };
        }
      }

      if (!incidentRes.ok) throw new Error('Failed to fetch incidents');
      const allIncidents = await incidentRes.json();
      const myAlerts = myAlertRes.ok ? await myAlertRes.json() : [];
      const activeBroadcasts = activeAlertRes.ok ? await activeAlertRes.json() : [];
      const myId = getUserId();

      // Hardcoded Command Center (Relief Admin) location for zone calculation
      const CENTER_LOC = { lat: 31.264905, lng: 75.700219 };

      /**
       * Calculates the bearing between two points to determine direction.
       */
      function getBearing(lat1, lon1, lat2, lon2) {
        const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }

      /**
       * Maps coordinates to a sector zone (A-F) based on radial bearing from center.
       */
      function getZone(lat, lng) {
        const bearing = getBearing(CENTER_LOC.lat, CENTER_LOC.lng, lat, lng);
        const idx = Math.floor(bearing / 60);
        return String.fromCharCode(65 + idx);
      }

      // Calculate current user's zone and define neighboring zones for situational awareness
      const userZone = getZone(USER_LOCATION.lat, USER_LOCATION.lng);
      const neighborsMap = {
        'A': ['F', 'B'],
        'B': ['A', 'C'],
        'C': ['B', 'D'],
        'D': ['C', 'E'],
        'E': ['D', 'F'],
        'F': ['E', 'A']
      };
      const neighborZones = neighborsMap[userZone] || [];

      // Filter incidents: Include if in neighboring zones OR within immediate 5km radius
      allNearbyAlerts = allIncidents.filter(inc => {
        // Don't alert the user about their own reports (these are handled in a separate view)
        if (inc.reportedBy === myId) return false;
        if (!inc.location || !inc.location.lat) return false;
        
        const incZone = inc.zone || getZone(inc.location.lat, inc.location.lng);
        const dist = haversine(USER_LOCATION.lat, USER_LOCATION.lng, inc.location.lat, inc.location.lng);
        
        const isSameZone = incZone === userZone;
        const isNeighbor = neighborZones.includes(incZone);
        const isImmediate = dist <= 5; // Immediate reports regardless of zone boundaries

        if (isSameZone || isNeighbor || isImmediate) {
          inc.distanceKm = dist;
          inc.zone = incZone;
          return true;
        }
        return false;
      });

      // Include user's own incidents to track relief center responses/status changes
      const myIncidents = allIncidents.filter(inc => String(inc.reportedBy) === String(myId));
      myIncidents.forEach(inc => {
        if (!allNearbyAlerts.find(x => String(x._id) === String(inc._id))) {
          allNearbyAlerts.push(inc);
        }
      });

      // Map Active Broadcasts (system-wide messages) into the unified alert structure
      activeBroadcasts.forEach(ab => {
         if (!ab.targetUser) {
           allNearbyAlerts.push({
              _id: ab._id,
              type: ab.type || 'SYSTEM BROADCAST',
              status: ab.active !== false ? 'pending' : 'resolved',
              description: ab.message,
              severity: ab.severity,
              createdAt: ab.createdAt,
              location: { address: `ZONE ${ab.zone || 'UNKNOWN'}` },
              isBroadcast: true
           });
         }
      });

      // Final sort: newest alerts at the top
      allNearbyAlerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Categorize into active vs past alerts based on status
      const activeAlerts = allNearbyAlerts.filter(r => ['pending', 'assigned', 'en_route'].includes(r.status));
      const pastAlerts = allNearbyAlerts.filter(r => ['resolved', 'dismissed'].includes(r.status));

      // Calculate Daily Statistics
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayAlerts = allNearbyAlerts.filter(r => new Date(r.createdAt) >= todayStart);
      
      let counts = { accident: 0, congestion: 0, route: 0, system: 0 };
      todayAlerts.forEach(a => counts[categorizeType(a.type)]++);

      // Update UI with calculated counts
      statAccident.textContent = counts.accident.toString().padStart(2, '0');
      statCongestion.textContent = counts.congestion.toString().padStart(2, '0');
      statRoute.textContent = counts.route.toString().padStart(2, '0');
      statSystem.textContent = counts.system.toString().padStart(2, '0');

      // Update active alerts badge
      activeAlertsCount.textContent = activeAlerts.length.toString();

      // Render the alert lists
      renderActiveAlerts(activeAlerts);
      renderPastAlerts(pastAlerts);

      // Render specific personal communications
      renderPersonalNotifications(myAlerts);
      
      // Update global notification bell state
      updateBellIcon(activeAlerts, myAlerts);

    } catch (err) {
      console.error(err);
      activeAlertsList.innerHTML = `<div style="color:var(--critical);">Failed to load alerts.</div>`;
    }
  };

  /**
   * Displays the detailed view of a selected alert in the right panel.
   * @param {Object} alert - The alert object to display.
   */
  const showDetail = (alert) => {
    // Hide empty state and show panel
    detailEmpty.style.display = 'none';
    detailPanel.style.display = 'block';

    const category = categorizeType(alert.type);
    // Construct priority label
    detailPriority.textContent = `${(alert.type || 'System').toUpperCase()}_${(alert.severity || 'Normal').toUpperCase()}`;
    detailPriority.className = `detail-priority-badge badge-${category}`;

    // Update textual details
    detailRef.textContent = `INCIDENT_LOG // ${alert.incidentId || 'SYS-000'}`;
    detailTitle.textContent = `${alert.type} — ${alert.location?.address || 'Unknown'}`;
    detailCoords.textContent = `${alert.location?.lat || 0}° N, ${alert.location?.lng || 0}° W`;
    detailDesc.textContent = alert.description || 'No additional details provided.';
    
    detailTime.textContent = formatDate(alert.createdAt);
    detailDist.textContent = alert.distanceKm ? `${alert.distanceKm.toFixed(1)} km away` : 'Nearby';
    detailSeverity.textContent = (alert.severity || 'Normal').charAt(0).toUpperCase() + (alert.severity || 'Normal').slice(1);
    detailSeverity.style.color = getTypeColor(category);
  };

  // Handle panel closure
  detailCloseBtn.addEventListener('click', () => {
    detailPanel.style.display = 'none';
    detailEmpty.style.display = 'flex';
  });

  /**
   * Renders active alerts as interactive cards in the grid.
   * @param {Array} alerts - List of active alert objects.
   */
  const renderActiveAlerts = (alerts) => {
    if (alerts.length === 0) {
      activeAlertsList.innerHTML = `<div style="opacity:0.5;grid-column:1/-1;">No active nearby alerts.</div>`;
      return;
    }

    // Map alerts to HTML card template
    const html = alerts.map(alert => {
      const cat = categorizeType(alert.type);
      const distStr = alert.distanceKm ? `${alert.distanceKm.toFixed(1)} km away` : 'Nearby';

      return `
        <div class="alert-card accent-${cat}" data-id="${alert._id}" style="cursor:pointer;">
          <span class="alert-type-badge badge-${cat}">${alert.type}</span>
          <div class="alert-card-title">${alert.type} — ${alert.location?.address || 'Unknown'}</div>
          <div class="alert-sector" style="color:${getTypeColor(cat)};">Priority ${alert.severity || 'Normal'} // System</div>
          <div class="alert-card-body">${alert.description || 'No description provided.'}</div>
          <div class="alert-card-footer">
            <span class="alert-dist">${distStr}</span>
            <span class="alert-time">${formatDate(alert.createdAt)}</span>
          </div>
        </div>
      `;
    }).join('');

    activeAlertsList.innerHTML = html;

    // Attach click listeners for detail viewing
    activeAlertsList.querySelectorAll('.alert-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const alert = allNearbyAlerts.find(x => x._id === id);
        if (alert) showDetail(alert);
      });
    });
  };

  /**
   * Renders past alerts as compact rows in the sidebar.
   * @param {Array} alerts - List of resolved/past alert objects.
   */
  const renderPastAlerts = (alerts) => {
    if (alerts.length === 0) {
      pastAlertsList.innerHTML = `<div style="opacity:0.5;">No past alerts earlier today.</div>`;
      return;
    }

    const html = alerts.map(alert => {
      const isDismissed = alert.status === 'dismissed';
      const label = isDismissed ? 'Dismissed' : 'Cleared_Success';
      const pill = isDismissed ? 'Dismissed' : 'Cleared';

      return `
        <div class="cleared-row" data-id="${alert._id}" style="cursor:pointer;">
          <div>
            <div class="cleared-title">${alert.type} — ${alert.location?.address || 'Unknown'} // ${pill}</div>
            <div class="cleared-meta">
              <span class="cleared-status" style="color:${isDismissed ? 'var(--text-muted)' : 'var(--success)'}">${label}</span>
              <span class="cleared-time">${formatDate(alert.createdAt)}</span>
            </div>
          </div>
          <span class="pill-cleared" style="border-color:${isDismissed ? 'var(--text-muted)' : 'var(--success)'}; color:${isDismissed ? 'var(--text-muted)' : 'var(--success)'};">${pill}</span>
        </div>
      `;
    }).join('');

    pastAlertsList.innerHTML = html;

    // Attach click listeners for detail viewing
    pastAlertsList.querySelectorAll('.cleared-row').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const alert = allNearbyAlerts.find(x => x._id === id);
        if (alert) showDetail(alert);
      });
    });
  };

  /**
   * Renders high-priority direct messages from relief centers.
   * @param {Array} alerts - List of personal alert objects.
   */
  const renderPersonalNotifications = (alerts) => {
    // Find or dynamically create a container for personal messages
    let container = document.getElementById('personal-notifications');
    if (!container) {
      container = document.createElement('div');
      container.id = 'personal-notifications';
      container.style.cssText = 'margin-top:1.5rem;';
      const alertsSection = activeAlertsList?.parentElement;
      if (alertsSection?.parentElement) {
        alertsSection.parentElement.insertBefore(container, alertsSection);
      }
    }

    if (!alerts || alerts.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Filter for specific relief center communications
    const relevantAlerts = alerts.filter(a => a.type === 'relief_center_message');
    if (relevantAlerts.length === 0) { container.innerHTML = ''; return; }

    const html = `
      <div style="margin-bottom:0.75rem;">
        <h3 style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:0.75rem;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.5rem;">MESSAGES FROM RELIEF CENTER</h3>
        ${relevantAlerts.map(a => `
          <div style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);border-left:3px solid #F97316;border-radius:6px;padding:0.75rem 1rem;margin-bottom:0.5rem;">
            <p style="font-family:'Outfit',sans-serif;font-size:0.875rem;color:var(--text-primary,#fff);margin:0 0 0.25rem;">${a.message}</p>
            <span style="font-family:'Fira Code',monospace;font-size:0.65rem;color:var(--text-muted);">${formatDate(a.createdAt)}</span>
          </div>
        `).join('')}
      </div>`;
    container.innerHTML = html;
  };

  /**
   * Updates the visual state of the navigation bar's notification bell.
   * @param {Array} activeAlerts - List of current active system alerts.
   * @param {Array} myAlerts - List of personal user alerts.
   */
  const updateBellIcon = (activeAlerts, myAlerts) => {
    const bellBtn = document.getElementById('navbar-bell-btn');
    const bellCount = document.getElementById('navbar-bell-count');
    const dropdown = document.getElementById('navbar-bell-dropdown');

    if (!bellBtn || !bellCount || !dropdown) return;

    // Aggregate broadcast alerts and unread personal messages
    const activeBroadcasts = activeAlerts.filter(a => a.isBroadcast);
    const personalAlerts = myAlerts.filter(a => a.active !== false);

    const allNotifs = [...activeBroadcasts, ...personalAlerts];
    allNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Update the notification badge count and visibility
    if (allNotifs.length > 0) {
      bellCount.style.display = 'flex';
      bellCount.textContent = allNotifs.length;
      bellCount.style.background = '#FF3B30';
      bellCount.style.color = '#fff';
      bellCount.style.width = '16px';
      bellCount.style.height = '16px';
      bellCount.style.fontSize = '9px';
      bellCount.style.borderRadius = '50%';
      bellCount.style.alignItems = 'center';
      bellCount.style.justifyContent = 'center';
      bellCount.style.position = 'absolute';
      bellCount.style.top = '-4px';
      bellCount.style.right = '-4px';
      bellCount.style.fontWeight = 'bold';
    } else {
      bellCount.style.display = 'none';
    }

    // Populate the dropdown menu content
    if (allNotifs.length === 0) {
      dropdown.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">No new notifications</div>`;
    } else {
      dropdown.innerHTML = allNotifs.map(notif => {
        const isPersonal = notif.targetUser;
        const color = isPersonal ? '#F97316' : '#FF3B30';
        const title = isPersonal ? 'Relief Center Message' : (notif.type || 'System Broadcast');
        const msg = notif.description || notif.message || '';
        return `
          <div style="padding:12px 16px; border-bottom:1px solid var(--border-color); cursor:pointer;" onmouseover="this.style.background='var(--surface-3)'" onmouseout="this.style.background='transparent'">
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;color:${color};margin-bottom:4px;text-transform:uppercase;">
              ${title}
            </div>
            <div style="font-family:'Outfit',sans-serif;font-size:12px;color:var(--text-primary);margin-bottom:6px;line-height:1.4;">
              ${msg}
            </div>
            <div style="font-family:'Fira Code',monospace;font-size:9px;color:var(--text-muted);">
              ${formatDate(notif.createdAt)}
            </div>
          </div>
        `;
      }).join('');
    }

    // Dropdown toggle logic
    bellBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    };

    // Close dropdown when clicking anywhere else on the document
    document.addEventListener('click', (e) => {
      if (!bellBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  };

  // Initialize the alerts dashboard
  loadAlerts();
})();

