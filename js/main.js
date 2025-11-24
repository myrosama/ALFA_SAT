// js/main.js - Core Logic & AI Agent for PDF Import
// FIXED: Strict rules for Question Ordering ( Page N = Question N ).
// FIXED: Strict rules for EBRW (No Math) vs Math (KaTeX).
// FIXED: Added Custom Prompt support.

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
                 e.preventDefault(); 
                 closeModal(createTestModal);
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
    const progressLog = document.getElementById('progress-log');
    // +++ NEW: Custom Prompt Input +++
    const customPromptInput = document.getElementById('pdf-import-custom-prompt');

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
            if (progressLog) progressLog.innerHTML = ''; 
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
    
    function logProgress(msg) {
        if (progressLog) {
             const div = document.createElement('div');
             div.textContent = `> ${msg}`;
             progressLog.prepend(div);
        }
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
                if (pdfUploadLabel) pdfUploadLabel.textContent = "Select PDF File (Max 100 pages)";
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
            
            const pdfTestNameInput = document.getElementById('pdf-import-test-name');
            const pdfTestIdInput = document.getElementById('pdf-import-test-id');

            if (!pdfTestNameInput || !pdfTestIdInput) {
                console.error("PDF Input fields missing in DOM! IDs: pdf-import-test-name, pdf-import-test-id");
                alert("Error: Input fields missing. Please reload the page.");
                return;
            }

            if (!pdfFileBlob) return showPdfError("Please select a PDF to start.");
            
            const testName = pdfTestNameInput.value.trim();
            const testId = pdfTestIdInput.value.trim();
            
            // +++ NEW: Capture Custom Prompt +++
            const customInstructions = customPromptInput ? customPromptInput.value.trim() : "";
            
            if (!testName || !testId || !/^[a-z0-9_]+$/.test(testId)) return showPdfError("Please provide a valid Test Name and ID.");

            updatePdfModalStep('progress');
            if (progressBar) progressBar.style.width = '5%';
            if (progressTextLabel) progressTextLabel.textContent = "Initializing...";

            try {
                // Check API Key
                if (typeof AI_API_KEY === 'undefined' || AI_API_KEY === "PASTE_YOUR_GOOGLE_AI_API_KEY_HERE" || AI_API_KEY === "") {
                    throw new Error("AI API Key is missing. Please check js/config.js.");
                }

                // 1. Convert PDF to Base64 Images
                logProgress("Reading PDF file...");
                const images = await readPDFAndConvert(pdfFileBlob);
                if (images.length === 0) throw new Error("Could not extract images from PDF.");
                logProgress(`PDF converted. Found ${images.length} pages.`);
                
                // 2. Initialize Test in Firestore
                await db.collection('tests').doc(testId).set({
                    name: testName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    visibility: 'hide', 
                    whitelist: [],
                    status: 'importing',
                    totalPages: images.length
                });
                logProgress(`Created test shell: ${testId}`);
                
                // 3. BATCH PROCESSING LOOP
                const BATCH_SIZE = 3; // Safe for free tier
                const DELAY_MS = 5000; // 5s wait
                let totalQuestionsSaved = 0;

                for (let i = 0; i < images.length; i += BATCH_SIZE) {
                     const batchImages = images.slice(i, i + BATCH_SIZE);
                     const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                     const totalBatches = Math.ceil(images.length / BATCH_SIZE);
                     const startPage = i + 1;

                     logProgress(`Analyzing Batch ${batchNum}/${totalBatches} (Pages ${startPage}-${startPage + batchImages.length - 1})...`);
                     if (progressTextLabel) progressTextLabel.textContent = `AI Analyzing Batch ${batchNum}/${totalBatches}...`;
                     
                     const progressPercent = 30 + ((i / images.length) * 60);
                     if (progressBar) progressBar.style.width = `${progressPercent}%`;

                     try {
                         // Heuristic Context for AI
                         let contextModule = "Reading & Writing Module 1";
                         if (startPage > 14) contextModule = "Reading & Writing Module 2";
                         if (startPage > 28) contextModule = "Math Module 1";
                         if (startPage > 40) contextModule = "Math Module 2";

                         // +++ Pass custom instructions to AI +++
                         const questions = await callGeminiForBatch(batchImages, contextModule, customInstructions);
                         
                         if (questions && questions.length > 0) {
                             logProgress(`Batch ${batchNum}: Found ${questions.length} questions. Saving...`);
                             await saveParsedQuestions(testId, testName, questions); 
                             totalQuestionsSaved += questions.length;
                         } else {
                             logProgress(`Batch ${batchNum}: No questions extracted.`);
                         }
                     } catch (batchError) {
                         console.error(`Batch ${batchNum} failed:`, batchError);
                         logProgress(`Error in Batch ${batchNum}: ${batchError.message}. Skipping...`);
                     }

                     if (i + BATCH_SIZE < images.length) {
                         logProgress(`Sleeping ${DELAY_MS/1000}s for rate limit...`);
                         await new Promise(r => setTimeout(r, DELAY_MS));
                     }
                }

                if (progressBar) progressBar.style.width = '100%';
                if (progressTextLabel) progressTextLabel.textContent = `Success! Imported ${totalQuestionsSaved} questions.`;
                logProgress("IMPORT COMPLETE.");
                
                // Notify Telegram
                if (typeof TELEGRAM_BOT_TOKEN !== 'undefined' && TELEGRAM_BOT_TOKEN.length > 20) {
                     uploadToTelegram(pdfFileBlob, `Test "${testName}" Imported (${totalQuestionsSaved} qs)`);
                }
                
                setTimeout(() => {
                    window.location.href = `edit-test.html?id=${testId}`;
                }, 2000);

            } catch (error) {
                console.error("Full Import Process Failed:", error);
                showPdfError(`Import Failed: ${error.message}`);
                if (cancelPdfImportBtn) cancelPdfImportBtn.disabled = false;
                db.collection('tests').doc(testId).delete().catch(() => {});
            }
        });
    }

    // --- CORE PDF & AI FUNCTIONS ---

    async function readPDFAndConvert(file) {
        if (typeof pdfjsLib === 'undefined') throw new Error("PDF.js library is not loaded.");
        const fileArray = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: fileArray }).promise;
        const totalPages = pdf.numPages; 

        const imagePromises = [];
        for (let i = 1; i <= totalPages; i++) {
            imagePromises.push((async () => {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 }); 
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                return { base64: base64, page: i };
            })());
        }
        
        const results = await Promise.all(imagePromises);
        results.sort((a, b) => a.page - b.page); 
        return results.map(r => r.base64);
    }

    // --- HELPER: Gemini API Call (STRICT FORMATTING PROMPT) ---
    async function callGeminiForBatch(base64Images, contextModule, customInstructions) {
        const apiKey = AI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const QUESTION_DOMAINS = {
            "Reading & Writing": ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"],
            "Math": ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"]
        };
        const domainListRW = QUESTION_DOMAINS["Reading & Writing"].join(', ');
        const domainListMath = QUESTION_DOMAINS["Math"].join(', ');

        const masterPrompt = `You are a precise SAT Test Parsing Agent.
        
        CONTEXT: You are analyzing pages from ${contextModule}.
        
        USER INSTRUCTIONS: ${customInstructions}
        
        STRICT FORMATTING RULES (MUST FOLLOW):
        1. **QUESTION ORDER:** Look for the *printed* question number on the page (e.g., "1", "2", "27"). Use this as the 'questionNumber'. This is the canonical source of truth.
        
        2. **EBRW (Reading/Writing) SECTIONS:**
           - **PURE TEXT ONLY.** No exceptions.
           - **ABSOLUTELY NO LaTeX or KaTeX.** Do NOT use <span class="ql-formula">.
           - Do NOT use markdown like **bold**. Use HTML tags: <b>, <i>, <u>, <ul>, <li>.
           - For "blanks" in text, use "________" (8 underscores).
        
        3. **MATH SECTIONS:**
           - **ALL** numbers, variables, equations, and fractions MUST be converted to KaTeX.
           - **WRAPPER:** <span class="ql-formula" data-value="LATEX_CODE">﻿<span contenteditable="false"><span class="katex">LATEX_CODE</span></span>﻿</span>
           - **CRITICAL:** Do NOT put a space after the closing </span> tag if it is inline.
           - Example: "If x=4" -> "If <span class="ql-formula" data-value="x=4">...</span>"
        
        4. **GENERAL:**
           - Extract ALL questions on these pages.
           - If Math question has NO options (A,B,C,D), set format="fill-in" and put answer in 'fillInAnswer'.
           - If Math question HAS options, set format="mcq" and put options in 'options' object.
           - Categorize domain/skill based on:
             - RW: ${domainListRW}
             - Math: ${domainListMath}

        OUTPUT: Return a valid JSON array of question objects.`;

        const contents = [{ parts: [{ text: masterPrompt }] }];
        base64Images.forEach(img => contents[0].parts.push({ inlineData: { mimeType: "image/jpeg", data: img } }));

        const jsonSchema = {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    module: { type: "INTEGER" },
                    questionNumber: { type: "INTEGER" },
                    passage: { type: "STRING" },
                    prompt: { type: "STRING" },
                    format: { type: "STRING", enum: ["mcq", "fill-in"] },
                    options: { 
                        type: "OBJECT",
                        properties: {
                            A: { type: "STRING" },
                            B: { type: "STRING" },
                            C: { type: "STRING" },
                            D: { type: "STRING" }
                        }
                    },
                    correctAnswer: { type: "STRING" },
                    fillInAnswer: { type: "STRING" },
                    domain: { type: "STRING" },
                    skill: { type: "STRING" },
                    explanation: { type: "STRING" }
                },
                required: ["prompt", "format", "domain"]
            }
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: jsonSchema
                    }
                })
            });

            if (!response.ok) {
                 const err = await response.json();
                 console.warn(`Batch Error: ${err.error.message}`);
                 return [];
            }

            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            return jsonText ? JSON.parse(jsonText) : [];
        } catch (e) {
            console.error("Batch AI Error:", e);
            return []; 
        }
    }

    /**
     * Saves the array of structured question data to Firestore.
     * Uses explicit question numbering from AI if available.
     */
    async function saveParsedQuestions(testId, testName, questions) {
        const batch = db.batch();
        const testRef = db.collection('tests').doc(testId);

        questions.forEach((q) => {
            // 1. Sanitize Module
            let mod = q.module || 1;
            if (mod < 1 || mod > 4) mod = 1;

            // 2. Use AI's Question Number if present
            // This is the key to your "Strict Order" requirement.
            let num = q.questionNumber;
            
            // Fallback if AI missed it (rare with new prompt)
            if (!num) {
                 num = `unknown_${Math.floor(Math.random() * 1000)}`;
            }
            
            const docId = `m${mod}_q${num}`;
            const docRef = testRef.collection('questions').doc(docId);
            
            // Ensure fields are present
            if (!q.questionNumber) q.questionNumber = parseInt(num) || 99;
            if (!q.module) q.module = mod;

            batch.set(docRef, q);
        });

        await batch.commit();
    }

    // --- ADMIN TEST DISPLAY FUNCTION ---
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
                             alert('Test deleted successfully.');
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
            
            // --- Profile Menu Logic ---
            setupProfileMenu(user);
            
            // --- Global Logout Logic ---
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn && !logoutBtn.dataset.listenerAdded) {
                 logoutBtn.addEventListener('click', (e) => {
                     e.preventDefault();
                     auth.signOut().then(() => { window.location.href = 'index.html'; });
                 });
                 logoutBtn.dataset.listenerAdded = 'true';
            }

        } else {
            // User is NOT logged in
            if (protectedPages.includes(currentPage)) {
                window.location.href = 'index.html';
            }
        }
    });

    // --- PROCTOR CODE HELPERS ---
    function generateProctorCode(length) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
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

        const code = input.value.trim().toUpperCase().replace('-', ''); 
        
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

        if(profileBtn && profileMenu && userIdDisplay && copyUidBtn && profileLogoutBtn) {
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

            profileLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                auth.signOut().then(() => { window.location.href = 'index.html'; });
            });
        }

        document.addEventListener('click', (e) => {
            if (profileMenu && profileMenu.classList.contains('visible') && !e.target.closest('.profile-nav')) {
                profileMenu.classList.remove('visible');
            }
        });
    }

    // --- DASHBOARD POPULATION ---
    async function populateDashboard(userId) {
        const testGrid = document.getElementById('test-grid-container');
        if (!testGrid) return;
        if (!db) {
            console.error("Firestore DB not initialized in populateDashboard.");
            testGrid.innerHTML = '<p>Error: Could not connect to the database.</p>';
            return;
        }

        testGrid.innerHTML = '<p>Loading available tests...</p>'; 

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

            testGrid.innerHTML = ''; 

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