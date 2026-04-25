/**
 * active_incident.js
 * 
 * FIELD OPERATIONS REGISTRY
 * This module specializes in the granular tracking and management of active deployments.
 * It provides a focused view of incident-to-unit assignments, response timing, 
 * and real-time tactical status across the relief center's jurisdiction.
 * 
 * CORE FUNCTIONALITIES:
 * - Proactive Monitoring: High-visibility queue of ongoing incidents.
 * - Deployment Status: Live tracking of field units (Available, En Route, On Site).
 * - Performance Analytics: Real-time calculation of response ETAs and resolution rates.
 * - Geospatial Context: Dedicated tactical map with zone-specific operational overlays.
 */
(() => {
  // --- Network Infrastructure ---
  const API_BASE = window.NEXUS_API_BASE || 'http://localhost:5000/api';
  const AUTH_KEY = 'nexustraffic_auth';

  /**
   * --- Authentication Interface ---
   * Safely retrieves the current session bearer token.
   */
  function getToken() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY))?.token; } catch { return null; }
  }

  /**
   * Standardized API dispatcher with integrated authorization headers.
   */
  async function apiFetch(path, opts = {}) {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {})
      }
    });
    if (!res.ok) throw new Error(`API ${path} failed (${res.status})`);
    return res.json();
  }

  /**
   * --- Synchronization Clock ---
   * Synchronizes UTC mission time across the operational interface.
   */
  function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const tick = () => {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} UTC`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /**
   * Formats ISO timestamps into mission-standard 24h format.
   */
  function formatTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  /**
   * Maps internal severity keys to standardized design system hex codes.
   */
  function severityColor(sev) {
    return { critical: '#FF3B30', high: '#FF6B35', medium: '#FFB830', low: '#34C759' }[sev] || '#888';
  }

  /**
   * Calculates the elapsed time since incident inception for priority tracking.
   */
  function formatETA(createdAt) {
    const start = new Date(createdAt);
    const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const m = Math.floor(diff / 60);
    return `${m} MIN`;
  }

  /**
   * --- Geospatial Situational Awareness ---
   * Orchestrates the Leaflet.js tactical map with jurisdiction-wide incident overlays.
   */
  let mapInitialized = false;
  function initMap(centerLat, centerLng) {
    if (mapInitialized) return;
    mapInitialized = true;

    const mapDiv = document.getElementById('leaflet-map-container');
    if (!mapDiv) return;

    // Async dependency management for Leaflet infrastructure
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const loadLeaflet = () => new Promise(resolve => {
      if (window.L) return resolve();
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });

    loadLeaflet().then(() => {
      const L = window.L;
      // Initialize map instance with tactical zoom/scroll capabilities
      const map = L.map('leaflet-map', {
        center: [centerLat, centerLng],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: true
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

      // --- Operational Jurisdiction Overlay (50km) ---
      L.circle([centerLat, centerLng], {
        radius: 50000,
        color: '#F97316', weight: 2,
        fill: true, fillColor: '#F97316', fillOpacity: 0.07
      }).addTo(map);

      // Node Identity Marker
      L.circleMarker([centerLat, centerLng], {
        radius: 6, color: '#F97316', fillColor: '#F97316', fillOpacity: 1
      }).addTo(map);

      // --- Radial Sector Overlay (Zones A-F) ---
      const ZONE_COLORS_MAP = ['#FF3B30','#FFB830','#F97316','#3A86FF','#34C759','#AF52DE'];
      const ZONE_LABELS = ['A','B','C','D','E','F'];
      const LAT_DEG = 50 / 111.32;
      const LNG_DEG = 50 / (111.32 * Math.cos(centerLat * Math.PI / 180));

      for (let i = 0; i < 6; i++) {
        const bearing = i * 60;
        const endLat = centerLat + LAT_DEG * Math.cos(bearing * Math.PI / 180);
        const endLng = centerLng + LNG_DEG * Math.sin(bearing * Math.PI / 180);

        // Tactical sector boundary lines
        L.polyline([[centerLat, centerLng], [endLat, endLng]], {
          color: ZONE_COLORS_MAP[i], weight: 1, opacity: 0.5, dashArray: '4 4'
        }).addTo(map);

        // Visual zone identity labels
        const midBearing = bearing + 30;
        const midLat = centerLat + LAT_DEG * 0.55 * Math.cos(midBearing * Math.PI / 180);
        const midLng = centerLng + LNG_DEG * 0.55 * Math.sin(midBearing * Math.PI / 180);

        L.marker([midLat, midLng], {
          icon: L.divIcon({
            html: `<span style="font-family:'Barlow Condensed',sans-serif;font-weight:800;color:${ZONE_COLORS_MAP[i]};font-size:11px;text-shadow:0 0 4px #000">ZONE ${ZONE_LABELS[i]}</span>`,
            className: '', iconAnchor: [20, 10]
          })
        }).addTo(map);
      }

      window.leafletMap = map;
      updateMapMarkers();
    });
  }

  /**
   * --- Application State Registry ---
   */
  let allActiveIncidents = [];
  let incidentMarkers = [];

  /**
   * --- Primary Registry Interface ---
   * Populates the left-column registry with high-visibility deployment cards.
   */
  function renderActiveIncidents() {
    const container = document.getElementById('active-incidents-container');
    if (!container) return;
    container.innerHTML = '';

    if (!allActiveIncidents || allActiveIncidents.length === 0) {
      container.innerHTML = `<div class="text-center py-12" style="color:var(--nt-dim)"><p class="outfit text-xs">No active incidents</p></div>`;
      return;
    }

    // Map active mission data to tactical cards
    allActiveIncidents.forEach(inc => {
      const color = severityColor(inc.severity);
      const sev = (inc.severity || 'low').toUpperCase();
      
      const card = document.createElement('div');
      card.className = `nt-card hoverable border-l-4 p-4 shadow-sm mb-4`;
      card.style.borderLeftColor = color;
      
      card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
          <span class="font-technical text-[10px] tracking-widest" style="color: var(--nt-dim)">INCIDENT_ID // ${inc.incidentId || inc._id.slice(-6).toUpperCase()}</span>
          <span class="w-2 h-2 rounded-full ${inc.severity === 'critical' ? 'pulse' : ''}" style="background-color: ${color}"></span>
        </div>
        <h3 class="font-body font-semibold text-sm mb-2 uppercase" style="color: var(--nt-bright)">${inc.type || 'Incident'}: Zone ${inc.zone || '?'}</h3>
        <div class="flex gap-4">
          <span class="font-technical text-[9px]" style="color: var(--nt-dim)">LVL: ${sev}</span>
          <span class="font-technical text-[9px]" style="color: var(--nt-dim)">ETA: ${formatETA(inc.createdAt)}</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  /**
   * Synchronizes geographical markers with the active incident registry.
   */
  function updateMapMarkers() {
    if (!window.leafletMap || !window.L) return;
    const L = window.L;
    const map = window.leafletMap;

    // Reset legacy markers
    incidentMarkers.forEach(m => map.removeLayer(m));
    incidentMarkers = [];

    allActiveIncidents.forEach(inc => {
      if (!inc.location?.lat || !inc.location?.lng) return;
      if (inc.status === 'resolved' || inc.status === 'dismissed') return;

      const color = severityColor(inc.severity);
      
      const marker = L.circleMarker([inc.location.lat, inc.location.lng], {
        radius: 6,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2
      }).addTo(map);

      // Detailed tooltips for rapid situation assessment
      marker.bindTooltip(`${inc.type?.toUpperCase()} [${inc.severity?.toUpperCase()}]`, {
        direction: 'top',
        className: 'nt-map-tooltip'
      });

      incidentMarkers.push(marker);
    });
  }

  /**
   * --- Personnel & Unit Tracking ---
   * Visualizes the live readiness of tactical response units.
   * @param {Array} units - Collection of field unit state objects.
   */
  function renderUnits(units) {
    const container = document.getElementById('unit-status-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (!units || units.length === 0) {
      container.innerHTML = `<div class="col-span-2 text-center text-[10px]" style="color:var(--nt-dim)">No units found</div>`;
      return;
    }

    units.forEach(unit => {
      const isAvailable = unit.status === 'available';
      const isEnRoute = unit.status === 'en_route';
      const isOnSite = unit.status === 'on_site';
      
      let badgeHtml = '';
      // Status-dependent visual identity
      if (isAvailable) {
        badgeHtml = `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style="background-color: var(--nt-card2); color: var(--nt-dim)">AVAILABLE</span>`;
      } else if (isEnRoute) {
        badgeHtml = `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style="background-color: rgba(249,115,22,0.15); color: #F97316; border: 1px solid rgba(249,115,22,0.35)">EN ROUTE</span>`;
      } else if (isOnSite) {
        badgeHtml = `<span class="text-[8px] bg-[#34C759]/20 text-[#34C759] font-bold px-1.5 py-0.5 rounded-full">ON SITE</span>`;
      } else {
        badgeHtml = `<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style="color: var(--nt-dim)">${(unit.status || 'unknown').toUpperCase()}</span>`;
      }

      const card = document.createElement('div');
      card.className = `nt-unit-card p-3 border border-[#1F3448]/20`;
      card.innerHTML = `
        <div class="flex justify-between items-center mb-2">
          <span class="font-technical text-[10px] text-[#F97316]">${unit.unitId}</span>
          ${badgeHtml}
        </div>
        <p class="font-body text-[10px]" style="color: var(--nt-dim)">Loc: ${unit.location?.lat?.toFixed(4) || '—'}, ${unit.location?.lng?.toFixed(4) || '—'}</p>
      `;
      container.appendChild(card);
    });
  }

  /**
   * --- High-Priority Tactical Registry ---
   * Isolates and emphasizes mission-critical incidents for rapid intervention.
   */
  function renderCriticalAlerts(incidents) {
    const container = document.getElementById('critical-alerts-container');
    if (!container) return;
    container.innerHTML = '';
    
    const criticalIncidents = incidents.filter(i => i.severity === 'critical');
    
    if (criticalIncidents.length === 0) {
      container.innerHTML = `<div class="text-[10px] p-3 border border-[#1F3448]/20" style="color:var(--nt-dim)">No critical alerts</div>`;
      return;
    }

    criticalIncidents.forEach(inc => {
      const card = document.createElement('div');
      card.className = `nt-card hoverable border-l-2 border-[#FF3B30] p-3`;
      card.innerHTML = `
        <p class="font-body text-xs font-semibold uppercase" style="color: var(--nt-bright)">${inc.type || 'Incident'} - Zone ${inc.zone || '?'}</p>
        <p class="font-technical text-[9px] mt-1" style="color: var(--nt-dim)">TIME: ${formatTime(inc.createdAt)} // LOC: ${inc.location?.lat?.toFixed(4)}, ${inc.location?.lng?.toFixed(4)}</p>
      `;
      container.appendChild(card);
    });
  }

  /**
   * --- Operational History Interface ---
   * Renders the chronological immutable activity log for deployment transparency.
   */
  function renderDispatchLog(incidents) {
    const container = document.getElementById('dispatch-log-container');
    if (!container) return;
    container.innerHTML = '';

    // Aggregate granular actions from the entire jurisdictional registry
    let allActions = [];
    if (incidents && incidents.length > 0) {
      incidents.forEach(inc => {
        if (inc.actions && inc.actions.length > 0) {
          inc.actions.forEach(act => {
            allActions.push({
              ...act,
              incidentId: inc.incidentId || inc._id.slice(-6).toUpperCase()
            });
          });
        }
      });
    }

    // Chronological normalization (Newest First)
    allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (allActions.length === 0) {
      container.innerHTML = `<tr><td colspan="4" class="p-4 text-center" style="color:var(--nt-dim)">No dispatch logs found</td></tr>`;
      return;
    }

    // Limit log view for performance (Top 20 high-fidelity events)
    allActions.slice(0, 20).forEach(act => {
      const tr = document.createElement('tr');
      const timeStr = act.timestamp ? formatTime(act.timestamp) : '—';
      const actionType = (act.type || 'SYSTEM_UPDATE').toUpperCase();
      const unitStr = act.unitId || act.performedBy || 'SYSTEM';
      
      let statusHtml = `<span class="text-[#34C759]">COMPLETE</span>`;
      if (actionType.includes('REQUEST') || actionType.includes('ASSIGN')) {
         statusHtml = `<span class="text-[#F97316]">PENDING</span>`;
      }

      tr.innerHTML = `
        <td class="p-2" style="color: var(--nt-dim)">${timeStr}</td>
        <td class="p-2" style="color: var(--nt-text)">${actionType}</td>
        <td class="p-2 text-[#F97316]">${unitStr}</td>
        <td class="p-2">${statusHtml}</td>
      `;
      container.appendChild(tr);
    });
  }

  /**
   * --- Operations Sync Orchestrator ---
   * Primary entry point for total module data synchronization.
   */
  async function loadData() {
    try {
      // Synchronize jurisdictional statistics and unit telemetry
      const stats = await apiFetch('/incidents/dashboard-stats');
      allActiveIncidents = stats.activeIncidents || [];
      
      // Update primary UI registries
      renderActiveIncidents();
      
      // Update geographical visualizations
      if (stats.centerLat && stats.centerLng) {
        initMap(stats.centerLat, stats.centerLng);
        updateMapMarkers();
      }
      
      // Update personnel status boards
      renderUnits(stats.fieldUnits || []);
      
      // Update intelligence modules
      renderCriticalAlerts(allActiveIncidents);
      renderDispatchLog(allActiveIncidents);
      
      // --- Performance Analytics Refresh ---
      const totalUnits = (stats.fieldUnits || []).length;
      const deployedUnits = (stats.fieldUnits || []).filter(u => ['en_route', 'on_site'].includes(u.status)).length;
      
      const elUnits = document.getElementById('metric-units');
      if (elUnits) elUnits.innerHTML = `${deployedUnits}<span class="text-xs font-normal ml-1" style="color: var(--nt-dim)">/${totalUnits}</span>`;
      
      const elEta = document.getElementById('metric-eta');
      if (elEta) {
        if (stats.avgResponseMinutes != null) {
          const m = stats.avgResponseMinutes;
          elEta.textContent = `${Math.floor(m / 60) > 0 ? Math.floor(m / 60) + 'H ' : ''}${m % 60}M`;
        } else {
          elEta.textContent = '—';
        }
      }
      
      const elResolved = document.getElementById('metric-resolved');
      if (elResolved) {
        elResolved.textContent = stats.resolvedTodayCount || 0;
      }

    } catch (err) {
      console.error('Active incidents data load error:', err);
    }
  }

  /**
   * --- WebSocket Integration ---
   * Binds real-time event listeners for tactical updates.
   */
  function initSocket() {
    const socket = (window.NexusAuth && typeof window.NexusAuth.initSocket === 'function')
      ? window.NexusAuth.initSocket()
      : null;

    if (socket) {
      // Refresh logic for newly reported field conditions
      socket.on('incident:new', () => {
        console.log('Socket Update: New incident reported.');
        loadData();
      });

      // State synchronization for status transitions
      socket.on('incident:updated', (data) => {
        console.log('Socket Update: Incident updated.', data);
        loadData();
      });
    }
  }

  /**
   * --- Module Initialization ---
   */
  document.addEventListener('DOMContentLoaded', () => {
    // Start mission clock
    startClock();
    // Perform initial SITREP load
    loadData();
    // Engage real-time event bridge
    initSocket();
    // Redundant polling (60s) for eventual consistency in high-noise environments
    setInterval(loadData, 60000); 
  });
})();

