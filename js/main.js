// js/main.js - Core Logic & AI Agent for PDF Import
// FIXED: Ensures admin test list only loads after user is authenticated.
// FIXED: Restored all admin button functionality (Access, Proctor Code, Delete).
// FIXED: PDF Import Modal triggers correctly and handles inputs safely.

let auth;
let db;

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
                        errorDiv.classList.add('visible'); 
                    }
                });
        });
    }

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        const errorDiv = document.getElementById('signup-error');
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (errorDiv) errorDiv.classList.remove('visible'); 

            const name = signupForm['signup-name'].value;
            const email = signupForm['signup-email'].value;
            const password = signupForm['signup-password'].value;

            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    return db.collection('users').doc(cred.user.uid).set({
                        fullName: name,
                        email: email, 
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

            auth.signInWithEmailAndPassword(email, password)
                .then(userCredential => {
                    const user = userCredential.user;
                    return db.collection('admins').doc(user.uid).get();
                })
                .then(doc => {
                    if (doc.exists) {
                        window.location.href = 'admin.html';
                    } else {
                        auth.signOut(); 
                         if (errorDiv) {
                            errorDiv.textContent = 'Access Denied. Not an admin account.';
                            errorDiv.classList.add('visible');
                        }
                    }
                })
                .catch(err => {
                    console.error("Admin Login Error:", err.code, err.message);
                     if (errorDiv) {
                        errorDiv.textContent = 'Invalid admin credentials.';
                        errorDiv.classList.add('visible');
                    }
                });
        });
    }

    // --- ADMIN PANEL "CREATE TEST" MODAL LOGIC (Manual/PDF Creation) ---
    const createTestBtn = document.getElementById('create-new-test-btn');
    const createTestForm = document.getElementById('create-test-form');
    const cancelCreateTestBtn = document.getElementById('cancel-create-test');

    if (createTestBtn && createTestModal && cancelCreateTestBtn && createTestForm) {
        const openModal = (modalEl) => {
            if(!modalEl) return;
            modalEl.style.display = 'block';
            adminModalBackdrop.style.display = 'block';
            setTimeout(() => {
                modalEl.classList.add('visible');
                adminModalBackdrop.classList.add('visible');
            }, 10);
        };

        const closeModal = (modalEl) => {
            if(!modalEl) return;
            modalEl.classList.remove('visible');
            adminModalBackdrop.classList.remove('visible');
            setTimeout(() => { modalEl.style.display = 'none'; }, 300);
        };
        
        // Open the main creation modal
        createTestBtn.addEventListener('click', () => openModal(createTestModal));
        cancelCreateTestBtn.addEventListener('click', () => closeModal(createTestModal));

        // Start Manual Creation
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
                visibility: 'hide', 
                whitelist: []
            }).then(() => {
                console.log('Test created successfully!');
                closeModal(createTestModal);
                alert('Test created successfully!');
                window.location.reload(); 
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
                 e.preventDefault(); // Prevent default if in form
                 closeModal(createTestModal);
                 // Small delay to allow first modal to close
                 setTimeout(() => openModal(pdfImportModal), 300);
            });
        }
    }


    // +++ AI PDF IMPORT AGENT LOGIC (PDF Handling) +++
    const pdfImportModal = document.getElementById('pdf-import-modal');
    const pdfUploadStep = document.getElementById('pdf-upload-step');
    const pdfProgressStep = document.getElementById('pdf-progress-step');
    const pdfFileInput = document.getElementById('pdf-file-input');
    const pdfUploadLabel = document.getElementById('pdf-upload-label');
    const startAnalysisBtn = document.getElementById('start-pdf-analysis');
    const cancelPdfImportBtn = document.getElementById('cancel-pdf-import');
    const progressBar = document.getElementById('import-progress-bar');
    const progressTextLabel = document.getElementById('progress-text-label');
    const pdfErrorMsg = document.getElementById('pdf-error-msg');
    // Removed global const for inputs to fetch them dynamically inside event listener

    let pdfFileBlob = null; 

    // --- UI State Manager for PDF Modal ---
    function updatePdfModalStep(step = 'upload') {
        if (step === 'upload') {
            pdfUploadStep?.classList.remove('hidden');
            pdfProgressStep?.classList.add('hidden');
            if (startAnalysisBtn) startAnalysisBtn.disabled = true;
            pdfErrorMsg?.classList.remove('visible');
            if (pdfErrorMsg) pdfErrorMsg.textContent = '';
            if (progressBar) progressBar.style.width = '0%';
        } else if (step === 'progress') {
            pdfUploadStep?.classList.add('hidden');
            pdfProgressStep?.classList.remove('hidden');
            if (startAnalysisBtn) startAnalysisBtn.disabled = true;
            if (cancelPdfImportBtn) cancelPdfImportBtn.disabled = true;
        }
    }

    function showPdfError(message) {
        if (pdfErrorMsg) {
            pdfErrorMsg.textContent = message;
            pdfErrorMsg.classList.add('visible');
        }
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = 'var(--error-red)';
        }
        if (progressTextLabel) progressTextLabel.textContent = "Error Detected";
    }

    // --- File Input Handler ---
    if (pdfFileInput) {
        pdfFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type === 'application/pdf') {
                pdfFileBlob = file;
                if (pdfUploadLabel) pdfUploadLabel.textContent = file.name;
                if (startAnalysisBtn) startAnalysisBtn.disabled = false;
                pdfErrorMsg?.classList.remove('visible');
            } else {
                pdfFileBlob = null;
                if (pdfUploadLabel) pdfUploadLabel.textContent = "Select PDF File (Max 5 pages recommended)";
                if (startAnalysisBtn) startAnalysisBtn.disabled = true;
                showPdfError("Please select a valid PDF file.");
            }
        });

        const pdfUploadContainer = document.getElementById('pdf-upload-container');
        if (pdfUploadContainer) {
            pdfUploadContainer.addEventListener('click', () => pdfFileInput.click());
        }
    }

    // --- Cancel Button Handler ---
    if (cancelPdfImportBtn) {
        cancelPdfImportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            updatePdfModalStep('upload');
            
            // Logic to close the modal correctly
            if (pdfImportModal) {
                pdfImportModal.classList.remove('visible');
                setTimeout(() => { pdfImportModal.style.display = 'none'; }, 300);
            }
            if (adminModalBackdrop) {
                adminModalBackdrop.classList.remove('visible');
            }
        });
    }

    // --- Start Analysis Button Handler ---
    if (startAnalysisBtn) {
        startAnalysisBtn.addEventListener('click', async () => {
            
            // +++ FIX: Re-select input elements here to ensure they exist +++
            const pdfTestNameInput = document.getElementById('pdf-import-test-name');
            const pdfTestIdInput = document.getElementById('pdf-import-test-id');

            // Debugging: Check if elements exist
            if (!pdfTestNameInput || !pdfTestIdInput) {
                console.error("PDF Input fields missing in DOM! IDs: pdf-import-test-name, pdf-import-test-id");
                alert("Error: Input fields missing. Please reload the page.");
                return;
            }

            if (!pdfFileBlob) return showPdfError("Please select a PDF to start.");
            
            // Use .value safely now
            const testName = pdfTestNameInput.value.trim();
            const testId = pdfTestIdInput.value.trim();
            
            if (!testName || !testId || !/^[a-z0-9_]+$/.test(testId)) return showPdfError("Please provide a valid Test Name and ID.");

            updatePdfModalStep('progress');
            if (progressBar) progressBar.style.width = '5%';
            if (progressTextLabel) progressTextLabel.textContent = "1/4: Reading PDF pages...";

            try {
                // Check API Key first (using the global variable from config.js)
                if (typeof AI_API_KEY === 'undefined' || AI_API_KEY === "PASTE_YOUR_GOOGLE_AI_API_KEY_HERE" || AI_API_KEY === "") {
                    throw new Error("AI API Key is missing. Please check js/config.js.");
                }

                // 1. Convert PDF to Base64 Images
                const images = await readPDFAndConvert(pdfFileBlob);
                if (images.length === 0) throw new Error("Could not extract images from PDF.");
                
                if (progressBar) progressBar.style.width = '30%';
                if (progressTextLabel) progressTextLabel.textContent = `2/4: Sending ${images.length} pages to AI...`;

                // 2. Call Gemini for parsing
                const allQuestions = await callGeminiToParseTest(testName, images);
                
                if (progressBar) progressBar.style.width = '70%';
                if (progressTextLabel) progressTextLabel.textContent = `3/4: Saving ${allQuestions.length} questions to Firestore...`;
                
                // 3. Save all questions to Firestore
                await saveParsedQuestions(testId, testName, allQuestions);

                if (progressBar) progressBar.style.width = '100%';
                if (progressTextLabel) progressTextLabel.textContent = `Success! Redirecting to Editor...`;
                
                // 4. Redirect for review
                setTimeout(() => {
                    window.location.href = `edit-test.html?id=${testId}`;
                }, 1000);

            } catch (error) {
                console.error("Full Import Process Failed:", error);
                showPdfError(`Import Failed: ${error.message}`);
                if (cancelPdfImportBtn) cancelPdfImportBtn.disabled = false;
                
                // Clean up the invalid test entry if it was created
                db.collection('tests').doc(testId).delete().catch(() => {});
            }
        });
    }

    // --- CORE PDF & AI FUNCTIONS ---

    /**
     * Renders PDF pages to an array of Base64 strings using PDF.js.
     */
    async function readPDFAndConvert(file) {
        if (typeof pdfjsLib === 'undefined') throw new Error("PDF.js library is not loaded.");
        const fileArray = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: fileArray }).promise;
        const totalPages = Math.min(pdf.numPages, 5); // Limit to first 5 pages for speed/cost

        const imagePromises = [];
        for (let i = 1; i <= totalPages; i++) {
            imagePromises.push((async () => {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 }); // Scale up for better OCR
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                return { base64: base64, page: i };
            })());
        }
        
        const results = await Promise.all(imagePromises);
        return results.map(r => r.base64);
    }

    /**
     * Calls Gemini to parse the test structure from the PDF pages.
     */
    async function callGeminiToParseTest(testName, base64Images) {
        
        const apiKey = AI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        // Build the contents array: First, the prompt, then all images
        const contents = [];
        
        const QUESTION_DOMAINS = {
            "Reading & Writing": {
                "Information and Ideas": ["Central Ideas and Details", "Command of Evidence", "Inferences"],
                "Craft and Structure": ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
                "Expression of Ideas": ["Rhetorical Synthesis", "Transitions"],
                "Standard English Conventions": ["Boundaries", "Form, Structure, and Sense"]
            },
            "Math": { 
                "Algebra": ["Linear equations in one variable", "Linear functions", "Systems of two linear equations in two variables", "Linear inequalities in one or two variables"],
                "Advanced Math": ["Equivalent expressions", "Nonlinear equations in one variable and systems of equations in two variables", "Nonlinear functions"],
                "Problem-Solving and Data Analysis": ["Ratios, rates", "Percentages", "One-variable data", "Two-variable data", "Probability and conditional probability", "Inference from sample statistics", "Geometry and Trigonometry"]
            }
        };

        const domainListRW = Object.keys(QUESTION_DOMAINS["Reading & Writing"]).join(', ');
        const domainListMath = Object.keys(QUESTION_DOMAINS["Math"]).join(', ');
        
        const masterPrompt = `You are a specialized SAT Test Parsing Agent. Your task is to process the ${base64Images.length} images provided, which represent pages of a full SAT practice test.
        
        CRITICAL INSTRUCTIONS:
        1.  **Structure:** Analyze the questions, group them into four modules (R&W M1, R&W M2, Math M1, Math M2), and determine the question number within its module.
        2.  **KaTeX/LaTeX:** For *all* mathematical content (variables, fractions, equations, function notation, exponents), you **MUST** convert the content into its LaTeX code and embed it using the Quill/KaTeX structure: <span class="ql-formula" data-value="LaTeX_CODE_HERE">﻿<span contenteditable="false"><span class="katex">...</span></span>﻿</span>. Example: "x^2" becomes <span class="ql-formula" data-value="x^2">...</span>.
        3.  **Formatting:** Preserve text formatting (bold, italic, underline, list items) using standard HTML tags (<b>, <i>, <u>, <ul>, <li>).
        4.  **Fill-in-the-Blank:** For Math questions that do NOT have A, B, C, D options, set 'format' to **'fill-in'** and put the answer (as simple text or KaTeX LaTeX string) in the **'fillInAnswer'** field.
        5.  **Passages:** Separate multi-question reading/writing passages into the 'passage' field.
        6.  **Categorization:** Assign the 'domain' and 'skill' based on the official SAT lists.

        OUTPUT REQUIREMENT: Return a single, valid JSON array containing ALL extracted questions. Do NOT include any introductory or concluding text. The entire output must be parsable JSON.
        `;

        contents.push({ parts: [{ text: masterPrompt }] });

        // Add all images to the contents array
        base64Images.forEach(base64 => {
            contents.push({ parts: [{ inlineData: { mimeType: "image/jpeg", data: base64 } }] });
        });

        // Define the JSON structure for the array of questions
        const jsonSchema = {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    module: { type: "INTEGER", description: "1=RW M1, 2=RW M2, 3=Math M1, 4=Math M2" },
                    questionNumber: { type: "INTEGER", description: "Question number within the module." },
                    passage: { type: "STRING", description: "Passage text, if any, with KaTeX/HTML tags." },
                    prompt: { type: "STRING", description: "Question text, with KaTeX/HTML tags." },
                    format: { type: "STRING", enum: ["mcq", "fill-in"] },
                    options: { type: "OBJECT", description: "JSON mapping {A: HTML_string, B: HTML_string} for MCQ. Empty object for fill-in." },
                    correctAnswer: { type: "STRING", description: "A, B, C, D for MCQ, or null for fill-in." },
                    fillInAnswer: { type: "STRING", description: "The correct answer value for fill-in questions (e.g., '1.75' or '12/5') or null for MCQ." },
                    domain: { type: "STRING" },
                    skill: { type: "STRING" },
                    explanation: { type: "STRING", description: "Detailed explanation." }
                },
                required: ["module", "questionNumber", "prompt", "format", "correctAnswer", "fillInAnswer", "domain", "skill"]
            }
        };

        const payload = {
            contents: contents,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: jsonSchema
            }
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                 let errorBody;
                 try {
                     errorBody = await response.json();
                 } catch(e) {
                      throw new Error(`API Error ${response.status}: ${response.statusText}`);
                 }
                 throw new Error(`API Error ${response.status}: ${errorBody.error?.message || 'Unknown API Error'}`);
            }

            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) throw new Error("AI returned an empty response.");
            
            return JSON.parse(jsonText);

        } catch (error) {
            console.error('Gemini API Error during PDF parsing:', error);
            throw new Error(`AI Parsing Failed: ${error.message}`);
        }
    }

    /**
     * Saves the array of structured question data to Firestore.
     */
    async function saveParsedQuestions(testId, testName, questions) {
        // 1. Create the main test document
        const testRef = db.collection('tests').doc(testId);
        await testRef.set({
            name: testName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            visibility: 'hide', // Default to hidden for new tests
            whitelist: [],
            totalQuestions: questions.length
        }, { merge: true });

        // 2. Save each question to the subcollection
        const batch = db.batch();
        questions.forEach(q => {
            const docRef = testRef.collection('questions').doc(`m${q.module}_q${q.questionNumber}`);
            batch.set(docRef, q);
        });

        await batch.commit();
        console.log(`Successfully imported and saved ${questions.length} questions for ${testId}.`);
    }

    // --- ADMIN TEST DISPLAY FUNCTION ---
    /**
     * Fetches and displays all tests in the admin panel.
     */
    async function displayAdminTests(userId) {
        const testListContainerAdmin = document.getElementById('admin-test-list');
        if (!testListContainerAdmin) return;
        
        testListContainerAdmin.innerHTML = '<p>Loading tests...</p>';

        try {
            const snapshot = await db.collection('tests').orderBy('createdAt', 'desc').get();
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
                             alert('Test deleted successfully (Note: Questions may remain in database until cleanup).');
                             window.location.reload();
                        } catch (err) {
                             console.error("Delete failed:", err);
                             alert("Failed to delete test.");
                        }
                    }
                }
                
                 // 2. GENERATE CODE BUTTON
                 const generateCodeButton = e.target.closest('.generate-code-btn');
                 if (generateCodeButton && proctorCodeModal) {
                     const testIdForCode = generateCodeButton.dataset.testid;
                     
                     // Setup modal
                     document.getElementById('proctor-code-display').innerHTML = '<span>Generating...</span>';
                     document.getElementById('proctor-test-name').textContent = '...';
                     
                     proctorCodeModal.classList.add('visible');
                     adminModalBackdrop.classList.add('visible');
                     
                     try {
                        // Generate code
                        const code = generateProctorCode(6);
                        
                        // Get Test Name
                        const testDoc = await db.collection('tests').doc(testIdForCode).get();
                        const testName = testDoc.exists ? testDoc.data().name : "Unknown Test";
                        
                        // Save to Firestore
                        await db.collection('proctoredSessions').doc(code).set({
                            testId: testIdForCode,
                            testName: testName,
                            adminId: userId, // Use passed userId
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // Display
                        document.getElementById('proctor-code-display').innerHTML = `<span>${code.slice(0, 3)}-${code.slice(3)}</span>`;
                        document.getElementById('proctor-test-name').textContent = testName;

                     } catch (err) {
                        console.error("Error generating proctor code:", err);
                        document.getElementById('proctor-code-display').innerHTML = `<span style="font-size: 1rem; color: var(--error-red);">Error</span>`;
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
                         
                         if(title) title.textContent = `Manage Access: ${testData.name}`;
                         if(select) select.value = testData.visibility || 'hide';
                         if(text) text.value = (testData.whitelist || []).join('\n');
                         
                         if(select) select.dispatchEvent(new Event('change')); // Trigger toggle logic
                         
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
    // Logic for the access modal save/cancel
    const saveAccessBtn = document.getElementById('save-access-btn');
    const cancelAccessBtn = document.getElementById('cancel-access');
    const accessForm = document.getElementById('access-form');
    const visibilitySelect = document.getElementById('test-visibility');
    const whitelistContainer = document.getElementById('whitelist-container');
    const whitelistTextarea = document.getElementById('test-whitelist');
    const accessErrorMsg = document.getElementById('access-error-msg');
    
    let currentEditingTestId = null; // Global for access modal

    if (accessForm && saveAccessBtn) {
        visibilitySelect?.addEventListener('change', () => {
            whitelistContainer?.classList.toggle('visible', visibilitySelect.value === 'private');
        });

        const closeAccessModal = () => {
            accessModal?.classList.remove('visible');
            // Only remove backdrop if no other modals are open
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
                window.location.reload(); 
            }).catch(err => {
                console.error("Error updating access:", err);
                if(accessErrorMsg) {
                    accessErrorMsg.textContent = `Error: ${err.message}`;
                    accessErrorMsg.classList.add('visible');
                }
                saveAccessBtn.disabled = false;
                saveAccessBtn.textContent = 'Save Access';
            });
        });
    }
    
    // --- PROCTOR MODAL CLOSE HANDLER ---
    const closeProctorBtn = document.getElementById('close-proctor-modal');
    if (closeProctorBtn) {
        closeProctorBtn.addEventListener('click', () => {
             proctorCodeModal.classList.remove('visible');
             if (!createTestModal.classList.contains('visible') && !accessModal.classList.contains('visible')) {
                adminModalBackdrop.classList.remove('visible');
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
                 // Check if user is an admin before displaying content
                 const adminDoc = await db.collection('admins').doc(user.uid).get();
                 if (adminDoc.exists) {
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
            
            // --- Profile Menu Logic (for dashboard) ---
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

            // Global listener to close profile menu on outside click
            document.addEventListener('click', (e) => {
                if (profileMenu && profileMenu.classList.contains('visible') && !e.target.closest('.profile-nav')) {
                    profileMenu.classList.remove('visible');
                }
            });
            
            // Re-add the simple logout logic for OTHER pages
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

    // --- PROCTOR CODE HELPERS (Outside DOMContentLoaded) ---

    function generateProctorCode(length) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // (O, I, 0, 1 removed for clarity)
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
                const testId = doc.data().testId;
                if (testId) {
                    window.location.href = `test.html?id=${testId}`;
                } else {
                    alert("Error: This session code is valid but has no test associated with it.");
                    button.disabled = false;
                    button.textContent = "Start Proctored Test";
                }
            } else {
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
     * Fetches and displays tests, checking against the user's completed tests.
     * @param {string} userId - The UID of the currently logged-in user.
     */
    async function populateDashboard(userId) {
        const testGrid = document.getElementById('test-grid-container');
        if (!testGrid) return;
        if (!db) {
            console.error("Firestore DB not initialized in populateDashboard.");
            testGrid.innerHTML = '<p>Error: Could not connect to the database.</p>';
            return;
        }

        testGrid.innerHTML = '<p>Loading available tests...</p>'; // Show loading message initially

        try {
            // 1. Get a map of completed test IDs and their results
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
            
            const testsSnapshot = Array.from(allAvailableTests.values());
            testsSnapshot.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            if (testsSnapshot.length === 0) {
                testGrid.innerHTML = '<p>No practice tests are available at the moment.</p>';
                return;
            }

            testGrid.innerHTML = ''; // Clear loading message

            // 3. Render cards
            testsSnapshot.forEach(test => {
                const testId = test.id;
                const completionData = completedTestsMap.get(testId); 
                
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
                            <div class="test-status completed">
                                <i class="fa-solid fa-check-circle"></i>
                                Finished - Score: <strong>${completionData.score || 'N/A'}</strong>
                            </div>
                        </div>
                        <a href="results.html?resultId=${completionData.resultId}" class="btn card-btn btn-view-results">View Results</a>
                    `;
                } else if (inProgressData) {
                    // +++ Test is IN PROGRESS ---
                    card.classList.add('in-progress'); 
                    cardHTML = `
                        <div class="card-content">
                            <h4>${test.name || 'Unnamed Test'}</h4>
                            <p>${test.description || 'A full-length adaptive test.'}</p>
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

}); // --- END OF DOMContentLoaded ---