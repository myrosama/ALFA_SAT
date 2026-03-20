// js/module-uploader.js
// ALFA SAT Full Module PDF Uploader
// This file handles the automatic module-wide screenshot extraction and uploading process.

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject UI Elements
    injectUploaderUI();

    // 2. Setup Event Listeners
    setupEventListeners();
});

// --- UI INJECTION ---
function injectUploaderUI() {
    // 1. Add "Module Uploader" button inside existing AI Helper Modal
    const aiModal = document.getElementById('ai-modal');
    if (aiModal) {
        // Find a good place to put it, maybe top right corner inside the modal
        const modUploaderBtn = document.createElement('button');
        modUploaderBtn.className = 'btn-icon'; // Use standard icon button class instead of giant floating btn
        modUploaderBtn.id = 'mod-uploader-btn';
        modUploaderBtn.title = 'Full Module PDF Uploader';
        // Add styling to place it in the top right corner of the AI modal
        modUploaderBtn.style.position = 'absolute';
        modUploaderBtn.style.top = '15px';
        modUploaderBtn.style.right = '50px'; // Right next to the close button which is usually at right: 15px
        modUploaderBtn.style.color = '#e74c3c';
        modUploaderBtn.style.fontSize = '1.2rem';
        modUploaderBtn.style.background = 'none';
        modUploaderBtn.style.border = 'none';
        modUploaderBtn.style.cursor = 'pointer';
        
        modUploaderBtn.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
        aiModal.appendChild(modUploaderBtn);
    }

    // 2. Add Modal
    const modalHtml = `
    <div class="modal-backdrop" id="mod-modal-backdrop" style="z-index: 2000; display: none;"></div>
    <div class="admin-modal" id="mod-modal" style="z-index: 2001; display: none;">
        <h3><i class="fa-solid fa-file-pdf"></i> Full Module PDF Uploader</h3>
        <p>Upload a PDF of a single module. The AI will automatically crop questions and submit them.</p>

        <div id="mod-upload-container">
            <div class="tool-group" style="margin-bottom: 15px;">
                <label>Select Module Target</label>
                <select id="mod-target-select" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border-color);">
                    <option value="1">Reading & Writing - Module 1 (Questions 1-27)</option>
                    <option value="2">Reading & Writing - Module 2 (Questions 1-27)</option>
                    <option value="3">Math - Module 1 (Questions 1-22)</option>
                    <option value="4">Math - Module 2 (Questions 1-22)</option>
                </select>
            </div>

            <input type="file" id="mod-pdf-upload" accept="application/pdf" hidden>
            <button class="btn-icon" id="mod-upload-button" type="button" onclick="document.getElementById('mod-pdf-upload').click()">
                <i class="fa-solid fa-upload"></i>
            </button>
            <span id="mod-upload-label">Click to select a PDF</span>
        </div>

        <div id="mod-progress-container" class="hidden" style="margin-top: 20px;">
            <h4 id="mod-status-text" style="font-size: 0.9rem; margin-bottom: 10px;">Status: Preparing...</h4>
            <div style="width: 100%; background-color: #eee; border-radius: 4px; overflow: hidden; height: 10px;">
                <div id="mod-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(135deg, #6A0DAD, #8a2be2); transition: width 0.3s ease;"></div>
            </div>
            <p id="mod-progress-details" style="font-size: 0.8rem; color: #666; margin-top: 5px; text-align: center;">0 / 0 questions processed</p>
            
            <div id="mod-current-preview" style="margin-top: 15px; text-align: center; max-height: 200px; overflow: hidden; border: 1px solid #ccc; border-radius: 4px;">
                <img id="mod-preview-img" src="" style="max-width: 100%; object-fit: contain;">
            </div>
            
            <div id="mod-error-log" class="hidden" style="margin-top: 15px; max-height: 100px; overflow-y: auto; font-size: 0.8rem; color: red; background: #ffeeee; padding: 10px; border-radius: 4px;">
            </div>
        </div>

        <div class="form-actions" style="margin-top: 20px;">
            <button type="button" class="btn btn-secondary" id="mod-cancel-btn">Close</button>
            <button type="button" class="btn btn-primary" id="mod-start-btn" disabled>
                <i class="fa-solid fa-play"></i> Start Automation
            </button>
        </div>
    </div>
    `;
    
    // Inject at the end of body
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    while(div.firstChild) {
        document.body.appendChild(div.firstChild);
    }
    
    // Ensure pdf.js is loaded
    if (typeof window.pdfjsLib === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        document.head.appendChild(script);
        
        script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        };
    }
}

