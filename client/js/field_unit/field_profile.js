/**
 * Fetches and populates the field unit agent's profile data, including
 * identity details, mission statistics, and weekly performance KPI charts.
 */
async function fetchProfileData() {
  try {
    // Authentication configuration and validation
    const authKey = 'nexustraffic_auth';
    const authData = JSON.parse(localStorage.getItem(authKey) || 'null');
    
    // Redirect to login if session data is missing or invalid
    if (!authData || !authData.token) {
      window.location.href = '../../index.html';
      return;
    }

    const token = authData.token;

    // Fetch specialized field unit statistics from the telemetry service
    const statsRes = await fetch('/api/field-units/profile/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const stats = await statsRes.json();

    // Aggregate user identity from authentication payload
    const user = authData.user || {};
    const fullName = user.name || 'Anonymous User';
    
    // Update core identity UI elements
    document.getElementById('profile-full-name').textContent = fullName;
    document.getElementById('profile-unit-id').textContent = `UNIT_ID // ${stats.unitId || 'UNKNOWN'}`;

    // --- Initials Circle Generation ---
    // Extract first letters of name components to create a tactical avatar
    const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const circle = document.getElementById('profile-initials-circle');
    circle.style.borderRadius = '50%';
    circle.style.display = 'flex';
    circle.style.alignItems = 'center';
    circle.style.justifyContent = 'center';
    circle.style.background = 'var(--accent)';
    circle.style.color = 'white';
    circle.style.fontSize = '28px';
    circle.style.fontWeight = '800';
    circle.textContent = initials;

    // --- Mission Statistics Update ---
    // Update high-level mission clearance and logistics counters
    document.getElementById('profile-cleared-count').textContent = stats.clearedCount || 0;
    document.getElementById('profile-zone').textContent = stats.zone || 'N/A';
    document.getElementById('profile-team').textContent = stats.teamName || 'N/A';

    // --- Weekly Response KPI Chart Rendering ---
    const chart = document.getElementById('profile-weekly-chart');
    chart.innerHTML = '';
    const weeklyStats = stats.weeklyStats || [];
    // Determine max value for proportional bar scaling
    const maxCount = Math.max(...weeklyStats.map(s => s.count), 1);

    // Build bar elements for each day in the historical week
    weeklyStats.forEach((s, i) => {
      const height = (s.count / maxCount) * 100;
      const isToday = i === weeklyStats.length - 1;
      
      const barCol = document.createElement('div');
      barCol.className = `bar-col ${isToday ? 'today' : ''}`;
      
      // Inject bar markup with calculated height
      barCol.innerHTML = `
        <div class="bar-wrap">
          <div class="bar-fill" style="height: ${height}%"></div>
        </div>
        <span class="bar-label">${s.day}</span>
      `;
      chart.appendChild(barCol);
    });

  } catch (err) {
    console.error('Error fetching profile data:', err);
  }
}

/**
 * Self-invoking lifecycle manager to initialize page logic and bind UI event listeners.
 */
(() => {
  // Trigger initial data load
  fetchProfileData();

  // --- Interaction Logic: Toggle Rows ---
  // Allow clicking anywhere on a setting row to toggle the associated checkbox
  document.querySelectorAll('.toggle-row').forEach((row) => {
    row.addEventListener('click', (event) => {
      // Prevent double-triggering if the click was directly on the checkbox or label
      if (event.target.closest('label') || event.target.tagName === 'INPUT') return;
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.click();
    });
  });
})();

