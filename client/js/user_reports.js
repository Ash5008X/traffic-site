// Wait for the DOM content to be fully loaded before initializing the user reports logic
document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Element Selection ---
  // Statistic counter elements
  const statTotal = document.getElementById('stat-total');
  const statActive = document.getElementById('stat-active');
  const statResolved = document.getElementById('stat-resolved');
  
  // Containers for rendering dynamic report lists
  const activeReportsCount = document.getElementById('active-reports-count');
  const activeReportsList = document.getElementById('active-reports-list');
  const pastReportsList = document.getElementById('past-reports-list');

  // Detail panel elements for showing single report data
  const reportDetailEmpty = document.getElementById('report-detail-empty');
  const reportDetailPanel = document.getElementById('report-detail-panel');
  const detailTicketId = document.getElementById('detail-ticket-id');
  const detailTitle = document.getElementById('detail-title');
  const detailCoords = document.getElementById('detail-coords');
  const detailType = document.getElementById('detail-type');
  const detailSeverity = document.getElementById('detail-severity');
  const detailDesc = document.getElementById('detail-desc');
  const detailCloseBtn = document.getElementById('detail-close-btn');

  // --- Helper Functions ---

  /**
   * Retrieves the authentication token from local storage.
   * @returns {string|null} The token or null if missing.
   */
  const getToken = () => {
    try {
      return JSON.parse(localStorage.getItem('nexustraffic_auth'))?.token;
    } catch {
      return null;
    }
  };

  /**
   * Formats a date string into a structured 'YYYY-MM-DD · HH:MM:SS UTC' format.
   * @param {string} dateStr - The ISO date string.
   * @returns {string} Formatted date/time.
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return '---';
    const date = new Date(dateStr);
    return `${date.toISOString().split('T')[0]} · ${date.toISOString().split('T')[1].substring(0, 8)} UTC`;
  };

  /**
   * Returns a CSS class name based on incident severity.
   * @param {string} severity - Incident severity level.
   * @returns {string} CSS class name.
   */
  const getSeverityClass = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'warning';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'info';
    }
  };

  /**
   * Returns a CSS class name based on the current report status.
   * @param {string} status - Report operational status.
   * @returns {string} CSS class name.
   */
  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'pending';
      case 'assigned': return 'in-progress';
      case 'en_route': return 'en-route';
      case 'resolved': return 'resolved';
      case 'dismissed': return 'dismissed';
      default: return 'pending';
    }
  };

  // State variable to hold the full list of user's reports
  let allReports = [];

  // --- Main Data Loading Logic ---

  /**
   * Fetches all reports submitted by the current user and updates the dashboard UI.
   */
  const loadReports = async () => {
    try {
      // API call to fetch personal reports
      const res = await fetch('/api/incidents?reportedBy=me', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to fetch reports');
      
      allReports = await res.json();
      
      // Sort reports by creation date (newest first)
      allReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Categorize reports into active and past categories
      const activeReports = allReports.filter(r => ['pending', 'assigned', 'en_route'].includes(r.status));
      const pastReports = allReports.filter(r => ['resolved', 'dismissed'].includes(r.status));
      const resolvedReports = pastReports.filter(r => r.status === 'resolved');

      // Update UI statistic counters with padded strings
      statTotal.textContent = allReports.length.toString().padStart(2, '0');
      statActive.textContent = activeReports.length.toString().padStart(2, '0');
      statResolved.textContent = resolvedReports.length.toString().padStart(2, '0');
      activeReportsCount.textContent = activeReports.length.toString();

      // Render the categorized lists into the DOM
      renderActiveReports(activeReports);
      renderPastReports(pastReports);

    } catch (err) {
      console.error('Error loading reports:', err);
      // Display error messages in the lists if fetch fails
      activeReportsList.innerHTML = `<div style="color: var(--critical);">Failed to load active reports.</div>`;
      pastReportsList.innerHTML = `<div style="color: var(--critical);">Failed to load past reports.</div>`;
    }
  };

  /**
   * Populates the detail panel with information from a specific report.
   * @param {Object} report - The report object to display.
   */
  const showReportDetail = (report) => {
    // Switch visibility from empty state to the detail panel
    reportDetailEmpty.style.display = 'none';
    reportDetailPanel.style.display = 'block';

    // Update textual details in the panel
    detailTicketId.textContent = `TICKET_ID // ${report.incidentId || '---'}`;
    detailTitle.textContent = `${report.type} — ${report.location?.address || 'Unknown Location'}`;
    detailCoords.textContent = `GEO_LOC // ${report.location?.lat || 0}° N, ${report.location?.lng || 0}° W`;
    
    detailType.textContent = (report.type || 'Unknown').toUpperCase();
    detailSeverity.textContent = (report.severity || 'Unknown').toUpperCase();
    detailDesc.textContent = report.description || 'No description provided.';
  };

  // Close the detail panel and return to the empty state
  detailCloseBtn.addEventListener('click', () => {
    reportDetailPanel.style.display = 'none';
    reportDetailEmpty.style.display = 'flex';
  });

  /**
   * Renders active reports with full progress tracking visualizers.
   * @param {Array} reports - The list of active report objects.
   */
  const renderActiveReports = (reports) => {
    if (reports.length === 0) {
      activeReportsList.innerHTML = `<div style="opacity: 0.5; padding: 20px 0;">No active reports found.</div>`;
      return;
    }

    const html = reports.map((report, idx) => {
      const sevClass = getSeverityClass(report.severity);
      const statClass = getStatusClass(report.status);
      const statLabel = (report.status || 'pending').replace('_', ' ').toUpperCase();
      
      // Determine the current step index in the 4-stage operational process
      const steps = ['pending', 'assigned', 'en_route', 'resolved'];
      let currentStepIdx = steps.indexOf(report.status);
      if (currentStepIdx === -1) currentStepIdx = 0;

      // Build the progress timeline visualization
      let progressRowHtml = '<div class="progress-row">';
      const stepLabels = ['Reported', "Ack'd", 'En Route', 'Resolved'];
      const stepIcons = ['check', 'check', 'local_shipping', 'task_alt'];

      for (let i = 0; i < 4; i++) {
        let dotStatus = 'pending';
        let lineStatus = 'pending';
        
        if (i < currentStepIdx) {
          dotStatus = 'done';
          lineStatus = 'done';
        } else if (i === currentStepIdx) {
          dotStatus = 'active';
        }

        progressRowHtml += `
          <div class="prog-step">
            <div class="prog-dot ${dotStatus}"><span class="material-symbols-outlined">${stepIcons[i]}</span></div>
            <span class="prog-label ${dotStatus}">${stepLabels[i]}</span>
          </div>
        `;
        
        // Add connector line between steps
        if (i < 3) {
          progressRowHtml += `<div class="prog-line ${lineStatus}"></div>`;
        }
      }
      progressRowHtml += '</div>';

      // Construct the card HTML
      return `
        <div class="card report-card ${sevClass}" style="margin-bottom: 12px; cursor: pointer;" data-id="${report._id}">
          <div class="report-card-top">
            <span class="ticket-id">TICKET_ID // ${report.incidentId || '---'}</span>
            <span class="status-badge ${statClass}">${statLabel}</span>
          </div>
          <div class="report-title">${report.type} — ${report.location?.address || 'Unknown'}</div>
          <div class="report-meta">
            <span class="meta-item">COORD // ${report.location?.lat || 0}°, ${report.location?.lng || 0}°</span>
            <span class="meta-item muted">SUBMITTED // ${formatDate(report.createdAt)}</span>
          </div>
          <p class="report-body">${report.description || 'No description provided.'}</p>
          ${progressRowHtml}
        </div>
      `;
    }).join('');

    activeReportsList.innerHTML = html;

    // Attach click events to each card for detailing
    activeReportsList.querySelectorAll('.report-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const r = allReports.find(x => x._id === id);
        if (r) showReportDetail(r);
      });
    });
  };

  /**
   * Renders resolved or dismissed reports as compact table rows.
   * @param {Array} reports - The list of past report objects.
   */
  const renderPastReports = (reports) => {
    if (reports.length === 0) {
      pastReportsList.innerHTML = `<div style="opacity: 0.5; padding: 20px;">No past reports found.</div>`;
      return;
    }

    const html = reports.map((report) => {
      const statLabel = (report.status || 'resolved').charAt(0).toUpperCase() + (report.status || 'resolved').slice(1);
      const isDismissed = report.status === 'dismissed';
      
      return `
        <div class="past-row ${isDismissed ? 'dismissed' : 'resolved'}" style="cursor: pointer;" data-id="${report._id}">
          <div class="past-row-main">
            <div class="past-row-id">${report.incidentId || '---'}</div>
            <div class="past-row-title">${report.type} — ${report.location?.address || 'Unknown'}</div>
          </div>
          <span class="past-row-date">${formatDate(report.createdAt)}</span>
          <span class="past-pill ${isDismissed ? 'dismissed' : 'resolved'}">${statLabel}</span>
        </div>
      `;
    }).join('');

    pastReportsList.innerHTML = html;

    // Attach click events to each row for detailing
    pastReportsList.querySelectorAll('.past-row').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const r = allReports.find(x => x._id === id);
        if (r) showReportDetail(r);
      });
    });
  };

  // Trigger initial report loading
  loadReports();
});

