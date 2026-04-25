/**
 * Self-invoking function to encapsulate the field unit dashboard logic.
 */
(() => {
  // Global configuration and state management
  const authKey = 'nexustraffic_auth';
  let currentUser = null;
  let activeIncidentId = null;

  /**
   * Fetches the core dashboard state from the backend API.
   * This includes mission data, daily stats, heatmap info, and nearby incidents.
   */
  async function fetchDashboardData() {
    try {
      // Validate authentication state
      const authData = JSON.parse(localStorage.getItem(authKey) || 'null');
      if (!authData || !authData.token) {
        // Redirect to login if unauthenticated
        window.location.href = '../../index.html';
        return;
      }
      const token = authData.token;

      // Primary tactical data fetch
      const res = await fetch('/api/field-units/dashboard/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      // Dispatch UI updates based on fetched data
      updateMissionUI(data.currentMission);
      updateStatsUI(data.statsToday);
      updateHeatmapUI(data.heatmap);
      updateMapMarkers(data.nearbyIncidents);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  }

  /**
   * Updates the mission-specific UI components (briefing card and mission control).
   * @param {Object} mission - The currently assigned incident mission object.
   */
  function updateMissionUI(mission) {
    const card = document.getElementById('active-mission-card');
    const empty = document.getElementById('no-mission-card');
    const brief = document.getElementById('briefing-card');
    const briefEmpty = document.getElementById('briefing-empty');

    // Handle case where no mission is assigned to the field unit
    if (!mission) {
      card.classList.add('hidden');
      empty.classList.remove('hidden');
      brief.classList.add('hidden');
      briefEmpty.classList.remove('hidden');
      activeIncidentId = null;
      return;
    }

    // Set active mission state
    activeIncidentId = mission._id;
    card.classList.remove('hidden');
    empty.classList.add('hidden');
    brief.classList.remove('hidden');
    briefEmpty.classList.add('hidden');

    // Update Left Column: Active Mission Card
    document.getElementById('mission-title').textContent = mission.title;
    document.getElementById('mission-id').textContent = mission._id.slice(-8).toUpperCase();
    document.getElementById('mission-severity').textContent = mission.severity.toUpperCase();
    document.getElementById('mission-severity').className = `critical-badge severity-${mission.severity}`;
    
    // Determine which location to use for the mission coordinates
    const loc = (mission.reporter && mission.reporter.location) ? mission.reporter.location : mission.location;
    if (loc) {
      document.getElementById('mission-coords').innerHTML = `${loc.lat.toFixed(3)} N<br/>${loc.lng.toFixed(3)} W`;
      document.getElementById('brief-coords').textContent = `${loc.lat.toFixed(4)} N, ${loc.lng.toFixed(4)} W`;
    }

    // Initialize or reset the elapsed time counter
    if (window.missionTimer) clearInterval(window.missionTimer);
    const start = new Date(mission.createdAt);
    const updateTimer = () => {
        const diff = Math.floor((new Date() - start) / 1000);
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        document.getElementById('mission-elapsed').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    updateTimer();
    window.missionTimer = setInterval(updateTimer, 1000);

    // Update Center Column: Incident Briefing
    document.getElementById('brief-id').textContent = `Incident_ID // ${mission._id.slice(-8).toUpperCase()}`;
    document.getElementById('brief-title').textContent = `${mission.title} // ${mission.type || 'STREET_LEVEL'}`;
    document.getElementById('brief-severity').textContent = mission.severity.toUpperCase();
    document.getElementById('brief-severity').className = `critical-badge severity-${mission.severity}`;
    document.getElementById('brief-desc').textContent = mission.description || 'No description provided.';
    
    // Format and display the reporting timestamp
    if (mission.createdAt) {
        const date = new Date(mission.createdAt);
        document.getElementById('brief-time').textContent = date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }
  }

  /**
   * Updates the performance statistics in the side panel.
   * @param {Object} stats - The statistics object for the current day.
   */
  function updateStatsUI(stats) {
    document.getElementById('stat-assigned').textContent = String(stats.assigned || 0).padStart(2, '0');
    document.getElementById('stat-completed').textContent = String(stats.completed).padStart(2, '0');
    document.getElementById('stat-response').innerHTML = `${stats.avgResponseTime}<small> M</small>`;
    document.getElementById('stat-distance').innerHTML = `${stats.distance.toFixed(1)}<small> KM</small>`;
  }

  /**
   * Updates the sector-based activity heatmap on the right sidebar.
   * @param {Object} heatmap - Incident distribution data across sectors.
   */
  function updateHeatmapUI(heatmap) {
    if (!heatmap || !heatmap.zoneBreakdown) return;
    const zones = ['A', 'B', 'C', 'D', 'E', 'F'];
    // System color palette for zone identification
    const ZONE_COLORS_MAP = ['#FF3B30', '#FFB830', '#F97316', '#3A86FF', '#34C759', '#AF52DE'];

    zones.forEach((zone, idx) => {
      const count = heatmap.zoneBreakdown[zone] ?? 0;
      const countEl = document.getElementById(`zone-${zone}`);
      const cell = countEl ? countEl.closest('.zone-cell') : null;
      if (!cell) return;

      const labelEl = cell.querySelector('.barlow-800');
      const color = ZONE_COLORS_MAP[idx];

      // Dynamic styling based on incident density in the zone
      if (countEl) {
        countEl.textContent = String(count).padStart(2, '0');
        countEl.style.color = count > 0 ? color : 'var(--nt-bright)';
        countEl.style.opacity = count > 0 ? '1' : '0.3';
      }

      // Visual emphasis on active zones
      cell.style.backgroundColor = color + '15';
      cell.style.borderColor = color + '40';
      if (labelEl) labelEl.style.color = color;
    });

    // Initialize the tactical map centered on the unit's operating region
    if (heatmap.centerLat && heatmap.centerLng) {
      initMap(heatmap.centerLat, heatmap.centerLng);
    }
  }

  // --- Tactical Mapping Logic (Leaflet Integration) ---

  let mapInitialized = false;
  /**
   * Initializes the interactive Leaflet map within the dashboard.
   */
  function initMap(centerLat, centerLng) {
    if (mapInitialized) return;
    mapInitialized = true;

    const mapDiv = document.querySelector('.mini-map');
    if (!mapDiv) return;
    // Inject the map container
    mapDiv.innerHTML = '<div id="leaflet-map" style="width:100%;height:100%;border-radius:inherit;z-index:0;"></div>';

    // Dynamically load Leaflet CSS if not already present
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Loader helper for Leaflet JS library
    const loadLeaflet = () => new Promise(resolve => {
      if (window.L) return resolve();
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });

    loadLeaflet().then(() => {
      const L = window.L;
      // Configure map instance
      const map = L.map('leaflet-map', {
        center: [centerLat, centerLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true
      });

      // Add CartoDB Dark Matter tile layer for the command center aesthetic
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

      // Render 15km operational radius boundary
      L.circle([centerLat, centerLng], {
        radius: 15000,
        color: '#F97316', weight: 2,
        fill: true, fillColor: '#F97316', fillOpacity: 0.07
      }).addTo(map);

      // Unit position marker (staging point)
      L.circleMarker([centerLat, centerLng], {
        radius: 6, color: '#F97316', fillColor: '#F97316', fillOpacity: 1
      }).addTo(map);

      // Render sector boundary lines and labels
      const ZONE_COLORS_MAP = ['#FF3B30','#FFB830','#F97316','#3A86FF','#34C759','#AF52DE'];
      const ZONE_LABELS = ['A','B','C','D','E','F'];
      const RADIUS_M = 15000;
      const LAT_DEG = RADIUS_M / 111320;
      const LNG_DEG = RADIUS_M / (111320 * Math.cos(centerLat * Math.PI / 180));

      for (let i = 0; i < 6; i++) {
        const bearing = i * 60;
        const endLat = centerLat + LAT_DEG * Math.cos(bearing * Math.PI / 180);
        const endLng = centerLng + LNG_DEG * Math.sin(bearing * Math.PI / 180);

        // Draw radial sector lines
        L.polyline([[centerLat, centerLng], [endLat, endLng]], {
          color: ZONE_COLORS_MAP[i], weight: 1, opacity: 0.5, dashArray: '4 4'
        }).addTo(map);

        // Place zone labels in the center of each sector
        const midBearing = bearing + 30;
        const midLat = centerLat + LAT_DEG * 0.55 * Math.cos(midBearing * Math.PI / 180);
        const midLng = centerLng + LNG_DEG * 0.55 * Math.sin(midBearing * Math.PI / 180);

        L.marker([midLat, midLng], {
          icon: L.divIcon({
            html: `<span style="font-family:'Outfit',sans-serif;font-weight:800;color:${ZONE_COLORS_MAP[i]};font-size:11px;text-shadow:0 0 4px #000">ZONE ${ZONE_LABELS[i]}</span>`,
            className: '', iconAnchor: [20, 10]
          })
        }).addTo(map);
      }
      window.leafletMap = map;
      // Force an initial marker render
      updateMapMarkers(lastIncidents);
    });
  }

  let incidentMarkers = [];
  let lastIncidents = [];
  /**
   * Plots incidents on the map as color-coded severity markers.
   * @param {Array} incidents - List of incident objects within operational range.
   */
  function updateMapMarkers(incidents) {
    lastIncidents = incidents || [];
    if (!window.leafletMap || !window.L) return;
    const L = window.L;
    const map = window.leafletMap;

    // Flush existing tactical markers
    incidentMarkers.forEach(m => map.removeLayer(m));
    incidentMarkers = [];

    // Severity based color mapping
    const sevColors = { critical: '#FF3B30', high: '#FF6B35', medium: '#FFB830', low: '#34C759' };

    lastIncidents.forEach(inc => {
      // Validate coordinates and active status
      if (!inc.location?.lat || !inc.location?.lng) return;
      if (inc.status === 'resolved' || inc.status === 'dismissed') return;

      const color = sevColors[inc.severity] || '#888';
      
      // Plot incident marker
      const marker = L.circleMarker([inc.location.lat, inc.location.lng], {
        radius: 6,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2
      }).addTo(map);

      // Add tactical tooltip
      marker.bindTooltip(`${inc.type?.toUpperCase()} [${inc.severity?.toUpperCase()}]`, {
        direction: 'top',
        className: 'nt-map-tooltip'
      });

      incidentMarkers.push(marker);
    });
  }

  // --- Operational Actions ---

  /**
   * Reports the unit's arrival at the incident location to dispatch.
   */
  async function handleArrived() {
    if (!activeIncidentId) return;
    try {
      const authData = JSON.parse(localStorage.getItem(authKey) || 'null');
      const res = await fetch(`/api/field-units/me/arrived`, {
        method: 'PATCH',
        headers: { 
            'Authorization': `Bearer ${authData.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ incidentId: activeIncidentId })
      });
      if (res.ok) {
        alert('Arrival reported to dispatch.');
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Arrival error:', err);
    }
  }

  /**
   * Triggers a high-priority request for additional units/backup at the current location.
   */
  async function handleBackup() {
    if (!activeIncidentId) return;
    try {
      const authData = JSON.parse(localStorage.getItem(authKey) || 'null');
      const res = await fetch(`/api/incidents/${activeIncidentId}/backup-request`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${authData.token}`,
            'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        alert('Backup request sent to relief center.');
      }
    } catch (err) {
      console.error('Backup error:', err);
    }
  }

  /**
   * Finalizes the mission by marking the incident as resolved in the system.
   */
  async function handleResolve() {
    if (!activeIncidentId) return;
    if (!confirm('Are you sure you want to mark this incident as resolved?')) return;

    try {
      const authData = JSON.parse(localStorage.getItem(authKey) || 'null');
      const res = await fetch(`/api/incidents/${activeIncidentId}/status`, {
        method: 'PATCH',
        headers: { 
            'Authorization': `Bearer ${authData.token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'resolved' })
      });
      if (res.ok) {
        alert('Incident resolved successfully.');
        // Refresh dashboard to show new state (likely empty mission)
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Resolve error:', err);
    }
  }

  // --- WebSocket Synchronization ---

  /**
   * Initializes real-time situational awareness via WebSockets.
   */
  function initSocket() {
    const socket = (window.NexusAuth && typeof window.NexusAuth.initSocket === 'function')
      ? window.NexusAuth.initSocket()
      : null;

    if (socket) {
      // Synchronize dashboard on any significant tactical changes
      socket.on('incident:new', () => {
        console.log('Tactical Update: New incidents available.');
        fetchDashboardData();
      });

      socket.on('incident:updated', (data) => {
        console.log('Tactical Update: Incident state changed.', data);
        fetchDashboardData();
      });

      socket.on('unit:statusChanged', (data) => {
        console.log('Tactical Update: Unit status changed.', data);
        fetchDashboardData();
      });
    }
  }

  // --- Initialization and Event Binding ---

  // Bind operational control buttons
  document.getElementById('btn-arrived')?.addEventListener('click', handleArrived);
  document.getElementById('btn-backup')?.addEventListener('click', handleBackup);
  document.getElementById('btn-resolve')?.addEventListener('click', handleResolve);

  // Perform initial data loading
  fetchDashboardData();
  // Setup real-time listeners
  initSocket();
  
  // Polling fallback to ensure dashboard remains current even if socket fails
  setInterval(fetchDashboardData, 60000);

})();

