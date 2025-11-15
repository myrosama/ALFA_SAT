// js/main.js - Update Dashboard for Completed Tests
// UPDATED: To handle test visibility (Public/Private/Hide) and whitelisting.
// UPDATED: To show "Continue Test" button if test is in progress.
// NEW: Added profile menu to dashboard to show User ID.
// NEW: Added Proctored Test Code generation and joining.

let auth;
let db;

document.addEventListener('DOMContentLoaded', () => {

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
                        email: email, // Store email
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
    
    // --- Get references to all modals ---
    const accessModal = document.getElementById('access-modal');
    const proctorCodeModal = document.getElementById('proctor-code-modal');

    if (createTestBtn && createTestModal && adminModalBackdrop && cancelCreateTestBtn && createTestForm) {
        const openModal = () => {
            createTestModal.classList.add('visible');
            adminModalBackdrop.classList.add('visible');
        };

        const closeModal = () => {
            createTestModal.classList.remove('visible');
            // Check if other modals are open before hiding backdrop
            if (accessModal && !accessModal.classList.contains('visible') && proctorCodeModal && !proctorCodeModal.classList.contains('visible')) {
                adminModalBackdrop.classList.remove('visible');
            }
            createTestForm.reset(); // Reset form on close
        };

        createTestBtn.addEventListener('click', openModal);
        cancelCreateTestBtn.addEventListener('click', closeModal);

        createTestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const testName = createTestForm['test-name'].value;
            const testId = createTestForm['test-id'].value;

            if (!testName || !testId || !/^[a-z0-9_]+$/.test(testId)) {
                alert("Please provide a valid name and ID (lowercase letters, numbers, underscores only).");
                return;
            }

            db.collection('tests').doc(testId).set({
                name: testName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                visibility: 'hide', // Default to hidden
                whitelist: []
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


    // +++ Access Control Modal Logic (Simple Version) +++
    const accessForm = document.getElementById('access-form');
    const cancelAccessBtn = document.getElementById('cancel-access');
    const visibilitySelect = document.getElementById('test-visibility');
    const whitelistContainer = document.getElementById('whitelist-container');
    const whitelistTextarea = document.getElementById('test-whitelist');
    const accessModalTitle = document.getElementById('access-modal-title');
    const saveAccessBtn = document.getElementById('save-access-btn'); 
    const accessErrorMsg = document.getElementById('access-error-msg');
    let currentEditingTestId = null;

    if (accessModal && accessForm && cancelAccessBtn && visibilitySelect && whitelistContainer && whitelistTextarea && adminModalBackdrop && saveAccessBtn && accessErrorMsg) {
        
        // Show/hide whitelist box based on dropdown
        visibilitySelect.addEventListener('change', () => {
            whitelistContainer.classList.toggle('visible', visibilitySelect.value === 'private');
        });

        // Close modal function
        const closeAccessModal = () => {
            accessModal.classList.remove('visible');
            if (createTestModal && !createTestModal.classList.contains('visible') && proctorCodeModal && !proctorCodeModal.classList.contains('visible')) {
                adminModalBackdrop.classList.remove('visible');
            }
            accessForm.reset();
            currentEditingTestId = null;
            whitelistContainer.classList.remove('visible');
            saveAccessBtn.disabled = false;
            saveAccessBtn.textContent = 'Save Access';
            accessErrorMsg.classList.remove('visible');
            accessErrorMsg.textContent = '';
        };

        cancelAccessBtn.addEventListener('click', closeAccessModal);

        // Global backdrop click handler
        adminModalBackdrop.addEventListener('click', (e) => {
            if (createTestModal && createTestModal.classList.contains('visible')) {
                createTestModal.classList.remove('visible');
            }
            if (accessModal && accessModal.classList.contains('visible')) {
                accessModal.classList.remove('visible');
            }
            if (proctorCodeModal && proctorCodeModal.classList.contains('visible')) {
                proctorCodeModal.classList.remove('visible');
            }
            adminModalBackdrop.classList.remove('visible');
        });

        // Save access settings by updating Firestore directly
        accessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentEditingTestId) return;

            saveAccessBtn.disabled = true;
            saveAccessBtn.textContent = 'Saving...';
            accessErrorMsg.classList.remove('visible');

            const visibility = visibilitySelect.value;
            
            const whitelist = whitelistTextarea.value
                .split('\n')
                .map(id => id.trim())
                .filter(id => id.length > 0); 

            const testRef = db.collection('tests').doc(currentEditingTestId);
            
            testRef.update({
                visibility: visibility,
                whitelist: whitelist 
            }).then(() => {
                console.log(`Access updated for ${currentEditingTestId}`);
                closeAccessModal();
                window.location.reload(); 
            }).catch(err => {
                console.error("Error updating access:", err);
                accessErrorMsg.textContent = `Error: ${err.message}`;
                accessErrorMsg.classList.add('visible');
                saveAccessBtn.disabled = false;
                saveAccessBtn.textContent = 'Save Access';
            });
        });
    }

    // +++ NEW: Proctored Code Modal Logic +++
    const proctorCodeDisplay = document.getElementById('proctor-code-display');
    const proctorTestName = document.getElementById('proctor-test-name');
    const closeProctorModalBtn = document.getElementById('close-proctor-modal');

    if (proctorCodeModal && proctorCodeDisplay && proctorTestName && closeProctorModalBtn) {
        const closeProctorModal = () => {
            proctorCodeModal.classList.remove('visible');
            if (createTestModal && !createTestModal.classList.contains('visible') && accessModal && !accessModal.classList.contains('visible')) {
                adminModalBackdrop.classList.remove('visible');
            }
        };

        closeProctorModalBtn.addEventListener('click', closeProctorModal);
    }
    // +++ END: Proctored Code Modal Logic +++


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
                
                let statusTag = '';
                switch(test.visibility) {
                    case 'public':
                        statusTag = '<span class="test-status-tag public">Public</span>';
                        break;
                    case 'private':
                        statusTag = `<span class="test-status-tag private">Private (${test.whitelist?.length || 0})</span>`;
                        break;
                    default:
                        statusTag = '<span class="test-status-tag hide">Hidden</span>';
                }

                html += `
                    <div class="test-item-admin" data-id="${testId}">
                        <div class="test-info">
                            ${statusTag}
                            <div>
                                <h4>${test.name || 'Unnamed Test'}</h4>
                                <span>ID: ${testId}</span>
                            </div>
                        </div>
                        <div class="test-actions">
                            <button class="btn-icon access-btn" data-testid="${testId}" title="Manage Access"><i class="fa-solid fa-shield-halved"></i></button>
                            <a href="edit-test.html?id=${testId}" class="btn-icon" title="Edit Questions"><i class="fa-solid fa-pen-to-square"></i></a>
                            <button class="btn-icon generate-code-btn" data-testid="${testId}" title="Generate Proctored Code"><i class="fa-solid fa-barcode"></i></button>
                            <button class="btn-icon danger delete-test-btn" data-testid="${testId}" data-testname="${test.name || 'this test'}" title="Delete Test"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>`;
            });
            testListContainerAdmin.innerHTML = html;

            testListContainerAdmin.addEventListener('click', async (e) => { // +++ Made async
                const deleteButton = e.target.closest('.delete-test-btn');
                if (deleteButton) {
                    const testIdToDelete = deleteButton.dataset.testid;
                    const testNameToDelete = deleteButton.dataset.testname;
                    if (confirm(`Are you sure you want to delete the test "${testNameToDelete}" (${testIdToDelete})? This cannot be undone.`)) {
                         console.warn(`Deletion requested for ${testIdToDelete}, but not implemented yet.`);
                         alert('Deletion functionality not yet implemented.');
                    }
                }

                 // +++ UPDATED: Proctored Code Button Logic +++
                 const generateCodeButton = e.target.closest('.generate-code-btn');
                 if (generateCodeButton && proctorCodeModal) {
                     const testIdForCode = generateCodeButton.dataset.testid;
                     
                     // 1. Show modal in loading state
                     proctorCodeDisplay.innerHTML = '<span>Generating...</span>';
                     proctorTestName.textContent = '...';
                     proctorCodeModal.classList.add('visible');
                     adminModalBackdrop.classList.add('visible');
                     
                     try {
                        // 2. Generate a 6-char code
                        const code = generateProctorCode(6);
                        
                        // 3. Get Test Name
                        const testDoc = await db.collection('tests').doc(testIdForCode).get();
                        const testName = testDoc.exists ? testDoc.data().name : "Unknown Test";
                        
                        // 4. Save to Firestore (use code as ID for easy lookup)
                        await db.collection('proctoredSessions').doc(code).set({
                            testId: testIdForCode,
                            testName: testName,
                            adminId: auth.currentUser.uid,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // 5. Display the code
                        proctorCodeDisplay.innerHTML = `<span>${code.slice(0, 3)}-${code.slice(3)}</span>`;
                        proctorTestName.textContent = testName;

                     } catch (err) {
                        console.error("Error generating proctor code:", err);
                        proctorCodeDisplay.innerHTML = `<span style="font-size: 1rem; color: var(--error-red);">Error</span>`;
                        proctorTestName.textContent = err.message;
                     }
                 }

                 // +++ ADDED: Listener for Access Button +++
                 const accessButton = e.target.closest('.access-btn');
                 if (accessButton && accessModal) {
                     currentEditingTestId = accessButton.dataset.testid;
                     
                     // Fetch current test data to populate modal
                     db.collection('tests').doc(currentEditingTestId).get().then(doc => {
                         if (!doc.exists) {
                             alert("Test not found!");
                             return;
                         }
                         const testData = doc.data();
                         
                         accessModalTitle.textContent = `Manage Access: ${testData.name}`;
                         visibilitySelect.value = testData.visibility || 'hide';
                         whitelistTextarea.value = (testData.whitelist || []).join('\n'); 
                         
                         visibilitySelect.dispatchEvent(new Event('change'));
                         
                         accessModal.classList.add('visible');
                         adminModalBackdrop.classList.add('visible');
                     });
                 }

            });

        }).catch(err => {
            console.error("Error fetching admin tests:", err);
            testListContainerAdmin.innerHTML = "<p>Error loading tests. Please try again.</p>";
        });
    } // End of Admin Test List Logic check


    // --- LOGOUT & PAGE PROTECTION ---
    auth.onAuthStateChanged(user => {
        const protectedPages = ['dashboard.html', 'admin.html', 'edit-test.html', 'test.html', 'review.html', 'results.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (user) {
            // User is logged in
            if (currentPage === 'dashboard.html') {
                 populateDashboard(user.uid);
                 // +++ ADDED: Student-side proctor code form listener +++
                 const proctorCodeForm = document.getElementById('test-code-form');
                 if (proctorCodeForm) {
                     proctorCodeForm.addEventListener('submit', handleProctorCodeSubmit);
                 }
            }
            
            // +++ NEW: Profile Menu Logic (for dashboard) +++
            const profileBtn = document.getElementById('profile-btn');
            const profileMenu = document.getElementById('profile-menu');
            const userIdDisplay = document.getElementById('user-id-display');
            const copyUidBtn = document.getElementById('copy-uid-btn');
            const profileLogoutBtn = document.getElementById('profile-logout-btn');

            if(profileBtn && profileMenu && userIdDisplay && copyUidBtn && profileLogoutBtn) {
                // 1. Populate User ID
                userIdDisplay.value = user.uid;

                // 2. Toggle Menu
                profileBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent click from bubbling to document
                    profileMenu.classList.toggle('visible');
                });

                // 3. Copy Button
                copyUidBtn.addEventListener('click', () => {
                    userIdDisplay.select();
                    document.execCommand('copy');
                    copyUidBtn.innerHTML = '<i class="fa-solid fa-check"></i>'; // Show checkmark
                    setTimeout(() => {
                        copyUidBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; // Revert icon
                    }, 2000);
                });

                // 4. Logout Button
                profileLogoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    auth.signOut().then(() => { window.location.href = 'index.html'; })
                    .catch(error => { console.error("Sign out error", error); });
                });
            }

            // +++ Global listener to close profile menu +++
            document.addEventListener('click', (e) => {
                if (profileMenu && profileMenu.classList.contains('visible') && !e.target.closest('.profile-nav')) {
                    profileMenu.classList.remove('visible');
                }
            });
            
            // +++ Re-add the simple logout logic for OTHER pages +++
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                 if (!logoutBtn.dataset.listenerAdded) {
                     logoutBtn.addEventListener('click', (e) => {
                         e.preventDefault();
                         auth.signOut().then(() => { window.location.href = 'index.html'; })
                         .catch(error => { console.error("Sign out error", error); });
                     });
                     logoutBtn.dataset.listenerAdded = 'true';
                }
            }
        } else {
            // User is NOT logged in
            if (protectedPages.includes(currentPage)) {
                console.log(`User not logged in, redirecting from protected page: ${currentPage}`);
                window.location.href = 'index.html';
            }
        }
    });

    // --- Ensure test-specific UI logic is NOT in main.js ---
    // Make sure no code here tries to manipulate elements specific to test.html


}); // --- END OF DOMContentLoaded for main.js ---


