/**
 * Self-invoking function to encapsulate the user profile management logic.
 */
(() => {
  // --- DOM Element Selection ---
  // Elements for displaying user identity
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileId = document.getElementById('profile-id');
  
  // Elements for displaying user activity statistics
  const statReportsFiled = document.getElementById('stat-reports-filed');
  const statIncidentsResolved = document.getElementById('stat-incidents-resolved');

  // --- Helper Functions ---

  /**
   * Retrieves the authentication object (user + token) from local storage.
   * @returns {Object|null} The auth data or null if invalid.
   */
  const getAuth = () => {
    try {
      return JSON.parse(localStorage.getItem('nexustraffic_auth'));
    } catch {
      return null;
    }
  };

  /**
   * Generates display initials from a full name (e.g., "John Doe" -> "JD").
   * @param {string} name - The user's full name.
   * @returns {string} One or two character initials.
   */
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  /**
   * Fetches user data and statistics to populate the profile UI.
   */
  const loadProfile = async () => {
    const auth = getAuth();
    // Validate authentication state
    if (!auth || !auth.user) {
      profileName.textContent = 'Unknown User';
      return;
    }

    const user = auth.user;
    // Update identity information
    profileName.textContent = user.name || 'Unknown User';
    profileAvatar.textContent = getInitials(user.name);
    
    // Create a deterministic short ID from the end of the MongoDB ObjectID
    const shortId = user._id ? user._id.substring(user._id.length - 6).toUpperCase() : '000000';
    profileId.textContent = `USER_ID // NX-${shortId}`;

    try {
      // Fetch incidents reported by this user to calculate stats
      const res = await fetch('/api/incidents?reportedBy=me', {
        headers: { 'Authorization': `Bearer ${auth.token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch incidents');
      
      const reports = await res.json();
      
      // Update statistics counters
      statReportsFiled.textContent = reports.length.toString();
      statIncidentsResolved.textContent = reports.filter(r => r.status === 'resolved').length.toString();

    } catch (err) {
      console.error('Error loading reports:', err);
      // Fallback display in case of API error
      statReportsFiled.textContent = 'Err';
      statIncidentsResolved.textContent = 'Err';
    }
  };

  // --- Interaction Listeners ---

  // Handle visual state changes for UI toggle switches
  const toggles = document.querySelectorAll('.toggle-switch');
  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      // Flip the 'active' class on click
      toggle.classList.toggle('active');
      // Note: Backend persistence for settings can be added here
    });
  });

  // Initialize the profile page
  loadProfile();
})();

