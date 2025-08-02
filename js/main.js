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

document.addEventListener('DOMContentLoaded', () => {

    // --- Login/Sign Up Page Logic ---
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const switchLink = document.getElementById('switch-link');
    const loginText = document.getElementById('login-text');
    const signupText = document.getElementById('signup-text');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');

    if (switchLink) {
        switchLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.toggle('hidden');
            signupForm.classList.toggle('hidden');
            loginText.classList.toggle('hidden');
            signupText.classList.toggle('hidden');
            if (signupForm.classList.contains('hidden')) {
                switchLink.textContent = 'Sign Up';
                formTitle.textContent = 'Log In';
                formSubtitle.textContent = 'Your journey to a better score starts here.';
            } else {
                switchLink.textContent = 'Log In';
                formTitle.textContent = 'Create Account';
                formSubtitle.textContent = 'Join us and start preparing for success.';
            }
        });
    }

    // --- Test Page Logic ---
    // We check if an element from the test page exists before running test-specific code
    const testBody = document.querySelector('.test-body');
    if (testBody) {

        // --- Question Navigator Modal Logic ---
        const navBtn = document.getElementById('question-nav-btn');
        const modal = document.getElementById('question-navigator-modal');
        const closeBtn = document.getElementById('close-modal-btn');
        const backdrop = document.getElementById('modal-backdrop');

        if (navBtn && modal && closeBtn && backdrop) {
            const toggleModal = () => {
                modal.classList.toggle('visible');
                backdrop.classList.toggle('visible');
                navBtn.classList.toggle('open');
            };

            navBtn.addEventListener('click', toggleModal);
            closeBtn.addEventListener('click', toggleModal);
            backdrop.addEventListener('click', toggleModal);
        }

        // --- Answer Strikethrough Logic ---
        const strikethroughButtons = document.querySelectorAll('.strikethrough-btn');
        strikethroughButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const wrapper = button.closest('.option-wrapper');
                const radio = wrapper.querySelector('input[type="radio"]');

                if (wrapper) {
                    wrapper.classList.toggle('stricken-through');
                    if (wrapper.classList.contains('stricken-through')) {
                        radio.checked = false;
                        radio.disabled = true;
                    } else {
                        radio.disabled = false;
                    }
                }
            });
        });
    }
});