// --- GLOBALS ---
let modPdfDoc = null;
let modIsRunning = false;
let modStopRequested = false;
let modQuestionsToProcess = [];

// --- API KEY ROTATION ---
// Round-robin through GEMINI_API_KEYS to stay under each key's 15 RPM limit.
let _geminiKeyIndex = 0;
function getNextGeminiKey() {
    const keys = (typeof GEMINI_API_KEYS !== 'undefined' && GEMINI_API_KEYS.length > 0)
        ? GEMINI_API_KEYS
        : [(typeof AI_API_KEY !== 'undefined') ? AI_API_KEY : ''];
    const key = keys[_geminiKeyIndex % keys.length];
    _geminiKeyIndex++;
    return key;
}

/**
 * Calls Gemini API with automatic key rotation and retry on 429/rate limit.
 * @param {object} payload - The request payload
 * @param {number} maxRetries - Max retry attempts on rate limit
 * @returns {Promise<object>} - Parsed JSON response
 */
async function callGeminiWithRetry(payload, maxRetries = 5) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const apiKey = getNextGeminiKey();
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.status === 429 || response.status === 503) {
                // Rate limited — wait and retry with next key
                const waitSec = Math.min(4 + attempt * 3, 20); // 4s, 7s, 10s, 13s...
                console.warn(`[module-uploader] Rate limited (${response.status}), retrying in ${waitSec}s with next key (attempt ${attempt + 1}/${maxRetries + 1})...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
                lastError = new Error(`Rate limited (${response.status})`);
                continue;
            }
            
            if (!response.ok) {
                let errorBody;
                try { errorBody = await response.json(); } catch (e) { /* ignore */ }
                const errorMsg = errorBody?.error?.message || response.statusText;
                
                // Gemini intermittent image processing bug — retriable
                if (response.status === 400 && errorMsg.includes('Unable to process input image')) {
                    const waitSec = 3 + attempt * 2; // 3s, 5s, 7s, 9s...
                    console.warn(`[module-uploader] Image processing error (transient), retrying in ${waitSec}s with next key (attempt ${attempt + 1}/${maxRetries + 1})...`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    lastError = new Error(`API Error ${response.status}: ${errorMsg}`);
                    continue;
                }
                
                throw new Error(`API Error ${response.status}: ${errorMsg}`);
            }
            
            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                if (result?.promptFeedback?.blockReason) {
                    throw new Error(`AI blocked: ${result.promptFeedback.blockReason}`);
                }
                // Empty response — also retriable (Gemini glitch)
                if (attempt < maxRetries) {
                    console.warn(`[module-uploader] Empty AI response, retrying with next key...`);
                    await new Promise(r => setTimeout(r, 2000));
                    lastError = new Error('Empty response from AI');
                    continue;
                }
                throw new Error('Empty response from AI');
            }
            
            return JSON.parse(text);
        } catch (err) {
            lastError = err;
            // Already handled retriable cases above (429, 503, image processing)
            // For other errors, allow a couple more retries with different keys
            if (attempt < maxRetries) {
                const isKnownRetriable = err.message.includes('Rate limited') 
                    || err.message.includes('Unable to process')
                    || err.message.includes('Empty response');
                if (isKnownRetriable) continue; // Already waited above
                
                console.warn(`[module-uploader] API error (attempt ${attempt + 1}/${maxRetries + 1}), retrying: ${err.message}`);
                await new Promise(r => setTimeout(r, 2000 + attempt * 1000));
                continue;
            }
            throw err;
        }
    }
    throw lastError || new Error('All API retry attempts exhausted');
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    const modBtn = document.getElementById('mod-uploader-btn');
    const modal = document.getElementById('mod-modal');
    const backdrop = document.getElementById('mod-modal-backdrop');
    const closeBtn = document.getElementById('mod-cancel-btn');
    const uploadInput = document.getElementById('mod-pdf-upload');
    const startBtn = document.getElementById('mod-start-btn');
    const uploadLabel = document.getElementById('mod-upload-label');

    // Toggle Modal
    modBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        backdrop.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('visible');
            backdrop.classList.add('visible');
        }, 10);
    });

    const closeModal = () => {
        if (modIsRunning && !confirm("Automation is running. Are you sure you want to close and stop?")) {
            return;
        }
        modStopRequested = true;
        modal.classList.remove('visible');
        backdrop.classList.remove('visible');
        setTimeout(() => {
            modal.style.display = 'none';
            backdrop.style.display = 'none';
            resetModModal();
        }, 300);
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    // File Upload
    uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadLabel.textContent = file.name;
        
        // Load PDF
        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading PDF...';
        startBtn.disabled = true;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            modPdfDoc = await window.pdfjsLib.getDocument({data: arrayBuffer}).promise;
            
            startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Automation';
            startBtn.disabled = false;
            
            document.getElementById('mod-status-text').textContent = `Loaded PDF: ${modPdfDoc.numPages} pages`;
            document.getElementById('mod-progress-container').classList.remove('hidden');
        } catch (err) {
            console.error("PDF Load Error", err);
            alert("Error loading PDF: " + err.message);
            resetModModal();
        }
    });

    // Start Automation
    startBtn.addEventListener('click', async () => {
        if (!modPdfDoc) return;
        
        modIsRunning = true;
        modStopRequested = false;
        
        document.getElementById('mod-upload-container').classList.add('hidden');
        startBtn.classList.add('hidden');
        closeBtn.textContent = "Stop Automation";
        
        const targetModule = parseInt(document.getElementById('mod-target-select').value);
        
        await runAutomation(targetModule);
    });
}

function resetModModal() {
    document.getElementById('mod-upload-container').classList.remove('hidden');
    document.getElementById('mod-progress-container').classList.add('hidden');
    document.getElementById('mod-pdf-upload').value = null;
    document.getElementById('mod-upload-label').textContent = 'Click to select a PDF';
    
    const startBtn = document.getElementById('mod-start-btn');
    startBtn.classList.remove('hidden');
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Automation';
    
    const closeBtn = document.getElementById('mod-cancel-btn');
    closeBtn.textContent = "Close";
    
    const errorLog = document.getElementById('mod-error-log');
    errorLog.innerHTML = "";
    errorLog.classList.add('hidden');
    
    modPdfDoc = null;
    modIsRunning = false;
    modStopRequested = false;
}

function logModError(msg) {
    const errorLog = document.getElementById('mod-error-log');
    errorLog.classList.remove('hidden');
    const entry = document.createElement('div');
    entry.textContent = `[Error] ${msg}`;
    errorLog.appendChild(entry);
    errorLog.scrollTop = errorLog.scrollHeight;
}

function updateModProgress(current, total, statusText) {
    const bar = document.getElementById('mod-progress-bar');
    const details = document.getElementById('mod-progress-details');
    const status = document.getElementById('mod-status-text');
    
    if (total > 0) {
        const pct = Math.round((current / total) * 100);
        bar.style.width = pct + '%';
        details.textContent = `${current} / ${total} items processed`;
    }
    
    if (statusText) {
        status.textContent = statusText;
    }
}

// --- CORE AUTOMATION LOGIC ---

async function clearModuleQuestions(targetModule) {
    const urlParams = new URLSearchParams(window.location.search);
    const mTestId = urlParams.get('id');
    const db = firebase.firestore();

    if (!mTestId || !targetModule) return;
    
    updateModProgress(1, 1, `Clearing old questions for Module ${targetModule}...`);
    try {
        const querySnapshot = await db.collection('tests').doc(mTestId).collection('questions').get();
        const batch = db.batch();
        let count = 0;
        
        querySnapshot.forEach(doc => {
            if (doc.id.startsWith(`m${targetModule}_`)) {
                // Completely deletes the question document from Firestore
                batch.delete(doc.ref);
                count++;
            }
        });
        
        if (count > 0) {
            await batch.commit();
            console.log(`Cleared ${count} old questions from Module ${targetModule} in the database.`);
        }
        
        // Wait a moment for firestore to sync before starting new uploads
        await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
        logModError(`Failed to clear old questions: ${error.message}`);
    }
}

async function runAutomation(targetModule) {
    // 0. CLEAR EXISTING DB QUESTIONS FOR THIS MODULE
    await clearModuleQuestions(targetModule);

    updateModProgress(0, 1, "Extracting pages as images...");
    
    // 1. Convert all PDF pages to Base64 Images
    const pageImages = [];
    try {
        for (let i = 1; i <= modPdfDoc.numPages; i++) {
            if (modStopRequested) return handleStop();
            updateModProgress(0, 1, `Rendering page ${i}/${modPdfDoc.numPages}...`);
            const pageInfo = await renderPageToBase64(i);
            pageImages.push(pageInfo);
        }
    } catch(err) {
        logModError("PDF rendering failed: " + err.message);
        return handleStop();
    }
    
    // 2. Locate Questions using Gemini Vision
    updateModProgress(0, 1, `Asking AI to find questions...`);
    let allQuestionBoxes = [];
    
    try {
        for (let i = 0; i < pageImages.length; i++) {
            if (modStopRequested) return handleStop();
            updateModProgress(0, 1, `Finding questions on page ${i+1}/${pageImages.length}...`);
            const boxes = await detectQuestionBoxesWithGemini(pageImages[i].base64Data);
            
            // Add boxes, keeping track of page index
            boxes.forEach(box => {
                allQuestionBoxes.push({
                    pageIndex: i,
                    box: box // {ymin, xmin, ymax, xmax} mapped to 0-1000
                });
            });
            
            // Artificial delay to respect rate limits
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch(err) {
        logModError("Failed to detect questions bounding boxes: " + err.message);
        return handleStop();
    }
    
    // Filter out invalid boxes according to Gemini's isValid flag
    allQuestionBoxes = allQuestionBoxes.filter(item => 
        item.box && item.box.isValid === true && typeof item.box.questionNumber === 'number'
    );
    
    if (allQuestionBoxes.length === 0) {
        logModError("AI found no valid, complete questions in this PDF.");
        return handleStop();
    }
    
    // Process by explicit question number rather than array index
    allQuestionBoxes.sort((a, b) => a.box.questionNumber - b.box.questionNumber);
    
    const maxExpectedQuestions = targetModule <= 2 ? 27 : 22;
    // Cap at expected questions just in case it reads random numbers
    if (allQuestionBoxes.length > maxExpectedQuestions) {
        allQuestionBoxes = allQuestionBoxes.slice(0, maxExpectedQuestions);
    }
    
    // 3. Process each question
    const totalQuestions = allQuestionBoxes.length;
    let successCount = 0;
    
    for (let qIdx = 0; qIdx < totalQuestions; qIdx++) {
        if (modStopRequested) return handleStop();
        
        const qData = allQuestionBoxes[qIdx];
        const currentQNumber = qData.box.questionNumber;
        
        // Prevent assigning a question number higher than max (e.g., if Gemini hallucinated Q99)
        if (currentQNumber > maxExpectedQuestions) {
            logModError(`Skipping Q${currentQNumber} as it exceeds max module size of ${maxExpectedQuestions}.`);
            continue;
        }

        updateModProgress(qIdx, totalQuestions, `Processing Question ${currentQNumber}...`);
        
        const pageImg = pageImages[qData.pageIndex];
        
        // Switch UI to this question slot to replicate human behavior
        // This relies on the global `switchModule` and `showEditorForQuestion` functions 
        // which must be exposed or accessible from editor.js
        if (typeof switchModule !== 'function' || typeof showEditorForQuestion !== 'function') {
            logModError("Could not hook into UI. Global functions not found.");
            return handleStop();
        }
        
        // This triggers a UI update
        showEditorForQuestion(targetModule, currentQNumber);
        
        try {
            // Crop image (default: JPEG)
            const croppedBase64 = await cropImage(pageImg.canvas, qData.box);
            
            // Show preview in modal
            document.getElementById('mod-preview-img').src = 'data:image/jpeg;base64,' + croppedBase64;
            
            updateModProgress(qIdx, totalQuestions, `AI extracting fields for Q${currentQNumber}...`);
            
            // Direct API call for extraction (bypasses fragile modal hook)
            let extractedData = await runDirectExtraction(targetModule, croppedBase64);
            
            // PNG fallback: if JPEG extraction failed (likely "Unable to process input image"),
            // re-crop as PNG and try again — Gemini sometimes handles PNG more reliably
            if (!extractedData) {
                console.warn(`[module-uploader] JPEG extraction failed for Q${currentQNumber}, trying PNG fallback...`);
                updateModProgress(qIdx, totalQuestions, `Retrying Q${currentQNumber} with PNG format...`);
                const pngBase64 = await cropImage(pageImg.canvas, qData.box, 'image/png');
                extractedData = await runDirectExtraction(targetModule, pngBase64, 'image/png');
            }
            
            if (extractedData) {
                // Fill the editor form directly via exposed global function
                if (typeof window._fillEditorForm === 'function') {
                    window._fillEditorForm(extractedData);
                }
                // Wait for the auto-save triggered by fillEditorForm to complete
                await new Promise(r => setTimeout(r, 1500));
                
                // Upload image if this question has one
                if (qData.box.hasImage && qData.box.imageBBox && typeof window._setQuestionImage === 'function') {
                    updateModProgress(qIdx, totalQuestions, `Uploading image for Q${currentQNumber}...`);
                    try {
                        const tgUrl = await cropAndUploadImage(pageImg.canvas, qData.box.imageBBox);
                        if (tgUrl) {
                            window._setQuestionImage(tgUrl);
                            await new Promise(r => setTimeout(r, 500));
                        } else {
                            logModError(`Image upload failed for Q${currentQNumber} (Telegram returned null).`);
                        }
                    } catch (imgErr) {
                        logModError(`Image upload error for Q${currentQNumber}: ${imgErr.message}`);
                    }
                }
                
                // If Math, run AI Fix via direct API call
                if (targetModule > 2) {
                    updateModProgress(qIdx, totalQuestions, `Running AI Fix (KaTeX wrap) for Q${currentQNumber}...`);
                    const fixResult = await runAiFixMathFormatting();
                    if (!fixResult) logModError(`Math fix timed out or failed for Q${currentQNumber}`);
                }
                
                // Explicitly save question
                if (typeof window._handleFormSubmit === 'function') {
                    window._handleFormSubmit(new Event('submit'));
                } else if (typeof document.getElementById('save-question-btn')?.click === 'function') {
                    document.getElementById('save-question-btn').click();
                }
                await new Promise(r => setTimeout(r, 1000));
                successCount++;
            } else {
                logModError(`Extraction failed for Q${currentQNumber}. Check the console for details.`);
            }
            
        } catch (err) {
            logModError(`Error on Q${currentQNumber}: ` + err.message);
        }
        
        // Rate limit delay between questions
        await new Promise(r => setTimeout(r, 2000));
    }
    
    updateModProgress(totalQuestions, totalQuestions, `Done! ${successCount}/${totalQuestions} processed successfully.`);
    document.getElementById('mod-cancel-btn').textContent = "Finish & Close";
    modIsRunning = false;
}

function handleStop() {
    modIsRunning = false;
    document.getElementById('mod-status-text').textContent = "Stopped.";
    document.getElementById('mod-cancel-btn').textContent = "Close";
}

// --- HELPER FUNCTIONS ---

async function renderPageToBase64(pageNum) {
    const page = await modPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High res for OCR
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    
    // We keep the canvas for cropping, but return the base64 for Gemini Vision
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    return { canvas, base64Data };
}

async function detectQuestionBoxesWithGemini(base64Image) {
    const prompt = `Analyze this SAT test page image. Identify the bounding boxes for every distinct multiple-choice or math question present on the page.
A question typically includes the passage/context (if any), the prompt, the graphic/chart (if any), and all answer choices.
Return a valid JSON array of objects. Each object should represent a single question area and must contain exactly these fields: 
- "questionNumber": the integer number printed next to the question (e.g., 3).
- "ymin", "xmin", "ymax", "xmax": exactly these 4 integer values between 0 and 1000 representing scaled coordinates relative to the image dimensions.
- "isValid": a boolean (true/false) that is true ONLY if the box successfully captures the FULL context, the prompt, and ALL 4 answer choices (if multiple choice). Mark it false if it is cut off or missing choices.
- "hasImage": a boolean. true if the question contains a graph, chart, figure, table, or any visual diagram that is essential to answering the question. false if it is text-only.
- "imageBBox": if "hasImage" is true, provide the bounding box of JUST the image/graph/chart as {"ymin": ..., "xmin": ..., "ymax": ..., "xmax": ...} using the same 0-1000 coordinate system relative to the FULL PAGE. If "hasImage" is false, set this to null.

Do not include \`\`\`json or markdown, just the raw JSON array.
If no questions are found, return an empty array [].`;

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: base64Image
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    // Uses key rotation + retry via shared helper
    return await callGeminiWithRetry(payload);
}

async function cropImage(sourceCanvas, box, format = 'image/jpeg') {
    // box coordinates are 0-1000
    const x0 = Math.floor((box.xmin / 1000) * sourceCanvas.width);
    const y0 = Math.floor((box.ymin / 1000) * sourceCanvas.height);
    const x1 = Math.ceil((box.xmax / 1000) * sourceCanvas.width);
    const y1 = Math.ceil((box.ymax / 1000) * sourceCanvas.height);
    
    const w = x1 - x0;
    const h = y1 - y0;
    
    if (w <= 0 || h <= 0) throw new Error("Invalid crop box dimensions");
    
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;
    const cropCtx = cropCanvas.getContext('2d');
    
    cropCtx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, w, h);
    
    const quality = format === 'image/png' ? undefined : 0.9;
    return cropCanvas.toDataURL(format, quality).split(',')[1];
}

