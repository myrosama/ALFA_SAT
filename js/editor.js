// js/editor.js - REFACTORED AND CORRECTED (v3 - With Bounds Fix)

document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Setup ---
    const db = firebase.firestore();

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    const stimulusPanelContent = document.getElementById('stimulus-panel').querySelector('.panel-content');

    // --- Page State ---
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null;
    let savedQuestions = {};
    let editors = {};

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
    const POINT_VALUES = [10, 20, 30, 40];

    // --- Main Initialization ---
    if (!testId) {
        alert("No Test ID found in URL.");
        window.location.href = 'admin.html';
        return;
    }

    const testRef = db.collection('tests').doc(testId);

    testRef.get().then(doc => {
        if (doc.exists) editorHeaderTitle.textContent = `Editing: ${doc.data().name}`;
        else {
            alert("Test not found!");
            window.location.href = 'admin.html';
        }
    });

    testRef.collection('questions').get().then(snapshot => {
        snapshot.forEach(doc => { savedQuestions[doc.id] = true; });
        switchModule(1);
    });

    function cleanupStimulusPanel() {
        if (stimulusPanelContent) {
            stimulusPanelContent.innerHTML = `
                <div id="stimulus-image-container" class="hidden"><img id="stimulus-image-preview" src=""><div class="resize-handle"></div></div>
                <div id="stimulus-editor"></div>`;
        }
        editors = {};
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
        
        // NINJA FIX: Create separate configs for each panel to contain tooltips.
        const passageConfig = {
            modules: { toolbar: toolbarOptions },
            theme: 'snow',
            bounds: document.getElementById('stimulus-panel') // Confine to left panel
        };

        const questionConfig = {
            modules: { toolbar: toolbarOptions },
            theme: 'snow',
            bounds: document.getElementById('question-panel') // Confine to right panel
        };

        editors = {}; // Clear previous instances

        editors.passage = new Quill('#stimulus-editor', { ...passageConfig, placeholder: 'Type or paste passage content here...' });
        editors.prompt = new Quill('#question-text-editor', { ...questionConfig, placeholder: 'Type the question prompt here...' });

        editors.options = {};
        ['A', 'B', 'C', 'D'].forEach(opt => {
            editors.options[opt] = new Quill(`#option-${opt.toLowerCase()}`, questionConfig);
        });
        editors.fillIn = new Quill('#fill-in-answer', questionConfig);
    }
    
    // ... (The rest of the functions: generateNavButtons, switchModule, etc. remain unchanged) ...
    // Note: I'm including the full file for you to copy-paste easily.

    function generateNavButtons(count, moduleNum) {
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
    
    function switchModule(moduleNum) {
        currentModule = moduleNum;
        currentQuestion = null;
        
        cleanupStimulusPanel(); 

        editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below.</p></div>`;
        
        const questionCount = (currentModule <= 2) ? 27 : 22;
        generateNavButtons(questionCount, currentModule);

        document.querySelectorAll('.module-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.module) === currentModule);
        });
    }

    async function showEditorForQuestion(module, qNumber) {
        currentModule = parseInt(module);
        currentQuestion = parseInt(qNumber);
        
        document.querySelectorAll('.q-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.qNumber == qNumber && btn.dataset.module == module);
        });

        cleanupStimulusPanel();

        editorContainer.innerHTML = '';
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.appendChild(formClone);
        initializeQuillEditors(); // This will now use the correct bounds

        const questionForm = editorContainer.querySelector('#question-form');
        const domainSelect = questionForm.querySelector('#q-domain');
        const skillSelect = questionForm.querySelector('#q-skill');
        const pointsSelect = questionForm.querySelector('#q-points');
        const formatSelect = questionForm.querySelector('#q-format');
        
        document.getElementById('q-number-display').textContent = qNumber;

        const isMath = currentModule > 2;
        const domainSource = isMath ? QUESTION_DOMAINS.Math : QUESTION_DOMAINS["Reading & Writing"];
        
        domainSelect.innerHTML = Object.keys(domainSource).map(d => `<option value="${d}">${d}</option>`).join('');
        
        const populateSkills = () => {
            const skills = domainSource[domainSelect.value] || [];
            skillSelect.innerHTML = skills.map(s => `<option value="${s}">${s}</option>`).join('');
        };
        domainSelect.addEventListener('change', populateSkills);
        populateSkills();

        pointsSelect.innerHTML = POINT_VALUES.map(v => `<option value="${v}">${v} points</option>`).join('');

        formatSelect.addEventListener('change', () => {
            questionForm.querySelector('#answer-options-container').classList.toggle('hidden', formatSelect.value !== 'mcq');
            questionForm.querySelector('#fill-in-answer-container').classList.toggle('hidden', formatSelect.value !== 'fill-in');
        });

        const questionId = `m${module}_q${qNumber}`;
        const doc = await testRef.collection('questions').doc(questionId).get();

        if (doc.exists) {
            const data = doc.data();
            editors.passage.root.innerHTML = data.passage || '';
            editors.prompt.root.innerHTML = data.prompt || '';
            if (data.options) {
                ['A', 'B', 'C', 'D'].forEach(opt => {
                    if (editors.options[opt]) {
                        editors.options[opt].root.innerHTML = data.options[opt] || '';
                    }
                });
            }
            editors.fillIn.root.innerHTML = data.fillInAnswer || '';
            
            formatSelect.value = data.format || 'mcq';
            const radio = questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`);
            if (radio) radio.checked = true;
            
            domainSelect.value = data.domain || Object.keys(domainSource)[0];
            populateSkills();
            skillSelect.value = data.skill || '';
            pointsSelect.value = data.points || POINT_VALUES[0];
        }

        formatSelect.dispatchEvent(new Event('change'));

        questionForm.addEventListener('submit', handleFormSubmit);
        questionForm.querySelector('#delete-question-btn').addEventListener('click', handleDeleteQuestion);
    }
    
    function handleFormSubmit(e) {
        e.preventDefault();
        if (!currentQuestion) return;

        const questionId = `m${currentModule}_q${currentQuestion}`;
        const questionForm = editorContainer.querySelector('#question-form');
        const saveBtn = questionForm.querySelector('button[type="submit"]');

        const dataToSave = {
            passage: editors.passage.root.innerHTML,
            prompt: editors.prompt.root.innerHTML,
            module: currentModule,
            questionNumber: currentQuestion,
            domain: questionForm.querySelector('#q-domain').value,
            skill: questionForm.querySelector('#q-skill').value,
            points: parseInt(questionForm.querySelector('#q-points').value),
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
                    showEditorForQuestion(currentModule, currentQuestion);
                    alert('Question deleted successfully.');
                })
                .catch(error => {
                    console.error("Error deleting question: ", error);
                    alert('There was an error deleting the question.');
                });
        }
    }

    function handleNavClick(e) {
        showEditorForQuestion(e.target.dataset.module, e.target.dataset.qNumber);
    }
    
    moduleSwitcher.addEventListener('click', (e) => {
        if (e.target.matches('.module-btn') && !e.target.classList.contains('active')) {
            switchModule(parseInt(e.target.dataset.module));
        }
    });
});