// +++ NEW: Helper function to generate random code +++
function generateProctorCode(length) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // (O, I, 0, 1 removed for clarity)
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// +++ NEW: Student-side handler for proctor code form +++
async function handleProctorCodeSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('.test-code-input');
    const button = form.querySelector('button[type="submit"]');
    
    if (!input || !button) return;

    const code = input.value.trim().toUpperCase().replace('-', ''); // Get code, normalize it
    
    if (code.length !== 6) {
        alert("Please enter a 6-letter code.");
        return;
    }

    button.disabled = true;
    button.textContent = "Checking...";

    try {
        const sessionRef = db.collection('proctoredSessions').doc(code);
        const doc = await sessionRef.get();

        if (doc.exists) {
            // Code is valid! Get the testId and redirect.
            const testId = doc.data().testId;
            if (testId) {
                window.location.href = `test.html?id=${testId}`;
            } else {
                alert("Error: This session code is valid but has no test associated with it.");
                button.disabled = false;
                button.textContent = "Start Proctored Test";
            }
        } else {
            // Code does not exist
            alert("Invalid code. Please check the code and try again.");
            button.disabled = false;
            button.textContent = "Start Proctored Test";
        }
    } catch (err) {
        console.error("Error checking proctor code:", err);
        alert("An error occurred. Please try again.");
        button.disabled = false;
        button.textContent = "Start Proctored Test";
    }
}


