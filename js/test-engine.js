// js/test-engine.js - CORRECTED FOR RENDERING

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase and MathQuill ---
    const db = firebase.firestore();
    const MQ = MathQuill.getInterface(2);

    // --- State Management ---
    let testId = null;
    let allQuestionsByModule = [[], [], [], []];
    let currentModuleIndex = 0;
    let currentQuestionIndex = 0;
    let markedQuestions = {};
    let userAnswers = {};
    let timerInterval = null;
    const moduleTimers = [32 * 60, 32 * 60, 35 * 60, 35 * 60];
    let isHighlighterActive = false;

    // --- Page Element References ---
    const stimulusPaneContent = document.querySelector('.stimulus-pane .pane-content');
    const questionPaneContent = document.querySelector('.question-pane .pane-content');
    const testTitleHeader = document.querySelector('.test-title h4');
    const moduleTitleHeader = document.querySelector('.test-title span');
    const nextBtn = document.querySelector('.footer-right .btn-primary');
    const backBtn = document.querySelector('.footer-right .btn-secondary');
    const questionNavBtnText = document.querySelector('#question-nav-btn span');
    const modalGrid = document.getElementById('modal-question-grid');
    const calculatorBtn = document.querySelector('.tool-btn[title="Calculator"]');
    const highlighterBtn = document.querySelector('.tool-btn[title="Highlighter"]');
    const timerDisplay = document.querySelector('.timer span');
    const modal = document.getElementById('question-navigator-modal');
    const backdrop = document.getElementById('modal-backdrop');
    const reviewBtn = modal.querySelector('.modal-footer button');

    /**
     * NINJA FIX #2: New helper function to find and render all math formulas.
     * This function should be called AFTER the HTML from the database is inserted into the page.
     */
    function renderAllMath() {
        // Find all the special formula spans that Quill creates
        const formulaSpans = document.querySelectorAll('.ql-formula');
        formulaSpans.forEach(span => {
            // Get the raw LaTeX from the 'data-value' attribute
            const latex = span.dataset.value;
            if (latex) {
                // Use MathQuill to render the LaTeX inside that span
                // This replaces the raw text with a beautifully formatted equation.
                try {
                    MQ.StaticMath(span).latex(latex);
                } catch (e) {
                    console.error("MathQuill rendering error:", e);
                    span.textContent = `[Math Error: ${latex}]`; // Show an error gracefully
                }
            }
        });
    }

    /**
     * NINJA FIX #1: The fully corrected renderQuestion function.
     * It now uses .innerHTML and calls renderAllMath() at the end.
     */
    // In js/test-engine.js

