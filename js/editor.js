// js/editor.js - REMOVED Points Dropdown

document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Setup ---
    const db = firebase.firestore();
    // (Ensure firebase.js and firebase-init.js are loaded)

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
    let editors = {}; // { passage, prompt, options: {A, B, C, D}, fillIn }
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
    // const POINT_VALUES = [10, 20, 30, 40]; // No longer needed

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
        // Destroy existing Quill instance if it exists
        if (editors.passage && typeof editors.passage.disable === 'function') {
             editors.passage.disable(); // Prevent memory leaks
        }
        
        if (stimulusPanelContent) {
            stimulusPanelContent.innerHTML = `
                <div id="stimulus-image-container" class="hidden">
                    <img id="stimulus-image-preview" src="" alt="Stimulus preview">
                    <div class="resize-handle"></div>
                </div>
                <div id="stimulus-editor"></div>`;
            stimulusPanelContent.classList.remove('image-below'); // Reset layout
        }
        
        // Clear all editor instances
        editors = {
            passage: null,
            prompt: null,
            options: { A: null, B: null, C: null, D: null },
            fillIn: null
        };
    }
    
    /**
     * Uploads an image file to a hosting service (placeholder).
     * @param {File} file - The image file to upload.
     * @returns {Promise<string|null>} A promise that resolves with the image URL or null on failure.
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
     * @param {object} data - Question data containing imageUrl and imageWidth.
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
        
        currentModule = moduleNum;
        currentQuestion = null; // Deselect question
        
        cleanupStimulusPanel(); // Clear editors

        // Show placeholder
        if(editorContainer) editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below.</p></div>`;
        
        // R&W modules have 27 questions, Math modules have 22
        const questionCount = (currentModule <= 2) ? 27 : 22;
        generateNavButtons(questionCount, currentModule);

        // Update active module button
        document.querySelectorAll('.module-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.module) === currentModule);
        });
    }

    /**
     * Fetches question data and displays the editor form.
     * @param {number} module - The module number (1-4).
     * @param {number} qNumber - The question number (1-27 or 1-22).
     */
    async function showEditorForQuestion(module, qNumber) {
        currentModule = parseInt(module);
        currentQuestion = parseInt(qNumber);
        
        // Update active state of navigation buttons
        document.querySelectorAll('.q-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.qNumber == qNumber && btn.dataset.module == module);
        });

        // Reset panels
        cleanupStimulusPanel();

        // Inject the editor form from the template
        if (!editorTemplate || !editorContainer) {
            console.error("Editor template or container not found!");
            return;
        }
        editorContainer.innerHTML = ''; // Clear placeholder
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.appendChild(formClone);
        
        // Initialize all Quill editors for the new form
        initializeQuillEditors();

        // --- Select form elements ---
        const questionForm = editorContainer.querySelector('#question-form');
        const domainSelect = questionForm.querySelector('#q-domain');
        const skillSelect = questionForm.querySelector('#q-skill');
        // const pointsSelect = questionForm.querySelector('#q-points'); // REMOVED
        const formatSelect = questionForm.querySelector('#q-format');
        const imagePosSelect = questionForm.querySelector('#q-image-position');
        
        document.getElementById('q-number-display').textContent = qNumber;

        const isMath = currentModule > 2;
        const domainSource = isMath ? QUESTION_DOMAINS.Math : QUESTION_DOMAINS["Reading & Writing"];
        
        // --- Populate form controls ---
        domainSelect.innerHTML = Object.keys(domainSource).map(d => `<option value="${d}">${d}</option>`).join('');
        
        const populateSkills = () => {
            const skills = domainSource[domainSelect.value] || [];
            skillSelect.innerHTML = skills.map(s => `<option value="${s}">${s}</option>`).join('');
        };
        domainSelect.addEventListener('change', populateSkills);
        
        // pointsSelect.innerHTML = POINT_VALUES.map(v => `<option value="${v}">${v} points</option>`).join(''); // REMOVED

        formatSelect.addEventListener('change', () => {
            questionForm.querySelector('#answer-options-container').classList.toggle('hidden', formatSelect.value !== 'mcq');
            questionForm.querySelector('#fill-in-answer-container').classList.toggle('hidden', formatSelect.value !== 'fill-in');
        });

        // Image position logic
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
        
        // Render stimulus image/passage
        renderStimulus(data);
        if(editors.passage) editors.passage.root.innerHTML = data.passage || '';

        // Populate editors with content
        if(editors.prompt) editors.prompt.root.innerHTML = data.prompt || '';
        if (data.options && editors.options) {
            ['A', 'B', 'C', 'D'].forEach(opt => {
                if (editors.options[opt]) {
                    editors.options[opt].root.innerHTML = data.options[opt] || '';
                }
            });
        }
        if(editors.fillIn) editors.fillIn.root.innerHTML = data.fillInAnswer || '';
        
        // Populate form controls with saved values
        formatSelect.value = data.format || 'mcq';
        const radio = questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`);
        if (radio) radio.checked = true;
        
        domainSelect.value = data.domain || Object.keys(domainSource)[0];
        populateSkills(); // Must call this after setting domainSelect.value
        skillSelect.value = data.skill || '';
        // pointsSelect.value = data.points || POINT_VALUES[0]; // REMOVED

        // Load and apply the saved image position
        imagePosSelect.value = data.imagePosition || 'above';
        imagePosSelect.dispatchEvent(new Event('change')); // Trigger visual re-order
        
        // Trigger initial show/hide for answer format
        formatSelect.dispatchEvent(new Event('change'));

        // --- Attach Event Listeners for the new form ---
        questionForm.addEventListener('submit', handleFormSubmit);
        questionForm.querySelector('#delete-question-btn').addEventListener('click', handleDeleteQuestion);
        setupImageResizing(); // Setup resizing for the loaded image container
    }
    
    /**
     * Handles the save button click for a question.
     * @param {Event} e - The form submit event.
     */
    function handleFormSubmit(e) {
        e.preventDefault();
        if (!currentQuestion) return;

        const questionId = `m${currentModule}_q${currentQuestion}`;
        const questionForm = editorContainer.querySelector('#question-form');
        const saveBtn = questionForm.querySelector('button[type="submit"]');
        const imageContainer = document.getElementById('stimulus-image-container');

        // Check if all editors are initialized
        if (!editors.passage || !editors.prompt || !editors.options.A || !editors.fillIn) {
            alert("Error: Editors are not fully loaded. Please wait a moment and try again.");
            return;
        }

        const dataToSave = {
            passage: editors.passage.root.innerHTML,
            prompt: editors.prompt.root.innerHTML,
            imageUrl: imageContainer.classList.contains('hidden') ? null : document.getElementById('stimulus-image-preview').src,
            imageWidth: imageContainer.classList.contains('hidden') ? null : imageContainer.style.width,
            imagePosition: questionForm.querySelector('#q-image-position').value,
            module: currentModule,
            questionNumber: currentQuestion,
            domain: questionForm.querySelector('#q-domain').value,
            skill: questionForm.querySelector('#q-skill').value,
            // points: parseInt(questionForm.querySelector('#q-points').value), // REMOVED
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

        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        testRef.collection('questions').doc(questionId).set(dataToSave, { merge: true })
            .then(() => {
                saveBtn.textContent = 'Saved!';
                setTimeout(() => { 
                    saveBtn.textContent = 'Save Question'; 
                    saveBtn.disabled = false;
                }, 2000);
                
                // Mark as completed in the nav
                document.querySelector(`.q-nav-btn.active`)?.classList.add('completed');
                savedQuestions[questionId] = true;
            })
            .catch(err => {
                console.error("Error saving question:", err);
                alert("Error saving question. See console for details.");
                saveBtn.textContent = 'Save Question';
                saveBtn.disabled = false;
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
                    // Unmark and reset the editor view
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
     * @param {Event} e - The click event.
     */
    function handleNavClick(e) {
        const btn = e.target.closest('.q-nav-btn');
        if (!btn) return;
        
        const module = btn.dataset.module;
        const qNumber = btn.dataset.qNumber;
        
        if (module != currentModule) {
            // This shouldn't happen with the current UI, but good to have
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

}); // End of DOMContentLoaded
