// js/test-engine.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase and MathQuill ---
    const db = firebase.firestore();
    const MQ = MathQuill.getInterface(2);

    // --- NINJA ARCHITECTURE: New State Management for a Module-Based Test ---
    let testId = null;
    let allQuestionsByModule = [[], [], [], []]; // An array of arrays for each module's questions
    let currentModuleIndex = 0;
    let currentQuestionIndex = 0; // Index within the current module's array
    let markedQuestions = {}; // To store review status, e.g., { "m1_q5": true }
    let userAnswers = {}; // To store the student's selected answers
    let timerInterval = null; // Holds the setInterval instance for the timer
    const moduleTimers = [32 * 60, 32 * 60, 35 * 60, 35 * 60]; // Durations in seconds for M1, M2, M3, M4
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
     * Main function to initialize the entire test.
     */
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

    /**
     * NINJA UPGRADE: Fetches all questions and groups them by module.
     */
    async function fetchAndGroupQuestions(id) {
        try {
            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                // Group into the correct module (module 1 -> index 0, etc.)
                if (question.module >= 1 && question.module <= 4) {
                    allQuestionsByModule[question.module - 1].push(question);
                }
            });
            // Sort questions within each module by their question number
            allQuestionsByModule.forEach(module => module.sort((a, b) => a.questionNumber - b.questionNumber));
        } catch (error) {
            console.error("Error fetching or grouping questions: ", error);
        }
    }

    /**
     * Starts a specific module of the test.
     */
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

    /**
     * Renders a question and its passage based on the current state.
     */
    function renderQuestion(index) {
        const question = allQuestionsByModule[currentModuleIndex][index];
        if (!question) return;

        // NINJA FEATURE: Render the image if it exists
        let imageHTML = '';
        if (question.imageUrl) {
            imageHTML = `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'}; margin-bottom: 15px; border-radius: 8px;">`;
        }

        stimulusPaneContent.innerHTML = imageHTML + (question.passage || '');

        const questionHTML = `
            <div class="question-header-bar">
                <div class="q-number-display">${question.questionNumber}</div>
                <label class="mark-for-review">
                    <input type="checkbox" id="mark-review-checkbox" ${markedQuestions[question.id] ? 'checked' : ''}>
                    <i class="fa-regular fa-flag"></i> <span>Mark for Review</span>
                </label>
            </div>
            <div class="question-text">${question.prompt || ''}</div>
            <div class="question-options">${renderOptions(question)}</div>
        `;
        questionPaneContent.innerHTML = questionHTML;

        // Re-render MathJax/MathQuill if it's a math module
        if (question.module > 2) {
            MQ.StaticMath(stimulusPaneContent);
            questionPaneContent.querySelectorAll('.question-text, .option-text').forEach(el => MQ.StaticMath(el));
        }
        
        const savedAnswer = userAnswers[question.id];
        if (savedAnswer) {
            const radioBtn = questionPaneContent.querySelector(`input[value="${savedAnswer}"]`);
            if (radioBtn) radioBtn.checked = true;
        }
        
        updateUI(question);
    }

    // In js/test-engine.js, REPLACE the line above with THIS function

/**
 * NINJA FIX: Generates the HTML for answer options (MCQ).
 * This was missing and caused the "undefined" error.
 */
function renderOptions(question) {
    if (question.format === 'mcq') {
        // Map through the options A, B, C, D to create the HTML for each one
        return ['A', 'B', 'C', 'D'].map(opt => {
            const optionText = question.options[opt] || ''; // Gracefully handle if an option is empty
            return `
                <div class="option-wrapper">
                    <label class="option">
                        <input type="radio" name="${question.id}" value="${opt}">
                        <span class="option-letter">${opt}</span>
                        <span class="option-text">${optionText}</span>
                    </label>
                    <button class="strikethrough-btn" title="Eliminate choice"><i class="fa-solid fa-ban"></i></button>
                </div>`;
        }).join(''); // Join the array of HTML strings into a single block
    }
    
    // Add logic here for other question types like fill-in-the-blank in the future
    if (question.format === 'fill-in') {
        return `<div><input type="text" class="fill-in-input" placeholder="Type your answer here"></div>`;
    }

    // Fallback for any unknown format
    return '<p>Question format not supported.</p>';}

    /**
     * Updates all UI elements based on the current state.
     */
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
    
    /**
     * NINJA UPGRADE: Populates the modal grid for the CURRENT module only.
     */
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

    /**
     * NINJA FEATURE: Updates highlights in the modal (current, answered, marked).
     */
    function updateModalGridHighlights() {
        const qBtns = modalGrid.querySelectorAll('.q-number');
        qBtns.forEach((btn, index) => {
            const questionId = allQuestionsByModule[currentModuleIndex][index].id;
            btn.classList.remove('current', 'answered', 'reviewed');
            if (index === currentQuestionIndex) btn.classList.add('current');
            if (userAnswers[questionId]) btn.classList.add('answered');
            if (markedQuestions[questionId]) btn.classList.add('reviewed');
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
                showReviewScreen(); // Automatically move to review
            }
        }, 1000);
    }
    function calculateScore() {
        let correctAnswers = 0;
        const totalQuestions = questions.length;

        // Flatten the modules into a single array of questions for easier iteration
        const allQuestions = allQuestionsByModule.flat();

        allQuestions.forEach(question => {
            const userAnswer = userAnswers[question.id];
            if (userAnswer && userAnswer === question.correctAnswer) {
                correctAnswers++;
            }
        });

        // Simple scoring: (Correct / Total) * Max Score (1600)
        // This is a placeholder; real scoring involves scaling tables.
        const rawScore = (correctAnswers / totalQuestions) || 0;
        const scaledScore = Math.round(rawScore * 1600);

        return {
            correct: correctAnswers,
            total: totalQuestions,
            score: scaledScore
        };
    }

    function showReviewScreen() {
        clearInterval(timerInterval);
        timerDisplay.textContent = "00:00";
        reviewBtn.textContent = (currentModuleIndex < 3) ? `Continue to Next Module` : `Finish Test and See Results`;
        toggleModal(true);
    }

    function finishTest() {
        clearInterval(timerInterval);
        const finalResult = calculateScore();
        // For now, we'll just alert the result.
        // In the future, we will save this to Firestore and redirect to a results page.
        alert(`Test Complete!\n\nCorrect Answers: ${finalResult.correct} / ${finalResult.total}\nEstimated Score: ${finalResult.score}`);
        
        // Redirect to dashboard after showing results
        window.location.href = 'dashboard.html';
    }

    function toggleModal(show) {
        updateModalGridHighlights(); // Always update highlights when opening
        modal.classList.toggle('visible', show);
        backdrop.classList.toggle('visible', show);
    }

    // --- Event Listeners ---
    nextBtn.addEventListener('click', () => {
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];
        if (currentQuestionIndex < currentModuleQuestions.length - 1) {
            currentQuestionIndex++;
            renderQuestion(currentQuestionIndex);
        } else {
            showReviewScreen();
        }
    });
    
    backBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion(currentQuestionIndex);
        }
    });

    // In js/test-engine.js

