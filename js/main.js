document.addEventListener('DOMContentLoaded', () => {

    const auth = firebase.auth();
    const db = firebase.firestore();

        // --- LOGIN PAGE LOGIC ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const errorDiv = document.getElementById('login-error');
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Hide the error on a new attempt
            errorDiv.classList.remove('visible'); 
            
            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;

            auth.signInWithEmailAndPassword(email, password)
                .then(cred => {
                    window.location.href = 'dashboard.html';
                })
                .catch(err => {
                    console.error(err.code);
                    let message = 'An error occurred. Please try again.';
                    if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                        message = 'Incorrect email or password.';
                    }
                    errorDiv.textContent = message;
                    // Make the error visible
                    errorDiv.classList.add('visible'); 
                });
        });
    }

        // --- SIGN UP PAGE LOGIC ---
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        const errorDiv = document.getElementById('signup-error');
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Hide the error on a new attempt
            errorDiv.classList.remove('visible');

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
                    let message = 'An error occurred. Please try again.';
                    if (err.code === 'auth/email-already-in-use') {
                        message = 'This email is already registered.';
                    } else if (err.code === 'auth/weak-password') {
                        message = 'Password should be at least 6 characters.';
                    }
                    errorDiv.textContent = message;
                    // Make the error visible
                    errorDiv.classList.add('visible');
                });
        });
    }

   // +++ ADD THIS NEW BLOCK IN ITS PLACE +++
// --- ADMIN LOGIN PAGE LOGIC (NEW & SIMPLE) ---
const adminLoginForm = document.getElementById('admin-login-form');
if (adminLoginForm) {
    const errorDiv = document.getElementById('admin-login-error');
    adminLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        errorDiv.classList.remove('visible');
        
        const email = adminLoginForm['admin-email'].value;
        const password = adminLoginForm['admin-password'].value;

        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                // Step 1: Login successful. Now check the database.
                const user = userCredential.user;
                return db.collection('admins').doc(user.uid).get();
            })
            .then(doc => {
                // Step 2: Check if the document exists in the 'admins' collection.
                if (doc.exists) {
                    // SUCCESS: User is an admin.
                    window.location.href = 'admin.html';
                } else {
                    // FAIL: User is not in the admins collection.
                    auth.signOut();
                    errorDiv.textContent = 'Access Denied. Not an admin account.';
                    errorDiv.classList.add('visible');
                }
            })
            .catch(err => {
                // This catches login errors like wrong password.
                errorDiv.textContent = 'Invalid admin credentials.';
                errorDiv.classList.add('visible');
            });
    });
}
// +++ ADD THIS ONE NEW BLOCK TO YOUR WORKING main.js FILE +++

    // --- ADMIN PANEL "CREATE TEST" LOGIC ---
    const createTestBtn = document.getElementById('create-new-test-btn');
    if (createTestBtn) { // This line ensures this code ONLY runs on admin.html
        
        const modal = document.getElementById('create-test-modal');
        const backdrop = document.getElementById('modal-backdrop');
        const cancelBtn = document.getElementById('cancel-create-test');
        const createTestForm = document.getElementById('create-test-form');

        const openModal = () => {
            modal.classList.add('visible');
            backdrop.classList.add('visible');
        };

        const closeModal = () => {
            modal.classList.remove('visible');
            backdrop.classList.remove('visible');
            createTestForm.reset();
        };

        // --- Event Listeners ---
        createTestBtn.addEventListener('click', openModal);
        cancelBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);

        // --- Handle Form Submission ---
        createTestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const testName = createTestForm['test-name'].value;
            const testId = createTestForm['test-id'].value;

            // Save the new test to the 'tests' collection in Firestore
            db.collection('tests').doc(testId).set({
                name: testName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                console.log('Test created successfully!');
                closeModal();
                alert('Test created successfully!');
                window.location.reload(); // Reload the page to see the new test (we'll improve this later)
            }).catch(err => {
                console.error("Error creating test:", err);
                alert("Error: " + err.message);
            });
        });
    }

       // --- LOGOUT & PAGE PROTECTION ---
    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                // After logout, always go back to the main login page
                window.location.href = 'index.html';
            });
        });
    }

    // +++ ADD THIS NEW BLOCK IN ITS PLACE +++
auth.onAuthStateChanged(user => {
    const isProtectedUserPage = window.location.pathname.includes('dashboard.html') || window.location.pathname.includes('test.html');
    const isAdminPage = window.location.pathname.includes('admin.html');
    
    if (user) { // A user is logged in
        db.collection('admins').doc(user.uid).get().then(doc => {
            const isAdmin = doc.exists;

            // If a non-admin tries to access admin.html, kick them out.
            if (isAdminPage && !isAdmin) {
                return window.location.replace('dashboard.html');
            }
            
            // Update UI elements only on the user-facing pages
            if (isProtectedUserPage) {
                const welcomeUserName = document.querySelector('#welcome-user-name');
                const footerUserName = document.querySelector('#footer-user-name');
                if (welcomeUserName) welcomeUserName.textContent = user.displayName;
                if (footerUserName) footerUserName.textContent = user.displayName;
            }
        });
    } else { // No user is logged in
        // If they are on any protected page, kick them to the login page.
        if (isProtectedUserPage || isAdminPage) {
            window.location.replace('index.html');
        }
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