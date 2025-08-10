document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const footerToggle = document.getElementById('footer-toggle');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    
    // --- State Management ---
const urlParams = new URLSearchParams(window.location.search);
const testId = urlParams.get('id');
let currentModule = 1;
let currentQuestion = null;
let savedQuestions = {}; // +++ ADD THIS LINE +++

    // --- Data Definitions (for toolbars) ---
    const questionTypes = {
        "Reading & Writing": {
            "Information and Ideas": ["Central Ideas and Details", "Command of Evidence", "Inferences"],
            "Craft and Structure": ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
            "Expression of Ideas": ["Rhetorical Synthesis", "Transitions"],
            "Standard English Conventions": ["Boundaries", "Form, Structure, and Sense"]
        },
        "Math": {
            "Algebra": ["Linear equations in one variable", "Linear functions"],
            "Advanced Math": ["Equivalent expressions", "Nonlinear functions"],
            "Problem-Solving and Data Analysis": ["Ratios, rates, and proportions", "Percentages"],
            "Geometry and Trigonometry": ["Area and volume", "Circles", "Triangles"]
        }
    };
    const pointValues = [10, 20, 30, 40];

    if (!testId) {
        alert('No test ID provided!');
        window.location.href = 'admin.html';
        return;
    }

    // --- REPLACE THIS ENTIRE BLOCK ---
// --- Fetch Test Info and ALL Question Statuses ---
const testRef = db.collection('tests').doc(testId);

testRef.get().then(doc => {
    if (doc.exists) {
        editorHeaderTitle.textContent = `Editing: ${doc.data().name}`;
    } else {
        alert('Test not found!');
        window.location.href = 'admin.html';
    }
});

// NEW: Fetch all question statuses at the beginning
testRef.collection('questions').get().then(snapshot => {
    snapshot.forEach(doc => {
        savedQuestions[doc.id] = true; // e.g., { 'm1_q12': true, 'm2_q5': true }
    });
    // Now that we know the status, generate the initial buttons
    generateNavButtons(27, 1);
});
// --- END OF REPLACEMENT ---

    // --- UI Generation Functions ---
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

        function showEditorForQuestion(module, qNumber) {
        currentModule = module;
        currentQuestion = qNumber;
        
        document.querySelectorAll('.q-nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.q-nav-btn[data-module='${module}'][data-q-number='${qNumber}']`);
        if (activeBtn) activeBtn.classList.add('active');

        // --- Clear and display the form template ---
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.innerHTML = '';
        editorContainer.appendChild(formClone);
        
        // --- Select all form elements ---
        const questionForm = editorContainer.querySelector('#question-form');
        const stimulusTextarea = document.getElementById('stimulus-textarea'); // We can select this now
        const domainSelect = editorContainer.querySelector('#q-domain');
        const skillSelect = editorContainer.querySelector('#q-skill');
        const pointsSelect = editorContainer.querySelector('#q-points');
        editorContainer.querySelector('#q-number-display').textContent = qNumber;

        // --- Populate Toolbars ---
        const isMath = module > 2;
        const domains = isMath ? Object.keys(questionTypes.Math) : Object.keys(questionTypes["Reading & Writing"]);
        domains.forEach(domain => { domainSelect.innerHTML += `<option value="${domain}">${domain}</option>`; });
        domainSelect.addEventListener('change', () => {
            skillSelect.innerHTML = '';
            const selectedDomain = domainSelect.value;
            const skills = isMath ? questionTypes.Math[selectedDomain] : questionTypes["Reading & Writing"][selectedDomain];
            skills.forEach(skill => { skillSelect.innerHTML += `<option value="${skill}">${skill}</option>`; });
        });
        domainSelect.dispatchEvent(new Event('change'));
        
        let defaultPoints = 20;
        if (qNumber <= 5) defaultPoints = 10;
        else if (qNumber >= 20) defaultPoints = 30;
        pointValues.forEach(val => {
            const selected = (val === defaultPoints) ? 'selected' : '';
            pointsSelect.innerHTML += `<option value="${val}" ${selected}>${val} points</option>`;
        });

        // --- LOGIC TO LOAD EXISTING QUESTION DATA ---
        const questionId = `m${module}_q${qNumber}`;
        db.collection('tests').doc(testId).collection('questions').doc(questionId).get().then(doc => {
            // Clear the stimulus text area before loading new data
            stimulusTextarea.value = '';

            if (doc.exists) {
                const data = doc.data();
                // Load the passage text into the left panel
                stimulusTextarea.value = data.passage || '';
                
                // Load the rest of the form data into the right panel
                questionForm.querySelector('#question-text').value = data.prompt || '';
                questionForm.querySelector('#option-a').value = data.options.A || '';
                questionForm.querySelector('#option-b').value = data.options.B || '';
                questionForm.querySelector('#option-c').value = data.options.C || '';
                questionForm.querySelector('#option-d').value = data.options.D || '';
                questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`).checked = true;
                domainSelect.value = data.domain;
                domainSelect.dispatchEvent(new Event('change'));
                skillSelect.value = data.skill;
                pointsSelect.value = data.points;
            }
        });

        // --- LOGIC TO HANDLE SAVING THE FORM ---
        questionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const questionData = {
                module: parseInt(module),
                questionNumber: parseInt(qNumber),
                domain: domainSelect.value,
                skill: skillSelect.value,
                points: parseInt(pointsSelect.value),
                passage: stimulusTextarea.value, // <-- ADDED THIS LINE
                prompt: questionForm.querySelector('#question-text').value,
                options: {
                    A: questionForm.querySelector('#option-a').value,
                    B: questionForm.querySelector('#option-b').value,
                    C: questionForm.querySelector('#option-c').value,
                    D: questionForm.querySelector('#option-d').value,
                },
                correctAnswer: questionForm.querySelector('input[name="correct-answer"]:checked').value,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const questionRef = db.collection('tests').doc(testId).collection('questions').doc(questionId);
            
            questionRef.set(questionData, { merge: true })
                .then(() => {
                    alert(`Question ${qNumber} saved successfully!`);
                    activeBtn.classList.add('completed');
                     savedQuestions[questionId] = true; // +++ ADD THIS LINE
                })
                .catch(err => {
                    console.error("Error saving question:", err);
                    alert("Error: " + err.message);
                });
        });
    }

    // --- Event Handlers ---
    function handleNavClick(e) {
        const module = e.target.dataset.module;
        const qNumber = e.target.dataset.qNumber;
        showEditorForQuestion(module, qNumber);
    }

    moduleSwitcher.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        document.querySelectorAll('.module-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        const moduleNum = parseInt(e.target.dataset.module);
        const questionCount = (moduleNum <= 2) ? 27 : 22;
        generateNavButtons(questionCount, moduleNum);
        
        editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below to begin editing.</p></div>`;
    });

    

    

});