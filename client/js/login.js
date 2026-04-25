(() => {
  /**
   * Displays a status or error message within the authentication form.
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

  // Initialize form submission logic once the DOM is fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    // Select the primary authentication form
    const form = document.querySelector('.auth-form');
    // Exit if the form or NexusAuth utility is not available
    if (!form || !window.NexusAuth) return;

    // Handle the form submission event
    form.addEventListener('submit', async (event) => {
      // Prevent the default browser form submission behavior
      event.preventDefault();

      // Extract and trim the user's input values
      const email = form.querySelector('#email')?.value.trim();
      const password = form.querySelector('#password')?.value;
      const submitButton = form.querySelector('button[type="submit"]');

      // Validate that both fields are populated
      if (!email || !password) {
        setFormMessage(form, 'Email and password are required.');
        return;
      }

      // Disable the submit button to prevent duplicate requests
      if (submitButton) submitButton.disabled = true;
      // Show a temporary loading message
      setFormMessage(form, 'Signing in...', false);

      try {
        // Attempt to log in using the NexusAuth utility
        const { user } = await window.NexusAuth.login(email, password);
        // Redirect the user to their respective dashboard based on their role
        window.NexusAuth.redirectToDashboard(user.role);
      } catch (error) {
        // Display any errors encountered during login
        setFormMessage(form, error.message || 'Unable to login.');
      } finally {
        // Re-enable the submit button regardless of the outcome
        if (submitButton) submitButton.disabled = false;
      }
    });
  });
})();

