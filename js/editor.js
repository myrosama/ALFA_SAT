document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    var MQ = MathQuill.getInterface(2);

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    const addImageBtn = document.getElementById('add-image-btn');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const stimulusPanelContent = document.getElementById('stimulus-panel').querySelector('.panel-content');
    
    // --- Page State ---
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null;
    let savedQuestions = {};
    let editors = { passage: null, prompt: null }; // Centralized editor instances

    // --- Data Definitions ---
    const questionTypes = {
        "Reading & Writing": {
            "Information and Ideas": ["Central Ideas and Details", "Command of Evidence", "Inferences"],
            "Craft and Structure": ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
            "Expression of Ideas": ["Rhetorical Synthesis", "Transitions"],
            "Standard English Conventions": ["Boundaries", "Form", "Structure", "and Sense"]
        },
        "Math": {
            "Algebra": ["Linear equations in one variable", "Linear functions"],
            "Advanced Math": ["Equivalent expressions", "Nonlinear functions"],
        }
    };
    const pointValues = [10, 20, 30, 40];

    // --- Initial Setup ---
    if (!testId) {
        console.error("No test ID provided in URL.");
        window.location.href = 'admin.html';
        return;
    }

    const testRef = db.collection('tests').doc(testId);
    testRef.get().then(doc => {
        if (doc.exists) {
            editorHeaderTitle.textContent = `Editing: ${doc.data().name}`;
        } else {
            console.error("Test document not found in Firestore.");
            window.location.href = 'admin.html';
        }
    });

    // Load existing question status to colorize nav buttons
    testRef.collection('questions').get().then(snapshot => {
        snapshot.forEach(doc => {
            savedQuestions[doc.id] = true;
        });
        generateNavButtons(27, 1); // Generate initial nav for Module 1
    });

    /**
     * NINJA FIX #1 & #4: Centralized Cleanup Function.
     * This function resets the stimulus panel's HTML to its original state.
     * It's called before loading a new question or switching modules to prevent
     * conflicts between Quill and MathQuill and fixes the lingering panel bug.
     */
    function cleanupStimulusPanel() {
        if (stimulusPanelContent) {
            stimulusPanelContent.innerHTML = `
                <div id="stimulus-image-container" class="hidden">
                    <img id="stimulus-image-preview" src="">
                    <div class="resize-handle"></div>
                </div>
                <div id="stimulus-editor"></div>`;
        }
        // Nullify editor instances to prevent memory leaks
        editors.passage = null;
        editors.prompt = null;
    }

    async function uploadImageToTelegram(file) {
        // NOTE: Ensure TELEGRAM_CHANNEL_ID and TELEGRAM_BOT_TOKEN are globally available
        // or defined in a config file loaded before this script.
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHANNEL_ID);
        formData.append('photo', file);
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            const data = await response.json();
            if (data.ok) {
                const photoArray = data.result.photo;
                const fileId = photoArray[photoArray.length - 1].file_id;
                const fileUrlData = await (await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
                if (fileUrlData.ok) {
                    return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileUrlData.result.file_path}`;
                } else { throw new Error(fileUrlData.description); }
            } else { throw new Error(data.description); }
        } catch (error) {
            console.error('Telegram Upload Error:', error);
            alert('Error uploading image: ' + error.message);
            return null;
        }
    }

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
            }
        }
    }

    function setupImageResizing() {
        const imageContainer = document.getElementById('stimulus-image-container');
        if (!imageContainer) return;
        const resizeHandle = imageContainer.querySelector('.resize-handle');
        if (!resizeHandle) return;
        let isResizing = false;
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            const startX = e.clientX;
            const startWidth = imageContainer.offsetWidth;
            const doDrag = (e) => {
                if (!isResizing) return;
                imageContainer.style.width = `${startWidth + (e.clientX - startX)}px`;
            };
            const stopDrag = () => {
                isResizing = false;
                window.removeEventListener('mousemove', doDrag);
                window.removeEventListener('mouseup', stopDrag);
            };
            window.addEventListener('mousemove', doDrag);
            window.addEventListener('mouseup', stopDrag);
        });
    }

    function generateNavButtons(count, moduleNum) {
        questionNavigator.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const button = document.createElement('button');
            button.classList.add('q-nav-btn');
            button.dataset.module = moduleNum;
            button.dataset.qNumber = i;
            button.textContent = i;
            const questionId = `m${moduleNum}_q${i}`;
            if (savedQuestions[questionId]) {
                button.classList.add('completed');
            }
            button.addEventListener('click', handleNavClick);
            questionNavigator.appendChild(button);
        }
    }

    // In js/editor.js, replace your old functions with these new ones.

// In js/editor.js, replace your entire showEditorForQuestion function with this one.

/**
 * NINJA UPGRADE: The definitive, corrected editor setup function.
 * This version fixes the bug where dropdowns appeared empty by loading data FIRST,
 * then populating the dropdowns, and THEN setting their values.
 */
async function showEditorForQuestion(module, qNumber) {
    currentModule = module;
    currentQuestion = qNumber;

    // Update nav button states
    document.querySelectorAll('.q-nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.q-nav-btn[data-q-number='${qNumber}'][data-module='${module}']`);
    if (activeBtn) activeBtn.classList.add('active');

    // Cleanup and build form from template
    cleanupStimulusPanel();
    editorContainer.innerHTML = '';
    const formClone = editorTemplate.content.cloneNode(true);
    editorContainer.appendChild(formClone);

    const questionForm = editorContainer.querySelector('#question-form');

    // --- Unified Quill Editor Setup ---
    const quillToolbarOptions = [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['formula'],
        ['clean']
    ];
    const quillOptions = {
        modules: { toolbar: quillToolbarOptions },
        placeholder: 'Type or paste content here...',
        theme: 'snow'
    };

    editors.passage = new Quill('#stimulus-editor', quillOptions);
    editors.prompt = new Quill('#question-text-editor', quillOptions);
    editors.options.A = new Quill('#option-a', quillOptions);
    editors.options.B = new Quill('#option-b', quillOptions);
    editors.options.C = new Quill('#option-c', quillOptions);
    editors.options.D = new Quill('#option-d', quillOptions);
    editors.fillIn = new Quill('#fill-in-answer', quillOptions);

    // --- CRITICAL: Load data from Firestore BEFORE populating the form ---
    const questionId = `m${module}_q${qNumber}`;
    const doc = await testRef.collection('questions').doc(questionId).get();
    const data = doc.exists ? doc.data() : {};

    // --- Get Form Element References ---
    const domainSelect = questionForm.querySelector('#q-domain');
    const skillSelect = questionForm.querySelector('#q-skill');
    const pointsSelect = questionForm.querySelector('#q-points');
    const formatSelect = questionForm.querySelector('#q-format');
    const isMath = module > 2;

    // --- Populate Dropdowns and Static Form Elements ---
    formatSelect.addEventListener('change', () => {
        questionForm.querySelector('#answer-options-container').classList.toggle('hidden', formatSelect.value !== 'mcq');
        questionForm.querySelector('#fill-in-answer-container').classList.toggle('hidden', formatSelect.value !== 'fill-in');
    });

    const domains = isMath ? Object.keys(questionTypes.Math) : Object.keys(questionTypes["Reading & Writing"]);
    domainSelect.innerHTML = domains.map(d => `<option value="${d}">${d}</option>`).join('');

    domainSelect.addEventListener('change', () => {
        const selectedDomain = domainSelect.value;
        const skills = isMath ? questionTypes.Math[selectedDomain] : questionTypes["Reading & Writing"][selectedDomain];
        skillSelect.innerHTML = skills.map(skill => `<option value="${skill}">${skill}</option>`).join('');
    });
    pointsSelect.innerHTML = pointValues.map(v => `<option value="${v}">${v} points</option>`).join('');

    // --- Set Form Values and Editor Content from Loaded Data ---
    if (doc.exists) {
        // Load content into Quill editors
        editors.passage.root.innerHTML = data.passage || '';
        editors.prompt.root.innerHTML = data.prompt || '';
        if (data.options) {
            editors.options.A.root.innerHTML = data.options.A || '';
            editors.options.B.root.innerHTML = data.options.B || '';
            editors.options.C.root.innerHTML = data.options.C || '';
            editors.options.D.root.innerHTML = data.options.D || '';
        }
        editors.fillIn.root.innerHTML = data.fillInAnswer || '';

        // Load image
        renderStimulus(data);
        
        // Set form control values
        formatSelect.value = data.format || 'mcq';
        if (data.correctAnswer) {
            const radio = questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`);
            if (radio) radio.checked = true;
        }

        // Set dropdown values in the correct order
        domainSelect.value = data.domain || domains[0];
        domainSelect.dispatchEvent(new Event('change')); // Trigger skill population
        skillSelect.value = data.skill; // Now set the skill
        pointsSelect.value = data.points;
    }
    
    // Trigger change events even for new questions to ensure UI consistency
    formatSelect.dispatchEvent(new Event('change'));
    if (!doc.exists) {
        domainSelect.dispatchEvent(new Event('change'));
    }

    // --- Attach Final Event Listeners ---
    questionForm.addEventListener('submit', handleFormSubmit);
    questionForm.querySelector('#delete-question-btn').addEventListener('click', handleDeleteQuestion);
    setupImageResizing();
}

/**
 * NINJA UPGRADE: The new data submission handler.
 * It now gets the full HTML content from each Quill editor, which includes
 * rich text formatting and KaTeX math formulas.
 */
function handleFormSubmit(e) {
    e.preventDefault();
    if (!currentQuestion) return;

    const questionId = `m${currentModule}_q${currentQuestion}`;
    const questionForm = editorContainer.querySelector('#question-form');
    const imageContainer = document.getElementById('stimulus-image-container');

    const dataToSave = {
        // Get content using .root.innerHTML from all editors
        passage: editors.passage.root.innerHTML,
        prompt: editors.prompt.root.innerHTML,
        
        // Standard data
        imageUrl: imageContainer.classList.contains('hidden') ? null : document.getElementById('stimulus-image-preview').src,
        imageWidth: imageContainer.classList.contains('hidden') ? null : imageContainer.style.width,
        module: parseInt(currentModule),
        questionNumber: parseInt(currentQuestion),
        domain: questionForm.querySelector('#q-domain').value,
        skill: questionForm.querySelector('#q-skill').value,
        points: parseInt(questionForm.querySelector('#q-points').value),
        format: questionForm.querySelector('#q-format').value,
        
        // Get options content
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

    testRef.collection('questions').doc(questionId).set(dataToSave, { merge: true }).then(() => {
        const saveBtn = questionForm.querySelector('button[type="submit"]');
        saveBtn.textContent = 'Saved!';
        setTimeout(() => { saveBtn.textContent = 'Save Question'; }, 2000);

        document.querySelector(`.q-nav-btn.active`)?.classList.add('completed');
        savedQuestions[questionId] = true;
    }).catch(err => {
        console.error("Error saving question:", err);
        alert("Error saving question. See console for details.");
    });
}

    

    /**
     * NINJA FIX #2: Implemented the delete question functionality.
     */
    function handleDeleteQuestion() {
        if (!currentQuestion) return;
        const questionId = `m${currentModule}_q${currentQuestion}`;

        if (!savedQuestions[questionId]) {
            alert("This question has not been saved yet, so it cannot be deleted.");
            return;
        }

        if (confirm(`Are you sure you want to permanently delete Module ${currentModule}, Question ${currentQuestion}? This action cannot be undone.`)) {
            testRef.collection('questions').doc(questionId).delete().then(() => {
                delete savedQuestions[questionId];
                document.querySelector(`.q-nav-btn.active`)?.classList.remove('completed');
                showEditorForQuestion(currentModule, currentQuestion); // Reload empty editor
                alert('Question deleted successfully.');
            }).catch(error => {
                console.error("Error removing document: ", error);
                alert('There was an error deleting the question.');
            });
        }
    }

    function handleNavClick(e) {
        showEditorForQuestion(currentModule, e.target.dataset.qNumber);
    }

    addImageBtn.addEventListener('click', async () => {
        if (!currentQuestion) return alert("Please select a question first!");
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('stimulus-image-container').classList.remove('hidden');
            document.getElementById('stimulus-image-preview').src = "https://i.gifer.com/ZZ5H.gif"; // Loading indicator
            const imageUrl = await uploadImageToTelegram(file);
            if (imageUrl) {
                renderStimulus({ imageUrl: imageUrl });
            } else {
                renderStimulus({}); // Hides the image container on failure
                alert("Image upload failed. Please try again.");
            }
        };
        input.click();
    });

    removeImageBtn.addEventListener('click', () => {
        if (!currentQuestion) return alert("Please select a question first!");
        renderStimulus({}); // Renders with no image data, effectively hiding it.
    });

    moduleSwitcher.addEventListener('click', (e) => {
        if (!e.target.matches('button') || e.target.classList.contains('active')) return;

        document.querySelectorAll('.module-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        currentModule = parseInt(e.target.dataset.module);
        const questionCount = (currentModule <= 2) ? 27 : 22;

        // NINJA FIX #4: Call the cleanup function on module switch.
        cleanupStimulusPanel();

        currentQuestion = null;
        generateNavButtons(questionCount, currentModule);
        editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below to begin editing.</p></div>`;
    });

    // Initial load
    generateNavButtons(27, 1);
});