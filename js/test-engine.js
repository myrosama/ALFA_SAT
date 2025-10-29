// js/test-engine.js - FINAL CORRECTION FOR FUNCTION ORDER & CALCULATOR

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
    let isCalculatorVisible = false;
    let calculatorInitialized = false;

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
    const reviewBtn = modal ? modal.querySelector('.modal-footer button') : null; // Added check for modal
    const testMain = document.querySelector('.test-main');
    const calculatorContainer = document.getElementById('calculator-container');
    const closeCalculatorBtn = document.getElementById('close-calculator-btn');


    // --- Core Functions ---

    /**
     * Fetches questions for the given test ID and groups them by module.
     * @param {string} id - The Firestore document ID of the test.
     */
    async function fetchAndGroupQuestions(id) {
        try {
            console.log(`Fetching questions for test ID: ${id}`);
            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            console.log(`Fetched ${questionsSnapshot.size} questions.`);

            // Clear existing questions before fetching
            allQuestionsByModule = [[], [], [], []];

            if (questionsSnapshot.empty) {
                console.warn("No questions found for this test in Firestore.");
                // Optionally display a message to the user
                if(questionPaneContent) questionPaneContent.innerHTML = "<p>No questions available for this test.</p>";
                 if(stimulusPaneContent) stimulusPaneContent.innerHTML = ""; // Clear stimulus pane too
                // Disable navigation?
                 if(nextBtn) nextBtn.disabled = true;
                 if(backBtn) backBtn.disabled = true;

                return; // Stop further processing if no questions
            }

            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                 // Basic validation: Check if module number is valid
                if (question.module >= 1 && question.module <= 4) {
                    // Subtract 1 to get the correct 0-based index
                    allQuestionsByModule[question.module - 1].push(question);
                } else {
                    console.warn(`Question ${doc.id} has invalid module number: ${question.module}`);
                }
            });

            // Sort questions within each module by questionNumber
            allQuestionsByModule.forEach((module, index) => {
                module.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
                 console.log(`Module ${index + 1} sorted with ${module.length} questions.`);
            });

        } catch (error) {
            console.error("Error fetching or grouping questions: ", error);
             // Display error to user
             if(questionPaneContent) questionPaneContent.innerHTML = "<p>Error loading questions. Please try again later.</p>";
             if(stimulusPaneContent) stimulusPaneContent.innerHTML = "";
        }
    }

     /**
      * Starts a specific module: sets indices, populates UI, renders first question, starts timer.
      * @param {number} moduleIndex - 0-based index of the module to start.
      */
     function startModule(moduleIndex) {
         console.log(`Starting module with index: ${moduleIndex}`);
         currentModuleIndex = moduleIndex;
         currentQuestionIndex = 0; // Reset question index for the new module

         // Close calculator if open when starting any module
         if (isCalculatorVisible) {
             toggleCalculator(false);
         }

         const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];
          console.log(`Module ${moduleIndex + 1} has ${currentModuleQuestions.length} questions.`);

         // Handle cases where a module might be empty or missing
         if (currentModuleQuestions.length === 0) {
              console.warn(`Module ${moduleIndex + 1} is empty or not loaded.`);
              // Decide how to proceed: skip to next, show error, finish test?
             if (currentModuleIndex < 3) { // If not the last module
                  console.log("Attempting to skip to the next module.");
                  // IMPORTANT: Avoid infinite loop if all remaining are empty
                  // Add a check or limit recursion depth if necessary
                  startModule(currentModuleIndex + 1); // Try starting the next one
             } else {
                  console.log("Last module is empty, finishing test.");
                 finishTest(); // No more modules left
             }
             return; // Stop execution for this empty module
         }


         // Update layout class based on the *starting* module
         const isMathModuleStart = moduleIndex >= 2;
         if(testMain) testMain.classList.toggle('math-layout-active', isMathModuleStart);

         // Populate UI elements for the new module
         populateModalGrid(); // Populate modal based on the *new* currentModuleIndex
         renderQuestion(currentQuestionIndex); // Render the *first* question of the new module
         startTimer(moduleTimers[currentModuleIndex]); // Start the timer for *this* module
     }

     // +++ PUT ALL OTHER FUNCTION DEFINITIONS HERE +++
     // renderAllMath, renderQuestion, renderOptions, updateUI,
     // populateModalGrid, updateModalGridHighlights, startTimer,
     // calculateScore, showReviewScreen, finishTest, toggleModal, toggleCalculator
     // ... (All function definitions from the previous correct snippet go here) ...
      // --- Helper Functions ---

    /**
     * Renders all MathQuill static math blocks on the page.
     * Call this after inserting HTML containing .ql-formula spans.
     */
    function renderAllMath() {
        const formulaSpans = document.querySelectorAll('.ql-formula');
        formulaSpans.forEach(span => {
            const latex = span.dataset.value;
            if (latex) {
                try {
                    MQ.StaticMath(span).latex(latex);
                } catch (e) {
                    console.error("MathQuill rendering error:", e, "for LaTeX:", latex);
                    span.textContent = `[Math Error]`; // Show a simpler error
                }
            }
        });
    }

    /**
     * Renders the question UI based on the provided index for the current module.
     * Handles layout switching (R&W vs Math), content population, and state restoration.
     * @param {number} index - The index of the question within the current module's array.
     */
    function renderQuestion(index) {
        if (!allQuestionsByModule[currentModuleIndex] || !allQuestionsByModule[currentModuleIndex][index]) {
            console.error(`Attempted to render invalid question: Module ${currentModuleIndex}, Index ${index}`);
            // Provide feedback or handle gracefully
             if(questionPaneContent) questionPaneContent.innerHTML = "<p>Could not load this question.</p>";
            return;
        }
        const question = allQuestionsByModule[currentModuleIndex][index];
         console.log(`Rendering question: Module ${question.module}, Number ${question.questionNumber}, Index ${index}`);


        const isMath = question.module > 2;

        // --- References (assuming these elements exist in test.html) ---
        // const mainWrapper = document.querySelector('.test-main'); // Already have testMain
        const stimulusPane = document.querySelector('.stimulus-pane');
        const mathHeader = document.getElementById('math-question-header');
        const rwHeader = document.getElementById('rw-question-header');

        // --- Layout & Visibility Logic ---
        if(testMain) testMain.classList.toggle('math-layout-active', isMath);

        // Close calculator if switching from Math to R&W
        if (!isMath && isCalculatorVisible) {
            toggleCalculator(false);
        }

        // Show/Hide correct header
        if (mathHeader) mathHeader.classList.toggle('hidden', !isMath);
        if (rwHeader) rwHeader.classList.toggle('hidden', isMath);

        // Determine active header and populate
        const activeHeader = isMath ? mathHeader : rwHeader;
        if (activeHeader) {
            const qNumberDisplay = activeHeader.querySelector('.q-number-display');
            const markReviewCheckbox = activeHeader.querySelector('.mark-review-checkbox');
            if (qNumberDisplay) qNumberDisplay.textContent = question.questionNumber || (index + 1); // Fallback to index
            // Ensure checkbox exists before setting property
            if (markReviewCheckbox) {
                 markReviewCheckbox.checked = !!markedQuestions[question.id];
                 // Associate checkbox with question ID for listener
                 markReviewCheckbox.dataset.questionId = question.id;
            }

        } else {
             console.warn("Could not find active question header bar for rendering.");
        }


        // Stimulus Pane visibility and content
        const isStimulusEmpty = (!question.passage || question.passage.trim() === '' || question.passage === '<p><br></p>') && !question.imageUrl;
        if (stimulusPane) stimulusPane.classList.toggle('is-empty', isStimulusEmpty);

        if (stimulusPaneContent) {
            const imagePosition = question.imagePosition || 'above';
            const imageHTML = question.imageUrl ? `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'};">` : '';
            const passageHTML = question.passage || '';
             stimulusPaneContent.innerHTML = (imagePosition === 'below') ? (passageHTML + imageHTML) : (imageHTML + passageHTML);
        } else {
            console.warn("Stimulus pane content area not found.");
        }


        // Question Pane Content
        if (questionPaneContent) {
            questionPaneContent.innerHTML = `
                <div class="question-text">${question.prompt || ''}</div>
                <div class="question-options">${renderOptions(question)}</div>
            `;
        } else {
            console.error("Question pane content area not found! Cannot render question.");
            return; // Critical element missing
        }


        // Render Math equations AFTER innerHTML is set
        renderAllMath();

        // --- Restore State ---
        const savedAnswer = userAnswers[question.id];
        if (savedAnswer && question.format === 'mcq') {
            // Use more specific selector including the name attribute
            const radioBtn = questionPaneContent.querySelector(`input[type="radio"][name="${question.id}"][value="${savedAnswer}"]`);
            if (radioBtn) {
                 radioBtn.checked = true;
                  console.log(`Restored answer ${savedAnswer} for question ${question.id}`);
            } else {
                 console.warn(`Could not find radio button for saved answer ${savedAnswer} on question ${question.id}`);
            }
        }
         // Add restoration for fill-in if implemented later

        // Update other UI elements (timer is handled separately)
        updateUI(question);
    }

    /**
     * Generates the HTML string for question options based on format.
     * @param {object} question - The question data object.
     * @returns {string} HTML string for the options.
     */
    function renderOptions(question) {
        if (!question || !question.id) return '<p>Invalid question data.</p>'; // Basic validation

        if (question.format === 'mcq') {
            // Ensure options object exists
            const options = question.options || {};
            return ['A', 'B', 'C', 'D'].map(opt => {
                const optionText = options[opt] || ''; // Use empty string if option missing
                // Ensure unique name attribute for radio buttons per question
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
            // Placeholder for fill-in - needs implementation for saving/restoring value
             // Restore saved value if it exists
             const savedValue = userAnswers[question.id] || '';
            return `<div><input type="text" class="fill-in-input" data-question-id="${question.id}" placeholder="Type your answer here" value="${savedValue}"></div>`;
        }
        console.warn(`Unsupported question format: ${question.format} for question ${question.id}`);
        return '<p>Question format not supported.</p>';
    }

    /**
     * Updates static UI elements like titles, button states, etc.
     * @param {object} question - The currently displayed question object.
     */
    function updateUI(question) {
         if (!question) {
             console.warn("updateUI called with invalid question object.");
             // Potentially set default states or hide elements
             return;
         }

        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];
        const isMathModule = question.module > 2;
         const totalQuestionsInModule = currentModuleQuestions.length;
         const currentQuestionNumberInModule = currentQuestionIndex + 1; // 1-based index

        // Update Header Titles
        if (testTitleHeader) testTitleHeader.textContent = isMathModule ? 'Math' : 'Reading & Writing';
        if (moduleTitleHeader) {
            // Adjust module number display for Math (1 and 2 instead of 3 and 4)
            const moduleNumberDisplay = isMathModule ? question.module - 2 : question.module;
            moduleTitleHeader.textContent = `Module ${moduleNumberDisplay}`;
        }

        // Update Footer Navigation Text
        if (questionNavBtnText) {
             if (totalQuestionsInModule > 0) {
                 questionNavBtnText.textContent = `Question ${currentQuestionNumberInModule} of ${totalQuestionsInModule}`;
             } else {
                 questionNavBtnText.textContent = "No Questions"; // Handle empty module case
             }
        }


        // Update Next/Back Button States
        if (backBtn) backBtn.disabled = currentQuestionIndex === 0;
        if (nextBtn) {
             nextBtn.disabled = totalQuestionsInModule === 0; // Disable if module is empty
             nextBtn.textContent = (currentQuestionIndex === totalQuestionsInModule - 1) ? 'Finish Module' : 'Next';
        }


        // Calculator Button visibility
        if (calculatorBtn) {
            calculatorBtn.style.display = isMathModule ? 'inline-block' : 'none';
             // Also ensure it's not active if not math
             if (!isMathModule) calculatorBtn.classList.remove('active');
        }


        // Ensure layout class is correct
        if (testMain) {
             testMain.classList.toggle('math-layout-active', isMathModule);
        }


        updateModalGridHighlights(); // Update modal highlights whenever UI changes
    }

    /**
     * Populates the question navigator modal grid with buttons for the current module.
     */
    function populateModalGrid() {
        if (!modalGrid) {
             console.warn("Modal grid element not found.");
             return;
        }

        modalGrid.innerHTML = ''; // Clear previous buttons
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];

        if (currentModuleQuestions.length === 0) {
             modalGrid.innerHTML = '<p>No questions in this module.</p>';
             return;
        }


        currentModuleQuestions.forEach((q, index) => {
            const qBtn = document.createElement('div');
            qBtn.classList.add('q-number');
            // Use actual question number if available, fall back to index+1
            qBtn.textContent = q.questionNumber || (index + 1);
            qBtn.dataset.index = index; // Store index for easy navigation
            qBtn.addEventListener('click', () => {
                currentQuestionIndex = index;
                renderQuestion(index);
                toggleModal(false); // Close modal after selection
            });
            modalGrid.appendChild(qBtn);
        });
        updateModalGridHighlights(); // Apply initial highlights
    }

    /**
     * Updates the visual state (current, answered, reviewed) of buttons in the modal grid.
     */
    function updateModalGridHighlights() {
         if (!modalGrid) return;
        const qBtns = modalGrid.querySelectorAll('.q-number');
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];

        qBtns.forEach((btn) => {
             const index = parseInt(btn.dataset.index, 10);
             // Validate index and existence of question data
             if (isNaN(index) || index < 0 || index >= currentModuleQuestions.length || !currentModuleQuestions[index]) {
                  console.warn(`Invalid index (${index}) or missing question data found in modal grid update.`);
                  btn.style.opacity = '0.5'; // Visually indicate an issue
                  return;
             }


            const questionId = currentModuleQuestions[index].id;
             if (!questionId) {
                  console.warn(`Question at index ${index} missing ID.`);
                  return; // Cannot apply state without ID
             }


            // Remove all state classes first
            btn.classList.remove('current', 'answered', 'reviewed');

            // Apply classes based on current state
            if (userAnswers[questionId]) btn.classList.add('answered');
            if (markedQuestions[questionId]) btn.classList.add('reviewed');
            if (index === currentQuestionIndex) btn.classList.add('current');
        });
    }


    /**
     * Starts or restarts the timer for the current module.
     * @param {number} duration - Time in seconds.
     */
    function startTimer(duration) {
        // Validate duration
         if (typeof duration !== 'number' || duration <= 0) {
            console.error(`Invalid timer duration received: ${duration}. Cannot start timer.`);
             if (timerDisplay) timerDisplay.textContent = "00:00";
             // Maybe disable next button or show error?
            return;
        }

        let timer = duration;
        clearInterval(timerInterval); // Clear any existing timer

        if (!timerDisplay) {
             console.warn("Timer display element not found.");
             return; // Cannot display timer
        }
         console.log(`Starting timer for ${duration} seconds.`);

        timerInterval = setInterval(() => {
            let minutes = parseInt(timer / 60, 10);
            let seconds = parseInt(timer % 60, 10);

            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;

            timerDisplay.textContent = minutes + ":" + seconds;

            if (--timer < 0) {
                clearInterval(timerInterval);
                console.log("Timer finished for module", currentModuleIndex + 1);
                // Using a simple alert for now, replace with a better UI later
                // Avoid alert if possible in final version
                alert("Time's up for this module!");
                // Automatically proceed or show review screen
                showReviewScreen(true); // Treat as end of module
            }
        }, 1000);
    }

    /**
     * Calculates the raw score (correct answers / total questions).
     * NOTE: This is a placeholder; actual SAT scoring is more complex.
     * @returns {object} Object containing correct count, total count, and a placeholder scaled score.
     */
    function calculateScore() {
        let correctAnswers = 0;
        const allQuestionsFlat = allQuestionsByModule.flat(); // Combine questions from all modules
        const totalQuestions = allQuestionsFlat.length;

        console.log(`Calculating score based on ${totalQuestions} total questions.`);

        if (totalQuestions === 0) {
             console.warn("No questions loaded to calculate score.");
             return { correct: 0, total: 0, score: 0 };
        }


        allQuestionsFlat.forEach(question => {
             if (!question || !question.id) return; // Skip invalid question data
            // Check if user answer matches the correct answer
            if (userAnswers[question.id] === question.correctAnswer) {
                correctAnswers++;
            }
        });

        // Placeholder scaling - REPLACE with actual SAT scaling logic if needed
        const rawScore = (correctAnswers / totalQuestions);
        // Simple scaling, not accurate SAT score
        const scaledScore = Math.round(rawScore * 800) * 2; // e.g., map to 200-1600 roughly

         console.log(`Score calculated: ${correctAnswers}/${totalQuestions}, Scaled (placeholder): ${scaledScore}`);
        return { correct: correctAnswers, total: totalQuestions, score: scaledScore };
    }

    /**
     * Shows the review screen (currently implemented via the navigator modal).
     * Stops the timer and configures the modal's proceed button.
     * @param {boolean} isEndOfModule - Determines the text/action of the proceed button.
     */
    function showReviewScreen(isEndOfModule = false) { // Default to false if not provided
        console.log(`Showing review screen. Is end of module: ${isEndOfModule}`);
        clearInterval(timerInterval);
        if (timerDisplay) timerDisplay.textContent = "00:00"; // Stop display at zero

        if (reviewBtn) {
            // Determine button text based on whether it's the last module
            const isLastModule = currentModuleIndex >= allQuestionsByModule.length - 1;
            reviewBtn.textContent = isLastModule ? `Finish Test and See Results` : `Continue to Next Module`;
             // Show the button *only* if this function was called because it's the end of the module
             reviewBtn.style.display = isEndOfModule ? 'block' : 'none';
        } else {
             console.warn("Review button not found in modal footer.");
        }


        toggleModal(true); // Open the modal to show the grid
    }

    /**
     * Finalizes the test, calculates the score, and redirects the user.
     */
    function finishTest() {
        console.log("Finishing test.");
        clearInterval(timerInterval); // Ensure timer is stopped
        const finalResult = calculateScore();

        // **IMPORTANT**: Replace alert with a proper results page or UI update
        // Storing results in sessionStorage/localStorage could be an option before redirecting
        sessionStorage.setItem('lastTestResult', JSON.stringify(finalResult));
        sessionStorage.setItem('lastTestId', testId);

        alert(`Test Complete!\n\nCorrect Answers: ${finalResult.correct} / ${finalResult.total}\nEstimated Score (Placeholder): ${finalResult.score}`);

        // Redirect to dashboard (or a dedicated results page)
        window.location.href = 'dashboard.html';
    }

    /**
     * Toggles the visibility of the question navigator modal and backdrop.
     * @param {boolean} show - Explicitly show or hide the modal.
     */
    function toggleModal(show) {
         // Ensure modal and backdrop exist
        if (!modal || !backdrop) {
             console.warn("Modal or backdrop element not found. Cannot toggle modal.");
             return;
        }

        // Force boolean context
        const shouldShow = typeof show === 'boolean' ? show : !modal.classList.contains('visible');

        console.log(shouldShow ? "Opening modal." : "Closing modal.");

        if (shouldShow) {
            // Update modal header dynamically
            const modalHeader = modal.querySelector('.modal-header h4');
            if (modalHeader) {
                const moduleType = currentModuleIndex < 2 ? "Reading and Writing" : "Math";
                // Adjust module number display for Math (1 and 2 instead of 3 and 4)
                const moduleNumberDisplay = currentModuleIndex < 2 ? currentModuleIndex + 1 : currentModuleIndex - 1;
                modalHeader.textContent = `Section ${currentModuleIndex + 1}, Module ${moduleNumberDisplay}: ${moduleType} Questions`;
            } else {
                 console.warn("Modal header title element not found.");
            }
             updateModalGridHighlights(); // Ensure highlights are correct when opening
        }
        modal.classList.toggle('visible', shouldShow);
        backdrop.classList.toggle('visible', shouldShow);
         // Toggle chevron on nav button
         const navBtn = document.getElementById('question-nav-btn');
         if(navBtn) navBtn.classList.toggle('open', shouldShow);
    }

    // +++ Calculator Toggle Function +++
    function toggleCalculator(show) {
        if (!testMain || !calculatorContainer || !calculatorBtn) {
             console.warn("Cannot toggle calculator, missing required elements.");
             return;
        }


        // Determine state or use forced state
        isCalculatorVisible = typeof show === 'boolean' ? show : !isCalculatorVisible;
         console.log(isCalculatorVisible ? "Showing calculator." : "Hiding calculator.");

        testMain.classList.toggle('calculator-active', isCalculatorVisible);
        calculatorBtn.classList.toggle('active', isCalculatorVisible);

        // Lazy load the iframe content only if showing and not already loaded
        if (isCalculatorVisible && !calculatorInitialized) {
             console.log("Initializing Desmos iframe.");
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.desmos.com/calculator';
            iframe.title = "Desmos Scientific Calculator"; // Accessibility

            // Ensure only one iframe exists - clear first (excluding close btn)
            let existingIframe = calculatorContainer.querySelector('iframe');
            if(existingIframe) {
                calculatorContainer.removeChild(existingIframe);
            }

            // Append iframe - place it before the close button if possible
            if(closeCalculatorBtn && closeCalculatorBtn.parentNode === calculatorContainer) {
                 calculatorContainer.insertBefore(iframe, closeCalculatorBtn);
            } else {
                 calculatorContainer.appendChild(iframe); // Append at end if close btn isn't there
            }


            calculatorInitialized = true;
        }
    }


    /**
     * Main initialization function for the test page.
     * Fetches test ID, loads questions, and starts the first module.
     */
    async function initTest() {
        console.log("Initializing test...");
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');

        if (!testId) {
            console.error("No Test ID found in URL.");
            document.body.innerHTML = '<h1>Error: No Test ID provided in URL.</h1><p>Please go back and select a test.</p>';
            return; // Stop execution
        }

        console.log(`Test ID found: ${testId}`);

        // Fetch questions first
        await fetchAndGroupQuestions(testId);

        // Check if questions actually loaded before starting
        if (allQuestionsByModule.flat().length > 0) {
             console.log("Questions loaded, starting module 0.");
             startModule(0); // Start with the first module (index 0)
        } else {
             console.error("Failed to load any questions, cannot start the test.");
             // Keep the error message displayed by fetchAndGroupQuestions
             // Or display a more specific "Test cannot start" message here.
             if(questionPaneContent) questionPaneContent.innerHTML = "<p>Could not load questions for this test. Please contact support.</p>";

        }
    }


    // --- Event Listeners ---
    // (Ensure all listeners are attached *after* function definitions)

     // Modal Toggle Buttons
     const toggleBtn = document.getElementById('question-nav-btn');
     const closeModalBtn = document.getElementById('close-modal-btn'); // Already declared near top


     if (toggleBtn) {
         toggleBtn.addEventListener('click', () => {
             if (reviewBtn) reviewBtn.style.display = 'none'; // Hide review button when opening manually
             toggleModal(true);
         });
     } else { console.warn("Question Nav Toggle Button not found."); }


      if (closeModalBtn) {
           closeModalBtn.addEventListener('click', () => toggleModal(false));
      } else { console.warn("Modal Close Button not found."); }


      if (backdrop) {
           backdrop.addEventListener('click', () => toggleModal(false)); // Close on backdrop click
      } else { console.warn("Modal Backdrop not found."); }



    // Next/Back Buttons
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];
            if (currentQuestionIndex < currentModuleQuestions.length - 1) {
                 console.log("Next button clicked - moving to next question.");
                currentQuestionIndex++;
                renderQuestion(currentQuestionIndex);
            } else {
                 console.log("Next button clicked - end of module, showing review.");
                showReviewScreen(true); // Show review at the end of the module
            }
        });
    } else { console.warn("Next Button not found."); }


    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentQuestionIndex > 0) {
                 console.log("Back button clicked - moving to previous question.");
                currentQuestionIndex--;
                renderQuestion(currentQuestionIndex);
            } else {
                 console.log("Back button clicked - already at first question.");
            }
        });
    } else { console.warn("Back Button not found."); }


    // Answer Selection & Marking for Review (Event delegation on questionPaneContent)
    if (questionPaneContent) {
        questionPaneContent.addEventListener('change', (event) => {
            // MCQ Answer Selection
            if (event.target.type === 'radio' && event.target.name) {
                const questionId = event.target.name;
                const answerValue = event.target.value;
                userAnswers[questionId] = answerValue;
                 console.log(`Answer selected for ${questionId}: ${answerValue}`);
                // If an option was stricken through, un-strike it upon selection
                const optionWrapper = event.target.closest('.option-wrapper');
                if (optionWrapper) {
                     optionWrapper.classList.remove('stricken-through');
                     event.target.disabled = false; // Re-enable if disabled
                }
                 updateModalGridHighlights(); // Update modal on answer change
            }
              // Fill-in Answer Input
             if (event.target.classList.contains('fill-in-input')) {
                 const questionId = event.target.dataset.questionId;
                 const answerValue = event.target.value.trim(); // Trim whitespace
                 if (questionId) {
                     userAnswers[questionId] = answerValue;
                     console.log(`Fill-in answer updated for ${questionId}: ${answerValue}`);
                     // Note: Modal might not show fill-in answers, just that it's answered.
                     updateModalGridHighlights();
                 }
             }
        });

        // Strikethrough Button Click
        questionPaneContent.addEventListener('click', (event) => {
            const strikethroughBtn = event.target.closest('.strikethrough-btn');
            if (strikethroughBtn) {
                 event.preventDefault(); // Prevent label click if button inside label
                 event.stopPropagation(); // Stop event from bubbling further

                const wrapper = strikethroughBtn.closest('.option-wrapper');
                const radio = wrapper ? wrapper.querySelector('input[type="radio"]') : null;
                if (wrapper && radio) {
                     const isStriking = !wrapper.classList.contains('stricken-through');
                      console.log(`${isStriking ? 'Striking' : 'Unstriking'} option ${radio.value}`);
                     wrapper.classList.toggle('stricken-through', isStriking);
                     radio.disabled = isStriking; // Disable radio when striking
                     if (isStriking && radio.checked) {
                          radio.checked = false; // Uncheck if striking through a selected answer
                          // Remove answer from state if unchecking
                          const questionId = radio.name;
                          if (userAnswers[questionId] === radio.value) {
                               delete userAnswers[questionId];
                                console.log(`Removed answer for ${questionId} due to strikethrough.`);
                                updateModalGridHighlights(); // Update modal state
                          }
                     }
                }
            }
        });
    } else { console.error("Question Pane Content area not found! Event listeners not attached."); }


      // Mark for Review Checkbox (Event delegation on body for reliability)
      document.body.addEventListener('change', (event) => {
           if (event.target.classList.contains('mark-review-checkbox')) {
               const questionId = event.target.dataset.questionId; // Get ID from data attribute
              if (!questionId) {
                   console.warn("Mark for review checkbox clicked, but no question ID found on element.");
                   return;
              }

              if (event.target.checked) {
                  markedQuestions[questionId] = true;
                   console.log(`Question ${questionId} marked for review.`);
              } else {
                  delete markedQuestions[questionId];
                   console.log(`Question ${questionId} unmarked for review.`);
              }
              updateModalGridHighlights(); // Update modal immediately
          }
      });


    // Review Button (in Modal)
    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
             console.log("Review button clicked.");
            toggleModal(false); // Close modal first

             // Check if there's a next module available
            const hasNextModule = currentModuleIndex < allQuestionsByModule.length - 1 && allQuestionsByModule[currentModuleIndex + 1]?.length > 0;

            if (hasNextModule) {
                 console.log("Proceeding to next module.");
                 // Find the next non-empty module index
                 let nextModuleIdx = currentModuleIndex + 1;
                 while(nextModuleIdx < allQuestionsByModule.length && (!allQuestionsByModule[nextModuleIdx] || allQuestionsByModule[nextModuleIdx].length === 0)) {
                    console.log(`Skipping empty module ${nextModuleIdx + 1}`);
                    nextModuleIdx++;
                 }

                 if (nextModuleIdx < allQuestionsByModule.length) {
                     startModule(nextModuleIdx); // Go to next available module
                 } else {
                     console.log("No more non-empty modules found, finishing test.");
                     finishTest(); // No more valid modules left
                 }

            } else {
                 console.log("Last module reviewed, finishing test.");
                finishTest(); // Finish test after last module review
            }
        });
    } else { console.warn("Review Button (in modal footer) not found."); }


    // Highlighter Button
    if (highlighterBtn) {
        highlighterBtn.addEventListener('click', () => {
            isHighlighterActive = !isHighlighterActive;
            console.log(`Highlighter ${isHighlighterActive ? 'activated' : 'deactivated'}.`);
            document.body.classList.toggle('highlighter-active', isHighlighterActive);
            highlighterBtn.classList.toggle('active', isHighlighterActive);
        });
    } else { console.warn("Highlighter Button not found."); }


    // Disable context menu for highlighter
    document.body.addEventListener('contextmenu', (event) => {
        if (isHighlighterActive && event.target.closest('.main-content-body')) {
            event.preventDefault(); // Prevent default right-click menu only when highlighter is active in the content area
        }
    });

    // Highlighter Text Selection Logic
    document.body.addEventListener('mouseup', (event) => {
        // Only highlight if active and mouseup occurred within stimulus or question pane content
        const targetPane = event.target.closest('.stimulus-pane .pane-content') || event.target.closest('.question-pane .pane-content');
        if (!isHighlighterActive || !targetPane) return;

        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);

            // Basic check: Don't highlight if selection starts or ends outside the target pane
             if (!targetPane.contains(range.startContainer) || !targetPane.contains(range.endContainer)) {
                selection.removeAllRanges();
                 return;
             }

            // Avoid wrapping interactive elements or headers
             const ancestor = range.commonAncestorContainer;
             if (ancestor.nodeType !== Node.TEXT_NODE && (ancestor.closest('.question-header-bar, .option-letter, .strikethrough-btn, input, button, label'))) {
                 console.log("Highlighting aborted: selection contains interactive element.");
                 selection.removeAllRanges();
                 return;
             }


            const span = document.createElement('span');
            span.className = 'highlight';
            try {
                 // More robust check: See if the direct parent is already a highlight
                 let startParent = range.startContainer.parentNode;
                 let endParent = range.endContainer.parentNode;

                 // Simple unhighlight attempt (basic - might not work perfectly with complex selections)
                 if (startParent.classList && startParent.classList.contains('highlight') && startParent === endParent) {
                      // If selection is fully within one highlight span, remove the span
                      let text = startParent.textContent;
                      startParent.parentNode.replaceChild(document.createTextNode(text), startParent);
                      console.log("Unhighlighted selection.");

                 } else if (startParent.closest && startParent.closest('.highlight') || endParent.closest && endParent.closest('.highlight')) {
                      // Avoid nested highlights or complex overlaps for now
                      console.log("Highlighting aborted: selection overlaps existing highlight.");
                 }
                 else {
                      range.surroundContents(span); // Wrap the selected text
                      console.log("Highlighted selection.");
                 }

            } catch (e) {
                console.warn("Could not wrap selection completely (might span across block elements). Highlighting might be partial.", e);
            }
            selection.removeAllRanges(); // Clear selection after attempting highlight/unhighlight
        }
    });

    // +++ Calculator Event Listeners +++
    if (calculatorBtn) {
        calculatorBtn.addEventListener('click', () => {
            const isMathModule = currentModuleIndex >= 2;
            if (isMathModule) { // Only allow opening on Math modules
                toggleCalculator();
            } else {
                 console.log("Calculator button clicked on non-math module - ignored.");
            }
        });
    } else { console.warn("Calculator Button not found."); }


    if (closeCalculatorBtn) {
        closeCalculatorBtn.addEventListener('click', () => {
            toggleCalculator(false); // Force close
        });
    } else {
         console.warn("Close Calculator Button not found during listener attachment."); // Log if still not found
    }

    // --- Initial Load ---
    // Moved initTest definition earlier, call it last.
    initTest();

}); // --- END OF DOMContentLoaded ---

