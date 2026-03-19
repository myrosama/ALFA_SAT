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
            // Crop image
            const croppedBase64 = await cropImage(pageImg.canvas, qData.box);
            
            // Show preview in modal
            document.getElementById('mod-preview-img').src = 'data:image/jpeg;base64,' + croppedBase64;
            
            updateModProgress(qIdx, totalQuestions, `AI extracting fields for Q${currentQNumber}...`);
            
            // Re-use Gemini Extraction Logic
            const extractionSuccess = await runExtractionOnCroppedImage(targetModule, croppedBase64);
            
            if (extractionSuccess) {
                // Let the editor's auto-save (triggered on modal close) finish its cycle first to prevent collision
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
                
                // If Math, run AI Fix explicitly
                if (targetModule > 2) {
                    updateModProgress(qIdx, totalQuestions, `Running AI Fix (KaTeX wrap) for Q${currentQNumber}...`);
                    const fixResult = await runAiFixMathFormatting();
                    if (!fixResult) logModError(`Math fix timed out or failed for Q${currentQNumber}`);
                }
                successCount++;
            } else {
                logModError(`Extraction failed for Q${currentQNumber}. Please check the console for API errors or see if the API Key limit was reached.`);
            }
            
            // Explicitly Save Question just in case it didn't trigger
            if (typeof document.getElementById('save-question-btn')?.click === 'function') {
                document.getElementById('save-question-btn').click();
                await new Promise(r => setTimeout(r, 1000)); // wait for save
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
    const apiKey = (typeof AI_API_KEY !== 'undefined') ? AI_API_KEY : "";
    if (!apiKey || apiKey === "PASTE_YOUR_GOOGLE_AI_API_KEY_HERE") {
        throw new Error("No API key configured");
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;
    
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

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("API call failed: " + response.statusText);
    
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error("Empty response from AI for bounding boxes");
    
    return JSON.parse(text);
}

async function cropImage(sourceCanvas, box) {
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
    
    return cropCanvas.toDataURL('image/jpeg', 0.9).split(',')[1];
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

async function runExtractionOnCroppedImage(targetModule, base64Image) {
    // This utilizes the global `callGeminiToParseQuestion` logic if it is exposed.
    // However, since `callGeminiToParseQuestion` in editor.js accesses private variables
    // like `currentQuestion`, `currentModule`, and manipulates UI modal elements (`aiModal`),
    // we need to mimic its exact payload but parse it to `fillEditorForm` which is also private.
    // To solve this cleanly without modifying editor.js extensively:
    // We will inject a temporary hidden input file, trigger the standard `aiUploadInput` change event, 
    // and click the `aiImportBtn`.
    
    return new Promise((resolve) => {
        const aiUploadInput = document.getElementById('ai-image-upload');
        const aiImportBtn = document.getElementById('ai-import-btn');
        const aiModal = document.getElementById('ai-modal');
        const aiModalBackdrop = document.getElementById('ai-modal-backdrop');
        const aiHelperBtn = document.getElementById('ai-helper-btn');
        
        if (!aiUploadInput || !aiImportBtn || !aiHelperBtn) {
            logModError("Missing editor DOM elements for AI extraction hook.");
            resolve(false);
            return;
        }
        
        // 1. Convert base64 to File object to mimic user upload
        const byteString = atob(base64Image);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'image/jpeg' });
        const dummyFile = new File([blob], "crop.jpeg", { type: "image/jpeg" });
        
        // Use DataTransfer to programmatically set the file input
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(dummyFile);
        aiUploadInput.files = dataTransfer.files;
        
        // 2. We don't want the modal to visibly pop up and interrupt the user.
        // But we must open it because the original code requires the modal to be visible to function correctly.
        aiModal.style.opacity = '0';
        aiModalBackdrop.style.opacity = '0';
        aiHelperBtn.click(); // Open modal
        
        // Monitor mutations on the import button to wait for the FileReader in `editor.js` to finish
        const observer = new MutationObserver((mutations, obs) => {
            if (!aiImportBtn.disabled) {
                // FileReader finished, base64 is loaded in `editor.js`.
                obs.disconnect();
                
                // Now monitor for completion (when modal closes)
                const completionObserver = new MutationObserver((mutations, obs2) => {
                    // editor.js removes the 'visible' class when done or failed
                    if (!aiModal.classList.contains('visible') || document.getElementById('ai-error-msg')?.classList.contains('visible')) {
                        obs2.disconnect();
                        aiModal.style.opacity = ''; // Restore opacity
                        aiModalBackdrop.style.opacity = '';
                        
                        const hasError = document.getElementById('ai-error-msg')?.classList.contains('visible');
                        if (hasError) {
                             logModError("AI Import reported an internal error (check API key / quota).");
                             resolve(false);
                        } else {
                             resolve(true); // Success
                        }
                    }
                });
                
                completionObserver.observe(aiModal, { attributes: true, attributeFilter: ['class'] });
                completionObserver.observe(document.getElementById('ai-error-msg'), { attributes: true, attributeFilter: ['class'] });
                
                // Trigger import
                aiImportBtn.click();
                
                // Timeout for safety (e.g. 30s)
                setTimeout(() => {
                    completionObserver.disconnect();
                    resolve(false); 
                }, 30000);
            }
        });
        
        // Start watching for FileReader to complete enabling the import button
        observer.observe(aiImportBtn, { attributes: true, attributeFilter: ['disabled'] });
        
        // 3. Trigger the file input change event to kick off `editor.js` FileReader
        const event = new Event('change', { bubbles: true });
        aiUploadInput.dispatchEvent(event);
    });
}

