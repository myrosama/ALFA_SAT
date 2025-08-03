document.addEventListener('DOMContentLoaded', () => {

    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- LOGIN PAGE LOGIC ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const errorDiv = document.getElementById('login-error');
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            errorDiv.textContent = ''; // Clear previous errors
            
            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;

            auth.signInWithEmailAndPassword(email, password)
                .then(cred => {
                    window.location.href = 'dashboard.html';
                })
                .catch(err => {
                    console.error(err.code);
                    if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                        errorDiv.textContent = 'Incorrect email or password.';
                    } else {
                        errorDiv.textContent = 'An error occurred. Please try again.';
                    }
                });
        });
    }

    // --- SIGN UP PAGE LOGIC ---
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        const errorDiv = document.getElementById('signup-error');
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            errorDiv.textContent = ''; // Clear previous errors

            const name = signupForm['signup-name'].value;
            const email = signupForm['signup-email'].value;
            const password = signupForm['signup-password'].value;

            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    return db.collection('users').doc(cred.user.uid).set({
                        fullName: name,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        return cred.user.updateProfile({ displayName: name });
                    });
                })
                .then(() => {
                    alert('Account created! Please log in.');
                    window.location.href = 'index.html';
                })
                .catch(err => {
                    console.error(err.code);
                    if (err.code === 'auth/email-already-in-use') {
                        errorDiv.textContent = 'This email is already registered.';
                    } else if (err.code === 'auth/weak-password') {
                        errorDiv.textContent = 'Password should be at least 6 characters.';
                    } else {
                        errorDiv.textContent = 'An error occurred. Please try again.';
                    }
                });
        });
    }

    // --- LOGOUT & PAGE PROTECTION ---
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                window.location.href = 'index.html';
            });
        });
    }

    auth.onAuthStateChanged(user => {
        const isOnAuthPage = window.location.pathname.includes('index.html') || window.location.pathname.includes('signup.html');
        if (user) {
            if (isOnAuthPage) { window.location.replace('dashboard.html'); } // Use replace to avoid back-button issues
            const welcomeUserName = document.querySelector('#welcome-user-name');
            const footerUserName = document.querySelector('#footer-user-name');
            if (welcomeUserName) welcomeUserName.textContent = user.displayName;
            if (footerUserName) footerUserName.textContent = user.displayName;
        } else {
            if (!isOnAuthPage) { window.location.replace('index.html'); }
        }
    });

    // --- TEST PAGE UI LOGIC ---
    const testBody = document.querySelector('.test-body');
    if (testBody) {
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

        const strikethroughButtons = document.querySelectorAll('.strikethrough-btn');
        strikethroughButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const wrapper = button.closest('.option-wrapper');
                const radio = wrapper.querySelector('input[type="radio"]');
                if (wrapper) {
                    wrapper.classList.toggle('stricken-through');
                    radio.disabled = wrapper.classList.contains('stricken-through');
                    if (radio.disabled) radio.checked = false;
                }
            });
        });
    }
});