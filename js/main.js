// Wait for the HTML document to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    // --- Login/Sign Up Page Logic ---
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const switchLink = document.getElementById('switch-link');
    const loginText = document.getElementById('login-text');
    const signupText = document.getElementById('signup-text');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');


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

            // Toggle the main form title and subtitle
            if (signupForm.classList.contains('hidden')) {
                // We are showing the Login form
                switchLink.textContent = 'Sign Up';
                formTitle.textContent = 'Log In';
                formSubtitle.textContent = 'Your journey to a better score starts here.';
            } else {
                // We are showing the Sign Up form
                switchLink.textContent = 'Log In';
                formTitle.textContent = 'Create Account';
                formSubtitle.textContent = 'Join us and start preparing for success.';
            }
        });
    }
    // --- Test Page Pane Resizer Logic ---
    const resizer = document.getElementById('pane-resizer');
    const leftPane = document.querySelector('.stimulus-pane');

    // Check if we are on the test page
    if (resizer && leftPane) {
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            // Prevent text selection during drag
            document.body.style.userSelect = 'none';
            document.body.style.pointerEvents = 'none'; // Improve performance
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            // Get the left boundary of the parent container
            const containerOffsetLeft = leftPane.parentElement.offsetLeft;
            // Calculate new width for the left pane
            let newWidth = e.clientX - containerOffsetLeft;

            // Constrain the resizing
            const containerWidth = leftPane.parentElement.offsetWidth;
            if (newWidth < 200) newWidth = 200; // Minimum width
            if (newWidth > containerWidth - 200) newWidth = containerWidth - 200; // Maximum width

            leftPane.style.flexBasis = `${newWidth}px`;
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            // Re-enable text selection
            document.body.style.userSelect = 'auto';
            document.body.style.pointerEvents = 'auto';
        });
    }
});
    // --- Question Navigator Modal Logic ---
    const navBtn = document.getElementById('question-nav-btn');
    const modal = document.getElementById('question-navigator-modal');
    const closeBtn = document.getElementById('close-modal-btn');

    if (navBtn && modal) {
        navBtn.addEventListener('click', () => {
            modal.classList.toggle('visible');
            navBtn.classList.toggle('open');
        });

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('visible');
            navBtn.classList.remove('open');
        });

        // Close modal if clicking outside of it
        document.addEventListener('click', (e) => {
            if (!modal.contains(e.target) && !navBtn.contains(e.target)) {
                modal.classList.remove('visible');
                navBtn.classList.remove('open');
            }
        });
    }