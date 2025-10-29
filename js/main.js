// js/main.js - More robust checks

// --- Global Firebase Refs (if needed by multiple functions) ---
// It's generally better to pass db/auth or initialize them where needed,
// but for simplicity in this structure:
let auth;
let db;

document.addEventListener('DOMContentLoaded', () => {

    // Initialize Firebase services within DOMContentLoaded
    // This assumes firebase.js (compat) is loaded before this script
    try {
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (error) {
        console.error("Firebase failed to initialize:", error);
        // Display a user-friendly message on the page if critical
        document.body.innerHTML = "Error initializing application. Please check console.";
        return; // Stop further execution if Firebase isn't available
    }

    // --- LOGIN PAGE LOGIC ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const errorDiv = document.getElementById('login-error');
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (errorDiv) errorDiv.classList.remove('visible'); // Hide error on new attempt

            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;

            auth.signInWithEmailAndPassword(email, password)
                .then(cred => {
                    window.location.href = 'dashboard.html';
                })
                .catch(err => {
                    console.error("Login Error:", err.code, err.message);
                    let message = 'An error occurred. Please try again.';
                    if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                        message = 'Incorrect email or password.';
                    }
                    if (errorDiv) {
                        errorDiv.textContent = message;
                        errorDiv.classList.add('visible'); // Make error visible
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
            if (errorDiv) errorDiv.classList.remove('visible'); // Hide error

            const name = signupForm['signup-name'].value;
            const email = signupForm['signup-email'].value;
            const password = signupForm['signup-password'].value;

            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    // Create user document in Firestore
                    return db.collection('users').doc(cred.user.uid).set({
                        fullName: name,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        // Update Firebase Auth profile (optional but good practice)
                        return cred.user.updateProfile({ displayName: name });
                    });
                })
                .then(() => {
                    alert('Account created! Please log in.');
                    window.location.href = 'index.html'; // Redirect to login
                })
                .catch(err => {
                    console.error("Signup Error:", err.code, err.message);
                    let message = 'An error occurred. Please try again.';
                    if (err.code === 'auth/email-already-in-use') {
                        message = 'This email is already registered.';
                    } else if (err.code === 'auth/weak-password') {
                        message = 'Password should be at least 6 characters.';
                    }
                     if (errorDiv) {
                        errorDiv.textContent = message;
                        errorDiv.classList.add('visible'); // Make error visible
                    }
                });
        });
    }

    // --- ADMIN LOGIN PAGE LOGIC ---
    const adminLoginForm = document.getElementById('admin-login-form');
    if (adminLoginForm) {
        const errorDiv = document.getElementById('admin-login-error');
        adminLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (errorDiv) errorDiv.classList.remove('visible');

            const email = adminLoginForm['admin-email'].value;
            const password = adminLoginForm['admin-password'].value;

            auth.signInWithEmailAndPassword(email, password)
                .then(userCredential => {
                    const user = userCredential.user;
                    // Check if user exists in the 'admins' collection
                    return db.collection('admins').doc(user.uid).get();
                })
                .then(doc => {
                    if (doc.exists) {
                        // User is an admin
                        window.location.href = 'admin.html';
                    } else {
                        // User logged in but is not in the admins collection
                        auth.signOut(); // Log them out
                         if (errorDiv) {
                            errorDiv.textContent = 'Access Denied. Not an admin account.';
                            errorDiv.classList.add('visible');
                        }
                    }
                })
                .catch(err => {
                    // Handle login errors (wrong password, user not found for admin)
                    console.error("Admin Login Error:", err.code, err.message);
                     if (errorDiv) {
                        errorDiv.textContent = 'Invalid admin credentials.';
                        errorDiv.classList.add('visible');
                    }
                });
        });
    }


    // --- ADMIN PANEL "CREATE TEST" MODAL LOGIC ---
    const createTestBtn = document.getElementById('create-new-test-btn');
    const createTestModal = document.getElementById('create-test-modal');
    const adminModalBackdrop = document.getElementById('modal-backdrop'); // Assuming same backdrop ID
    const cancelCreateTestBtn = document.getElementById('cancel-create-test');
    const createTestForm = document.getElementById('create-test-form');

    // Only add listeners if all relevant elements are found (i.e., we are on admin.html)
    if (createTestBtn && createTestModal && adminModalBackdrop && cancelCreateTestBtn && createTestForm) {
        const openModal = () => {
            createTestModal.classList.add('visible');
            adminModalBackdrop.classList.add('visible');
        };

        const closeModal = () => {
            createTestModal.classList.remove('visible');
            adminModalBackdrop.classList.remove('visible');
            createTestForm.reset(); // Reset form on close
        };

        createTestBtn.addEventListener('click', openModal);
        cancelCreateTestBtn.addEventListener('click', closeModal);
        adminModalBackdrop.addEventListener('click', closeModal);

        createTestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const testName = createTestForm['test-name'].value;
            const testId = createTestForm['test-id'].value;

            // Basic validation (more could be added)
            if (!testName || !testId || !/^[a-z0-9_]+$/.test(testId)) {
                alert("Please provide a valid name and ID (lowercase letters, numbers, underscores only).");
                return;
            }

            db.collection('tests').doc(testId).set({
                name: testName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                console.log('Test created successfully!');
                closeModal();
                alert('Test created successfully!');
                window.location.reload(); // Reload admin page to show new test
            }).catch(err => {
                console.error("Error creating test:", err);
                alert("Error creating test: " + err.message);
            });
        });
    } // End of Create Test Modal Logic check


    // --- DISPLAY TESTS FROM DATABASE (Admin Panel) --- //
    const testListContainerAdmin = document.getElementById('admin-test-list');
    if (testListContainerAdmin) { // Check specifically for the admin container
        db.collection('tests').orderBy('createdAt', 'desc').get().then(snapshot => {
            if (snapshot.empty) {
                testListContainerAdmin.innerHTML = "<p>No tests found. Create one to get started!</p>";
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const test = doc.data();
                const testId = doc.id;
                html += `
                    <div class="test-item-admin" data-id="${testId}">
                        <div class="test-info">
                            <h4>${test.name || 'Unnamed Test'}</h4>
                            <span>ID: ${testId}</span>
                        </div>
                        <div class="test-actions">
                            <a href="edit-test.html?id=${testId}" class="btn-icon" title="Edit Questions"><i class="fa-solid fa-pen-to-square"></i></a>
                            <button class="btn-icon generate-code-btn" data-testid="${testId}" title="Generate Proctored Code"><i class="fa-solid fa-barcode"></i></button>
                            <button class="btn-icon danger delete-test-btn" data-testid="${testId}" data-testname="${test.name || 'this test'}" title="Delete Test"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>`;
            });
            testListContainerAdmin.innerHTML = html;

            // Add event listeners for delete buttons (using event delegation)
            testListContainerAdmin.addEventListener('click', (e) => {
                const deleteButton = e.target.closest('.delete-test-btn');
                if (deleteButton) {
                    const testIdToDelete = deleteButton.dataset.testid;
                    const testNameToDelete = deleteButton.dataset.testname;
                    // Replace confirm with a custom modal in a real app
                    if (confirm(`Are you sure you want to delete the test "${testNameToDelete}" (${testIdToDelete})? This cannot be undone.`)) {
                        // Add deletion logic here (deleting test doc and potentially questions subcollection)
                        console.warn(`Deletion requested for ${testIdToDelete}, but not implemented yet.`);
                        // Example: db.collection('tests').doc(testIdToDelete).delete().then(...).catch(...);
                         alert('Deletion functionality not yet implemented.');
                    }
                }
                 const generateCodeButton = e.target.closest('.generate-code-btn');
                 if (generateCodeButton) {
                     const testIdForCode = generateCodeButton.dataset.testid;
                     console.warn(`Code generation requested for ${testIdForCode}, but not implemented yet.`);
                     alert('Proctored code generation not yet implemented.');
                 }

            });

        }).catch(err => {
            console.error("Error fetching admin tests:", err);
            testListContainerAdmin.innerHTML = "<p>Error loading tests. Please try again.</p>";
        });
    } // End of Admin Test List Logic check


    // --- LOGOUT & PAGE PROTECTION ---
    auth.onAuthStateChanged(user => {
        const protectedPages = ['dashboard.html', 'admin.html', 'edit-test.html', 'test.html', 'review.html'];
        const currentPage = window.location.pathname.split('/').pop();

        const logoutBtn = document.getElementById('logout-btn'); // Get logout button reference

        if (user) {
            // User is logged in

            // Only attempt to populate dashboard if on dashboard.html
            if (currentPage === 'dashboard.html') {
                 populateDashboard(); // This function now has its own internal check
            }

            // Setup Logout Button if it exists on the page
            if (logoutBtn) {
                 // Check if listener already added to prevent duplicates (optional but good practice)
                if (!logoutBtn.dataset.listenerAdded) {
                     logoutBtn.addEventListener('click', (e) => {
                         e.preventDefault();
                         auth.signOut().then(() => {
                             window.location.href = 'index.html'; // Redirect after sign out
                         }).catch(error => {
                             console.error("Sign out error", error);
                         });
                     });
                     logoutBtn.dataset.listenerAdded = 'true'; // Mark as added
                }
            }
        } else {
            // User is NOT logged in
            // If user tries to access a protected page, redirect to login
            if (protectedPages.includes(currentPage)) {
                console.log(`User not logged in, redirecting from protected page: ${currentPage}`);
                window.location.href = 'index.html';
            }
        }
    });

    // --- Ensure test-specific UI logic is NOT in main.js ---
    // Make sure no code here tries to manipulate elements specific to test.html
    // like modals, strikethrough buttons, etc. That belongs in test-engine.js.


}); // --- END OF DOMContentLoaded for main.js ---


