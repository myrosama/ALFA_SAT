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
    const moduleTimers = [32 * 60, 32 * 60, 35 * 60, 35 * 60 ]; // Durations in seconds for M1, M2, M3, M4
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

    document.body.addEventListener('mouseup', (event) => {
    // Only highlight if the feature is active and the mouse is inside our main content area
    if (!isHighlighterActive || !event.target.closest('.main-content-body')) return;

    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'highlight';
        
        try {
            // This method is safer for wrapping selections that may cross element boundaries
            range.surroundContents(span);
        } catch (e) {
            console.warn("Could not wrap complex selection.", e);
        }
        
        // Clear the browser's native selection after we've applied our highlight
        selection.removeAllRanges(); 
    }
});

// We still need to prevent the context menu in both panes
document.body.addEventListener('contextmenu', (event) => {
    if (isHighlighterActive && event.target.closest('.main-content-body')) {
        event.preventDefault();
    }
});
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


function renderQuestion(index) {
    const question = allQuestionsByModule[currentModuleIndex][index];
    if (!question) return;

    const isMath = question.module > 2;

    // --- Stimulus Pane Rendering ---
    let imageHTML = '';
    if (question.imageUrl) {
        imageHTML = `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'}; margin-bottom: 15px; border-radius: 8px;">`;
    }

    // NINJA FIX: This is the corrected logic.
    // We create the containers first, THEN safely add the text content.
    if (isMath) {
        // Step 1: Create the HTML structure with an empty container for the math passage.
        stimulusPaneContent.innerHTML = imageHTML + `<div id="math-passage" class="mq-math-mode"></div>`;
        
        // Step 2: Find that new container and set its .textContent. This preserves the LaTeX.
        const mathPassageEl = document.getElementById('math-passage');
        if (mathPassageEl) {
            mathPassageEl.textContent = question.passage || '';
        }
    } else {
        // Non-math modules are simple.
        stimulusPaneContent.innerHTML = imageHTML + (question.passage || '');
    }

    // --- Question Pane Rendering (Reverting to the stable, working version) ---
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

    // --- Post-Rendering MathQuill Initialization ---
    if (isMath) {
        // Step 3: Now that the LaTeX is safely in the DOM, render it.
        const mathPassageEl = document.getElementById('math-passage');
        if (mathPassageEl) {
            MQ.StaticMath(mathPassageEl);
        }
        
        // Reverting to the original, reliable forEach loop for questions and options.
        questionPaneContent.querySelectorAll('.question-text, .option-text').forEach(el => {
            el.classList.add('mq-math-mode');
            MQ.StaticMath(el);
        });
    }

    // Restore user's saved answer (Unchanged)
    const savedAnswer = userAnswers[question.id];
    if (savedAnswer) {
        const radioBtn = questionPaneContent.querySelector(`input[value="${savedAnswer}"]`);
        if (radioBtn) radioBtn.checked = true;
    }
    
    // Update the rest of the UI (Unchanged)
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
    const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];

    qBtns.forEach((btn, index) => {
        // Make sure we don't get an error if the button doesn't match a question
        if (!currentModuleQuestions[index]) return;

        const questionId = currentModuleQuestions[index].id;
        
        // Reset all states first
        btn.classList.remove('current', 'answered', 'reviewed');

        // Apply state classes based on our state objects
        if (userAnswers[questionId]) {
            btn.classList.add('answered');
        }
        if (markedQuestions[questionId]) {
            btn.classList.add('reviewed');
        }
        // The 'current' class should be the most prominent, applied last.
        if (index === currentQuestionIndex) {
            btn.classList.add('current');
        }
    });
}


    function startTimer(duration) {
    let timer = duration;
    clearInterval(timerInterval); // Ensure no other timers are running

    timerInterval = setInterval(() => {
        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        timerDisplay.textContent = minutes + ":" + seconds;

        // Check if time has run out
        if (--timer < 0) {
            clearInterval(timerInterval);
            alert("Time's up for this module!");

            // NINJA LOGIC: Automatically advance to the next stage
            if (currentModuleIndex < 3) {
                // If it's not the last module, start the next one
                startModule(currentModuleIndex + 1);
            } else {
                // If it is the last module, finish the entire test
                finishTest();
            }
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

    function showReviewScreen(isEndOfModule) {
    clearInterval(timerInterval);
    timerDisplay.textContent = "00:00";
    
    // Set the button text based on whether it's the final module
    reviewBtn.textContent = (currentModuleIndex < 3) ? `Continue to Next Module` : `Finish Test and See Results`;
    
    // NINJA LOGIC: Only show the button if the module has truly ended
    // (either by finishing the last question or by timer running out).
    if (isEndOfModule) {
        reviewBtn.style.display = 'block';
    } else {
        reviewBtn.style.display = 'none';
    }

    toggleModal(true); // Show the modal
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

    // In js/test-engine.js, find and REPLACE the toggleModal function


function toggleModal(show) {
    if (show) {
        // Find the modal header element
        const modalHeader = modal.querySelector('.modal-header h4');
        
        // Dynamically set the text based on the current module index
        const moduleType = currentModuleIndex < 2 ? "Reading and Writing" : "Math";
        const moduleNumber = currentModuleIndex < 2 ? currentModuleIndex + 1 : currentModuleIndex - 1;
        modalHeader.textContent = `Section ${currentModuleIndex + 1}, Module ${moduleNumber}: ${moduleType} Questions`;
        
        // Always update the button highlights when the modal opens
        updateModalGridHighlights();
    }
    
    modal.classList.toggle('visible', show);
    backdrop.classList.toggle('visible', show);
}

    // --- Event Listeners ---
    // In js/test-engine.js
/**
 * NINJA UX REFINEMENT: Prevent the right-click context menu
 * from appearing over the passage when the highlighter is active.
 */

const toggleBtn = document.getElementById('question-nav-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
toggleBtn.addEventListener('click', () => {
    // When the user opens the modal manually, it's just for navigation, not for review.
    reviewBtn.style.display = 'none';
    toggleModal(true);
});

closeModalBtn.addEventListener('click', () => toggleModal(false));
backdrop.addEventListener('click', () => toggleModal(false));
stimulusPaneContent.addEventListener('contextmenu', (event) => {
    if (isHighlighterActive) {
        event.preventDefault(); // This stops the menu from showing up.
    }
});

// The 'mouseup' listener for applying the highlight should remain unchanged.
stimulusPaneContent.addEventListener('mouseup', () => {
    if (!isHighlighterActive) return;
    const selection = window.getSelection();
    // Only highlight if the user has actually selected text
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        // Use a more robust method to avoid breaking existing nodes
        const span = document.createElement('span');
        span.className = 'highlight';
        
        // This is a safer way to wrap the selection
        try {
            range.surroundContents(span);
        } catch (e) {
            // Fallback for complex selections, though less common here
            console.warn("Could not wrap complex selection.", e);
        }
        
        // Clear the selection after highlighting
        selection.removeAllRanges(); 
    }
});
    // In js/test-engine.js, REPLACE the existing nextBtn listener

nextBtn.addEventListener('click', () => {
    const currentModuleQuestions = allQuestionsByModule[currentModuleIndex];
    if (currentQuestionIndex < currentModuleQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuestion(currentQuestionIndex);
    } else {
        // We've reached the end of the module.
        showReviewScreen(true); // Pass `true` to show the "Continue" button
    }
});
    
    backBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion(currentQuestionIndex);
        }
    });


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
    highlighterBtn.classList.toggle('active', isHighlighterActive);
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