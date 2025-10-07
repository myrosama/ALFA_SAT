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
    // Add this entire function to js/main.js

/**
 * NINJA STRIKE: This is the core function for the dynamic dashboard.
 * It fetches all documents from the 'tests' collection in Firestore
 * and dynamically creates the test cards on the student dashboard.
 */
async function populateDashboard() {
    const testGrid = document.getElementById('test-grid-container');
    // Guard clause: If we're not on the dashboard page, do nothing.
    if (!testGrid) {
        return;
    }

    const db = firebase.firestore();
    try {
        const testsSnapshot = await db.collection('tests').get();
        
        if (testsSnapshot.empty) {
            testGrid.innerHTML = '<p>No practice tests are available at the moment. Please check back later.</p>';
            return;
        }

        // Clear the initial "Loading..." message
        testGrid.innerHTML = '';

        testsSnapshot.forEach(doc => {
            const test = doc.data();
            const testId = doc.id; // This is the unique ID like "pt3_2024"

            // Create the card element from scratch
            const card = document.createElement('div');
            card.classList.add('test-card');

            // Use the data from Firestore to populate the card's content.
            // Note the link (`href`) now includes the unique testId.
            card.innerHTML = `
                <div class="card-content">
                    <h4>${test.name || 'Unnamed Test'}</h4>
                    <p>A full-length adaptive test covering Reading, Writing, and Math.</p>
                    <span class="test-status not-started">Not Started</span>
                </div>
                <a href="test.html?id=${testId}" class="btn btn-primary card-btn">Start Test</a>
            `;
            
            testGrid.appendChild(card);
        });

    } catch (error) {
        console.error("Error fetching tests for dashboard:", error);
        testGrid.innerHTML = '<p>Could not load tests due to an error. Please try refreshing the page.</p>';
    }
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
    // --- TEST EDITOR PAGE LOGIC ---
    const editorPage = document.querySelector('.editor-main');
    if (editorPage) {
        // Get the test ID from the URL
        const urlParams = new URLSearchParams(window.location.search);
        const testId = urlParams.get('id');

        if (!testId) {
            // If no ID is provided, send them back to the admin page
            window.location.href = 'admin.html';
        }

        // --- Fetch and display the test name ---
        const testEditorTitle = document.getElementById('test-editor-title');
        db.collection('tests').doc(testId).get().then(doc => {
            if (doc.exists) {
                testEditorTitle.textContent = doc.data().name;
            } else {
                alert('Test not found!');
                window.location.href = 'admin.html';
            }
        });

        // +++ ADD THIS NEW CODE BELOW THE EXISTING EDITOR LOGIC +++

        const addQuestionBtn = document.getElementById('add-question-btn');
        const editorContainer = document.getElementById('question-editor-container');
        const editorTemplate = document.getElementById('question-editor-template');
        const questionEditorTitle = document.getElementById('question-editor-title');

        addQuestionBtn.addEventListener('click', () => {
            // Clone the template content
            const formClone = editorTemplate.content.cloneNode(true);
            
            // Clear the editor and append the new form
            editorContainer.innerHTML = '';
            editorContainer.appendChild(formClone);
            questionEditorTitle.textContent = "Create New Question";

            // Add logic for the new cancel button inside the form
            const cancelQuestionBtn = editorContainer.querySelector('#cancel-question-btn');
            cancelQuestionBtn.addEventListener('click', () => {
                editorContainer.innerHTML = ''; // Clear the form
                // Restore the placeholder
                editorContainer.innerHTML = `
                    <div id="editor-placeholder">
                        <i class="fa-solid fa-file-circle-plus"></i>
                        <p>Add a new question to get started</p>
                    </div>`;
                questionEditorTitle.textContent = "Select a question or add a new one";
            });
        });

        // (Code to SAVE the question will go here next)
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
    // ... (The working createTestForm submit logic is here) ...

// +++ PASTE THIS CORRECTED BLOCK +++

        // --- DISPLAY TESTS FROM DATABASE --- //
        const testListContainer = document.getElementById('admin-test-list');

        db.collection('tests').orderBy('createdAt', 'desc').get().then(snapshot => {
            if (snapshot.empty) {
                testListContainer.innerHTML = "<p>No tests found. Create one to get started!</p>";
                return;
            }

            let html = '';
            snapshot.forEach(doc => {
                const test = doc.data();
                const testId = doc.id;

                html += `
                    <div class="test-item-admin" data-id="${testId}">
                        <div class="test-info">
                            <h4>${test.name}</h4>
                            <span>ID: ${testId}</span>
                        </div>
                        <div class="test-actions">
                            <a href="edit-test.html?id=${testId}" class="btn-icon" title="Edit Questions"><i class="fa-solid fa-pen-to-square"></i></a>
                            <button class="btn-icon" title="Generate Proctored Code"><i class="fa-solid fa-barcode"></i></button>
                            <button class="btn-icon danger" title="Delete Test"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                `;
            });
            testListContainer.innerHTML = html;
        }).catch(err => {
            console.error("Error fetching tests:", err);
            testListContainer.innerHTML = "<p>Error loading tests. Please try again.</p>";
        });

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
// In js/main.js, find and modify this block

firebase.auth().onAuthStateChanged(user => {
    const protectedPages = ['dashboard.html', 'admin.html', 'edit-test.html', 'test.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (user) {
        // User is logged in
        
        // NINJA MODIFICATION: Call our new dashboard function!
        // We check if the current page is the dashboard before running it.
        if (currentPage === 'dashboard.html') {
            populateDashboard();
        }

        // Existing Logout Button Logic
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                firebase.auth().signOut();
            });
        }
    } else {
        // User is not logged in
        if (protectedPages.includes(currentPage)) {
            window.location.href = 'index.html';
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