// --- Event Listeners ---

// ... (keep the existing nextBtn, backBtn, and reviewBtn listeners) ...


/**
 * NINJA FIX: Re-activating the Strikethrough functionality.
 * We use event delegation on the question pane for maximum efficiency.
 */
questionPaneContent.addEventListener('click', (event) => {
    // Find the closest strikethrough button to where the user clicked
    const strikethroughBtn = event.target.closest('.strikethrough-btn');

    if (strikethroughBtn) {
        // Find the parent .option-wrapper and toggle its class
        const optionWrapper = strikethroughBtn.closest('.option-wrapper');
        if (optionWrapper) {
            optionWrapper.classList.toggle('stricken-through');
        }
    }
});

// Listen for answer selections and save them (This listener should already exist)
questionPaneContent.addEventListener('change', (event) => {
    // Handle when a student selects an answer
    if (event.target.type === 'radio') {
        const questionId = event.target.name;
        const selectedAnswer = event.target.value;
        userAnswers[questionId] = selectedAnswer;

        // For better UX, automatically un-strike an answer when it's selected
        const optionWrapper = event.target.closest('.option-wrapper');
        if (optionWrapper) {
            optionWrapper.classList.remove('stricken-through');
        }
    }

    // Handle when a student toggles "Mark for Review"
    if (event.target.type === 'checkbox') {
        const questionId = allQuestionsByModule[currentModuleIndex][currentQuestionIndex].id;
        if (event.target.checked) {
            markedQuestions[questionId] = true;
        } else {
            delete markedQuestions[questionId];
        }
    }

    // After any change, update the highlights in the navigator modal
    updateModalGridHighlights();
});
    
    reviewBtn.addEventListener('click', () => {
        toggleModal(false);
        if (currentModuleIndex < 3) {
            startModule(currentModuleIndex + 1);
        } else {
            finishTest();
        }
    });

    questionPaneContent.addEventListener('change', (event) => {
    // 1. Handle when a student selects an answer (clicks a radio button)
    if (event.target.type === 'radio') {
        const questionId = event.target.name;
        const selectedAnswer = event.target.value;
        userAnswers[questionId] = selectedAnswer; // Save the answer to our state object

        // A good UX touch: automatically un-strike an answer when selected.
        const optionWrapper = event.target.closest('.option-wrapper');
        if (optionWrapper) {
            optionWrapper.classList.remove('stricken-through');
        }
    }

    // 2. Handle when a student toggles "Mark for Review"
    if (event.target.type === 'checkbox') {
        const questionId = allQuestionsByModule[currentModuleIndex][currentQuestionIndex].id;
        if (event.target.checked) {
            markedQuestions[questionId] = true; // Mark as true if checked
        } else {
            delete markedQuestions[questionId]; // Remove if unchecked
        }
    }

    // 3. After any change, update the navigator modal to reflect the new state.
    updateModalGridHighlights();
});

    highlighterBtn.addEventListener('click', () => {
        isHighlighterActive = !isHighlighterActive;
        document.body.classList.toggle('highlighter-active', isHighlighterActive);
        highlighterBtn.classList.toggle('active', isHighlighterActive); // Visual feedback
    });

    // Add a listener to the passage text itself to handle highlighting
    stimulusPaneContent.addEventListener('mouseup', () => {
        if (!isHighlighterActive) return;
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = 'highlight';
            span.appendChild(range.extractContents());
            range.insertNode(span);
        }
    });

    
    // --- Initialize the test on page load ---
    initTest();
});