async function cropAndUploadImage(sourceCanvas, imageBBox) {
    // Crop the image/graph sub-region from the page canvas
    const x0 = Math.floor((imageBBox.xmin / 1000) * sourceCanvas.width);
    const y0 = Math.floor((imageBBox.ymin / 1000) * sourceCanvas.height);
    const x1 = Math.ceil((imageBBox.xmax / 1000) * sourceCanvas.width);
    const y1 = Math.ceil((imageBBox.ymax / 1000) * sourceCanvas.height);
    
    const w = x1 - x0;
    const h = y1 - y0;
    
    if (w <= 0 || h <= 0) {
        console.warn("Invalid image crop dimensions, skipping image upload.");
        return null;
    }
    
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(sourceCanvas, x0, y0, w, h, 0, 0, w, h);
    
    // Convert canvas to Blob for Telegram upload
    const blob = await new Promise(resolve => cropCanvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return null;
    
    const file = new File([blob], 'question_image.jpg', { type: 'image/jpeg' });
    
    // Upload via shared TelegramImages utility
    const tgUrl = await TelegramImages.uploadImage(file);
    return tgUrl; // e.g. "tg://0:AgACAgIAAxk..."
}

/**
 * Direct API extraction — bypasses the fragile AI modal hook entirely.
 * Makes a Gemini API call directly with key rotation + retry, then fills
 * the editor form via the exposed global _fillEditorForm function.
 */
async function runDirectExtraction(targetModule, base64Image, mimeType = 'image/jpeg') {
    const isMath = targetModule > 2;
    const subject = isMath ? 'Math' : 'Reading & Writing';
    const domains = window._QUESTION_DOMAINS || {};
    const domainSource = isMath ? (domains.Math || {}) : (domains['Reading & Writing'] || {});
    const domainList = Object.keys(domainSource).join(', ');
    
    const textPrompt = `You are an expert SAT question parser. Analyze this image of an SAT question.
The image may contain a reading passage, a question prompt, and multiple-choice options.
Extract the following information:
1.  **passage**: The full text of the reading passage, if one exists. If not, this should be an empty string. Handle text formatting like bold and underline by wrapping them in <b></b> or <u></u> tags. For math, this is usually empty.
2.  **prompt**: The text of the question itself, including any inline text from the passage. Handle all text formatting. For math, include all parts of the question, but *not* the multiple choice options.
3.  **options**: A JSON object of the four multiple-choice options, like {"A": "Text...", "B": "Text...", "C": "Text...", "D": "Text..."}. Handle all text formatting, especially math formulas.
4.  **correctAnswer**: The correct option letter ("A", "B", "C", or "D"). Infer this from visual cues in the image, such as a checkmark, a circle, or bolding on the correct answer. If no cue, select the most logical answer.
5.  **domain**: Categorize this question into one of the following domains: ${domainList}.
6.  **skill**: Based on the domain, categorize this into the most specific skill from the provided list.
7.  **explanation**: Write a clear, concise explanation for why the correct answer is right and the others are wrong.

Return *only* a single, valid JSON object with these fields.`;

    const payload = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: textPrompt },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    passage: { type: 'STRING' },
                    prompt: { type: 'STRING' },
                    options: {
                        type: 'OBJECT',
                        properties: {
                            A: { type: 'STRING' },
                            B: { type: 'STRING' },
                            C: { type: 'STRING' },
                            D: { type: 'STRING' }
                        },
                        required: ['A', 'B', 'C', 'D']
                    },
                    correctAnswer: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] },
                    domain: { type: 'STRING' },
                    skill: { type: 'STRING' },
                    explanation: { type: 'STRING' }
                },
                required: ['prompt', 'options', 'correctAnswer', 'explanation', 'domain', 'skill']
            }
        }
    };

    try {
        return await callGeminiWithRetry(payload);
    } catch (err) {
        console.error('[module-uploader] Extraction API error:', err);
        logModError(`API extraction error: ${err.message}`);
        return null;
    }
}

