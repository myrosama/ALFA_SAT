document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const editorFooter = document.getElementById('editor-footer');
    const footerToggle = document.getElementById('footer-toggle');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    
    // --- State Management ---
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null;

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

    // --- Fetch Test Info ---
    db.collection('tests').doc(testId).get().then(doc => {
        if (doc.exists) {
            editorHeaderTitle.textContent = `Editing: ${doc.data().name}`;
        } else {
            alert('Test not found!');
            window.location.href = 'admin.html';
        }
    });

    // --- UI Generation Functions ---
    function generateNavButtons(count, moduleNum) {
        questionNavigator.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const button = document.createElement('button');
            button.classList.add('q-nav-btn');
            button.dataset.module = moduleNum;
            button.dataset.qNumber = i;
            button.textContent = i;
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

        // *** THIS IS THE CRITICAL FIX ***
        // Clone the template, which contains the full form, and display it
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.innerHTML = '';
        editorContainer.appendChild(formClone);
        
        // --- Now, populate the toolbars inside the newly created form ---
        const domainSelect = editorContainer.querySelector('#q-domain');
        const skillSelect = editorContainer.querySelector('#q-skill');
        const pointsSelect = editorContainer.querySelector('#q-points');
        editorContainer.querySelector('#q-number-display').textContent = qNumber;

        const isMath = module > 2;
        const domains = isMath ? Object.keys(questionTypes.Math) : Object.keys(questionTypes["Reading & Writing"]);
        
        domains.forEach(domain => {
            domainSelect.innerHTML += `<option value="${domain}">${domain}</option>`;
        });
        
        domainSelect.addEventListener('change', () => {
            skillSelect.innerHTML = '';
            const selectedDomain = domainSelect.value;
            const skills = isMath ? questionTypes.Math[selectedDomain] : questionTypes["Reading & Writing"][selectedDomain];
            skills.forEach(skill => {
                skillSelect.innerHTML += `<option value="${skill}">${skill}</option>`;
            });
        });
        domainSelect.dispatchEvent(new Event('change'));

        // --- Automatic Point Calculation ---
        let defaultPoints = 20;
        if (qNumber <= 5) defaultPoints = 10;
        else if (qNumber >= 20) defaultPoints = 30;
        
        pointValues.forEach(val => {
            const selected = (val === defaultPoints) ? 'selected' : '';
            pointsSelect.innerHTML += `<option value="${val}" ${selected}>${val} points</option>`;
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

    footerToggle.addEventListener('click', () => {
        const isHidden = editorFooter.classList.toggle('hidden');
        footerToggle.innerHTML = isHidden ? `<i class="fa-solid fa-chevron-up"></i>` : `<i class="fa-solid fa-chevron-down"></i>`;
    });

    // --- Initial Page Load ---
    generateNavButtons(27, 1);
});