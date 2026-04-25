(() => {
  /**
   * Displays a status or error message within the registration form.
   * @param {HTMLFormElement} form - The form element to append the message to.
   * @param {string} message - The message text to display.
   * @param {boolean} isError - Whether the message is an error (red) or success (green).
   */
  function setFormMessage(form, message, isError = true) {
    // Attempt to find an existing message node in the form
    let messageNode = form.querySelector('.form-message');
    // Create a new message node if one doesn't exist
    if (!messageNode) {
      messageNode = document.createElement('p');
      messageNode.className = 'form-message';
      messageNode.style.marginTop = '12px';
      messageNode.style.fontSize = '0.9rem';
      form.appendChild(messageNode);
    }
    // Set the color based on whether it's an error or success message
    messageNode.style.color = isError ? '#ff6b6b' : '#34d399';
    // Update the message text content
    messageNode.textContent = message;
  }

  // Initialize registration logic once the DOM is fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    // Select the primary registration form
    const form = document.querySelector('.auth-form');
    // Exit if the form or NexusAuth utility is not available
    if (!form || !window.NexusAuth) return;

    // Handle the registration form submission event
    form.addEventListener('submit', async (event) => {
      // Prevent the default browser form submission behavior
      event.preventDefault();

      // Extract values from the form fields
      const firstName = form.querySelector('#firstName')?.value.trim();
      const lastName = form.querySelector('#lastName')?.value.trim();
      const email = form.querySelector('#email')?.value.trim();
      const password = form.querySelector('#password')?.value;
      const confirmPassword = form.querySelector('#confirmPassword')?.value;
      const role = form.querySelector('input[name="role"]:checked')?.value || 'user';
      const submitButton = form.querySelector('button[type="submit"]');

      // Validate that mandatory fields are populated
      if (!firstName || !email || !password) {
        setFormMessage(form, 'First name, email, and password are required.');
        return;
      }

      // Ensure that the password and confirmation fields match
      if (password !== confirmPassword) {
        setFormMessage(form, 'Passwords do not match.');
        return;
      }

      // Disable the submit button to prevent multiple submissions
      if (submitButton) submitButton.disabled = true;
      // Show a temporary loading message
      setFormMessage(form, 'Creating account...', false);

      try {
        // Construct the registration payload
        const payload = {
          name: `${firstName} ${lastName || ''}`.trim(),
          email,
          password,
          role
        };

        // --- Feature: Capture registration location for Field Units ---
        if (role === 'field_unit') {
          if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by your browser. Required for Field Unit registration.');
          }
          
          setFormMessage(form, 'Capturing location for regional assignment...', false);
          
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000
            });
          }).catch(err => {
            throw new Error('Location access is required for Field Unit registration. Please enable GPS.');
          });
          
          payload.location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        }

        // Attempt to register using the NexusAuth utility
        const { user } = await window.NexusAuth.register(payload);
        // Redirect the user to their respective dashboard based on their role
        window.NexusAuth.redirectToDashboard(user.role);
      } catch (error) {
        // Display any errors encountered during registration
        setFormMessage(form, error.message || 'Unable to register.');
      } finally {
        // Re-enable the submit button regardless of the outcome
        if (submitButton) submitButton.disabled = false;
      }
    });
  });
})();

