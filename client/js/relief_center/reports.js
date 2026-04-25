/**
 * reports.js
 * 
 * HISTORICAL ANALYTICS & INTELLIGENCE ENGINE
 * This module is responsible for aggregating, filtering, and visualizing historical 
 * incident data for post-operational analysis and reporting.
 * 
 * CORE FUNCTIONALITIES:
 * - Multi-Vector Filtering: Temporal, Severity, Status, and Protocol-based scoping.
 * - Performance Metrics: Calculation of response efficiency and resolution ratios.
 * - Temporal Trending: Weekly incident volume visualization (Last 7 Days).
 * - Spatial Sector Analysis: Distribution of incidents across jurisdictional zones (A-F).
 * - Export System: Generation of mission archives in PDF, CSV, and Excel formats.
 */
(function() {
  // --- Secure Session Management ---
  const authData = JSON.parse(localStorage.getItem('nexustraffic_auth') || 'null');
  const token = authData?.token;
  if (!token) window.location.href = '../../index.html';

  /**
   * Operational State Registry
   */
  let allIncidents = [];
  let currentFilters = {
    fromDate: '',
    toDate: '',
    severity: ['critical', 'high', 'medium', 'low'],
    status: ['resolved', 'pending', 'dismissed'],
    type: ['accident', 'medical', 'congestion', 'maintenance']
  };

  /**
   * Visual Identity Tokens (Aligned with NexusTRAFFIC Design System)
   */
  const colors = {
    critical: '#FF3B30',
    high: '#FF6B35',
    medium: '#FFB830',
    low: '#34C759'
  };

  /**
   * Standardized API dispatcher with integrated authorization headers.
   */
  async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`http://localhost:5000/api${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  /**
   * --- Filter Logic Orchestrator ---
   * Initializes the temporal and categorical filtering interface.
   */
  function initFilters() {
    // Temporal Defaults: Normalization to trailing 30-day window.
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    document.getElementById('filter-to-date').value = today.toISOString().split('T')[0];
    document.getElementById('filter-from-date').value = thirtyDaysAgo.toISOString().split('T')[0];
    
    /**
     * Temporal Preset Event Handlers
     */
    document.querySelectorAll('.date-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.date-btn').forEach(b => {
          b.classList.remove('bg-[#F97316]', 'text-white', 'font-bold');
          b.classList.add('bg-[#1F3448]/30', 'text-[var(--nt-dim)]');
        });
        e.target.classList.remove('bg-[#1F3448]/30', 'text-[var(--nt-dim)]');
        e.target.classList.add('bg-[#F97316]', 'text-white', 'font-bold');

        const days = e.target.dataset.days;
        const end = new Date();
        document.getElementById('filter-to-date').value = end.toISOString().split('T')[0];
        
        if (days === 'all') {
          document.getElementById('filter-from-date').value = '2020-01-01';
        } else {
          const start = new Date(end.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);
          document.getElementById('filter-from-date').value = start.toISOString().split('T')[0];
        }
      });
    });

    /**
     * Categorical State Toggles (Severity, Status, Type)
     */
    ['severity', 'status', 'type'].forEach(cat => {
      document.querySelectorAll(`#filter-${cat} .filter-btn`).forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.val;
          const idx = currentFilters[cat].indexOf(val);
          if (idx > -1) {
            currentFilters[cat].splice(idx, 1);
            btn.classList.remove('active');
            btn.style.opacity = '0.4';
          } else {
            currentFilters[cat].push(val);
            btn.classList.add('active');
            btn.style.opacity = '1';
          }
        });
      });
    });

    /**
     * Report Generation Trigger
     */
    document.getElementById('btn-generate-report').addEventListener('click', () => {
      currentFilters.fromDate = document.getElementById('filter-from-date').value;
      currentFilters.toDate = document.getElementById('filter-to-date').value;
      renderReport();
    });

    // Wire export systems
    document.getElementById('btn-export-pdf').addEventListener('click', () => downloadMock('PDF'));
    document.getElementById('btn-export-csv').addEventListener('click', () => downloadMock('CSV'));
    document.getElementById('btn-export-excel').addEventListener('click', () => downloadMock('EXCEL'));
  }

  /**
   * --- Archive Export Helper ---
   * Simulates data package generation for various archival formats.
   */
  function downloadMock(format) {
    const data = getFilteredData();
    const content = `Report generated with ${data.length} records. Format: ${format}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NexusTraffic_Report_${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`;
    a.click();
  }

  /**
   * --- Scoping Engine ---
   * Filters the global incident registry based on the active operational parameters.
   */
  function getFilteredData() {
    const start = new Date(currentFilters.fromDate || '2020-01-01').getTime();
    const end = new Date(currentFilters.toDate || '2099-01-01').getTime() + 86400000; // Temporal buffer for end day

    return allIncidents.filter(inc => {
      const t = new Date(inc.createdAt).getTime();
      if (t < start || t > end) return false;
      if (!currentFilters.severity.includes(inc.severity)) return false;
      if (!currentFilters.status.includes(inc.status)) return false;
      if (!currentFilters.type.includes(inc.type)) return false;
      return true;
    });
  }

  /**
   * --- Performance Analytics ---
   * Calculates the mean response time for resolved incidents in minutes.
   */
  function calculateAvgResponse(data) {
    const resolved = data.filter(i => i.status === 'resolved');
    if (resolved.length === 0) return 0;
    
    let totalMs = 0;
    resolved.forEach(i => {
      totalMs += (new Date(i.updatedAt).getTime() - new Date(i.createdAt).getTime());
    });
    
    return (totalMs / resolved.length / 60000).toFixed(1);
  }

  /**
   * --- UI Rendering Orchestrator ---
   * Updates all analytical visual regions based on the scoped data package.
   */
  function renderReport() {
    const data = getFilteredData();
    
    // Sector Badges: Records quantification
    document.getElementById('records-found-badge').textContent = `${data.length.toLocaleString()} RECORDS FOUND`;
    document.getElementById('date-range-badge').textContent = `${currentFilters.fromDate || 'START'} — ${currentFilters.toDate || 'NOW'}`;

    // KPI Matrix: High-level mission performance metrics
    const resolvedCount = data.filter(i => i.status === 'resolved').length;
    const dismissedCount = data.filter(i => i.status === 'dismissed').length;
    const avgResponse = calculateAvgResponse(data);

    document.getElementById('stat-total-incidents').textContent = data.length.toLocaleString();
    document.getElementById('stat-resolved').textContent = resolvedCount.toLocaleString();
    document.getElementById('stat-dismissed').textContent = dismissedCount.toLocaleString();
    document.getElementById('stat-avg-response').textContent = avgResponse;

    // --- Chronological Event Feed ---
    const timelineContainer = document.getElementById('incident-timeline');
    timelineContainer.innerHTML = '';
    const sortedData = [...data].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
    
    sortedData.forEach(inc => {
      const color = colors[inc.severity] || colors.medium;
      const opacity = inc.status === 'resolved' ? 'opacity-60' : '';
      const timeStr = new Date(inc.createdAt).toLocaleTimeString();
      
      timelineContainer.innerHTML += `
        <div class="relative pl-8 ${opacity} mb-6">
          <div class="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full" style="background-color: ${color}; box-shadow: 0 0 0 4px ${color}33"></div>
          <div class="flex justify-between items-start">
            <div>
              <h4 class="barlow-800 font-bold text-[var(--nt-bright)] uppercase tracking-tight">${inc.type} // ${inc.zone || 'UNKNOWN_ZONE'}</h4>
              <p class="text-[var(--nt-dim)] text-xs mt-1">${inc.description || 'No description provided'}</p>
            </div>
            <span class="fira-code text-[10px] text-[var(--nt-dim)] ml-4 shrink-0">${timeStr}</span>
          </div>
        </div>
      `;
    });

    // --- Intelligence Analytics: Severity Breakdown ---
    const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    data.forEach(inc => { if (sevCounts[inc.severity] !== undefined) sevCounts[inc.severity]++; });
    
    document.getElementById('sev-count-critical').textContent = sevCounts.critical;
    document.getElementById('sev-count-high').textContent = sevCounts.high;
    document.getElementById('sev-count-medium').textContent = sevCounts.medium;
    document.getElementById('sev-count-low').textContent = sevCounts.low;

    // Severity Ratio Bar
    const barContainer = document.getElementById('severity-bar');
    barContainer.innerHTML = '';
    const total = data.length || 1;
    ['critical', 'high', 'medium', 'low'].forEach(sev => {
      const pct = (sevCounts[sev] / total) * 100;
      if (pct > 0) {
        barContainer.innerHTML += `<div class="h-full flex items-center justify-center barlow-800 font-bold text-xs" style="width: ${pct}%; background-color: ${colors[sev]}">${pct.toFixed(0)}%</div>`;
      }
    });

    // --- Intelligence Analytics: Weekly Temporal Trend ---
    const trendContainer = document.getElementById('weekly-trend');
    trendContainer.innerHTML = '';
    const dayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    
    const last7Days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      last7Days.push({
        label: dayLabels[d.getDay()],
        dateStr: d.toISOString().split('T')[0],
        counts: { critical: 0, high: 0, medium: 0, low: 0 }
      });
    }

    data.forEach(inc => {
      const incDateStr = new Date(inc.createdAt).toISOString().split('T')[0];
      const match = last7Days.find(d => d.dateStr === incDateStr);
      if (match && match.counts[inc.severity] !== undefined) {
        match.counts[inc.severity]++;
      }
    });

    let maxDayCount = 1;
    last7Days.forEach(day => {
      const dayTotal = day.counts.critical + day.counts.high + day.counts.medium + day.counts.low;
      if (dayTotal > maxDayCount) maxDayCount = dayTotal;
    });

    last7Days.forEach(day => {
      const div = document.createElement('div');
      div.className = 'flex-1 flex flex-col justify-end gap-0.5 h-full';
      const dayTotal = day.counts.critical + day.counts.high + day.counts.medium + day.counts.low;
      
      ['critical', 'high', 'medium', 'low'].forEach(sev => {
        if (day.counts[sev] > 0) {
          const hPct = (day.counts[sev] / maxDayCount) * 100;
          div.innerHTML += `<div class="w-full rounded-sm" style="height: ${hPct}%; background-color: ${colors[sev]}; opacity: 0.9; min-height: 2px"></div>`;
        }
      });
      div.innerHTML += `<span class="fira-code text-[8px] text-center mt-1 text-[var(--nt-dim)]">${day.label}</span>`;
      if (dayTotal > 0) {
        div.innerHTML += `<span class="fira-code text-[7px] text-center text-[var(--nt-dim)]">${dayTotal}</span>`;
      }
      trendContainer.appendChild(div);
    });

    // --- Intelligence Analytics: Spatial Sector Distribution ---
    const zoneContainer = document.getElementById('zone-report');
    zoneContainer.innerHTML = '';
    const fixedZones = ['A', 'B', 'C', 'D', 'E', 'F'];
    const zoneColors = {
      A: '#FF3B30', B: '#FF6B35', C: '#FFB830',
      D: '#F97316', E: '#34C759', F: '#BF5AF2'
    };
    const zoneCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    data.forEach(inc => {
      const z = inc.zone;
      if (z && zoneCounts[z] !== undefined) {
        zoneCounts[z]++;
      }
    });

    fixedZones.forEach(z => {
      const count = zoneCounts[z];
      const c = zoneColors[z];
      zoneContainer.innerHTML += `
        <div class="flex items-center justify-between p-3 nt-card border-l-4 border border-[var(--nt-card-border)]" style="border-left-color: ${c}">
          <div>
            <span class="barlow-800 font-bold text-xs uppercase">ZONE_${z}</span>
            <div class="fira-code text-[10px] text-[var(--nt-dim)]">${count} REPORT${count !== 1 ? 'S' : ''} GENERATED</div>
          </div>
          <span class="barlow-800 font-extrabold text-xl" style="color: ${c}">${count}</span>
        </div>
      `;
    });
  }

  /**
   * --- Spatial Classification Logic ---
   * Calculates the jurisdictional sector (A-F) based on bearing from the command center.
   */
  function bearingDeg(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const la1 = toRad(lat1), la2 = toRad(lat2);
    const dLon = toRad(lng2 - lng1);
    const y = Math.sin(dLon) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function classifyZone(centerLat, centerLng, pointLat, pointLng) {
    const bearing = bearingDeg(centerLat, centerLng, pointLat, pointLng);
    const idx = Math.floor(bearing / 60); // Mapping 360 degrees to 6 radial sectors
    return String.fromCharCode(65 + idx);  // Normalizing to 'A' - 'F'
  }

  /**
   * --- Initial Synchronizer ---
   * Fetches full historical registry and calibrates spatial sectors based on administrator location.
   */
  async function loadData() {
    try {
      const [incidents, userData] = await Promise.all([
        apiFetch('/incidents'),
        apiFetch('/auth/me')
      ]);

      // Operational Center Coordinates
      const centerLat = userData.location?.lat || 19.076;
      const centerLng = userData.location?.lng || 72.8777;

      // Annotate incident registry with jurisdictional zone metadata
      allIncidents = incidents.map(inc => {
        if (inc.location && inc.location.lat != null && inc.location.lng != null) {
          inc.zone = classifyZone(centerLat, centerLng, inc.location.lat, inc.location.lng);
        } else {
          inc.zone = null;
        }
        return inc;
      });
      
      // Calibrate temporal scoping and execute initial render
      currentFilters.fromDate = document.getElementById('filter-from-date').value;
      currentFilters.toDate = document.getElementById('filter-to-date').value;
      
      renderReport();
    } catch (err) {
      console.error('Report engine data load error:', err);
    }
  }

  /**
   * --- Module Initialization ---
   */
  document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    loadData();
  });
})();

