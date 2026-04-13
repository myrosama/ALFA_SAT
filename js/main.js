// js/main.js - Core Logic & AI Agent for PDF Import
// FIXED: Strict rules for Question Ordering ( Page N = Question N ).
// FIXED: Strict rules for EBRW (No Math) vs Math (KaTeX).
// FIXED: Added Custom Prompt support.
// UPDATED: Multi-admin personal dashboards with role-based test categorization.

let auth;
let db;
let currentAdminRole = null; // 'real_exam_admin' or 'premium_admin'

document.addEventListener('DOMContentLoaded', () => {

    // --- Core Firebase Initialization ---
    try {
        auth = firebase.auth();
        db = firebase.firestore();
    } catch (error) {
        console.error("Firebase failed to initialize:", error);
        document.body.innerHTML = "Error initializing application. Please check console.";
        return;
    }

    // --- GENERAL MODAL ELEMENTS ---
    const adminModalBackdrop = document.getElementById('modal-backdrop');
    const createTestModal = document.getElementById('create-test-modal');
    const accessModal = document.getElementById('access-modal');
    const proctorCodeModal = document.getElementById('proctor-code-modal');


    // --- LOGIN & SIGNUP LOGIC ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const errorDiv = document.getElementById('login-error');
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (errorDiv) errorDiv.classList.remove('visible');

            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;

            const submitBtn = loginForm.querySelector('button[type="submit"]');
            if (window.btnLoading) btnLoading(submitBtn, true);
            auth.signInWithEmailAndPassword(email, password)
                .then(cred => {
                    (window.navigateTo ? window.navigateTo('dashboard.html') : window.location.href = 'dashboard.html');
                })
                .catch(err => {
                    console.error("Login Error:", err.code, err.message);
                    let message = 'An error occurred. Please try again.';
                    if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                        message = 'Incorrect email or password.';
                    }
                    if (errorDiv) {
                        errorDiv.textContent = message;
                        errorDiv.classList.add('visible');
                    }
                    if (window.btnLoading) btnLoading(submitBtn, false);
                });
        });
    }

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        const errorDiv = document.getElementById('signup-error');

        // +++ Referral: Check for ?ref= parameter +++
        const urlParams = new URLSearchParams(window.location.search);
        const referrerUid = urlParams.get('ref');
        if (referrerUid) {
            const referralNotice = document.getElementById('referral-notice');
            const referrerNameEl = document.getElementById('referrer-name');
            if (referralNotice && referrerNameEl) {
                // Show notice immediately with generic text
                referrerNameEl.textContent = 'a friend';
                referralNotice.style.display = 'flex';

                // Try to fetch referrer's actual name (may fail if rules block unauthenticated reads)
                db.collection('users').doc(referrerUid).get().then(doc => {
                    if (doc.exists && doc.data().fullName) {
                        referrerNameEl.textContent = doc.data().fullName;
                    }
                }).catch(() => { /* Keep generic name if lookup fails */ });
            }
        }
        // +++ End referral check +++

        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (errorDiv) errorDiv.classList.remove('visible');

            const name = signupForm['signup-name'].value;
            const email = signupForm['signup-email'].value;
            const password = signupForm['signup-password'].value;

            const submitBtn = signupForm.querySelector('button[type="submit"]');
            if (window.btnLoading) btnLoading(submitBtn, true);
            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    const userData = {
                        fullName: name,
                        email: email,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    // +++ Store referral if present +++
                    if (referrerUid) {
                        userData.referredBy = referrerUid;
                    }
                    return db.collection('users').doc(cred.user.uid).set(userData).then(() => {
                        return cred.user.updateProfile({ displayName: name });
                    });
                })
                .then(() => {
                    if (window.showToast) window.showToast('Account created! Please log in.', 'success'); else alert('Account created! Please log in.');
                    (window.navigateTo ? window.navigateTo('index.html') : window.location.href = 'index.html');
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
                        errorDiv.classList.add('visible');
                    }
                    if (window.btnLoading) btnLoading(submitBtn, false);
                });
        });
    }

    const adminLoginForm = document.getElementById('admin-login-form');
    if (adminLoginForm) {
        const errorDiv = document.getElementById('admin-login-error');
        adminLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (errorDiv) errorDiv.classList.remove('visible');

            const email = adminLoginForm['admin-email'].value;
            const password = adminLoginForm['admin-password'].value;

            const submitBtn = adminLoginForm.querySelector('button[type="submit"]');
            if (window.btnLoading) btnLoading(submitBtn, true);
            auth.signInWithEmailAndPassword(email, password)
                .then(userCredential => {
                    const user = userCredential.user;
                    return db.collection('admins').doc(user.uid).get();
                })
                .then(doc => {
                    if (doc.exists) {
                        (window.navigateTo ? window.navigateTo('admin.html') : window.location.href = 'admin.html');
                    } else {
                        auth.signOut();
                        if (errorDiv) {
                            errorDiv.textContent = 'Access Denied. Not an admin account.';
                            errorDiv.classList.add('visible');
                        }
                        if (window.btnLoading) btnLoading(submitBtn, false);
                    }
                })
                .catch(err => {
                    console.error("Admin Login Error:", err.code, err.message);
                    if (errorDiv) {
                        errorDiv.textContent = 'Invalid admin credentials.';
                        errorDiv.classList.add('visible');
                    }
                    if (window.btnLoading) btnLoading(submitBtn, false);
                });
        });
    }

    // --- ADMIN PANEL "CREATE TEST" MODAL LOGIC (Manual/PDF Creation) ---
    const createTestBtn = document.getElementById('create-new-test-btn');
    const createTestForm = document.getElementById('create-test-form');
    const cancelCreateTestBtn = document.getElementById('cancel-create-test');

    if (createTestBtn && createTestModal && cancelCreateTestBtn && createTestForm) {
        const openModal = (modalEl) => {
            if (!modalEl) return;
            modalEl.style.display = 'block';
            adminModalBackdrop.style.display = 'block';
            setTimeout(() => {
                modalEl.classList.add('visible');
                adminModalBackdrop.classList.add('visible');
            }, 10);
        };

        const closeModal = (modalEl) => {
            if (!modalEl) return;
            modalEl.classList.remove('visible');
            adminModalBackdrop.classList.remove('visible');
            setTimeout(() => { modalEl.style.display = 'none'; }, 300);
        };

        createTestBtn.addEventListener('click', () => openModal(createTestModal));
        cancelCreateTestBtn.addEventListener('click', () => closeModal(createTestModal));

        const startManualBtn = document.getElementById('start-manual-creation');
        if (startManualBtn) {
            startManualBtn.addEventListener('click', (e) => {
                e.preventDefault();
                createTestForm.dispatchEvent(new Event('submit'));
            });
        }

        createTestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const testName = createTestForm['test-name'].value;
            const testId = createTestForm['test-id'].value;

            if (!testName || !testId || !/^[a-z0-9_]+$/.test(testId)) {
                alert("Please provide a valid name and ID (lowercase letters, numbers, underscores only).");
                return;
            }

            const testCategory = currentAdminRole === 'real_exam_admin' ? 'real_exam' : 'premium';
            db.collection('tests').doc(testId).set({
                name: testName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                visibility: 'hide',
                whitelist: [],
                createdBy: auth.currentUser?.uid || '',
                testCategory: testCategory
            }).then(() => {
                console.log('Test created successfully!');
                closeModal(createTestModal);
                if (window.showToast) window.showToast('Test created successfully!', 'success'); else alert('Test created successfully!');
                (window.smoothReload ? window.smoothReload() : window.location.reload());
            }).catch(err => {
                console.error("Error creating test:", err);
                alert("Error creating test: " + err.message);
            });
        });

        // Listener to switch to PDF modal
        const openPdfModalBtn = document.getElementById('open-pdf-import-modal');
        const pdfImportModal = document.getElementById('pdf-import-modal');

        if (openPdfModalBtn && pdfImportModal) {
            openPdfModalBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeModal(createTestModal);
                setTimeout(() => openModal(pdfImportModal), 300);
            });
        }
    }


    // NOTE: Full PDF Import Agent was removed. Use module-uploader.js for PDF uploads instead.
    // --- ADMIN TEST DISPLAY FUNCTION ---
    async function displayAdminTests(userId) {
        const testListContainerAdmin = document.getElementById('admin-test-list');
        if (!testListContainerAdmin) return;

        testListContainerAdmin.innerHTML = '<p>Loading tests...</p>';

        try {
            // Fetch ALL tests, then client-side filter:
            // Show tests owned by this admin OR legacy tests with no createdBy field
            const snapshot = await db.collection('tests').orderBy('createdAt', 'desc').get();

            const myTests = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const owner = data.createdBy || '';
                // Show if: this admin owns it, OR it's unclaimed (legacy)
                if (owner === userId || !owner) {
                    myTests.push({ id: doc.id, ...data });
                }
            });

            if (myTests.length === 0) {
                testListContainerAdmin.innerHTML = "<p>No tests found. Create one to get started!</p>";
                return;
            }

            // Sort tests by name (e.g., '2025 Nov' before '2024 Aug'), falling back to createdAt
            myTests.sort((a, b) => {
                const nameA = a.name || "";
                const nameB = b.name || "";
                if (nameA > nameB) return -1;
                if (nameA < nameB) return 1;
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });

            let html = '';
            myTests.forEach(test => {
                const testId = test.id;
                const isLegacy = !test.createdBy;

                let statusTag = '';
                switch (test.visibility) {
                    case 'public':
                        statusTag = '<span class="test-status-tag public">Public</span>';
                        break;
                    case 'private':
                        statusTag = `<span class="test-status-tag private">Private (${test.whitelist?.length || 0})</span>`;
                        break;
                    default:
                        statusTag = '<span class="test-status-tag hide">Hidden</span>';
                }

                // Show a small label for unclaimed legacy tests
                const legacyLabel = isLegacy ? ' <span style="font-size:0.7rem; color:#e67e22; font-weight:600;">(legacy)</span>' : '';

                html += `
                    <div class="test-item-admin" data-id="${testId}">
                        <div class="test-info">
                            ${statusTag}
                            <div>
                                <h4>${test.name || 'Unnamed Test'}${legacyLabel}</h4>
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

            // If any legacy tests (no createdBy), show a claim banner
            const legacyTests = myTests.filter(t => !t.createdBy);
            if (legacyTests.length > 0) {
                const banner = document.createElement('div');
                banner.style.cssText = 'background:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:12px 16px; margin-bottom:15px; display:flex; align-items:center; justify-content:space-between; gap:10px;';
                banner.innerHTML = `
                    <span style="font-size:0.9rem; color:#856404;">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong>${legacyTests.length}</strong> test(s) don't have an owner yet.
                    </span>
                    <button id="claim-legacy-btn" class="btn btn-primary" style="margin:0; padding:6px 14px; font-size:0.85rem;">
                        <i class="fa-solid fa-hand-pointer"></i> Claim All
                    </button>
                `;
                testListContainerAdmin.insertBefore(banner, testListContainerAdmin.firstChild);

                document.getElementById('claim-legacy-btn').addEventListener('click', async () => {
                    if (!confirm(`Assign all ${legacyTests.length} unclaimed test(s) to your account?`)) return;
                    const category = currentAdminRole === 'real_exam_admin' ? 'real_exam' : 'premium';
                    try {
                        const batch = db.batch();
                        legacyTests.forEach(t => {
                            batch.update(db.collection('tests').doc(t.id), {
                                createdBy: userId,
                                testCategory: category
                            });
                        });
                        await batch.commit();
                        alert(`Done! ${legacyTests.length} test(s) claimed.`);
                        (window.smoothReload ? window.smoothReload() : window.location.reload());
                    } catch (err) {
                        alert('Error: ' + err.message);
                    }
                });
            }

            // --- Add event listeners for new buttons ---
            testListContainerAdmin.addEventListener('click', async (e) => {

                // 1. DELETE BUTTON
                const deleteButton = e.target.closest('.delete-test-btn');
                if (deleteButton) {
                    const testIdToDelete = deleteButton.dataset.testid;
                    const testNameToDelete = deleteButton.dataset.testname;
                    if (confirm(`Are you sure you want to delete the test "${testNameToDelete}" (${testIdToDelete})? This cannot be undone.`)) {
                        try {
                            // Delete main document
                            await db.collection('tests').doc(testIdToDelete).delete();
                            alert('Test deleted successfully.');
                            (window.smoothReload ? window.smoothReload() : window.location.reload());
                        } catch (err) {
                            console.error("Delete failed:", err);
                            alert("Failed to delete test.");
                        }
                    }
                }

                // 2. PROCTOR CODE BUTTON - Check for existing active session first
                const generateCodeButton = e.target.closest('.generate-code-btn');
                if (generateCodeButton && proctorCodeModal) {
                    const testIdForCode = generateCodeButton.dataset.testid;
                    currentProctorTestId = testIdForCode;

                    // Show modal with loading state
                    const activeSection = document.getElementById('proctor-active-section');
                    const generateSection = document.getElementById('proctor-generate-section');
                    const historyList = document.getElementById('proctor-history-list');

                    if (activeSection) activeSection.style.display = 'none';
                    if (generateSection) generateSection.style.display = 'none';
                    if (historyList) historyList.innerHTML = '<p style="color: var(--dark-gray); font-size: 0.85rem;">Loading...</p>';

                    proctorCodeModal.classList.add('visible');
                    adminModalBackdrop.classList.add('visible');

                    try {
                        // Check for an existing ACTIVE session for this test
                        const activeSessionQuery = await db.collection('proctoredSessions')
                            .where('testId', '==', testIdForCode)
                            .where('status', '==', 'active')
                            .limit(1)
                            .get();

                        if (!activeSessionQuery.empty) {
                            // Active session exists — show it
                            const sessionDoc = activeSessionQuery.docs[0];
                            const code = sessionDoc.id;
                            const data = sessionDoc.data();
                            currentProctorCode = code;
                            showActiveProctorSession(code, data.testName || 'Unknown Test', 'active');
                        } else {
                            // No active session — show generate button
                            if (activeSection) activeSection.style.display = 'none';
                            if (generateSection) generateSection.style.display = 'block';
                        }

                        // Load past (revoked) sessions
                        loadPastSessions(testIdForCode);

                    } catch (err) {
                        console.error("Error checking proctor sessions:", err);
                        if (generateSection) generateSection.style.display = 'block';
                    }
                }

                // 3. ACCESS BUTTON
                const accessButton = e.target.closest('.access-btn');
                if (accessButton && accessModal) {
                    currentEditingTestId = accessButton.dataset.testid; // Use global var

                    // Fetch test data
                    db.collection('tests').doc(currentEditingTestId).get().then(doc => {
                        if (!doc.exists) return alert("Test not found!");
                        const testData = doc.data();

                        const title = document.getElementById('access-modal-title');
                        const select = document.getElementById('test-visibility');
                        const text = document.getElementById('test-whitelist');

                        if (title) title.textContent = `Manage Access: ${testData.name}`;
                        if (select) select.value = testData.visibility || 'hide';
                        if (text) text.value = (testData.whitelist || []).join('\n');

                        if (select) select.dispatchEvent(new Event('change')); // Trigger toggle logic

                        accessModal.classList.add('visible');
                        adminModalBackdrop.classList.add('visible');
                    });
                }

            });

        } catch (error) {
            console.error("Error fetching admin tests:", error);
            testListContainerAdmin.innerHTML = `<p style="color: var(--error-red);">Error loading tests. Check console for permissions. ${error.message}</p>`;
        }
    }

    // --- ACCESS MODAL HANDLERS ---
    const saveAccessBtn = document.getElementById('save-access-btn');
    const cancelAccessBtn = document.getElementById('cancel-access');
    const accessForm = document.getElementById('access-form');
    const visibilitySelect = document.getElementById('test-visibility');
    const whitelistContainer = document.getElementById('whitelist-container');
    const whitelistTextarea = document.getElementById('test-whitelist');
    const accessErrorMsg = document.getElementById('access-error-msg');

    let currentEditingTestId = null;

    if (accessForm && saveAccessBtn) {
        visibilitySelect?.addEventListener('change', () => {
            whitelistContainer?.classList.toggle('visible', visibilitySelect.value === 'private');
        });

        const closeAccessModal = () => {
            accessModal?.classList.remove('visible');
            if (!createTestModal.classList.contains('visible') && !proctorCodeModal.classList.contains('visible')) {
                adminModalBackdrop?.classList.remove('visible');
            }
            accessForm.reset();
            currentEditingTestId = null;
        };

        cancelAccessBtn?.addEventListener('click', closeAccessModal);

        accessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentEditingTestId) return;

            saveAccessBtn.disabled = true;
            saveAccessBtn.textContent = 'Saving...';

            const visibility = visibilitySelect.value;
            const whitelist = whitelistTextarea.value.split('\n').map(id => id.trim()).filter(id => id.length > 0);

            db.collection('tests').doc(currentEditingTestId).update({
                visibility: visibility,
                whitelist: whitelist
            }).then(() => {
                console.log(`Access updated for ${currentEditingTestId}`);
                closeAccessModal();
                (window.smoothReload ? window.smoothReload() : window.location.reload());
            }).catch(err => {
                console.error("Error updating access:", err);
                if (accessErrorMsg) {
                    accessErrorMsg.textContent = `Error: ${err.message}`;
                    accessErrorMsg.classList.add('visible');
                }
                saveAccessBtn.disabled = false;
                saveAccessBtn.textContent = 'Save Access';
            });
        });
    }

    // --- PROCTOR MODAL HANDLERS ---
    const closeProctorBtn = document.getElementById('close-proctor-modal');
    const copyProctorCodeBtn = document.getElementById('copy-proctor-code-btn');
    const viewSessionBtn = document.getElementById('view-session-btn');
    const revokeProctorBtn = document.getElementById('revoke-proctor-btn');
    const generateNewCodeBtn = document.getElementById('generate-new-code-btn');

    // Track the current proctor code & test for button actions
    let currentProctorCode = null;
    let currentProctorTestId = null;

    /** Shows the active session UI with given code and test name */
    function showActiveProctorSession(code, testNameStr, status) {
        const activeSection = document.getElementById('proctor-active-section');
        const generateSection = document.getElementById('proctor-generate-section');
        const statusBadge = document.getElementById('proctor-status-badge');
        const statusText = document.getElementById('proctor-status-text');

        if (activeSection) activeSection.style.display = 'block';
        if (generateSection) generateSection.style.display = 'none';

        document.getElementById('proctor-code-display').innerHTML = `<span>${code.slice(0, 3)}-${code.slice(3)}</span>`;
        document.getElementById('proctor-test-name').textContent = testNameStr;
        currentProctorCode = code;

        if (statusBadge) {
            statusBadge.className = `proctor-status-badge ${status}`;
        }
        if (statusText) {
            statusText.textContent = status === 'active' ? 'Active' : 'Revoked';
        }
        if (revokeProctorBtn) {
            revokeProctorBtn.style.display = status === 'active' ? 'flex' : 'none';
        }
    }

    /** Loads past (revoked) sessions for a test into the history list */
    async function loadPastSessions(testIdForHistory) {
        const historyList = document.getElementById('proctor-history-list');
        if (!historyList) return;

        try {
            const sessionsQuery = await db.collection('proctoredSessions')
                .where('testId', '==', testIdForHistory)
                .where('status', '==', 'revoked')
                .orderBy('createdAt', 'desc')
                .limit(10)
                .get();

            if (sessionsQuery.empty) {
                historyList.innerHTML = '<p style="color: var(--dark-gray); font-size: 0.85rem;">No past sessions yet.</p>';
                return;
            }

            let html = '';
            sessionsQuery.forEach(doc => {
                const data = doc.data();
                const code = doc.id;
                const formattedCode = code.slice(0, 3) + '-' + code.slice(3);
                const createdDate = data.createdAt?.toDate();
                const dateStr = createdDate ? createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

                html += `
                    <div class="past-session-item" data-code="${code}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 6px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='var(--light-gray)'" onmouseout="this.style.background='white'">
                        <div>
                            <strong style="font-family: monospace; letter-spacing: 2px;">${formattedCode}</strong>
                            <div style="font-size: 0.75rem; color: var(--dark-gray);">${dateStr}</div>
                        </div>
                        <i class="fa-solid fa-arrow-right" style="color: var(--dark-gray);"></i>
                    </div>`;
            });
            historyList.innerHTML = html;

            // Add click handlers for past sessions
            historyList.querySelectorAll('.past-session-item').forEach(item => {
                item.addEventListener('click', () => {
                    const code = item.dataset.code;
                    window.open(`proctor-session.html?code=${code}`, '_blank');
                });
            });
        } catch (err) {
            console.error('Error loading past sessions:', err);
            historyList.innerHTML = '<p style="color: var(--error-red); font-size: 0.85rem;">Error loading history.</p>';
        }
    }

    // Close modal
    if (closeProctorBtn) {
        closeProctorBtn.addEventListener('click', () => {
            proctorCodeModal.classList.remove('visible');
            if (!createTestModal.classList.contains('visible') && !accessModal.classList.contains('visible')) {
                adminModalBackdrop.classList.remove('visible');
            }
        });
    }

    // Generate New Code
    if (generateNewCodeBtn) {
        generateNewCodeBtn.addEventListener('click', async () => {
            if (!currentProctorTestId) return;
            generateNewCodeBtn.disabled = true;
            generateNewCodeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

            try {
                const code = generateProctorCode(6);
                const testDoc = await db.collection('tests').doc(currentProctorTestId).get();
                const testNameStr = testDoc.exists ? testDoc.data().name : "Unknown Test";

                await db.collection('proctoredSessions').doc(code).set({
                    testId: currentProctorTestId,
                    testName: testNameStr,
                    adminId: auth.currentUser?.uid || '',
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                showActiveProctorSession(code, testNameStr, 'active');
            } catch (err) {
                console.error("Error generating proctor code:", err);
                alert("Error generating code: " + err.message);
            }
            generateNewCodeBtn.disabled = false;
            generateNewCodeBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Generate New Code';
        });
    }

    // Revoke Code
    if (revokeProctorBtn) {
        revokeProctorBtn.addEventListener('click', async () => {
            if (!currentProctorCode) return;
            if (!confirm('Revoke this code? Students will no longer be able to use it.')) return;

            revokeProctorBtn.disabled = true;
            revokeProctorBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Revoking...';

            try {
                await db.collection('proctoredSessions').doc(currentProctorCode).update({
                    status: 'revoked',
                    revokedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Refresh the modal
                const activeSection = document.getElementById('proctor-active-section');
                const generateSection = document.getElementById('proctor-generate-section');
                if (activeSection) activeSection.style.display = 'none';
                if (generateSection) generateSection.style.display = 'block';
                currentProctorCode = null;

                // Reload history
                if (currentProctorTestId) loadPastSessions(currentProctorTestId);
            } catch (err) {
                console.error("Error revoking code:", err);
                alert("Error revoking code: " + err.message);
            }
            revokeProctorBtn.disabled = false;
            revokeProctorBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Revoke Code';
        });
    }

    // Copy Code
    if (copyProctorCodeBtn) {
        copyProctorCodeBtn.addEventListener('click', () => {
            if (currentProctorCode) {
                const formattedCode = currentProctorCode.slice(0, 3) + '-' + currentProctorCode.slice(3);
                navigator.clipboard.writeText(formattedCode).then(() => {
                    copyProctorCodeBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    setTimeout(() => {
                        copyProctorCodeBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Code';
                    }, 2000);
                }).catch(() => {
                    const temp = document.createElement('textarea');
                    temp.value = formattedCode;
                    document.body.appendChild(temp);
                    temp.select();
                    document.execCommand('copy');
                    document.body.removeChild(temp);
                    copyProctorCodeBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    setTimeout(() => {
                        copyProctorCodeBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Code';
                    }, 2000);
                });
            }
        });
    }

    // View Session
    if (viewSessionBtn) {
        viewSessionBtn.addEventListener('click', () => {
            if (currentProctorCode) {
                window.open(`proctor-session.html?code=${currentProctorCode}`, '_blank');
            }
        });
    }
    // --- LOGOUT & PAGE PROTECTION ---
    auth.onAuthStateChanged(async (user) => {
        const protectedPages = ['dashboard.html', 'admin.html', 'edit-test.html', 'test.html', 'review.html', 'results.html'];
        const currentPage = window.location.pathname.split('/').pop();

        if (user) {

            // +++ CRITICAL FIX: Run test display only AFTER auth +++
            if (currentPage === 'admin.html') {
                const adminDoc = await db.collection('admins').doc(user.uid).get();
                if (adminDoc.exists) {
                    currentAdminRole = adminDoc.data().role || 'premium_admin';
                    // Show role badge in admin header
                    const roleBadge = document.getElementById('admin-role-badge');
                    if (roleBadge) {
                        const roleLabel = currentAdminRole === 'real_exam_admin' ? 'Real Exam Manager' : 'Premium Manager';
                        const roleIcon = currentAdminRole === 'real_exam_admin' ? 'fa-file-lines' : 'fa-crown';
                        roleBadge.innerHTML = `<i class="fa-solid ${roleIcon}"></i> ${roleLabel}`;
                        roleBadge.style.display = 'inline-flex';
                    }
                    displayAdminTests(user.uid);
                } else {
                    auth.signOut();
                    return;
                }
            }
            // --- End Admin Logic ---

            if (currentPage === 'dashboard.html') {
                populateDashboard(user.uid);
                const proctorCodeForm = document.getElementById('test-code-form');
                if (proctorCodeForm) {
                    proctorCodeForm.addEventListener('submit', handleProctorCodeSubmit);
                }
            }

            // --- Profile Menu Logic ---
            setupProfileMenu(user);

            // --- Global Logout Logic ---
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn && !logoutBtn.dataset.listenerAdded) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    auth.signOut().then(() => { (window.navigateTo ? window.navigateTo('index.html') : window.location.href = 'index.html'); });
                });
                logoutBtn.dataset.listenerAdded = 'true';
            }

        } else {
            // User is NOT logged in
            if (protectedPages.includes(currentPage)) {
                (window.navigateTo ? window.navigateTo('index.html') : window.location.href = 'index.html');
            }
        }
    });

    // --- PROCTOR CODE HELPERS ---
    function generateProctorCode(length) {
        const chars = '0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async function handleProctorCodeSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const input = form.querySelector('.test-code-input');
        const button = form.querySelector('button[type="submit"]');

        if (!input || !button) return;

        // Strip all non-digit characters (dashes, spaces, etc.)
        const code = input.value.trim().replace(/\D/g, '');

        if (code.length !== 6) {
            alert("Please enter a 6-digit code.");
            return;
        }

        button.disabled = true;
        button.textContent = "Checking...";

        try {
            const sessionRef = db.collection('proctoredSessions').doc(code);
            const doc = await sessionRef.get();

            if (doc.exists) {
                const sessionData = doc.data();
                const testId = sessionData.testId;

                // Check if session is active (not revoked)
                if (sessionData.status === 'revoked') {
                    alert("This session code has been revoked by the administrator.");
                    button.disabled = false;
                    button.textContent = "Start Proctored Test";
                    return;
                }

                if (testId) {
                    (window.navigateTo ? window.navigateTo(`test.html?id=${testId}&proctorCode=${code}`) : window.location.href = `test.html?id=${testId}&proctorCode=${code}`);
                } else {
                    alert("Error: Test not found.");
                    button.disabled = false;
                    button.textContent = "Start Proctored Test";
                }
            } else {
                alert("Invalid code.");
                button.disabled = false;
                button.textContent = "Start Proctored Test";
            }
        } catch (err) {
            console.error("Error checking code:", err);
            alert("An error occurred.");
            button.disabled = false;
            button.textContent = "Start Proctored Test";
        }
    }

    function setupProfileMenu(user) {
        const profileBtn = document.getElementById('profile-btn');
        const profileMenu = document.getElementById('profile-menu');
        const userIdDisplay = document.getElementById('user-id-display');
        const copyUidBtn = document.getElementById('copy-uid-btn');
        const profileLogoutBtn = document.getElementById('profile-logout-btn');

        if (profileBtn && profileMenu && userIdDisplay && copyUidBtn && profileLogoutBtn) {
            userIdDisplay.value = user.uid;

            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profileMenu.classList.toggle('visible');
            });

            copyUidBtn.addEventListener('click', () => {
                userIdDisplay.select();
                document.execCommand('copy');
                copyUidBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => { copyUidBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
            });

            // +++ Referral link setup +++
            const referralLinkDisplay = document.getElementById('referral-link-display');
            const copyReferralBtn = document.getElementById('copy-referral-btn');
            const referralCountDisplay = document.getElementById('referral-count-display');

            if (referralLinkDisplay) {
                const baseUrl = window.location.origin || 'https://alfasat.uz';
                referralLinkDisplay.value = baseUrl + '/signup.html?ref=' + user.uid;
            }

            if (copyReferralBtn && referralLinkDisplay) {
                copyReferralBtn.addEventListener('click', () => {
                    referralLinkDisplay.select();
                    document.execCommand('copy');
                    copyReferralBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    setTimeout(() => { copyReferralBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
                });
            }

            // Load referral count from referrals collection (reliable source)
            if (referralCountDisplay) {
                db.collection('referrals')
                    .where('referrerId', '==', user.uid)
                    .get()
                    .then(snap => {
                        const count = snap.size;
                        referralCountDisplay.textContent = `Referred: ${count} / 5 students`;
                        if (count >= 5) {
                            referralCountDisplay.textContent = `✅ Referral reward unlocked! (${count} students)`;
                            referralCountDisplay.style.color = '#0d6832';
                        }
                    })
                    .catch(err => {
                        console.warn('Could not load referral count:', err);
                        // Fallback: try from user doc
                        db.collection('users').doc(user.uid).get().then(doc => {
                            if (doc.exists) {
                                const count = doc.data().referralCount || 0;
                                referralCountDisplay.textContent = `Referred: ${count} / 5 students`;
                            }
                        }).catch(() => {});
                    });
            }
            // +++ End referral link setup +++

            profileLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                auth.signOut().then(() => { (window.navigateTo ? window.navigateTo('index.html') : window.location.href = 'index.html'); });
            });
        }

        document.addEventListener('click', (e) => {
            if (profileMenu && profileMenu.classList.contains('visible') && !e.target.closest('.profile-nav')) {
                profileMenu.classList.remove('visible');
            }
        });
    }

    // --- DASHBOARD POPULATION (Sectioned Layout) ---
    async function populateDashboard(userId) {
        const loadingContainer = document.getElementById('loading-container');
        const finishedSection = document.getElementById('finished-section');
        const inProgressSection = document.getElementById('in-progress-section');
        const realExamSection = document.getElementById('real-exam-section');
        const premiumSection = document.getElementById('premium-section');
        const otherSection = document.getElementById('other-section');

        const finishedGrid = document.getElementById('finished-grid');
        const inProgressGrid = document.getElementById('in-progress-grid');
        const realExamGrid = document.getElementById('real-exam-grid');
        const premiumGrid = document.getElementById('premium-grid');
        const otherGrid = document.getElementById('other-grid');

        if (!loadingContainer) return;
        if (!db) {
            loadingContainer.innerHTML = '<p>Error: Could not connect to the database.</p>';
            return;
        }

        try {
            // 1. Get completed tests map
            const completedTestsMap = new Map();
            const completedSnapshot = await db.collection('users').doc(userId).collection('completedTests').get();
            completedSnapshot.forEach(doc => {
                completedTestsMap.set(doc.id, doc.data());
            });

            // 2. Get all available tests (Public OR Whitelisted)
            const publicTestsQuery = db.collection('tests').where('visibility', '==', 'public');
            const privateTestsQuery = db.collection('tests').where('whitelist', 'array-contains', userId);

            const [publicSnapshot, privateSnapshot] = await Promise.all([
                publicTestsQuery.get(),
                privateTestsQuery.get()
            ]);

            const allAvailableTests = new Map();
            publicSnapshot.forEach(doc => {
                allAvailableTests.set(doc.id, { id: doc.id, ...doc.data() });
            });
            privateSnapshot.forEach(doc => {
                allAvailableTests.set(doc.id, { id: doc.id, ...doc.data() });
            });

            const testsArray = Array.from(allAvailableTests.values());
            // Sort tests by name (e.g., '2025 Nov' before '2024 Aug'), falling back to createdAt
            testsArray.sort((a, b) => {
                const nameA = a.name || "";
                const nameB = b.name || "";
                if (nameA > nameB) return -1;
                if (nameA < nameB) return 1;
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });

            // Hide loading container
            loadingContainer.style.display = 'none';

            // 3. Categorize tests into sections
            const finished = [];
            const inProgress = [];
            const realExamTests = [];
            const premiumTests = [];
            const otherTests = [];

            testsArray.forEach(test => {
                const testId = test.id;
                const completionData = completedTestsMap.get(testId);
                const inProgressKey = `inProgressTest_${userId}_${testId}`;
                const inProgressData = localStorage.getItem(inProgressKey);
                const category = test.testCategory || 'custom';

                const testObj = { test, completionData, inProgressData: !!inProgressData };

                if (completionData) {
                    finished.push({ test, completionData });
                } else {
                    if (category === 'real_exam') realExamTests.push(testObj);
                    else if (category === 'premium') premiumTests.push(testObj);
                    else otherTests.push(testObj);

                    if (inProgressData) {
                        inProgress.push(testObj);
                    }
                }
            });

            // Also add orphaned completed tests (from proctored sessions)
            let orphanedFinishedCount = 0;
            completedTestsMap.forEach((completionData, ctTestId) => {
                if (!allAvailableTests.has(ctTestId)) {
                    orphanedFinishedCount++;
                    finished.push({
                        test: { id: ctTestId, name: completionData.testName || 'Practice Test' },
                        completionData
                    });
                }
            });

            // Calculate Counts for Filter Badges
            const finalTotalTests = testsArray.length + orphanedFinishedCount;
            
            const countAllEl = document.getElementById('count-all');
            const countRealExamEl = document.getElementById('count-real-exam');
            const countPremiumEl = document.getElementById('count-premium');
            const countFinishedEl = document.getElementById('count-finished');

            if (countAllEl) countAllEl.textContent = finalTotalTests;
            if (countRealExamEl) countRealExamEl.textContent = realExamTests.length;
            if (countPremiumEl) countPremiumEl.textContent = premiumTests.length;
            if (countFinishedEl) countFinishedEl.textContent = finished.length;

            // Generic Card Builder
            function buildTestCard(testObj) {
                const { test, completionData, inProgressData } = testObj;
                const category = test.testCategory || 'custom';
                const isRealExam = category === 'real_exam';
                const isPremium = category === 'premium';
                
                const card = document.createElement('div');
                card.classList.add('test-card');
                card.dataset.category = category;
                
                if (isRealExam) card.classList.add('real-exam-card');
                if (isPremium) card.classList.add('premium-card');

                let badgeHtml = '';
                if (isRealExam) badgeHtml = `<span class="card-badge free-badge"><i class="fa-solid fa-gift"></i> FREE</span>`;
                if (isPremium) badgeHtml = `<span class="card-badge premium-badge"><i class="fa-solid fa-crown"></i> Premium</span>`;
                const badgesContainer = badgeHtml ? `<div class="card-badges">${badgeHtml}</div>` : '';

                if (completionData) {
                    card.classList.add('completed');
                    const isPending = completionData.proctorCode && completionData.scoringStatus !== 'published';
                    let dateStr = '';
                    if (completionData.completedAt) {
                        const d = completionData.completedAt.toDate ? completionData.completedAt.toDate() : new Date(completionData.completedAt);
                        dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                    }
                    
                    card.innerHTML = `
                        <div class="card-content">
                            ${badgesContainer}
                            <h4>${test.name || 'Unnamed Test'}</h4>
                            <p>${dateStr ? `Completed on ${dateStr}` : 'A full-length adaptive test.'}</p>
                            <div class="test-status ${isPending ? 'pending' : 'completed'}">
                                <i class="fa-solid ${isPending ? 'fa-clock' : 'fa-check-circle'}"></i>
                                ${isPending ? 'Results Pending' : `Finished - Score: <strong>${completionData.score || 'N/A'}</strong>`}
                            </div>
                        </div>
                        <a href="results.html?resultId=${completionData.resultId}" class="btn card-btn btn-view-results">${isPending ? 'View Status' : 'View Results'}</a>
                    `;
                } else if (inProgressData) {
                    card.classList.add('in-progress');
                    card.innerHTML = `
                        <div class="card-content">
                            ${badgesContainer}
                            <h4>${test.name || 'Unnamed Test'}</h4>
                            <p>${test.description || 'A full-length adaptive test.'}</p>
                            <span class="test-status not-started">In Progress</span>
                        </div>
                        <a href="test.html?id=${test.id}" class="btn btn-primary card-btn">Continue Test</a>
                    `;
                } else {
                    card.classList.add('not-started');
                    card.innerHTML = `
                        <div class="card-content">
                            ${badgesContainer}
                            <h4>${test.name || 'Unnamed Test'}</h4>
                            <p>${test.description || (isRealExam ? 'Real SAT exam questions for practice.' : isPremium ? 'AI-generated SAT-style questions.' : 'A full-length adaptive test.')}</p>
                            <span class="test-status not-started">Not Started</span>
                        </div>
                        <a href="test.html?id=${test.id}" class="btn btn-primary card-btn">Start Test</a>
                    `;
                }
                return card;
            }

            // --- IN PROGRESS ---
            if (inProgress.length > 0 && inProgressGrid) {
                inProgressSection.style.display = 'block';
                inProgress.forEach(testObj => inProgressGrid.appendChild(buildTestCard(testObj)));
            }

            // --- REAL EXAM TESTS ---
            if (realExamTests.length > 0 && realExamGrid) {
                realExamSection.style.display = 'block';
                realExamTests.forEach(testObj => realExamGrid.appendChild(buildTestCard(testObj)));
            }

            // --- PREMIUM TESTS ---
            if (premiumTests.length > 0 && premiumGrid) {
                premiumSection.style.display = 'block';
                premiumTests.forEach(testObj => premiumGrid.appendChild(buildTestCard(testObj)));
            }

            // --- OTHER/CUSTOM TESTS ---
            if (otherTests.length > 0 && otherGrid) {
                otherSection.style.display = 'block';
                otherTests.forEach(testObj => otherGrid.appendChild(buildTestCard(testObj)));
            }

            // --- FINISHED ---
            if (finished.length > 0 && finishedGrid) {
                finishedSection.style.display = 'block';
                // Sort finished tests by completion date (newest first)
                finished.sort((a, b) => {
                    const timeA = a.completionData.completedAt?.toDate ? a.completionData.completedAt.toDate().getTime() : (a.completionData.completedAt || 0);
                    const timeB = b.completionData.completedAt?.toDate ? b.completionData.completedAt.toDate().getTime() : (b.completionData.completedAt || 0);
                    return timeB - timeA;
                });
                finished.forEach(testObj => finishedGrid.appendChild(buildTestCard(testObj)));
            }

            // If no tests at all
            if (finalTotalTests === 0) {
                loadingContainer.style.display = 'block';
                loadingContainer.querySelector('.test-grid').innerHTML = '<p>No practice tests are available at the moment.</p>';
            }

            // 5. Setup filter tab listeners
            setupDashboardFilters();

        } catch (error) {
            console.error("Error fetching tests for student dashboard:", error);
            loadingContainer.innerHTML = '<p>Could not load tests due to an error. Please try refreshing the page.</p>';
        }
    }

    // --- DASHBOARD FILTER TABS ---
    function setupDashboardFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        if (!filterBtns.length) return;

        const sections = {
            finished: document.getElementById('finished-section'),
            inProgress: document.getElementById('in-progress-section'),
            realExam: document.getElementById('real-exam-section'),
            premium: document.getElementById('premium-section'),
            other: document.getElementById('other-section')
        };

        const hasContent = {
            finished: sections.finished && sections.finished.querySelector('.test-grid')?.children?.length > 0,
            inProgress: sections.inProgress && sections.inProgress.querySelector('.test-grid')?.children?.length > 0,
            realExam: sections.realExam && sections.realExam.querySelector('.test-grid')?.children?.length > 0,
            premium: sections.premium && sections.premium.querySelector('.test-grid')?.children?.length > 0,
            other: sections.other && sections.other.querySelector('.test-grid')?.children?.length > 0
        };

        function applyViewState(section, mode) {
            if (!section) return;
            const grid = section.querySelector('.test-grid');
            if (!grid) return;

            // Remove existing see-more container if any
            const existingSeeMore = section.querySelector('.see-more-container');
            if (existingSeeMore) existingSeeMore.remove();

            const cards = Array.from(grid.querySelectorAll('.test-card'));
            let visibleCards = [];

            if (mode === 'all') {
                // In generic grids under "All", hide completed ones.
                cards.forEach(card => {
                    if (card.classList.contains('completed')) {
                        card.style.display = 'none';
                        card.classList.add('filtered-out');
                    } else {
                        card.classList.remove('filtered-out');
                        visibleCards.push(card);
                    }
                });
                setupPagination(grid, visibleCards, 6);
            } else if (mode === 'all-finished') {
                // The finished grid under "All" limits to 3
                cards.forEach(card => {
                    card.classList.remove('filtered-out');
                    visibleCards.push(card);
                });
                setupPagination(grid, visibleCards, 3);
            } else if (mode === 'individual') {
                // Show absolutely everything in this grid without pagination
                cards.forEach(card => {
                    card.style.display = '';
                    card.classList.remove('filtered-out');
                });
            }
        }

        function setupPagination(grid, cardsArr, batchSize) {
            if (cardsArr.length <= batchSize) {
                cardsArr.forEach(c => c.style.display = '');
                return;
            }

            let currentlyVisible = batchSize;
            cardsArr.forEach((c, i) => {
                c.style.display = i < currentlyVisible ? '' : 'none';
            });

            const btnContainer = document.createElement('div');
            btnContainer.className = 'see-more-container';
            const seeMoreBtn = document.createElement('button');
            seeMoreBtn.className = 'btn btn-secondary see-more-btn';
            seeMoreBtn.innerHTML = `See More <i class="fa-solid fa-chevron-down"></i>`;
            btnContainer.appendChild(seeMoreBtn);
            
            grid.parentNode.insertBefore(btnContainer, grid.nextSibling);

            seeMoreBtn.addEventListener('click', () => {
                const nextLimit = currentlyVisible + batchSize;
                cardsArr.forEach((card, i) => {
                    if (i >= currentlyVisible && i < nextLimit) {
                        card.style.display = '';
                        card.style.animation = 'fadeInUp 0.3s ease forwards';
                    }
                });
                currentlyVisible = nextLimit;
                if (currentlyVisible >= cardsArr.length) {
                    btnContainer.remove();
                }
            });
        }

        function updateDashboardView(filter) {
            // Hide all sections initially
            Object.values(sections).forEach(el => {
                if (el) el.style.display = 'none';
            });

            if (filter === 'all') {
                if (hasContent.inProgress) sections.inProgress.style.display = 'block';
                if (hasContent.realExam) {
                    sections.realExam.style.display = 'block';
                    applyViewState(sections.realExam, 'all');
                    // Hide section entirely if no non-completed cards exist
                    const visibleCards = sections.realExam.querySelectorAll('.test-card:not(.filtered-out)');
                    if (visibleCards.length === 0) sections.realExam.style.display = 'none';
                }
                if (hasContent.premium) {
                    sections.premium.style.display = 'block';
                    applyViewState(sections.premium, 'all');
                    const visibleCards = sections.premium.querySelectorAll('.test-card:not(.filtered-out)');
                    if (visibleCards.length === 0) sections.premium.style.display = 'none';
                }
                if (hasContent.other) {
                    sections.other.style.display = 'block';
                    applyViewState(sections.other, 'all');
                    const visibleCards = sections.other.querySelectorAll('.test-card:not(.filtered-out)');
                    if (visibleCards.length === 0) sections.other.style.display = 'none';
                }
                if (hasContent.finished) {
                    sections.finished.style.display = 'block';
                    applyViewState(sections.finished, 'all-finished');
                }
            } else {
                let mapKey = filter;
                if (filter === 'real_exam') mapKey = 'realExam';
                if (filter === 'premium') mapKey = 'premium';
                if (filter === 'finished') mapKey = 'finished';

                if (hasContent[mapKey] && sections[mapKey]) {
                    sections[mapKey].style.display = 'block';
                    applyViewState(sections[mapKey], 'individual');
                }
            }
        }

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateDashboardView(btn.dataset.filter);
            });
        });

        // Initialize view based on active tab (default 'all')
        updateDashboardView('all');
    }

}); // --- END OF DOMContentLoaded ---