// --- populateDashboard Function (defined outside DOMContentLoaded) ---
// This function fetches tests and populates the STUDENT dashboard grid.
async function populateDashboard() {
    const testGrid = document.getElementById('test-grid-container');
    // Guard clause: If the grid container doesn't exist on this page, exit.
    if (!testGrid) {
        // console.log("Not on student dashboard, skipping populateDashboard.");
        return;
    }
     // Ensure db is initialized before trying to use it
     if (!db) {
         console.error("Firestore DB not initialized in populateDashboard.");
         testGrid.innerHTML = '<p>Error: Could not connect to the database.</p>';
         return;
     }


    testGrid.innerHTML = '<p>Loading available tests...</p>'; // Show loading message initially

    try {
        const testsSnapshot = await db.collection('tests').orderBy('createdAt', 'desc').get();

        if (testsSnapshot.empty) {
            testGrid.innerHTML = '<p>No practice tests are available at the moment. Please check back later.</p>';
            return;
        }

        testGrid.innerHTML = ''; // Clear loading message

        testsSnapshot.forEach(doc => {
            const test = doc.data();
            const testId = doc.id;

            const card = document.createElement('div');
            card.classList.add('test-card'); // Use class for styling
            card.innerHTML = `
                <div class="card-content">
                    <h4>${test.name || 'Unnamed Test'}</h4>
                    <p>${test.description || 'A full-length adaptive test covering Reading, Writing, and Math.'}</p>
                    <span class="test-status not-started">Not Started</span>
                    </div>
                    <a href="test.html?id=${testId}" class="btn btn-primary card-btn">Start Test</a>
            `;
            testGrid.appendChild(card);
            // TODO: Add logic here later to check user's progress for this testId
            // and update the 'test-status' span and button text accordingly.
        });

    } catch (error) {
        console.error("Error fetching tests for student dashboard:", error);
        testGrid.innerHTML = '<p>Could not load tests due to an error. Please try refreshing the page.</p>';
    }
}