/**
 * +++ MODIFIED popuplateDashboard +++
 * Fetches and displays tests, checking against the user's completed tests.
 * @param {string} userId - The UID of the currently logged-in user.
 */
async function populateDashboard(userId) {
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
        // 1. Get a map of completed test IDs and their results
        const completedTestsMap = new Map();
        // +++ Fetch data from the user's 'completedTests' subcollection +++
        const completedSnapshot = await db.collection('users').doc(userId).collection('completedTests').get();
        completedSnapshot.forEach(doc => {
            completedTestsMap.set(doc.id, doc.data()); // doc.id is testId, data is { score, resultId, completedAt }
        });
        console.log(`User has completed ${completedTestsMap.size} tests.`);

        // 2. Get all available tests from the main 'tests' collection
        // +++ UPDATED: Fetch public tests and private tests for this user +++
        
        // Query 1: Get all PUBLIC tests
        const publicTestsQuery = db.collection('tests').where('visibility', '==', 'public');
        
        // Query 2: Get all PRIVATE tests this user is whitelisted for
        const privateTestsQuery = db.collection('tests').where('whitelist', 'array-contains', userId);

        const [publicSnapshot, privateSnapshot] = await Promise.all([
            publicTestsQuery.get(),
            privateTestsQuery.get()
        ]);

        // Combine results and remove duplicates (in case a test is somehow public AND user is whitelisted)
        const allAvailableTests = new Map();
        publicSnapshot.forEach(doc => {
            allAvailableTests.set(doc.id, { id: doc.id, ...doc.data() });
        });
        privateSnapshot.forEach(doc => {
            // This will add or overwrite, ensuring no duplicates
            allAvailableTests.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        // Convert map values to an array
        const testsSnapshot = Array.from(allAvailableTests.values());
        
        // +++ Sort combined results by creation date (optional, but nice) +++
        testsSnapshot.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        if (testsSnapshot.length === 0) {
            testGrid.innerHTML = '<p>No practice tests are available at the moment.</p>';
            return;
        }

        testGrid.innerHTML = ''; // Clear loading message

        // 3. Render cards, modifying if completed
        testsSnapshot.forEach(test => {
            const testId = test.id;
            const completionData = completedTestsMap.get(testId); // Check if this testId is in our map
            
            // +++ ADDED: Check localStorage for in-progress test +++
            const inProgressKey = `inProgressTest_${userId}_${testId}`;
            const inProgressData = localStorage.getItem(inProgressKey);

            const card = document.createElement('div');
            card.classList.add('test-card');
            
            let cardHTML = '';
            
            if (completionData) {
                // --- Test is COMPLETED ---
                card.classList.add('completed');
                cardHTML = `
                    <div class="card-content">
                        <h4>${test.name || 'Unnamed Test'}</h4>
                        <p>${test.description || 'A full-length adaptive test.'}</p>
                        <!-- +++ Updated status display +++ -->
                        <div class="test-status completed">
                            <i class="fa-solid fa-check-circle"></i>
                            Finished - Score: <strong>${completionData.score || 'N/A'}</strong>
                        </div>
                    </div>
                    <!-- +++ Link to new results page with resultId +++ -->
                    <a href="results.html?resultId=${completionData.resultId}" class="btn card-btn btn-view-results">View Results</a>
                `;
            } else if (inProgressData) {
                // +++ NEW: Test is IN PROGRESS ---
                card.classList.add('in-progress'); // You can add custom styles for this
                cardHTML = `
                    <div class="card-content">
                        <h4>${test.name || 'Unnamed Test'}</h4>
                        <p>${test.description || 'A full-length adaptive test.'}</p>
                        <!-- +++ Updated status display +++ -->
                        <span class="test-status not-started">In Progress</span>
                    </div>
                    <a href="test.html?id=${testId}" class="btn btn-primary card-btn">Continue Test</a>
                `;
            } else {
                // --- Test is NOT STARTED ---
                card.classList.add('not-started');
                cardHTML = `
                    <div class="card-content">
                        <h4>${test.name || 'Unnamed Test'}</h4>
                        <p>${test.description || 'A full-length adaptive test.'}</p>
                        <span class="test-status not-started">Not Started</span>
                    </div>
                    <a href="test.html?id=${testId}" class="btn btn-primary card-btn">Start Test</a>
                `;
            }
            
            card.innerHTML = cardHTML;
            testGrid.appendChild(card);
        });

    } catch (error) {
        console.error("Error fetching tests for student dashboard:", error);
        testGrid.innerHTML = '<p>Could not load tests due to an error. Please try refreshing the page.</p>';
    }
}