async function runAiFixMathFormatting() {
    return new Promise(async (resolve) => {
        // Instead of trying to find the dynamically-injected 'open-ai-fix-btn',
        // we directly open the AI Fix panel. These elements are static in the HTML.
        const aiFixPanel = document.getElementById('ai-fix-panel');
        const instructionInput = document.getElementById('ai-fix-instruction');
        const runBtn = document.getElementById('run-ai-fix-btn');
        const loadingDiv = document.getElementById('ai-fix-loading');
        const mainEditorContent = document.querySelector('.editor-main-content');
        
        if (!aiFixPanel || !instructionInput || !runBtn) {
            logModError("AI Fix panel elements not found in HTML.");
            resolve(false);
            return;
        }
        
        // Open the panel directly (replicating what openAiFixPanel() does in editor.js)
        aiFixPanel.style.display = 'flex';
        if (mainEditorContent) mainEditorContent.classList.add('ai-panel-open');
        
        // Small delay to let the panel render
        await new Promise(r => setTimeout(r, 300));
        
        // Set instruction
        instructionInput.value = "Wrap all the equations, math expressions, functions, numbers and variables (like x, y) to the katex format using $...$ delimiters. Do not add plain text for them. If it's a block equation use $$...$$";
        
        // Monitor for completion by watching the runBtn's style.display.
        // editor.js handler: hides runBtn (display='none') on start, shows it (display='block') on finish.
        let aiStarted = false;
        const observer = new MutationObserver((mutations, obs) => {
            // Phase 1: Detect that AI started (runBtn hidden)
            if (!aiStarted && runBtn.style.display === 'none') {
                aiStarted = true;
            }
            // Phase 2: Detect completion (runBtn shown again after being hidden)
            if (aiStarted && runBtn.style.display === 'block') {
                obs.disconnect();
                // Close panel
                aiFixPanel.style.display = 'none';
                if (mainEditorContent) mainEditorContent.classList.remove('ai-panel-open');
                instructionInput.value = '';
                // Trigger a save after the fix
                setTimeout(() => {
                    document.getElementById('save-question-btn')?.click();
                }, 300);
                resolve(true);
            }
        });
        
        observer.observe(runBtn, { attributes: true, attributeFilter: ['style'] });
        if (loadingDiv) observer.observe(loadingDiv, { attributes: true, attributeFilter: ['style'] });
        
        // Trigger Fix by clicking the static run button
        runBtn.click();
        
        // Safety timeout (45s for API call)
        setTimeout(() => {
            observer.disconnect();
            // Clean up panel
            aiFixPanel.style.display = 'none';
            if (mainEditorContent) mainEditorContent.classList.remove('ai-panel-open');
            if (!aiStarted) {
                logModError("AI Fix never started - the click handler may not have fired.");
            }
            resolve(false);
        }, 45000);
    });
}

