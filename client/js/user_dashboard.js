// Wait for the DOM content to be fully loaded before initializing the dashboard logic
document.addEventListener('DOMContentLoaded', () => {
  // Modal DOM elements for reporting incidents
  const reportBtn = document.getElementById('report-accident-btn');
  const modalOverlay = document.getElementById('report-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelReportBtn = document.getElementById('cancel-report-btn');
  const reportForm = document.getElementById('report-form');
  const submitBtn = document.getElementById('submit-report-btn');

  // Dashboard DOM elements for displaying dynamic data
  const userReportsList = document.getElementById('user-reports-list');
  const activeReportCard = document.getElementById('active-report-card');
  const noActiveReportCard = document.getElementById('no-active-report-card');
  const activeReportRef = document.getElementById('active-report-ref');
  const activeReportTime = document.getElementById('active-report-time');
  const activeReportTitle = document.getElementById('active-report-title');
  const activeReportDesc = document.getElementById('active-report-desc');
  const nearbyAlertsList = document.getElementById('nearby-alerts-list');

  // State variable to store the user's real location coordinates
  let USER_LOCATION = null;
  
  /**
   * Retrieves the authentication token from local storage.
   * @returns {string|null} The auth token or null if not found.
   */
  const getToken = () => {
    try {
      return JSON.parse(localStorage.getItem('nexustraffic_auth'))?.token;
    } catch {
      return null;
    }
  };

  /**
   * Formats a date string into a human-readable 'time ago' format.
   * @param {string} dateStr - The ISO date string to format.
   * @returns {string} A relative time string (e.g., '5 min ago').
   */
  const timeAgo = (dateStr) => {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  /**
   * Maps a severity string to its corresponding CSS class for styling.
   * @param {string} severity - The severity level of the incident.
   * @returns {string} The CSS class name.
   */
  const getSeverityClass = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'warning'; // map high to warning colors
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'info';
    }
  };

  // --- 1. Modal Management Logic ---

  /**
   * Opens the incident report modal and prevents background scrolling.
   */
  const openModal = () => {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  /**
   * Closes the incident report modal and resets form state.
   */
  const closeModal = () => {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    reportForm.reset();
  };

  // Event listeners for opening and closing the modal
  reportBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  cancelReportBtn.addEventListener('click', closeModal);
  // Close the modal if the user clicks on the overlay backdrop
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // --- 2. Data Loading Logic ---

  /**
   * Fetches the authenticated user's profile to retrieve their registered location.
   */
  const loadUserLocation = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to fetch user profile');
      const profile = await res.json();
      // Store the lat/lng coordinates for reporting and proximity searches
      if (profile.location && profile.location.lat != null && profile.location.lng != null) {
        USER_LOCATION = { lat: profile.location.lat, lng: profile.location.lng };
      } else {
        // Fallback to origin if no location is registered in the profile
        USER_LOCATION = { lat: 0, lng: 0 };
        console.warn('User location not set in profile — using (0,0) as fallback');
      }
    } catch (err) {
      console.error('Error loading user location:', err);
      USER_LOCATION = { lat: 0, lng: 0 };
    }
  };

  /**
   * Fetches all incidents reported by the current user.
   */
  const loadUserData = async () => {
    try {
      const res = await fetch('/api/incidents?reportedBy=me', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to fetch reports');
      
      const reports = await res.json();
      
      // Update the recent reports list in the left column
      renderReportsFeed(reports.slice(0, 3));
      
      // Update the active monitoring panel in the right column
      const activeReport = reports.find(r => r.status !== 'resolved' && r.status !== 'dismissed');
      renderActiveReport(activeReport);
      
    } catch (err) {
      console.error('Error loading user data:', err);
      // Display an error message if the fetch fails
      userReportsList.innerHTML = `<div class="feed-row"><div class="feed-row-main"><div class="feed-row-body" style="color: var(--critical);">Failed to load reports.</div></div></div>`;
    }
  };

  /**
   * Renders the user's recent reports into the dashboard feed.
   * @param {Array} reports - The list of report objects to render.
   */
  const renderReportsFeed = (reports) => {
    // Handle empty state
    if (!reports || reports.length === 0) {
      userReportsList.innerHTML = `<div class="feed-row" style="opacity: 0.5;"><div class="feed-row-main"><div class="feed-row-body">No recent reports found.</div></div></div>`;
      return;
    }

    // Generate HTML for each report row
    userReportsList.innerHTML = reports.map(report => {
      const sevClass = getSeverityClass(report.severity);
      const sevLabel = (report.severity || 'info').charAt(0).toUpperCase() + (report.severity || 'info').slice(1);
      
      return `
        <div class="feed-row">
          <div class="sev-bar ${sevClass}"></div>
          <div class="feed-row-main">
            <div class="feed-row-title">${report.type} Incident</div>
            <div class="feed-row-body">${report.description || 'No description provided.'}</div>
            <div class="feed-row-tags">
              <span class="sev-pill ${sevClass}">${sevLabel}</span>
              <span class="mono-meta">${timeAgo(report.createdAt)}</span>
              <span class="sev-pill" style="background: var(--surface-2); border: 1px solid var(--border); color: var(--text-muted);">${report.status.toUpperCase()}</span>
            </div>
          </div>
          <span class="material-symbols-outlined row-arrow">chevron_right</span>
        </div>
      `;
    }).join('');
  };

  // Storage for the current active report being monitored
  let activeReportId = null;

  /**
   * Renders the monitoring panel for an active incident report.
   * @param {Object} report - The active report object to display.
   */
  const renderActiveReport = (report) => {
    // If no active report exists, show the empty state card
    if (!report) {
      activeReportId = null;
      activeReportCard.style.display = 'none';
      noActiveReportCard.style.display = 'block';
      return;
    }

    // Update state and display the monitoring card
    activeReportId = report._id;
    activeReportCard.style.display = 'block';
    noActiveReportCard.style.display = 'none';

    // Update textual information in the monitoring card
    activeReportRef.textContent = `Ref: ${report.incidentId || '---'}`;
    activeReportTime.textContent = timeAgo(report.createdAt);
    activeReportTitle.textContent = `${report.type} Reported`;
    activeReportDesc.textContent = report.description || 'Your report is being processed.';

    // Progress timeline state management based on report status
    const steps = ['pending', 'assigned', 'en_route', 'resolved'];
    let currentStepIdx = steps.indexOf(report.status);
    if (currentStepIdx === -1) currentStepIdx = 0; // Default to pending
    
    // Update the visual width of the progress bar fill
    const fills = ['25%', '50%', '75%', '100%'];
    document.querySelector('#active-report-timeline .tl-fill').style.width = fills[currentStepIdx] || '25%';

    // Update each individual step dot and label in the timeline
    steps.forEach((step, idx) => {
      const dot = document.getElementById(`tl-step-${idx + 1}-dot`);
      const label = document.getElementById(`tl-step-${idx + 1}-label`);
      
      dot.className = 'tl-dot';
      label.className = 'tl-label';
      
      if (idx < currentStepIdx) {
        // Step is completed
        dot.classList.add('done');
        label.classList.add('done');
        dot.innerHTML = `<span class="material-symbols-outlined">check</span>`;
      } else if (idx === currentStepIdx) {
        // Step is currently active
        dot.classList.add('active');
        label.classList.add('active');
      } else {
        // Step is still pending
        dot.classList.add('pending');
        label.classList.add('pending');
      }
    });
  };

  // --- 3. Interaction Handlers ---

  /**
   * Global event listener to handle manual resolution of reported incidents.
   */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#resolve-report-btn');
    if (!btn) return;
    
    // Validate that we have a report to resolve
    if (!activeReportId) {
        console.warn('No active report ID found to resolve.');
        return;
    }
    
    // Confirm resolution with the user
    if (!confirm('Are you sure you want to mark this incident as resolved?')) return;

    try {
      // Show loading state on the button
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 1s linear infinite">sync</span> Processing...';
      btn.disabled = true;

      // Send status update request to the API
      const res = await fetch(`/api/incidents/${activeReportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ status: 'resolved' })
      });

      if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to resolve report');
      }
      
      // Refresh data to update the UI after resolution
      await loadUserData();
    } catch (err) {
      console.error('Error resolving report:', err);
      alert(`Failed to resolve report: ${err.message}`);
    } finally {
      // Restore button state
      btn.innerHTML = '<span class="material-symbols-outlined">task_alt</span> Resolve Report';
      btn.disabled = false;
    }
  });

  /**
   * Fetches nearby alerts based on the user's stored location.
   */
  const loadNearbyAlerts = async () => {
    try {
      const res = await fetch(`/api/incidents/nearby?lat=${USER_LOCATION.lat}&lng=${USER_LOCATION.lng}&radius=50`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to fetch nearby alerts');
      
      const alerts = await res.json();
      
      // Handle empty state for nearby alerts
      if (!alerts || alerts.length === 0) {
        nearbyAlertsList.innerHTML = `<div style="text-align: center; padding: 20px 0; color: var(--text-muted);">No nearby alerts found.</div>`;
        return;
      }

      // Render the top 4 nearby alerts into the list
      nearbyAlertsList.innerHTML = alerts.slice(0, 4).map(alert => {
        const sevClass = getSeverityClass(alert.severity);
        const dist = alert.dist ? `${alert.dist.toFixed(1)} km` : '< 2 km';
        
        return `
          <div class="alert-row">
            <div class="ar-bar" style="background: var(--${sevClass});"></div>
            <div class="ar-content">
              <div class="ar-title">${alert.type}</div>
              <div class="ar-meta">
                <span class="ar-ref">${alert.incidentId || 'SYS-NEW'}</span>
                <div class="ar-sep"></div>
                <span class="ar-dist">${dist} away</span>
              </div>
            </div>
            <span class="material-symbols-outlined ar-arrow">chevron_right</span>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Error loading nearby alerts:', err);
      nearbyAlertsList.innerHTML = `<div style="text-align: center; padding: 20px 0; color: var(--critical);">Error loading alerts.</div>`;
    }
  };

  /**
   * Handles the submission of a new incident report form.
   * CAPTURES LIVE LOCATION: Grabs the user's exact coordinates at the moment of submission
   * to ensure accurate incident placement on the tactical map.
   */
  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Show loading state on the submission button to indicate location acquisition is in progress
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 1s linear infinite">sync</span> Acquiring Location...';
    submitBtn.disabled = true;

    // Check for geolocation support in the browser
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser. Cannot submit report.');
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
      return;
    }

    // Step 1: Capture live location at the moment of submission
    const tryGetLocation = () => {
      const geoOptions = {
        enableHighAccuracy: false, // Faster and more reliable on desktops
        timeout: 15000,            // 15 second timeout
        maximumAge: 10000          // Accept location up to 10s old
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Success: Use live location
          const liveLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            address: document.getElementById('report-location').value
          };
          submitReport(liveLocation);
        },
        (error) => {
          // Error/Timeout: Fallback to stored profile location
          console.warn('Live location acquisition failed (Code ' + error.code + '). Falling back to profile location.', error);
          
          if (USER_LOCATION && USER_LOCATION.lat !== 0) {
            alert('Using your saved location for this report.');
            const fallbackLocation = {
              ...USER_LOCATION,
              address: document.getElementById('report-location').value
            };
            submitReport(fallbackLocation);
          } else {
            // No fallback available
            if (error.code === error.PERMISSION_DENIED) {
              alert('Location access is required or a saved profile location must be set to submit a report.');
            } else {
              alert('Failed to acquire location and no saved location found in your profile.');
            }
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
          }
        },
        geoOptions
      );
    };

    /**
     * Submits the report data to the server
     * @param {Object} locationObj - The {lat, lng, address} to save
     */
    const submitReport = async (locationObj) => {
      submitBtn.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 1s linear infinite">sync</span> Submitting Report...';

      const data = {
        type: document.getElementById('report-type').value,
        severity: document.getElementById('report-severity').value,
        location: locationObj,
        description: document.getElementById('report-description').value
      };

      try {
        const res = await fetch('/api/incidents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
          },
          body: JSON.stringify(data)
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to submit report');
        }
        
        closeModal();
        await loadUserData();
        console.log('Incident reported successfully at:', locationObj);
        
      } catch (err) {
        console.error('Error submitting report:', err);
        alert(`Failed to submit report: ${err.message}`);
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    };

    tryGetLocation();
  });

  // --- 5. Real-time Communication (WebSocket) ---

  /**
   * Initializes WebSocket listeners for real-time dashboard updates.
   */
  const socket = (window.NexusAuth && typeof window.NexusAuth.initSocket === 'function') 
    ? window.NexusAuth.initSocket() 
    : null;

  if (socket) {
    // Listen for new incidents reported in the network
    socket.on('incident:new', () => {
      loadNearbyAlerts();
    });

    // Listen for updates to existing incidents (e.g., status changes)
    socket.on('incident:updated', (incident) => {
      // Refresh all dynamic components to ensure dashboard remains current
      loadUserData();
      loadNearbyAlerts();
    });
  }

  // --- 6. Initial Bootstrapping ---

  // Sequence of initialization: load location first, then fetch dependent data
  loadUserLocation().then(() => {
    loadUserData();
    loadNearbyAlerts();
  });
});

