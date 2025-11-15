// js/editor.js
// UPDATED: To add Gemini AI Question Importer

document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Setup ---
    const db = firebase.firestore();

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    const stimulusPanel = document.getElementById('stimulus-panel');
    const stimulusPanelContent = stimulusPanel.querySelector('.panel-content');
    const addImageBtn = document.getElementById('add-image-btn');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    // --- Page State ---
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null; // Stores the *number* (e.g., 1, 2, 3)
    let savedQuestions = {}; // { "m1_q1": true, "m1_q2": true, ... }
    let editors = {}; // { passage, prompt, options: {A, B, C, D}, fillIn, explanation }
    let testName = "Loading..."; // Store test name

    // --- Data Definitions ---
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
            "Problem-Solving and Data Analysis": ["Ratios, rates, proportional relationships, and units", "Percentages", "One-variable data: distributions and measures of center and spread", "Two-variable data: models and scatterplots", "Probability and conditional probability", "Inference from sample statistics and margin of error"],
            "Geometry and Trigonometry": ["Area and volume", "Lines, angles, and triangles", "Right triangles and trigonometry", "Circles"]
        }
    };

    // --- Main Initialization ---
    if (!testId) {
        alert("No Test ID found in URL. Redirecting to admin panel.");
        window.location.href = 'admin.html';
        return;
    }

    const testRef = db.collection('tests').doc(testId);

    // Fetch test name
    testRef.get().then(doc => {
        if (doc.exists) {
            testName = doc.data().name || "Unnamed Test";
            editorHeaderTitle.textContent = `Editing: ${testName}`;
        } else {
            alert("Test not found!");
            window.location.href = 'admin.html';
        }
    }).catch(err => {
        console.error("Error fetching test name:", err);
        editorHeaderTitle.textContent = "Error Loading Test";
    });

    // Fetch existing question markers
    testRef.collection('questions').get().then(snapshot => {
        snapshot.forEach(doc => {
            savedQuestions[doc.id] = true;
        });
        // Start on module 1 after markers are loaded
        switchModule(1);
    }).catch(err => {
        console.error("Error fetching question markers:", err);
        switchModule(1); // Still try to load module 1
    });

    /**
     * Clears all Quill editors and the stimulus panel content.
     */
    function cleanupStimulusPanel() {
        if (editors.passage && typeof editors.passage.disable === 'function') {
             editors.passage.disable(); 
        }
        
        if (stimulusPanelContent) {
            stimulusPanelContent.innerHTML = `
                <div id="stimulus-image-container" class="hidden">
                    <img id="stimulus-image-preview" src="" alt="Stimulus preview">
                    <div class="resize-handle"></div>
                </div>
                <div id="stimulus-editor"></div>`;
            stimulusPanelContent.classList.remove('image-below'); 
        }
        
        editors = {
            passage: null,
            prompt: null,
            options: { A: null, B: null, C: null, D: null },
            fillIn: null,
            explanation: null // Keep explanation editor
        };
    }
    
    /**
     * Placeholder function - we are not using Telegram for this.
     * We will use image-to-base64 conversion instead.
     */
     async function uploadImageToTelegram(file) {
        // This function seems to be defined in the original file, but was missing in the provided snippet.
        // Assuming it exists (e.g., from config.js or similar)
        if (typeof TELEGRAM_BOT_TOKEN === 'undefined' || typeof TELEGRAM_CHANNEL_ID === 'undefined') {
            console.error('Telegram configuration is missing.');
            alert('Error: Telegram configuration is missing. Cannot upload image.');
            return null;
        }
        
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHANNEL_ID);
        formData.append('photo', file);
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            const data = await response.json();
            if (data.ok) {
                // Get the file_id of the largest photo
                const photoArray = data.result.photo;
                const fileId = photoArray[photoArray.length - 1].file_id;
                
                // Use getFile to get the file_path
                const fileUrlDataRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
                const fileUrlData = await fileUrlDataRes.json();
                
                if (fileUrlData.ok) {
                    // Construct the permanent file URL
                    return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileUrlData.result.file_path}`;
                } else {
                    throw new Error(fileUrlData.description);
                }
            } else {
                throw new Error(data.description);
            }
        } catch (error) {
            console.error('Telegram Upload Error:', error);
            alert('Error uploading image: ' + error.message);
            return null;
        }
    }

    /**
     * Renders the stimulus image preview.
     */
    function renderStimulus(data = {}) {
        const imageContainer = document.getElementById('stimulus-image-container');
        const imagePreview = document.getElementById('stimulus-image-preview');
        
        if (imageContainer && imagePreview) {
            if (data.imageUrl) {
                imagePreview.src = data.imageUrl;
                imageContainer.style.width = data.imageWidth || '100%';
                imageContainer.classList.remove('hidden');
            } else {
                imageContainer.classList.add('hidden');
                imagePreview.src = ""; // Clear src
                imageContainer.style.width = '100%'; // Reset width
            }
        }
    }

    /**
     * Sets up mouse events for resizing the image container.
     */
    function setupImageResizing() {
        const imageContainer = document.getElementById('stimulus-image-container');
        if (!imageContainer) return;
        const resizeHandle = imageContainer.querySelector('.resize-handle');
        if (!resizeHandle) return;

        let isResizing = false;
        
        const doDrag = (dragEvent) => {
            if (!isResizing) return;
            const newWidth = Math.max(50, imageContainer.offsetWidth + (dragEvent.clientX - startX));
            imageContainer.style.width = `${newWidth}px`;
            startX = dragEvent.clientX; // Reset startX for next move event
        };

        const stopDrag = () => {
            isResizing = false;
            window.removeEventListener('mousemove', doDrag);
            window.removeEventListener('mouseup', stopDrag);
            document.body.style.userSelect = ''; // Re-enable text selection
        };
        
        let startX = 0;
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            document.body.style.userSelect = 'none'; // Disable text selection
            window.addEventListener('mousemove', doDrag);
            window.addEventListener('mouseup', stopDrag, { once: true });
        });
    }

    /**
     * Initializes all Quill editors with correct bounds.
     */
    function initializeQuillEditors() {
        const toolbarOptions = [
            ['bold', 'italic', 'underline'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'align': [] }],
            ['formula'],
            ['clean']
        ];
        
        const passageConfig = {
            modules: { toolbar: toolbarOptions },
            theme: 'snow',
            bounds: document.getElementById('stimulus-panel')
        };

        const questionConfig = {
            modules: { toolbar: toolbarOptions },
            theme: 'snow',
            bounds: document.getElementById('question-panel')
        };

        editors = {}; // Clear previous instances

        try {
            editors.passage = new Quill('#stimulus-editor', { ...passageConfig, placeholder: 'Type or paste passage content here...' });
            editors.prompt = new Quill('#question-text-editor', { ...questionConfig, placeholder: 'Type the question prompt here...' });

            editors.options = {};
            ['A', 'B', 'C', 'D'].forEach(opt => {
                editors.options[opt] = new Quill(`#option-${opt.toLowerCase()}`, questionConfig);
            });
            editors.fillIn = new Quill('#fill-in-answer', questionConfig);
            // This editor ID is from the GitHub version
            editors.explanation = new Quill('#explanation-editor', { ...questionConfig, placeholder: 'Type the explanation here...' });
        } catch(e) {
            console.error("Quill initialization failed. Are the containers in the DOM?", e);
            alert("Error: Could not load text editors. Please refresh.");
        }
    }
    
    /**
     * Generates navigation buttons for the given module.
     * @param {number} count - Number of questions in the module.
     * @param {number} moduleNum - The module number (1-4).
     */
    function generateNavButtons(count, moduleNum) {
        if (!questionNavigator) return;
        questionNavigator.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const button = document.createElement('button');
            button.className = 'q-nav-btn';
            button.dataset.module = moduleNum;
            button.dataset.qNumber = i;
            button.textContent = i;

            const questionId = `m${moduleNum}_q${i}`;
            if (savedQuestions[questionId]) button.classList.add('completed');
            if (i === currentQuestion) button.classList.add('active');

            button.addEventListener('click', handleNavClick);
            questionNavigator.appendChild(button);
        }
    }
    
    /**
     * Switches the editor view to a different module.
     * @param {number} moduleNum - The module number to switch to (1-4).
     */
    function switchModule(moduleNum) {
        if (currentModule === moduleNum && currentQuestion != null) return; // Avoid redundant switch
        
        currentModule = parseInt(moduleNum); // Ensure it's a number
        currentQuestion = null; // Deselect question
        
        cleanupStimulusPanel(); // Clear editors

        if(editorContainer) editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below.</p></div>`;
        
        // R&W modules have 27 questions, Math modules have 22
        const questionCount = (currentModule <= 2) ? 27 : 22;
        generateNavButtons(questionCount, currentModule);

        document.querySelectorAll('.module-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.module) === currentModule);
        });
    }

    /**
     * Fetches question data and displays the editor form.
     */
    async function showEditorForQuestion(module, qNumber) {
        currentModule = parseInt(module);
        currentQuestion = parseInt(qNumber);
        
        document.querySelectorAll('.q-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.qNumber == qNumber && btn.dataset.module == module);
        });

        cleanupStimulusPanel();

        if (!editorTemplate || !editorContainer) {
            console.error("Editor template or container not found!");
            return;
        }
        editorContainer.innerHTML = ''; // Clear placeholder
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.appendChild(formClone);
        
        initializeQuillEditors();

        // --- Select form elements ---
        const questionForm = editorContainer.querySelector('#question-form');
        const domainSelect = questionForm.querySelector('#q-domain');
        const skillSelect = questionForm.querySelector('#q-skill');
        const formatSelect = questionForm.querySelector('#q-format');
        const imagePosSelect = questionForm.querySelector('#q-image-position');
        
        document.getElementById('q-number-display').textContent = qNumber;

        const isMath = currentModule > 2;
        const domainSource = isMath ? QUESTION_DOMAINS.Math : QUESTION_DOMAINS["Reading & Writing"];
        
        domainSelect.innerHTML = Object.keys(domainSource).map(d => `<option value="${d}">${d}</option>`).join('');
        
        const populateSkills = () => {
            const skills = domainSource[domainSelect.value] || [];
            skillSelect.innerHTML = skills.map(s => `<option value="${s}">${s}</option>`).join('');
        };
        domainSelect.addEventListener('change', populateSkills);
        
        formatSelect.addEventListener('change', () => {
            questionForm.querySelector('#answer-options-container').classList.toggle('hidden', formatSelect.value !== 'mcq');
            questionForm.querySelector('#fill-in-answer-container').classList.toggle('hidden', formatSelect.value !== 'fill-in');
        });

        if (stimulusPanelContent) {
            imagePosSelect.addEventListener('change', () => {
                stimulusPanelContent.classList.toggle('image-below', imagePosSelect.value === 'below');
            });
        }
        
        // --- Fetch and Load Existing Question Data ---
        const questionId = `m${module}_q${qNumber}`;
        const docRef = testRef.collection('questions').doc(questionId);
        let data = {};
        
        try {
            const doc = await docRef.get();
            if (doc.exists) {
                data = doc.data();
            }
        } catch (err) {
            console.error("Error fetching question data:", err);
            alert("Error loading question data. See console.");
        }
        
        renderStimulus(data);
        if(editors.passage) editors.passage.root.innerHTML = data.passage || '';

        if(editors.prompt) editors.prompt.root.innerHTML = data.prompt || '';
        if (data.options && editors.options) {
            ['A', 'B', 'C', 'D'].forEach(opt => {
                if (editors.options[opt]) {
                    editors.options[opt].root.innerHTML = data.options[opt] || '';
                }
            });
        }
        if(editors.fillIn) editors.fillIn.root.innerHTML = data.fillInAnswer || '';
        if(editors.explanation) editors.explanation.root.innerHTML = data.explanation || '';
        
        formatSelect.value = data.format || 'mcq';
        const radio = questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`);
        if (radio) radio.checked = true;
        
        domainSelect.value = data.domain || Object.keys(domainSource)[0];
        populateSkills(); 
        skillSelect.value = data.skill || '';

        imagePosSelect.value = data.imagePosition || 'above';
        imagePosSelect.dispatchEvent(new Event('change')); 
        
        formatSelect.dispatchEvent(new Event('change'));

        // --- Attach Event Listeners for the new form ---
        questionForm.addEventListener('submit', handleFormSubmit);
        questionForm.querySelector('#delete-question-btn').addEventListener('click', handleDeleteQuestion);
        setupImageResizing(); // Setup resizing for the loaded image container
    }
    
    /**
     * Handles the save button click for a question.
     */
    function handleFormSubmit(e) {
        if (e) e.preventDefault(); // Check if event exists (can be called manually)
        if (!currentQuestion) return;

        const questionId = `m${currentModule}_q${currentQuestion}`;
        const questionForm = editorContainer.querySelector('#question-form');
        const saveBtn = questionForm.querySelector('button[type="submit"]');
        const imageContainer = document.getElementById('stimulus-image-container');

        if (!editors.passage || !editors.prompt || !editors.options.A || !editors.fillIn || !editors.explanation) {
            alert("Error: Editors are not fully loaded. Please wait a moment and try again.");
            return;
        }

        const dataToSave = {
            passage: editors.passage.root.innerHTML,
            prompt: editors.prompt.root.innerHTML,
            explanation: editors.explanation.root.innerHTML,
            imageUrl: imageContainer.classList.contains('hidden') ? null : document.getElementById('stimulus-image-preview').src,
            imageWidth: imageContainer.classList.contains('hidden') ? null : imageContainer.style.width,
            imagePosition: questionForm.querySelector('#q-image-position').value,
            module: currentModule,
            questionNumber: currentQuestion,
            domain: questionForm.querySelector('#q-domain').value,
            skill: questionForm.querySelector('#q-skill').value,
            format: questionForm.querySelector('#q-format').value,
            options: {
                A: editors.options.A.root.innerHTML,
                B: editors.options.B.root.innerHTML,
                C: editors.options.C.root.innerHTML,
                D: editors.options.D.root.innerHTML,
            },
            fillInAnswer: editors.fillIn.root.innerHTML,
            correctAnswer: questionForm.querySelector('input[name="correct-answer"]:checked')?.value || null,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (saveBtn) { // saveBtn might not exist if called from AI
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
        }

        testRef.collection('questions').doc(questionId).set(dataToSave, { merge: true })
            .then(() => {
                if (saveBtn) {
                    saveBtn.textContent = 'Saved!';
                    setTimeout(() => { 
                        saveBtn.textContent = 'Save Question'; 
                        saveBtn.disabled = false;
                    }, 2000);
                }
                document.querySelector(`.q-nav-btn.active`)?.classList.add('completed');
                savedQuestions[questionId] = true;
            })
            .catch(err => {
                console.error("Error saving question:", err);
                alert("Error saving question. See console for details.");
                if (saveBtn) {
                    saveBtn.textContent = 'Save Question';
                    saveBtn.disabled = false;
                }
            });
    }

    /**
     * Handles the delete button click for a question.
     */
    function handleDeleteQuestion() {
        if (!currentQuestion) return;
        
        const questionId = `m${currentModule}_q${currentQuestion}`;
        if (!savedQuestions[questionId]) {
            alert("This question hasn't been saved yet, so there's nothing to delete.");
            return;
        }

        if (confirm(`Are you sure you want to permanently delete Module ${currentModule}, Question ${currentQuestion}? This action cannot be undone.`)) {
            testRef.collection('questions').doc(questionId).delete()
                .then(() => {
                    delete savedQuestions[questionId];
                    document.querySelector(`.q-nav-btn.active`)?.classList.remove('completed', 'active');
                    currentQuestion = null; // Deselect
                    editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Question deleted. Select another question.</p></div>`;
                    cleanupStimulusPanel(); // Clear stimulus
                    
                    alert('Question deleted successfully.');
                })
                .catch(error => {
                    console.error("Error deleting question: ", error);
                    alert('There was an error deleting the question.');
                });
        }
    }

    /**
     * Handles clicks on the question navigation buttons.
     */
    function handleNavClick(e) {
        const btn = e.target.closest('.q-nav-btn');
        if (!btn) return;
        
        const module = btn.dataset.module;
        const qNumber = btn.dataset.qNumber;
        
        if (module != currentModule) {
            switchModule(module);
        }
        showEditorForQuestion(module, qNumber);
    }
    
    // --- Global Event Listeners ---
    
    // Module switcher buttons
    if (moduleSwitcher) {
        moduleSwitcher.addEventListener('click', (e) => {
            if (e.target.matches('.module-btn') && !e.target.classList.contains('active')) {
                switchModule(parseInt(e.target.dataset.module));
            }
        });
    }

    // Add/Remove Image buttons
    // Add/Remove Image buttons
    if (addImageBtn) {
        addImageBtn.addEventListener('click', async () => {
            if (!currentQuestion) return alert("Please select a question first!");
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            
            input.onchange = async e => {
                const file = e.target.files[0];
                if (!file) return;
                
                const imagePreview = document.getElementById('stimulus-image-preview');
                const imageContainer = document.getElementById('stimulus-image-container');
                
                // Show a loading state
                imagePreview.src = "https://i.gifer.com/ZZ5H.gif"; // Simple loading GIF
                imageContainer.classList.remove('hidden');

                const imageUrl = await uploadImageToTelegram(file);
                
                if (imageUrl) {
                    renderStimulus({ imageUrl: imageUrl, imageWidth: '100%' });
                } else {
                    renderStimulus({}); // Hide image container on failure
                    alert("Image upload failed. Please try again.");
                }
            };
            input.click();
        });
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            if (!currentQuestion) return alert("Please select a question first!");
            if (confirm("Are you sure you want to remove the image? This will be permanent when you save.")) {
                renderStimulus({}); // Renders with no image data, effectively hiding it.
            }
        });
    }


    // +++ NEW: AI HELPER LOGIC +++

    // --- AI Modal Elements ---
    const aiHelperBtn = document.getElementById('ai-helper-btn');
    const aiModal = document.getElementById('ai-modal');
    const aiModalBackdrop = document.getElementById('ai-modal-backdrop');
    const aiCancelBtn = document.getElementById('ai-cancel-btn');
    const aiUploadContainer = document.getElementById('ai-upload-container');
    const aiUploadInput = document.getElementById('ai-image-upload');
    const aiUploadLabel = document.getElementById('ai-upload-label');
    const aiPreviewContainer = document.getElementById('ai-preview-container');
    const aiImagePreview = document.getElementById('ai-image-preview');
    const aiRemovePreviewBtn = document.getElementById('ai-remove-preview');
    const aiImportBtn = document.getElementById('ai-import-btn');
    const aiLoadingContainer = document.getElementById('ai-loading-container');
    const aiErrorMsg = document.getElementById('ai-error-msg');

    let aiImageBase64 = null; // Store the base64 string of the uploaded image

    // --- Toggle Modal ---
    const openAiModal = () => {
        if (!currentQuestion) {
            alert("Please select a question slot (e.g., M1: Q5) *before* using the AI helper.");
            return;
        }
        aiModal.style.display = 'block';
        aiModalBackdrop.style.display = 'block';
        setTimeout(() => {
            aiModal.classList.add('visible');
            aiModalBackdrop.classList.add('visible');
        }, 10);
    };

    const closeAiModal = () => {
        aiModal.classList.remove('visible');
        aiModalBackdrop.classList.remove('visible');
        // Hide with delay to allow transition
        setTimeout(() => {
            aiModal.style.display = 'none';
            aiModalBackdrop.style.display = 'none';
            resetAiModal();
        }, 300);
    };

    const resetAiModal = () => {
        aiImageBase64 = null;
        aiUploadInput.value = null; // Clear file input
        aiUploadContainer.classList.remove('hidden');
        aiPreviewContainer.classList.add('hidden');
        aiLoadingContainer.classList.add('hidden');
        aiImportBtn.disabled = true;
        aiImportBtn.innerHTML = '<i class="fa-solid fa-download"></i> Import'; // Reset button text
        aiCancelBtn.disabled = false;
        aiUploadLabel.textContent = "Click to select an image";
        aiErrorMsg.classList.remove('visible');
    };

    if (aiHelperBtn) aiHelperBtn.addEventListener('click', openAiModal);
    if (aiCancelBtn) aiCancelBtn.addEventListener('click', closeAiModal);
    if (aiModalBackdrop) aiModalBackdrop.addEventListener('click', closeAiModal);

    // --- Image Upload Logic ---
    if (aiUploadContainer) aiUploadContainer.addEventListener('click', () => aiUploadInput.click());
    
    if (aiUploadInput) aiUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 4 * 1024 * 1024) { // 4MB size limit (standard for API)
                alert("Image is too large (Max 4MB). Please upload a smaller screenshot.");
                aiUploadInput.value = null;
                return;
            }
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const base64String = readerEvent.target.result.split(',')[1]; // Get just the base64 data
                aiImageBase64 = base64String;
                
                aiImagePreview.src = readerEvent.target.result; // Show preview
                aiUploadContainer.classList.add('hidden');
                aiPreviewContainer.classList.remove('hidden');
                aiImportBtn.disabled = false;
                aiUploadLabel.textContent = file.name;
            };
            reader.onerror = (error) => {
                console.error("File reading error:", error);
                alert("Could not read the file. Please try again.");
            };
            reader.readAsDataURL(file);
        }
    });

    if (aiRemovePreviewBtn) aiRemovePreviewBtn.addEventListener('click', resetAiModal);

    // --- Call Gemini API ---
    if (aiImportBtn) aiImportBtn.addEventListener('click', () => {
        if (!aiImageBase64) {
            showAiError("No image selected.");
            return;
        }
        if (!currentQuestion) {
            showAiError("No question slot selected. Please close this and select a question.");
            return;
        }
        
        // Check if config.js was loaded correctly
        if (typeof AI_API_KEY === 'undefined' || AI_API_KEY === "PASTE_YOUR_GOOGLE_AI_API_KEY_HERE" || AI_API_KEY === "") {
             showAiError("API Key is missing. Please add it to js/config.js");
             return;
        }

        const isMath = currentModule > 2;
        const subject = isMath ? "Math" : "Reading & Writing";
        const domainList = Object.keys(QUESTION_DOMAINS[subject]).join(', ');
        
        // This is the "Master Prompt"
        const textPrompt = `You are an expert SAT question parser. Analyze this image of an SAT question.
The image may contain a reading passage, a question prompt, and multiple-choice options.
Extract the following information:
1.  **passage**: The full text of the reading passage, if one exists. If not, this should be an empty string. Handle text formatting like bold and underline by wrapping them in <b></b> or <u></u> tags. For math, this is usually empty.
2.  **prompt**: The text of the question itself, including any inline text from the passage. Handle all text formatting. For math, include all parts of the question, but *not* the multiple choice options.
3.  **options**: A JSON object of the four multiple-choice options, like {"A": "Text...", "B": "Text...", "C": "Text...", "D": "Text..."}. Handle all text formatting, especially math formulas.
4.  **correctAnswer**: The correct option letter ("A", "B", "C", or "D"). Infer this from visual cues in the image, such as a checkmark, a circle, or bolding on the correct answer. If no cue, select the most logical answer.
5.  **domain**: Categorize this question into one of the following domains: ${domainList}.
6.  **skill**: Based on the domain, categorize this into the most specific skill from the provided list. (e.g., if domain is 'Craft and Structure', skill could be 'Words in Context').
7.  **explanation**: Write a clear, concise explanation for why the correct answer is right and the others are wrong.

Return *only* a single, valid JSON object with these fields.
`;
        
        // This is the JSON structure we demand from the AI
        const jsonSchema = {
          "type": "OBJECT",
          "properties": {
            "passage": { "type": "STRING" },
            "prompt": { "type": "STRING" },
            "options": {
              "type": "OBJECT",
              "properties": {
                "A": { "type": "STRING" },
                "B": { "type": "STRING" },
                "C": { "type": "STRING" },
                "D": { "type": "STRING" }
              },
              "required": ["A", "B", "C", "D"]
            },
            "correctAnswer": { "type": "STRING", "enum": ["A", "B", "C", "D"] },
            "domain": { "type": "STRING" },
            "skill": { "type": "STRING" },
            "explanation": { "type": "STRING" }
          },
          "required": ["prompt", "options", "correctAnswer", "explanation", "domain", "skill"]
        };

        callGeminiToParseQuestion(textPrompt, jsonSchema, aiImageBase64);
    });

    async function callGeminiToParseQuestion(prompt, schema, base64ImageData) {
        aiPreviewContainer.classList.add('hidden');
        aiLoadingContainer.classList.remove('hidden');
        aiImportBtn.disabled = true;
        aiImportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';
        aiCancelBtn.disabled = true;
        aiErrorMsg.classList.remove('visible');

        // +++ THIS IS THE FIX +++
        // Read the key from the config.js file (which must be loaded in the HTML)
        const apiKey = (typeof AI_API_KEY !== 'undefined') ? AI_API_KEY : "";
        if (apiKey === "" || apiKey === "PASTE_YOUR_GOOGLE_AI_API_KEY_HERE") {
            showAiError("API Key is missing from js/config.js. Please add it.");
            // Reset modal state
            aiLoadingContainer.classList.add('hidden');
            aiPreviewContainer.classList.remove('hidden');
            aiImportBtn.disabled = false;
            aiImportBtn.innerHTML = '<i class="fa-solid fa-download"></i> Import';
            aiCancelBtn.disabled = false;
            return;
        }
        // +++ END OF FIX +++
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: "image/png", // The API can handle png/jpeg/webp
                                data: base64ImageData
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Try to parse error from Google
                let errorBody;
                try {
                    errorBody = await response.json();
                } catch(e) {
                    throw new Error(`API Error ${response.status}: ${response.statusText}`);
                }
                console.error("API Error Body:", errorBody);
                throw new Error(`API Error ${response.status}: ${errorBody.error?.message || 'Unknown API Error'}`);
            }

            const result = await response.json();
            
            if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0].text) {
                const jsonText = result.candidates[0].content.parts[0].text;
                const parsedData = JSON.parse(jsonText);
                
                // Success! Fill the form.
                fillEditorForm(parsedData);
                closeAiModal();

            } else {
                console.error("Invalid response structure:", result);
                throw new Error("Invalid response structure from API.");
            }

        } catch (error) {
            console.error('Gemini API Error:', error);
            showAiError(error.message);
        } finally {
            // Reset modal state on failure (if it's still open)
            if (aiModal.classList.contains('visible')) {
                aiPreviewContainer.classList.remove('hidden');
                aiLoadingContainer.classList.add('hidden');
                aiImportBtn.disabled = false;
                aiImportBtn.innerHTML = '<i class="fa-solid fa-download"></i> Import';
                aiCancelBtn.disabled = false;
            }
        }
    }

    function showAiError(message) {
        aiErrorMsg.textContent = `Error: ${message}`;
        aiErrorMsg.classList.add('visible');
    }

    /**
     * Fills the active editor form with data from the AI.
     * @param {object} data - The parsed JSON object from Gemini.
     */
    function fillEditorForm(data) {
        if (!currentQuestion) return; // Safety check

        const questionForm = editorContainer.querySelector('#question-form');
        const domainSelect = questionForm.querySelector('#q-domain');
        const skillSelect = questionForm.querySelector('#q-skill');
        const formatSelect = questionForm.querySelector('#q-format');

        // 1. Fill Quill Editors
        if (data.passage && editors.passage) {
            // Use <p> tags for proper Quill formatting
            editors.passage.root.innerHTML = data.passage.split('\n').map(p => `<p>${p}</p>`).join('');
        }
        if (data.prompt && editors.prompt) {
            editors.prompt.root.innerHTML = data.prompt.split('\n').map(p => `<p>${p}</p>`).join('');
        }
        if (data.options && editors.options) {
            editors.options.A.root.innerHTML = `<p>${data.options.A || ''}</p>`;
            editors.options.B.root.innerHTML = `<p>${data.options.B || ''}</p>`;
            editors.options.C.root.innerHTML = `<p>${data.options.C || ''}</p>`;
            editors.options.D.root.innerHTML = `<p>${data.options.D || ''}</p>`;
        }
        if (data.explanation && editors.explanation) {
            editors.explanation.root.innerHTML = data.explanation.split('\n').map(p => `<p>${p}</p>`).join('');
        }

        // 2. Set Correct Answer
        if (data.correctAnswer) {
            const radio = questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`);
            if (radio) radio.checked = true;
        }
        
        // 3. Set Dropdowns (Domain & Skill)
        // This logic finds the *closest* match from the AI in the dropdown.
        if (data.domain && domainSelect) {
            const bestDomain = findBestOption(domainSelect, data.domain);
            domainSelect.value = bestDomain;
            domainSelect.dispatchEvent(new Event('change')); // Trigger skill populate
            
            if (data.skill && skillSelect) {
                // We must wait for the skill dropdown to populate
                setTimeout(() => {
                     const bestSkill = findBestOption(skillSelect, data.skill);
                     skillSelect.value = bestSkill;
                }, 100); // 100ms delay to allow skills to populate
            }
        }
        
        // 4. Set Format (Assume MCQ for now, as that's what we asked for)
        formatSelect.value = 'mcq';
        formatSelect.dispatchEvent(new Event('change'));
        
        // 5. Auto-save the form
        // We wrap this in a timeout to be 100% sure the skill dropdown has populated
        setTimeout(() => {
            handleFormSubmit(new Event('submit'));
        }, 200);
    }

    /**
     * Helper function to find the best <option> value from AI text.
     * @param {HTMLSelectElement} select - The dropdown element.
     * @param {string} aiText - The text from the AI.
     */
    function findBestOption(select, aiText) {
        let bestMatch = select.options[0].value;
        let bestScore = 0;
        
        if (!aiText) return bestMatch;
        aiText = aiText.toLowerCase().trim();

        for (const option of select.options) {
            const optionText = option.text.toLowerCase().trim();
            if (optionText === aiText) return option.value; // Perfect match
            
            // Check for partial match (e.g., AI says "Words in Context", option is "Words in Context")
            if (aiText.includes(optionText) || optionText.includes(aiText)) {
                // Simple scoring: prioritize longer matches
                let score = 0;
                if (aiText.includes(optionText)) score = optionText.length;
                if (optionText.includes(aiText)) score = Math.max(score, aiText.length);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = option.value;
                }
            }
        }
        return bestMatch;
    }
    // +++ END AI HELPER LOGIC +++

}); // End of DOMContentLoaded