/**
 * AI Fix for math formatting — also uses direct API calls with key rotation.
 * Reads the current editor content, sends to Gemini with KaTeX wrapping instructions,
 * and applies the result back.
 */
async function runAiFixMathFormatting() {
    try {
        // Read current editor content via DOM
        const editorContainer = document.getElementById('question-editor-container');
        if (!editorContainer) return false;
        
        const questionForm = editorContainer.querySelector('#question-form');
        if (!questionForm) return false;
        
        const getEditorHTML = (selector) => {
            const el = editorContainer.querySelector(selector);
            return el ? el.querySelector('.ql-editor')?.innerHTML || '' : '';
        };
        
        const currentData = {
            passage: document.querySelector('#stimulus-editor .ql-editor')?.innerHTML || '',
            prompt: getEditorHTML('#question-text-editor'),
            options: {
                A: getEditorHTML('#option-a'),
                B: getEditorHTML('#option-b'),
                C: getEditorHTML('#option-c'),
                D: getEditorHTML('#option-d')
            },
            explanation: getEditorHTML('#explanation-editor')
        };
        
        const instruction = 'Wrap all the equations, math expressions, functions, numbers and variables (like x, y) to the katex format using $...$ delimiters. Do not add plain text for them. If it\'s a block equation use $$...$$';

        const systemInstruction = `You are an expert SAT question editor. You will be provided with the current HTML state of an SAT question.
Apply the following instruction: "${instruction}"

RULES:
- ALL math formulas, variables, numbers, and equations MUST be wrapped in $...$
- Block equations should use $$...$$
- Do NOT use plain text for variables or equations.
- Do NOT output nested HTML span tags or ql-formula tags.

Return ONLY a valid JSON object with: passage, prompt, options (A,B,C,D), explanation — all as HTML strings.`;

        const payload = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemInstruction },
                        { text: 'CURRENT QUESTION DATA:\n' + JSON.stringify(currentData, null, 2) }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json'
            }
        };

        const updatedData = await callGeminiWithRetry(payload);
        
        // Apply via fillEditorForm (it handles Quill editors and auto-saves)
        if (typeof window._fillEditorForm === 'function' && updatedData) {
            // fillEditorForm expects passage, prompt, options, explanation, correctAnswer, domain, skill
            // We only want to update content fields (not correctAnswer/domain/skill)
            // So we use dangerouslyPasteHTML directly on the Quill editors
            const applyToEditor = (selector, html) => {
                if (!html) return;
                const editorEl = selector.startsWith('#stimulus') 
                    ? document.querySelector(`${selector} .ql-editor`)
                    : editorContainer.querySelector(`${selector} .ql-editor`);
                if (editorEl) {
                    // Get the Quill instance from the editor element
                    const qlEditor = editorEl.closest('.ql-container')?.__quill;
                    if (qlEditor) {
                        qlEditor.clipboard.dangerouslyPasteHTML(html);
                    } else {
                        editorEl.innerHTML = html;
                    }
                }
            };
            
            applyToEditor('#stimulus-editor', updatedData.passage);
            applyToEditor('#question-text-editor', updatedData.prompt);
            if (updatedData.options) {
                applyToEditor('#option-a', updatedData.options.A);
                applyToEditor('#option-b', updatedData.options.B);
                applyToEditor('#option-c', updatedData.options.C);
                applyToEditor('#option-d', updatedData.options.D);
            }
            applyToEditor('#explanation-editor', updatedData.explanation);
        }
        
        // Trigger save
        if (typeof window._handleFormSubmit === 'function') {
            window._handleFormSubmit(new Event('submit'));
        } else {
            document.getElementById('save-question-btn')?.click();
        }
        await new Promise(r => setTimeout(r, 500));
        
        return true;
    } catch (err) {
        console.error('[module-uploader] AI Fix error:', err);
        logModError(`AI Fix error: ${err.message}`);
        return false;
    }
}

