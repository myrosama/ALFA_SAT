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
                const testCategory = currentAdminRole === 'real_exam_admin' ? 'real_exam' : 'premium';
                await db.collection('tests').doc(testId).set({
                    name: testName,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    visibility: 'hide',
                    whitelist: [],
                    createdBy: auth.currentUser?.uid || '',
                    testCategory: testCategory,
                    status: 'importing',
                    totalPages: images.length
                });
                logProgress(`Created test shell: ${testId}`);

                // 3. EXTRACT QUESTIONS — No hardcoded module assignment
                const BATCH_SIZE = 3;
                const DELAY_MS = 5000;
                let allExtractedQuestions = [];

                // Store PDF images for later image cropping
                window._pdfImages = images;

                for (let i = 0; i < images.length; i += BATCH_SIZE) {
                    const batchImages = images.slice(i, i + BATCH_SIZE);
                    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(images.length / BATCH_SIZE);
                    const startPage = i + 1;
                    const endPage = Math.min(i + BATCH_SIZE, images.length);

                    logProgress(`Analyzing Batch ${batchNum}/${totalBatches} (Pages ${startPage}-${endPage})...`);
                    if (progressTextLabel) progressTextLabel.textContent = `AI Analyzing Batch ${batchNum}/${totalBatches}...`;
                    const progressPercent = 15 + ((i / images.length) * 60);
                    if (progressBar) progressBar.style.width = `${progressPercent}%`;

                    try {
                        const questions = await callGeminiForBatch(batchImages, customInstructions, startPage);

                        if (questions && questions.length > 0) {
                            questions.forEach(q => {
                                q._batchStartPage = startPage;
                                q._batchIndex = i;
                            });
                            allExtractedQuestions.push(...questions);
                            logProgress(`Batch ${batchNum}: Found ${questions.length} questions.`);
                        } else {
                            logProgress(`Batch ${batchNum}: No questions (directions/answer key page).`);
                        }
                    } catch (batchError) {
                        console.error(`Batch ${batchNum} failed:`, batchError);
                        logProgress(`Error in Batch ${batchNum}: ${batchError.message}. Skipping...`);
                    }

                    if (i + BATCH_SIZE < images.length) {
                        logProgress(`Sleeping ${DELAY_MS / 1000}s for rate limit...`);
                        await new Promise(r => setTimeout(r, DELAY_MS));
                    }
                }

                // 4. POST-PROCESSING: assign modules, deduplicate, validate
                logProgress("Post-processing: assigning modules and deduplicating...");
                if (progressBar) progressBar.style.width = '80%';
                if (progressTextLabel) progressTextLabel.textContent = "Assigning modules...";

                allExtractedQuestions = assignModulesAndDeduplicate(allExtractedQuestions);
                logProgress(`Final count: ${allExtractedQuestions.length} questions across 4 modules.`);

                // 5. IMAGE CROPPING: crop images for questions with image_bbox
                const questionsWithImages = allExtractedQuestions.filter(q => q.image_bbox);
                if (questionsWithImages.length > 0) {
                    logProgress(`Cropping ${questionsWithImages.length} images from PDF...`);
                    if (progressTextLabel) progressTextLabel.textContent = `Cropping ${questionsWithImages.length} images...`;
                    if (progressBar) progressBar.style.width = '85%';

                    for (const q of questionsWithImages) {
                        try {
                            const croppedDataUrl = await cropImageFromPDFPage(q.image_bbox, q._batchStartPage, q._batchIndex);
                            if (croppedDataUrl) {
                                // Upload to Telegram
                                if (typeof TelegramImages !== 'undefined' && TelegramImages.uploadBase64Image) {
                                    const tgUrl = await TelegramImages.uploadBase64Image(croppedDataUrl);
                                    if (tgUrl) {
                                        q.imageUrl = tgUrl;
                                        q.imageWidth = '100%';
                                        const imgType = q.image_bbox.type || 'diagram';
                                        q.imagePosition = q.imagePosition || (imgType === 'table' || imgType === 'chart' ? 'below' : 'above');
                                        logProgress(`  Uploaded image for Q${q.questionNumber}`);
                                    }
                                } else {
                                    // Fallback: store as inline base64 (not ideal but works)
                                    q.imageUrl = croppedDataUrl;
                                    q.imageWidth = '100%';
                                    q.imagePosition = q.imagePosition || 'above';
                                }
                            }
                        } catch (e) {
                            console.warn(`Image crop failed for Q${q.questionNumber}:`, e);
                        }
                        delete q.image_bbox;
                    }
                }

                // Clean up internal fields
                allExtractedQuestions.forEach(q => {
                    delete q._batchStartPage;
                    delete q._batchIndex;
                    delete q.image_bbox;
                    delete q.sectionType;
                });

                // 6. SAVE
                if (allExtractedQuestions.length > 0) {
                    logProgress("Saving all questions to Firestore...");
                    if (progressBar) progressBar.style.width = '92%';
                    await saveParsedQuestions(testId, testName, allExtractedQuestions);
                }

                if (progressBar) progressBar.style.width = '100%';
                if (progressTextLabel) progressTextLabel.textContent = `Success! Imported ${allExtractedQuestions.length} questions.`;
                logProgress("IMPORT COMPLETE.");

                if (typeof TelegramImages !== 'undefined' && TelegramImages.sendMessage) {
                    TelegramImages.sendMessage(`📥 Test "${testName}" imported with ${allExtractedQuestions.length} questions.`);
                }

                setTimeout(() => {
                    window.location.href = `edit-test.html?id=${testId}`;
                }, 2000);

            } catch (error) {
                console.error("Full Import Process Failed:", error);
                showPdfError(`Import Failed: ${error.message}`);
                if (cancelPdfImportBtn) cancelPdfImportBtn.disabled = false;
                db.collection('tests').doc(testId).delete().catch(() => { });
            }
        });
    }

    // --- CORE PDF FUNCTION ---
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

    // =====================================================
    // GEMINI API CALL — No module pre-assignment
    // =====================================================
    async function callGeminiForBatch(base64Images, customInstructions, startPage) {
        const apiKey = AI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

        const masterPrompt = `You are a precise SAT Test Parsing Agent.

You are analyzing page(s) ${startPage} onward from a Digital SAT practice test PDF.
${customInstructions ? `USER INSTRUCTIONS: ${customInstructions}` : ''}

YOUR TASK: Extract EVERY question visible on these pages.

CRITICAL RULES:

1. **SECTION DETECTION (YOU decide):**
   - Look at the page content to determine if this is a Reading & Writing section or a Math section.
   - Reading & Writing pages have: text passages, literary excerpts, grammar questions.
   - Math pages have: equations, numbers, graphs, geometry, word problems with calculations.
   - Set "sectionType" to "rw" for Reading & Writing, or "math" for Math.
   - This is YOUR determination from the content — there is no pre-assigned module.

2. **QUESTION NUMBER:** Use the printed question number visible on the page (1, 2, 3...).

3. **READING & WRITING FORMAT:**
   - PURE TEXT ONLY. No LaTeX, no KaTeX, no ql-formula.
   - Use HTML tags: <b>, <i>, <u>, <ul>, <li>.
   - For blanks: "________" (8 underscores).
   - Passages go in "passage", the question in "prompt".
   - All R&W questions are MCQ.

4. **MATH FORMAT:**
   - ALL math must use KaTeX wrapper: <span class="ql-formula" data-value="LATEX_CODE">﻿<span contenteditable="false"><span class="katex">LATEX_CODE</span></span>﻿</span>
   - MCQ questions: format="mcq", options={A,B,C,D}
   - Student-produced response: format="fill-in", fillInAnswer="answer"

5. **IMAGES/TABLES/CHARTS/GRAPHS:**
   - If a question has an image, table, chart, or graph, include:
     "image_bbox": {"x0": float, "y0": float, "x1": float, "y1": float, "page_index": int, "type": "table|chart|diagram"}
   - Coordinates are NORMALIZED 0.0 to 1.0 relative to page dimensions.
   - page_index is 0-based within this batch (0 = first page of batch, 1 = second, etc.)
   - For tables: bbox MUST include headers/titles above the table.
   - Set imagePosition: "below" for tables/charts, "above" for standalone diagrams.
   - If NO image exists, omit these fields.

6. **ANSWER:** If the correct answer is visible, set correctAnswer. Otherwise leave empty.

7. **DOMAINS:**
   - RW: Information and Ideas, Craft and Structure, Expression of Ideas, Standard English Conventions
   - Math: Algebra, Advanced Math, Problem-Solving and Data Analysis, Geometry and Trigonometry

8. **SKIP RULES:** If a page is directions, title page, or answer key — return [].
   Do NOT invent questions. Only extract what is printed.

OUTPUT: Return a valid JSON array. Each object MUST include sectionType and questionNumber.`;

        const contents = [{ parts: [{ text: masterPrompt }] }];
        base64Images.forEach(img => contents[0].parts.push({ inlineData: { mimeType: "image/jpeg", data: img } }));

        const jsonSchema = {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    sectionType: { type: "STRING", enum: ["rw", "math"] },
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
                    explanation: { type: "STRING" },
                    imagePosition: { type: "STRING" },
                    image_bbox: {
                        type: "OBJECT",
                        properties: {
                            x0: { type: "NUMBER" },
                            y0: { type: "NUMBER" },
                            x1: { type: "NUMBER" },
                            y1: { type: "NUMBER" },
                            page_index: { type: "INTEGER" },
                            type: { type: "STRING" }
                        }
                    }
                },
                required: ["sectionType", "questionNumber", "prompt", "format"]
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
                console.warn(`Batch Error: ${err.error?.message || 'Unknown'}`);
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

    // =====================================================
    // POST-PROCESSING: Question-number-restart module assignment
    // =====================================================
    function assignModulesAndDeduplicate(questions) {
        if (!questions || questions.length === 0) return [];

        // 1. Drop invalid questions
        let valid = questions.filter(q => q.prompt && q.prompt.trim().length > 5);

        // 2. Split by section type (Gemini's determination)
        const rwQuestions = valid.filter(q => q.sectionType === 'rw');
        const mathQuestions = valid.filter(q => q.sectionType === 'math');

        console.log(`[PostProcess] RW: ${rwQuestions.length}, Math: ${mathQuestions.length}`);

        // 3. Assign modules using question-number-restart detection
        assignModulesViaRestart(rwQuestions, 1, 2);  // RW → Module 1, Module 2
        assignModulesViaRestart(mathQuestions, 3, 4); // Math → Module 3, Module 4

        const allAssigned = [...rwQuestions, ...mathQuestions];

        // 4. Deduplicate by module + questionNumber (keep the one with more content)
        const seen = new Map();
        for (const q of allAssigned) {
            const key = `m${q.module}_q${q.questionNumber}`;
            const existing = seen.get(key);
            if (!existing) {
                seen.set(key, q);
            } else {
                const existingLen = (existing.prompt || '').length + (existing.passage || '').length;
                const newLen = (q.prompt || '').length + (q.passage || '').length;
                if (newLen > existingLen) seen.set(key, q);
            }
        }
        let deduped = Array.from(seen.values());

        // 5. Fix missing question numbers
        for (let mod = 1; mod <= 4; mod++) {
            const moduleQs = deduped.filter(q => q.module === mod)
                .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
            moduleQs.forEach((q, idx) => {
                if (!q.questionNumber || q.questionNumber <= 0) q.questionNumber = idx + 1;
            });
        }

        // 6. Sort: module asc, questionNumber asc
        deduped.sort((a, b) => {
            if (a.module !== b.module) return a.module - b.module;
            return (a.questionNumber || 0) - (b.questionNumber || 0);
        });

        // Log module counts
        for (let m = 1; m <= 4; m++) {
            const count = deduped.filter(q => q.module === m).length;
            console.log(`[PostProcess] Module ${m}: ${count} questions`);
        }

        return deduped;
    }

    /**
     * Assigns module numbers using question-number-restart detection.
     * Questions are sorted by extraction order (batch page).
     * When questionNumber drops significantly (e.g., 27→1), that's a module boundary.
     * 
     * @param {Array} questions - All questions of one section type (rw or math)
     * @param {number} mod1 - First module number (1 for RW, 3 for Math)
     * @param {number} mod2 - Second module number (2 for RW, 4 for Math)
     */
    function assignModulesViaRestart(questions, mod1, mod2) {
        if (questions.length === 0) return;

        // Sort by extraction order (batch page position)
        questions.sort((a, b) => {
            if ((a._batchStartPage || 0) !== (b._batchStartPage || 0)) {
                return (a._batchStartPage || 0) - (b._batchStartPage || 0);
            }
            return (a.questionNumber || 0) - (b.questionNumber || 0);
        });

        // Find the restart point where question numbers drop
        let restartIndex = -1;
        let maxQNum = 0;

        for (let i = 0; i < questions.length; i++) {
            const qNum = questions[i].questionNumber || 0;

            // A restart is when: we've seen high numbers (>5) and then see a low number (<=3)
            // This catches the 27→1 or 22→1 restart pattern
            if (maxQNum >= 5 && qNum <= 3 && qNum < maxQNum * 0.5) {
                restartIndex = i;
                break;
            }
            maxQNum = Math.max(maxQNum, qNum);
        }

        // Assign modules
        if (restartIndex === -1) {
            // No restart detected — all questions belong to mod1
            questions.forEach(q => { q.module = mod1; });
            console.log(`[Restart] ${mod1 <= 2 ? 'RW' : 'Math'}: No restart detected, all → Module ${mod1}`);
        } else {
            // Split at restart
            for (let i = 0; i < questions.length; i++) {
                questions[i].module = (i < restartIndex) ? mod1 : mod2;
            }
            console.log(`[Restart] ${mod1 <= 2 ? 'RW' : 'Math'}: Restart at index ${restartIndex} (Q${questions[restartIndex].questionNumber}). Module ${mod1}: ${restartIndex}, Module ${mod2}: ${questions.length - restartIndex}`);
        }
    }

    // =====================================================
    // IMAGE CROPPING — Canvas-based from PDF page images
    // =====================================================
    async function cropImageFromPDFPage(bbox, batchStartPage, batchIndex) {
        try {
            const pageIndex = bbox.page_index || 0;
            const globalPageIndex = batchIndex + pageIndex;

            if (!window._pdfImages || globalPageIndex >= window._pdfImages.length) {
                console.warn('Image crop: page index out of range');
                return null;
            }

            const pageBase64 = window._pdfImages[globalPageIndex];

            // Load the page image
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = `data:image/jpeg;base64,${pageBase64}`;
            });

            // Normalize coordinates (Gemini might return 0-1 or 0-1000)
            let { x0, y0, x1, y1 } = bbox;
            if (Math.max(x0, y0, x1, y1) > 1.0) {
                x0 /= 1000; y0 /= 1000; x1 /= 1000; y1 /= 1000;
            }

            // Ensure correct order
            if (x0 > x1) [x0, x1] = [x1, x0];
            if (y0 > y1) [y0, y1] = [y1, y0];

            // Convert to pixel coordinates
            const px0 = x0 * img.width;
            const py0 = y0 * img.height;
            const px1 = x1 * img.width;
            const py1 = y1 * img.height;

            const cropWidth = px1 - px0;
            const cropHeight = py1 - py0;

            if (cropWidth <= 5 || cropHeight <= 5) {
                console.warn('Image crop: zero-area bounding box');
                return null;
            }

            // Add padding (8% horizontal, 15% vertical)
            const padX = Math.max(10, cropWidth * 0.08);
            const padY = Math.max(15, cropHeight * 0.15);

            const safeX0 = Math.max(0, px0 - padX);
            const safeY0 = Math.max(0, py0 - padY);
            const safeX1 = Math.min(img.width, px1 + padX);
            const safeY1 = Math.min(img.height, py1 + padY);

            // Crop using canvas
            const canvas = document.createElement('canvas');
            canvas.width = safeX1 - safeX0;
            canvas.height = safeY1 - safeY0;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img,
                safeX0, safeY0, canvas.width, canvas.height,
                0, 0, canvas.width, canvas.height
            );

            return canvas.toDataURL('image/png', 0.95);

        } catch (e) {
            console.error('Image crop error:', e);
            return null;
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
            let num = q.questionNumber;
            if (!num) {
                num = `unknown_${Math.floor(Math.random() * 1000)}`;
            }

            const docId = `m${mod}_q${num}`;
            const docRef = testRef.collection('questions').doc(docId);

            // --- Normalize data to match editor.js schema ---
            const data = {
                passage: q.passage || '',
                prompt: q.prompt || '',
                explanation: q.explanation || '',
                imageUrl: q.imageUrl || '',
                imageWidth: q.imageWidth || '100%',
                imagePosition: q.imagePosition || 'above',
                module: mod,
                questionNumber: parseInt(num) || 99,
                domain: q.domain || '',
                skill: q.skill || '',
                format: q.format || 'mcq',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (data.format === 'mcq') {
                // Normalize options from any AI format into {A, B, C, D}
                const opts = q.options;
                const parsed = { A: '', B: '', C: '', D: '' };

                if (opts && !Array.isArray(opts) && typeof opts === 'object') {
                    parsed.A = String(opts.A || opts.a || '');
                    parsed.B = String(opts.B || opts.b || '');
                    parsed.C = String(opts.C || opts.c || '');
                    parsed.D = String(opts.D || opts.d || '');
                } else if (Array.isArray(opts)) {
                    const letters = ['A', 'B', 'C', 'D'];
                    opts.slice(0, 4).forEach((item, i) => {
                        const letter = letters[i];
                        if (typeof item === 'string') {
                            parsed[letter] = item;
                        } else if (typeof item === 'object' && item !== null) {
                            // Try known keys: text, option_text, label, content
                            const text = item.text || item.option_text || item.label || item.content || '';
                            if (text) {
                                parsed[letter] = String(text);
                            } else {
                                // Fallback: longest string value that isn't just the letter
                                const possibleTexts = Object.values(item)
                                    .filter(v => typeof v === 'string' && v.length > 1 && v.toUpperCase() !== letter)
                                    .sort((a, b) => b.length - a.length);
                                parsed[letter] = possibleTexts[0] || '';
                            }
                        }
                    });
                }

                // Strip letter prefixes like "A) text"
                for (const k of ['A', 'B', 'C', 'D']) {
                    let val = parsed[k].trim();
                    const prefixRe = new RegExp(`^${k}[).:]\\s*`, 'i');
                    if (prefixRe.test(val)) val = val.replace(prefixRe, '');
                    parsed[k] = val;
                }

                data.options = parsed;
                const ans = String(q.correctAnswer || 'A').trim().toUpperCase();
                data.correctAnswer = ['A', 'B', 'C', 'D'].includes(ans) ? ans : 'A';
            } else {
                // fill-in format
                data.fillInAnswer = q.fillInAnswer || '';
                data.correctAnswer = String(q.correctAnswer || '');
            }

            batch.set(docRef, data);
        });

        await batch.commit();
    }


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
                        window.location.reload();
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
                            window.location.reload();
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
                window.location.reload();
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
                    window.location.href = `test.html?id=${testId}&proctorCode=${code}`;
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