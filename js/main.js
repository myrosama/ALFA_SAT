// Wait for the HTML document to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    // --- Login/Sign Up Page Logic ---
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const switchLink = document.getElementById('switch-link');
    const loginText = document.getElementById('login-text');
    const signupText = document.getElementById('signup-text');

    // Check if we are on the login/signup page before adding event listeners
    if (switchLink) {
        switchLink.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent the link from navigating

            // Toggle visibility of the forms
            loginForm.classList.toggle('hidden');
            signupForm.classList.toggle('hidden');

            // Toggle the helper text and link text
            loginText.classList.toggle('hidden');
            signupText.classList.toggle('hidden');

            if (signupForm.classList.contains('hidden')) {
                // We are showing the Login form
                switchLink.textContent = 'Sign Up';
            } else {
                // We are showing the Sign Up form
                switchLink.textContent = 'Log In';
            }
        });
    }

});