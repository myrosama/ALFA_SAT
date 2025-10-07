// js/test-engine.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase and MathQuill ---
    const db = firebase.firestore();
    const MQ = MathQuill.getInterface(2);

    // --- State Management ---
    let testId = null;
    let questions = []; // Array to hold all fetched questions in order
    let currentQuestionIndex = 0;
    let userAnswers = {}; // To store user's selected answers

    // --- Page Elements ---
    const stimulusPaneContent = document.querySelector('.stimulus-pane .pane-content');
    const questionPaneContent = document.querySelector('.question-pane .pane-content');
    const testTitleHeader = document.querySelector('.test-title h4');
    const moduleTitleHeader = document.querySelector('.test-title span');
    const nextBtn = document.querySelector('.footer-right .btn-primary');
    const backBtn = document.querySelector('.footer-right .btn-secondary');
    const questionNavBtnText = document.querySelector('#question-nav-btn span');
    const modalGrid = document.getElementById('modal-question-grid');

    /**
     * Main function to initialize the test.
     * It gets the test ID from the URL, fetches questions, and renders the first one.
     */
    async function initTest() {
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');

        if (!testId) {
            document.body.innerHTML = '<h1>Error: No Test ID provided.</h1>';
            return;
        }

        await fetchQuestions(testId);

        if (questions.length > 0) {
            populateModalGrid();
            renderQuestion(currentQuestionIndex);
        } else {
            stimulusPaneContent.innerHTML = '<p>Could not load questions for this test.</p>';
        }
    }

    /**
     * Fetches all questions for a given testId from Firestore and sorts them.
     * @param {string} testId - The document ID of the test.
     */
    async function fetchQuestions(testId) {
        try {
            const questionsSnapshot = await db.collection('tests').doc(testId).collection('questions').get();
            questionsSnapshot.forEach(doc => {
                questions.push(doc.data());
            });

            // Sort questions by module, then by question number
            questions.sort((a, b) => {
                if (a.module !== b.module) {
                    return a.module - b.module;
                }
                return a.questionNumber - b.questionNumber;
            });

            console.log(`Successfully fetched and sorted ${questions.length} questions.`);
        } catch (error) {
            console.error("Error fetching questions: ", error);
        }
    }

    /**
     * Renders a question based on its index in the `questions` array.
     * @param {number} index - The index of the question to render.
     */
    function renderQuestion(index) {
        const question = questions[index];
        if (!question) return;

        const isMath = question.module > 2;
        
        // Render Stimulus/Passage
        stimulusPaneContent.innerHTML = question.passage || '<p>No passage for this question.</p>';

        // Render Question Content
        const questionHTML = `
            <div class="question-header-bar">
                <div class="q-number-display">${question.questionNumber}</div>
                <label class="mark-for-review">
                    <input type="checkbox">
                    <i class="fa-regular fa-flag"></i>
                    <span>Mark for Review</span>
                </label>
            </div>
            <div class="question-text">${question.prompt}</div>
            <div class="question-options">
                ${renderOptions(question)}
            </div>
        `;
        questionPaneContent.innerHTML = questionHTML;

        // If it's a math question, re-render using MathQuill
        if (isMath) {
            MQ.StaticMath(stimulusPaneContent);
            questionPaneContent.querySelectorAll('.question-text, .option-text').forEach(el => MQ.StaticMath(el));
        }
        
        // Update UI elements
        updateHeaders(question);
        updateFooter();
    }
    
    /**
     * Generates HTML for the answer options.
     */
    function renderOptions(question) {
        if (question.format === 'mcq') {
            return ['A', 'B', 'C', 'D'].map(opt => `
                <div class="option-wrapper">
                    <label class="option">
                        <input type="radio" name="question${question.questionNumber}" value="${opt}">
                        <span class="option-letter">${opt}</span>
                        <span class="option-text">${question.options[opt]}</span>
                    </label>
                    <button class="strikethrough-btn" title="Eliminate choice"><i class="fa-solid fa-ban"></i></button>
                </div>
            `).join('');
        }
        // Add logic for fill-in-the-blank here if needed
        return '<p>Unsupported question format.</p>';
    }

    /**
     * Populates the question navigator modal with buttons for each question.
     */
    function populateModalGrid() {
        modalGrid.innerHTML = ''; // Clear existing grid
        questions.forEach((q, index) => {
            const qBtn = document.createElement('div');
            qBtn.classList.add('q-number');
            qBtn.textContent = q.questionNumber;
            qBtn.dataset.index = index; // Use index for easy navigation
            qBtn.addEventListener('click', () => {
                currentQuestionIndex = index;
                renderQuestion(index);
                // Assuming you have a function to close the modal
                document.getElementById('modal-backdrop').classList.remove('visible');
                document.getElementById('question-navigator-modal').classList.remove('visible');
            });
            modalGrid.appendChild(qBtn);
        });
    }

    /**
     * Updates the main header titles.
     */
    function updateHeaders(question) {
        testTitleHeader.textContent = question.module <= 2 ? 'Reading & Writing' : 'Math';
        moduleTitleHeader.textContent = `Module ${question.module <= 2 ? question.module : question.module - 2}`;
    }

    /**
     * Updates the footer text and button states.
     */
    function updateFooter() {
        questionNavBtnText.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
        backBtn.disabled = currentQuestionIndex === 0;
        
        if (currentQuestionIndex === questions.length - 1) {
            nextBtn.textContent = 'Finish'; // Or "Review"
        } else {
            nextBtn.textContent = 'Next';
        }
    }

    // --- Event Listeners for Navigation ---
    nextBtn.addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            renderQuestion(currentQuestionIndex);
        }
    });

    backBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion(currentQuestionIndex);
        }
    });

    // --- Start the Test ---
    initTest();
});