document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    const moduleSwitcher = document.querySelector('.module-switcher');

    // --- State Management ---
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null;

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
        
        // Update active button style
        document.querySelectorAll('.q-nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.q-nav-btn[data-module='${module}'][data-q-number='${qNumber}']`);
        if(activeBtn) activeBtn.classList.add('active');

        // Clone the template and display it
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.innerHTML = '';
        editorContainer.appendChild(formClone);
        
        // We will add logic here later to populate the form with question types and saved data
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
        currentModule = moduleNum;

        // English modules have 27 questions, Math have 22
        const questionCount = (moduleNum <= 2) ? 27 : 22;
        generateNavButtons(questionCount, moduleNum);
        
        // Clear the editor when switching modules
        editorContainer.innerHTML = `
            <div class="editor-placeholder">
                <i class="fa-solid fa-hand-pointer"></i>
                <p>Select a question from the navigator below to begin editing.</p>
            </div>`;
    });

    // --- Initial Page Load ---
    generateNavButtons(27, 1); // Start with R&W Module 1
});