// In js/test-engine.js, replace the entire renderQuestion function
function renderQuestion(index) {
    const question = allQuestionsByModule[currentModuleIndex][index];
    if (!question) return;

    const isMath = question.module > 2;

    // --- References to Elements ---
    const mainWrapper = document.querySelector('.test-main');
    const stimulusPane = document.querySelector('.stimulus-pane');
    
    // Get references to BOTH headers
    const mathHeader = document.getElementById('math-question-header');
    const rwHeader = document.getElementById('rw-question-header');

    // --- Layout & Visibility Logic ---
    mainWrapper.classList.toggle('math-layout-active', isMath);
    
    // Show the correct header and hide the other
    mathHeader.classList.toggle('hidden', !isMath);
    rwHeader.classList.toggle('hidden', isMath);

    // Determine which header is currently active to populate it
    const activeHeader = isMath ? mathHeader : rwHeader;
    const qNumberDisplay = activeHeader.querySelector('.q-number-display');
    const markReviewCheckbox = activeHeader.querySelector('.mark-review-checkbox');

    const isStimulusEmpty = (!question.passage || question.passage.trim() === '' || question.passage === '<p><br></p>') && !question.imageUrl;
    stimulusPane.classList.toggle('is-empty', isStimulusEmpty);

    // --- Content Rendering ---
    const imagePosition = question.imagePosition || 'above';
    const imageHTML = question.imageUrl ? `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'};">` : '';
    const passageHTML = question.passage || '';
    stimulusPaneContent.innerHTML = (imagePosition === 'below') ? (passageHTML + imageHTML) : (imageHTML + passageHTML);
    
    // Populate the active header bar
    qNumberDisplay.textContent = question.questionNumber;
    markReviewCheckbox.checked = !!markedQuestions[question.id];
    
    // Populate the question prompt and options
    questionPaneContent.innerHTML = `
        <div class="question-text">${question.prompt || ''}</div>
        <div class="question-options">${renderOptions(question)}</div>
    `;

    renderAllMath();

    // --- Restore State and Update UI ---
    const savedAnswer = userAnswers[question.id];
    if (savedAnswer) {
        const radioBtn = document.querySelector(`.question-pane input[value="${savedAnswer}"]`);
        if (radioBtn) radioBtn.checked = true;
    }
    
    updateUI(question);
}
    
    // The rest of the file remains largely the same... I'm including it all for a simple copy-paste replacement.

    async function initTest() {
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');
        if (!testId) {
            document.body.innerHTML = '<h1>Error: No Test ID provided.</h1>';
            return;
        }
        await fetchAndGroupQuestions(testId);
        startModule(0);
    }

    async function fetchAndGroupQuestions(id) {
        try {
            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                if (question.module >= 1 && question.module <= 4) {
                    allQuestionsByModule[question.module - 1].push(question);
                }
            });
            allQuestionsByModule.forEach(module => module.sort((a, b) => a.questionNumber - b.questionNumber));
        } catch (error) {
            console.error("Error fetching or grouping questions: ", error);
        }
    }

    function startModule(moduleIndex) {
        currentModuleIndex = moduleIndex;
        currentQuestionIndex = 0;
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];
        if (!currentModuleQuestions || currentModuleQuestions.length === 0) {
            if (currentModuleIndex < 3) {
                 startModule(currentModuleIndex + 1);
            } else {
                 finishTest();
            }
            return;
        }
        populateModalGrid();
        renderQuestion(currentQuestionIndex);
        startTimer(moduleTimers[currentModuleIndex]);
    }

    function renderOptions(question) {
        if (question.format === 'mcq') {
            return ['A', 'B', 'C', 'D'].map(opt => {
                const optionText = question.options[opt] || '';
                return `
                    <div class="option-wrapper">
                        <label class="option">
                            <input type="radio" name="${question.id}" value="${opt}">
                            <span class="option-letter">${opt}</span>
                            <span class="option-text">${optionText}</span>
                        </label>
                        <button class="strikethrough-btn" title="Eliminate choice"><i class="fa-solid fa-ban"></i></button>
                    </div>`;
            }).join('');
        }
        if (question.format === 'fill-in') {
            return `<div><input type="text" class="fill-in-input" placeholder="Type your answer here"></div>`;
        }
        return '<p>Question format not supported.</p>';
    }

    function updateUI(question) {
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];
        testTitleHeader.textContent = question.module <= 2 ? 'Reading & Writing' : 'Math';
        moduleTitleHeader.textContent = `Module ${question.module <= 2 ? question.module : question.module - 2}`;
        questionNavBtnText.textContent = `Question ${currentQuestionIndex + 1} of ${currentModuleQuestions.length}`;
        backBtn.disabled = currentQuestionIndex === 0;
        nextBtn.textContent = (currentQuestionIndex === currentModuleQuestions.length - 1) ? 'Finish Module' : 'Next';
        calculatorBtn.style.display = (question.module > 2) ? 'inline-block' : 'none';
        updateModalGridHighlights();
    }
    
    function populateModalGrid() {
        modalGrid.innerHTML = '';
        allQuestionsByModule[currentModuleIndex].forEach((q, index) => {
            const qBtn = document.createElement('div');
            qBtn.classList.add('q-number');
            qBtn.textContent = q.questionNumber;
            qBtn.dataset.index = index;
            qBtn.addEventListener('click', () => {
                currentQuestionIndex = index;
                renderQuestion(index);
                toggleModal(false);
            });
            modalGrid.appendChild(qBtn);
        });
    }

    function updateModalGridHighlights() {
        const qBtns = modalGrid.querySelectorAll('.q-number');
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];

        qBtns.forEach((btn, index) => {
            if (!currentModuleQuestions[index]) return;
            const questionId = currentModuleQuestions[index].id;
            
            btn.classList.remove('current', 'answered', 'reviewed');

            if (userAnswers[questionId]) btn.classList.add('answered');
            if (markedQuestions[questionId]) btn.classList.add('reviewed');
            if (index === currentQuestionIndex) btn.classList.add('current');
        });
    }

    function startTimer(duration) {
        let timer = duration;
        clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            let minutes = parseInt(timer / 60, 10);
            let seconds = parseInt(timer % 60, 10);
            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;
            timerDisplay.textContent = minutes + ":" + seconds;

            if (--timer < 0) {
                clearInterval(timerInterval);
                alert("Time's up for this module!");
                if (currentModuleIndex < 3) startModule(currentModuleIndex + 1);
                else finishTest();
            }
        }, 1000);
    }

    function calculateScore() {
        let correctAnswers = 0;
        const allQuestionsFlat = allQuestionsByModule.flat();
        const totalQuestions = allQuestionsFlat.length;
        if(totalQuestions === 0) return { correct: 0, total: 0, score: 0 };

        allQuestionsFlat.forEach(question => {
            if (userAnswers[question.id] === question.correctAnswer) {
                correctAnswers++;
            }
        });

        const rawScore = (correctAnswers / totalQuestions);
        const scaledScore = Math.round(rawScore * 1600); // Placeholder scaling

        return { correct: correctAnswers, total: totalQuestions, score: scaledScore };
    }

    function showReviewScreen(isEndOfModule) {
        clearInterval(timerInterval);
        timerDisplay.textContent = "00:00";
        reviewBtn.textContent = (currentModuleIndex < 3) ? `Continue to Next Module` : `Finish Test and See Results`;
        reviewBtn.style.display = isEndOfModule ? 'block' : 'none';
        toggleModal(true);
    }

    function finishTest() {
        clearInterval(timerInterval);
        const finalResult = calculateScore();
        alert(`Test Complete!\n\nCorrect Answers: ${finalResult.correct} / ${finalResult.total}\nEstimated Score: ${finalResult.score}`);
        window.location.href = 'dashboard.html';
    }

    function toggleModal(show) {
        if (show) {
            const modalHeader = modal.querySelector('.modal-header h4');
            const moduleType = currentModuleIndex < 2 ? "Reading and Writing" : "Math";
            const moduleNumber = currentModuleIndex < 2 ? currentModuleIndex + 1 : currentModuleIndex - 1;
            modalHeader.textContent = `Section ${currentModuleIndex + 1}, Module ${moduleNumber}: ${moduleType} Questions`;
            updateModalGridHighlights();
        }
        modal.classList.toggle('visible', show);
        backdrop.classList.toggle('visible', show);
    }

    // --- Event Listeners ---
    const toggleBtn = document.getElementById('question-nav-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    toggleBtn.addEventListener('click', () => {
        reviewBtn.style.display = 'none';
        toggleModal(true);
    });
    closeModalBtn.addEventListener('click', () => toggleModal(false));
    backdrop.addEventListener('click', () => toggleModal(false));

    nextBtn.addEventListener('click', () => {
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];
        if (currentQuestionIndex < currentModuleQuestions.length - 1) {
            currentQuestionIndex++;
            renderQuestion(currentQuestionIndex);
        } else {
            showReviewScreen(true);
        }
    });
    
    backBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion(currentQuestionIndex);
        }
    });

    questionPaneContent.addEventListener('change', (event) => {
        if (event.target.type === 'radio') {
            const questionId = event.target.name;
            userAnswers[questionId] = event.target.value;
            const optionWrapper = event.target.closest('.option-wrapper');
            if (optionWrapper) optionWrapper.classList.remove('stricken-through');
        }

        if (event.target.id === 'mark-review-checkbox') {
            const questionId = allQuestionsByModule[currentModuleIndex][currentQuestionIndex].id;
            if (event.target.checked) markedQuestions[questionId] = true;
            else delete markedQuestions[questionId];
        }
        updateModalGridHighlights();
    });

    questionPaneContent.addEventListener('click', (event) => {
        const strikethroughBtn = event.target.closest('.strikethrough-btn');
        if (strikethroughBtn) {
            strikethroughBtn.closest('.option-wrapper')?.classList.toggle('stricken-through');
        }
    });
    
    reviewBtn.addEventListener('click', () => {
        toggleModal(false);
        if (currentModuleIndex < 3) startModule(currentModuleIndex + 1);
        else finishTest();
    });

    highlighterBtn.addEventListener('click', () => {
        isHighlighterActive = !isHighlighterActive;
        document.body.classList.toggle('highlighter-active', isHighlighterActive);
        highlighterBtn.classList.toggle('active', isHighlighterActive);
    });

    document.body.addEventListener('contextmenu', (event) => {
        if (isHighlighterActive && event.target.closest('.main-content-body')) {
            event.preventDefault();
        }
    });

    document.body.addEventListener('mouseup', (event) => {
        if (!isHighlighterActive || !event.target.closest('.main-content-body')) return;
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = 'highlight';
            try {
                range.surroundContents(span);
            } catch (e) { console.warn("Could not wrap selection.", e); }
            selection.removeAllRanges(); 
        }
    });
    
    initTest();
});