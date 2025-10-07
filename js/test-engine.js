// js/test-engine.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase and MathQuill ---
    const db = firebase.firestore();
    const MQ = MathQuill.getInterface(2);

    // --- State Management: The core variables that run the test ---
    let testId = null;
    let questions = []; // This will hold all fetched questions, sorted correctly.
    let currentQuestionIndex = 0;
    let userAnswers = {}; // Stores the student's answers, e.g., { "m1_q1": "A" }
    let timerInterval = null; // Holds the setInterval instance for the timer

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
    const timerDisplay = document.querySelector('.timer span');


    /**
     * The main function to initialize the entire test.
     */
    async function initTest() {
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');

        if (!testId) {
            document.body.innerHTML = '<h1>Error: No Test ID found in URL.</h1><a href="dashboard.html">Go back to Dashboard</a>';
            return;
        }

        await fetchQuestions(testId);

        if (questions.length > 0) {
            populateModalGrid();
            renderQuestion(currentQuestionIndex);
            startTimer(32 * 60); // Starts a 32-minute timer
        } else {
            stimulusPaneContent.innerHTML = '<p>Could not load questions for this test. The test may be empty.</p>';
            questionPaneContent.innerHTML = '';
        }
    }

    /**
     * Fetches all questions for the given testId from Firestore and sorts them.
     */
    async function fetchQuestions(id) {
        try {
            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            questionsSnapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
            
            // CRITICAL: Sort questions by module, then by question number.
            questions.sort((a, b) => {
                if (a.module !== b.module) return a.module - b.module;
                return a.questionNumber - b.questionNumber;
            });
        } catch (error) {
            console.error("Error fetching questions: ", error);
        }
    }

    /**
     * Renders a question and its passage based on the current index. This is the core rendering function.
     */
    function renderQuestion(index) {
        const question = questions[index];
        if (!question) return;

        const isMath = question.module > 2;

        // Render Passage/Stimulus (handles empty passage gracefully)
        stimulusPaneContent.innerHTML = question.passage || '<p></p>'; // Show nothing if empty

        // Build the question HTML
        const questionHTML = `
            <div class="question-header-bar">
                <div class="q-number-display">${question.questionNumber}</div>
                <label class="mark-for-review">
                    <input type="checkbox"> <i class="fa-regular fa-flag"></i> <span>Mark for Review</span>
                </label>
            </div>
            <div class="question-text">${question.prompt || 'Question text not available.'}</div>
            <div class="question-options">
                ${renderOptions(question)}
            </div>
        `;
        questionPaneContent.innerHTML = questionHTML;

        // If it's a math question, render LaTeX using MathQuill
        if (isMath) {
            MQ.StaticMath(stimulusPaneContent);
            questionPaneContent.querySelectorAll('.question-text, .option-text').forEach(el => MQ.StaticMath(el));
        }

        // Restore the user's previously selected answer for this question
        const savedAnswer = userAnswers[question.id];
        if (savedAnswer) {
            const radioBtn = questionPaneContent.querySelector(`input[value="${savedAnswer}"]`);
            if (radioBtn) radioBtn.checked = true;
        }

        updateUI(question);
    }

    /**
     * Generates the HTML for A, B, C, D options.
     */
    function renderOptions(question) {
        if (question.format === 'mcq') {
            return ['A', 'B', 'C', 'D'].map(opt => {
                const optionText = question.options[opt] || ''; // Handle empty options
                return `
                    <div class="option-wrapper">
                        <label class="option">
                            <input type="radio" name="${question.id}" value="${opt}">
                            <span class="option-letter">${opt}</span>
                            <span class="option-text">${optionText}</span>
                        </label>
                    </div>`;
            }).join('');
        }
        // Future-proof for fill-in-the-blank
        return '<p>Unsupported question format.</p>';
    }

    /**
     * Updates all static UI elements like headers, footers, and buttons.
     */
    function updateUI(question) {
        // Update header titles
        testTitleHeader.textContent = question.module <= 2 ? 'Reading & Writing' : 'Math';
        moduleTitleHeader.textContent = `Module ${question.module <= 2 ? question.module : question.module - 2}`;

        // Update footer navigation button
        questionNavBtnText.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;

        // Enable/disable Back/Next buttons
        backBtn.disabled = currentQuestionIndex === 0;
        nextBtn.textContent = (currentQuestionIndex === questions.length - 1) ? 'Finish' : 'Next';

        // NINJA FEATURE: Conditional Calculator
        if (calculatorBtn) {
            calculatorBtn.style.display = (question.module > 2) ? 'inline-block' : 'none';
        }
    }

    /**
     * Populates the question navigator modal with clickable buttons.
     */
    function populateModalGrid() {
        modalGrid.innerHTML = '';
        questions.forEach((q, index) => {
            const qBtn = document.createElement('div');
            qBtn.classList.add('q-number');
            qBtn.textContent = q.questionNumber;
            qBtn.dataset.index = index;
            qBtn.addEventListener('click', () => {
                currentQuestionIndex = index;
                renderQuestion(index);
                // Close modal after selection
                document.getElementById('modal-backdrop').classList.remove('visible');
                document.getElementById('question-navigator-modal').classList.remove('visible');
            });
            modalGrid.appendChild(qBtn);
        });
    }
    
    /**
     * NINJA FEATURE: Starts a countdown timer.
     * @param {number} duration in seconds
     */
    function startTimer(duration) {
        let timer = duration;
        clearInterval(timerInterval); // Clear any existing timer

        timerInterval = setInterval(() => {
            let minutes = parseInt(timer / 60, 10);
            let seconds = parseInt(timer % 60, 10);

            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;

            timerDisplay.textContent = minutes + ":" + seconds;

            if (--timer < 0) {
                clearInterval(timerInterval);
                alert("Time's up!");
                // Here you would typically auto-submit the test
            }
        }, 1000);
    }

    // --- Event Listeners ---

    nextBtn.addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            renderQuestion(currentQuestionIndex);
        } else {
            // Logic for Finish button
            alert("Test Finished! (Scoring logic to be implemented)");
        }
    });

    backBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion(currentQuestionIndex);
        }
    });

    // Listen for answer selections and save them
    questionPaneContent.addEventListener('change', (event) => {
        if (event.target.type === 'radio') {
            const questionId = event.target.name;
            const selectedAnswer = event.target.value;
            userAnswers[questionId] = selectedAnswer;
            console.log('User Answers:', userAnswers); // For debugging
        }
    });

    // --- Let's Begin ---
    initTest();
});