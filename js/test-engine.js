// js/test-engine.js - Fix Drag/Resize/Maximize Logic & Missing Vars

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
    const moduleTimers = [32 * 60, 32 * 60, 35 * 60, 35 * 60]; // Durations in seconds
    let isHighlighterActive = false;
    let isCalculatorVisible = false;
    let calculatorInitialized = false;
    // ++ Drag State ++
    let isDraggingCalc = false;
    let calcOffsetX = 0;
    let calcOffsetY = 0;
    // ++ Resize State ++
    let isResizingCalc = false;
    let calcResizeStartX = 0;
    let calcResizeStartY = 0;
    let calcResizeStartWidth = 0;
    let calcResizeStartHeight = 0;
    // ++ Maximize State ++
    let isCalculatorMaximized = false;
    // ++ Store current/last known non-maximized dimensions ++
    let currentCalcWidth = 360;
    let currentCalcHeight = 500;
    try {
        currentCalcWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-width')) || 360;
        currentCalcHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-height')) || 500;
    } catch (e) { console.warn("Could not read initial calc size from CSS vars."); }
    let currentCalcLeft = 10; // Initial position
    let currentCalcTop = 10; // Initial position


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
    const timerDisplay = document.getElementById('timer-display');
    const modal = document.getElementById('question-navigator-modal');
    const backdrop = document.getElementById('modal-backdrop');
    const modalProceedBtn = document.getElementById('modal-proceed-btn');
    const testMain = document.querySelector('.test-main');
    const calculatorContainer = document.getElementById('calculator-container');
    const closeCalculatorBtn = document.getElementById('close-calculator-btn');
    const calculatorHeader = document.getElementById('calculator-header');
    const calcResizeHandle = document.getElementById('calculator-resize-handle');
    const calcSizeToggleBtn = document.getElementById('calc-size-toggle-btn');
    const calcSizeToggleIcon = calcSizeToggleBtn ? calcSizeToggleBtn.querySelector('i') : null;
    const userNameDisp = document.getElementById('user-name-display');
    
    // +++ ADDED MISSING VARIABLE DEFINITIONS +++
    const toggleBtn = document.getElementById('question-nav-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');


    // --- Core Test Functions ---
    // (fetchAndGroupQuestions, startModule, renderAllMath, renderQuestion,
    // renderOptions, updateUI, populateModalGrid, updateModalGridHighlights,
    // startTimer, calculateScore, showReviewScreen, findNextNonEmptyModule,
    // finishTest, toggleModal)
    // --- [Start of Collapsed Core Functions] ---
    async function fetchAndGroupQuestions(id) {
        try {
            console.log(`Fetching questions for test ID: ${id}`);
            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            console.log(`Fetched ${questionsSnapshot.size} questions.`);
            allQuestionsByModule = [[], [], [], []]; // Clear existing

            if (questionsSnapshot.empty) {
                console.warn("No questions found for this test.");
                if(questionPaneContent) questionPaneContent.innerHTML = "<p>No questions available for this test.</p>";
                if(stimulusPaneContent) stimulusPaneContent.innerHTML = "";
                if(nextBtn) nextBtn.disabled = true; if(backBtn) backBtn.disabled = true; return;
            }
            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                if (question.module >= 1 && question.module <= 4) allQuestionsByModule[question.module - 1].push(question);
                else console.warn(`Question ${doc.id} has invalid module number: ${question.module}`);
            });
            allQuestionsByModule.forEach((module, index) => {
                module.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
                console.log(`Module ${index + 1} sorted with ${module.length} questions.`);
            });
        } catch (error) { console.error("Error fetching/grouping questions: ", error); if(questionPaneContent) questionPaneContent.innerHTML = "<p>Error loading questions.</p>"; if(stimulusPaneContent) stimulusPaneContent.innerHTML = ""; }
    }
     function startModule(moduleIndex) {
         currentModuleIndex = moduleIndex; currentQuestionIndex = 0;
         if (isCalculatorVisible) toggleCalculator(false);
         const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];
         if (currentModuleQuestions.length === 0) {
             const nextNonEmpty = findNextNonEmptyModule(moduleIndex + 1);
             if (nextNonEmpty !== -1) startModule(nextNonEmpty); else finishTest();
             return;
         }
         const isMathModuleStart = moduleIndex >= 2;
         if(testMain) testMain.classList.toggle('math-layout-active', isMathModuleStart);
         populateModalGrid(); renderQuestion(currentQuestionIndex);
         const timerDuration = moduleTimers[currentModuleIndex] > 0 ? moduleTimers[currentModuleIndex] : 1800;
         startTimer(timerDuration);
     }
    function renderAllMath() {
        try {
            document.querySelectorAll('.ql-formula').forEach(span => {
                const latex = span.dataset.value;
                if (latex && MQ && span) MQ.StaticMath(span).latex(latex);
                else if (latex && span) span.textContent = `[Math: ${latex}]`;
            });
        } catch (e) { console.error("renderAllMath error:", e); }
    }
    function renderQuestion(index) {
        if (!allQuestionsByModule[currentModuleIndex]?.[index]) {
            if (questionPaneContent) questionPaneContent.innerHTML = "<p>Error: Could not load question.</p>"; return;
        }
        const question = allQuestionsByModule[currentModuleIndex][index];
        const isMath = question.module > 2;
        const stimulusPane = document.querySelector('.stimulus-pane');
        const mathHeader = document.getElementById('math-question-header');
        const rwHeader = document.getElementById('rw-question-header');
        if(testMain) testMain.classList.toggle('math-layout-active', isMath);
        if (!isMath && isCalculatorVisible) toggleCalculator(false);
        if (mathHeader) mathHeader.classList.toggle('hidden', !isMath);
        if (rwHeader) rwHeader.classList.toggle('hidden', isMath);
        const activeHeader = isMath ? mathHeader : rwHeader;
        if (activeHeader) {
            const qNumDisp = activeHeader.querySelector('.q-number-display');
            const markCheck = activeHeader.querySelector('.mark-review-checkbox');
            if (qNumDisp) qNumDisp.textContent = question.questionNumber || (index + 1);
            if (markCheck) { markCheck.checked = !!markedQuestions[question.id]; markCheck.dataset.questionId = question.id; }
        }
        const isStimulusEmpty = (!question.passage || question.passage.trim() === '' || question.passage === '<p><br></p>') && !question.imageUrl;
        if (stimulusPane) stimulusPane.classList.toggle('is-empty', isStimulusEmpty);
        if (stimulusPaneContent) {
            const imgPos = question.imagePosition || 'above';
            const imgHTML = question.imageUrl ? `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'};">` : '';
            const passageHTML = question.passage || '';
            stimulusPaneContent.innerHTML = (imgPos === 'below') ? (passageHTML + imgHTML) : (imgHTML + passageHTML);
        }
        if (questionPaneContent) {
            questionPaneContent.innerHTML = `<div class="question-text">${question.prompt || ''}</div><div class="question-options">${renderOptions(question)}</div>`;
        } else { console.error("Question pane content missing!"); return; }
        renderAllMath();
        const savedAnswer = userAnswers[question.id];
        if (savedAnswer) {
            if (question.format === 'mcq') { const radio = questionPaneContent.querySelector(`input[type="radio"][name="${question.id}"][value="${savedAnswer}"]`); if (radio) radio.checked = true; }
            else if (question.format === 'fill-in') { const input = questionPaneContent.querySelector(`.fill-in-input[data-question-id="${question.id}"]`); if (input) input.value = savedAnswer; }
        }
        updateUI(question);
    }
    function renderOptions(question) {
        if (!question || !question.id) return '<p>Invalid data.</p>';
        if (question.format === 'mcq') {
            const options = question.options || {};
            return ['A', 'B', 'C', 'D'].map(opt => {
                const optText = options[opt] || '';
                return `<div class="option-wrapper"><label class="option"><input type="radio" name="${question.id}" value="${opt}"><span class="option-letter">${opt}</span><span class="option-text">${optText}</span></label><button class="strikethrough-btn" title="Eliminate choice"><i class="fa-solid fa-ban"></i></button></div>`;
            }).join('');
        }
        if (question.format === 'fill-in') { const savedVal = userAnswers[question.id] || ''; return `<div><input type="text" class="fill-in-input" data-question-id="${question.id}" placeholder="Type your answer here" value="${savedVal}"></div>`; }
        return '<p>Format not supported.</p>';
    }
    function updateUI(question) {
        if (!question) return;
        const currentModuleQs = allQuestionsByModule[currentModuleIndex] || [];
        const isMath = question.module > 2; const totalQs = currentModuleQs.length; const currentQNum = currentQuestionIndex + 1;
        if (testTitleHeader) testTitleHeader.textContent = isMath ? 'Math' : 'Reading & Writing';
        if (moduleTitleHeader) { const modNumDisp = isMath ? question.module - 2 : question.module; moduleTitleHeader.textContent = `Module ${modNumDisp}`; }
        if (questionNavBtnText) questionNavBtnText.textContent = totalQs > 0 ? `Question ${currentQNum} of ${totalQs}` : "No Questions";
        if (backBtn) backBtn.disabled = currentQuestionIndex === 0;
        if (nextBtn) { nextBtn.disabled = totalQs === 0; nextBtn.textContent = (currentQuestionIndex === totalQs - 1) ? 'Finish Module' : 'Next'; }
        if (calculatorBtn) { calculatorBtn.style.display = isMath ? 'inline-block' : 'none'; if (!isMath) calculatorBtn.classList.remove('active'); }
        if (testMain) testMain.classList.toggle('math-layout-active', isMath);
        updateModalGridHighlights();
    }
    function populateModalGrid() {
        if (!modalGrid) return; modalGrid.innerHTML = '';
        const currentModuleQs = allQuestionsByModule[currentModuleIndex] || [];
        if (currentModuleQs.length === 0) { modalGrid.innerHTML = '<p>No questions.</p>'; return; }
        currentModuleQs.forEach((q, index) => {
            const qBtn = document.createElement('div'); qBtn.className = 'q-number'; qBtn.textContent = q.questionNumber || (index + 1); qBtn.dataset.index = index;
            qBtn.addEventListener('click', () => { currentQuestionIndex = index; renderQuestion(index); toggleModal(false); });
            modalGrid.appendChild(qBtn);
        });
        updateModalGridHighlights();
    }
    function updateModalGridHighlights() {
        if (!modalGrid) return;
        const qBtns = modalGrid.querySelectorAll('.q-number');
        const currentModuleQs = allQuestionsByModule[currentModuleIndex] || [];
        qBtns.forEach((btn) => {
            const index = parseInt(btn.dataset.index, 10);
            if (isNaN(index) || !currentModuleQs[index]?.id) { btn.style.opacity = '0.5'; return; }
            const qId = currentModuleQs[index].id; btn.classList.remove('current', 'answered', 'reviewed');
            const hasAnswer = userAnswers[qId] !== undefined && userAnswers[qId] !== null && userAnswers[qId] !== '';
            if (hasAnswer) btn.classList.add('answered');
            if (markedQuestions[qId]) btn.classList.add('reviewed');
            if (index === currentQuestionIndex) btn.classList.add('current');
        });
    }
    function startTimer(duration) {
        if (typeof duration !== 'number' || duration <= 0) { if (timerDisplay) timerDisplay.textContent = "00:00"; return; }
        let timer = duration; clearInterval(timerInterval);
        if (!timerDisplay) return;
        timerInterval = setInterval(() => {
            let mins = Math.floor(timer / 60); let secs = timer % 60;
            timerDisplay.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
            if (--timer < 0) { clearInterval(timerInterval); alert("Time's up!"); showReviewScreen(true); }
        }, 1000);
    }
    function calculateScore() {
        let correct = 0; const flatQs = allQuestionsByModule.flat(); const total = flatQs.length;
        if (total === 0) return { correct: 0, total: 0, score: 0 };
        flatQs.forEach(q => { if (q?.id && userAnswers[q.id] === q.correctAnswer) { correct++; } });
        const scaled = Math.round((correct / total) * 800) * 2;
        return { correct, total, score: scaled };
    }
     function showReviewScreen(isEndOfModule = false) {
         clearInterval(timerInterval); if (timerDisplay) timerDisplay.textContent = "00:00";
         if (modalProceedBtn) {
             const nextNonEmpty = findNextNonEmptyModule(currentModuleIndex + 1);
             modalProceedBtn.textContent = (nextNonEmpty === -1) ? `Finish Test and See Results` : `Continue to Next Module`;
             modalProceedBtn.style.display = isEndOfModule ? 'inline-block' : 'none';
         }
         toggleModal(true);
     }
    function findNextNonEmptyModule(startIndex) {
        for (let i = startIndex; i < allQuestionsByModule.length; i++) { if (allQuestionsByModule[i]?.length > 0) return i; }
        return -1;
    }
    function finishTest() {
        clearInterval(timerInterval); const result = calculateScore();
        sessionStorage.setItem('lastTestResult', JSON.stringify(result));
        sessionStorage.setItem('lastTestId', testId);
        alert(`Test Complete! Correct: ${result.correct}/${result.total}, Score: ${result.score}`);
        window.location.href = 'dashboard.html';
    }
    function toggleModal(show) {
        if (!modal || !backdrop) return;
        const shouldShow = typeof show === 'boolean' ? show : !modal.classList.contains('visible');
        if (shouldShow) {
            const header = modal.querySelector('.modal-header h4');
            if (header) {
                const type = currentModuleIndex < 2 ? "Reading & Writing" : "Math";
                const numDisp = currentModuleIndex < 2 ? currentModuleIndex + 1 : currentModuleIndex - 1;
                header.textContent = `Section ${currentModuleIndex + 1}, Module ${numDisp}: ${type} Questions`;
            }
            updateModalGridHighlights();
        } else { if (modalProceedBtn) modalProceedBtn.style.display = 'none'; }
        modal.classList.toggle('visible', shouldShow);
        backdrop.classList.toggle('visible', shouldShow);
        const navBtn = document.getElementById('question-nav-btn');
        if(navBtn) navBtn.classList.toggle('open', shouldShow);
    }
    // --- [End of Collapsed Core Functions] ---


    // --- Calculator Specific Functions ---

    /** Toggles calculator visibility, loads iframe, updates content margin. */
    function toggleCalculator(show) {
        if (!testMain || !calculatorContainer || !calculatorBtn) { console.warn("Calculator elements missing."); return; }
        isCalculatorVisible = typeof show === 'boolean' ? show : !isCalculatorVisible;
        console.log(isCalculatorVisible ? "Showing calculator." : "Hiding calculator.");

        testMain.classList.toggle('calculator-active', isCalculatorVisible);
        calculatorBtn.classList.toggle('active', isCalculatorVisible);

        if (isCalculatorVisible) {
            // Restore non-maximized size/position before showing
            if (isCalculatorMaximized) {
                // Force restore state *before* making it visible if it was closed maximized
                // This prevents it flashing maximized then shrinking
                toggleMaximizeCalculator(false); // This applies styles and resets state
            } else {
                // Apply last known dimensions/position from state variables
                calculatorContainer.style.width = `${currentCalcWidth}px`;
                calculatorContainer.style.height = `${currentCalcHeight}px`;
                calculatorContainer.style.left = `${currentCalcLeft}px`;
                calculatorContainer.style.top = `${currentCalcTop}px`;
            }
             // Ensure correct transitions are set for show/hide
            calculatorContainer.style.transition = 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s';

            // Lazy load iframe
            if (!calculatorInitialized) {
                 console.log("Initializing Desmos iframe.");
                 const iframe = document.createElement('iframe');
                 iframe.src = 'https://www.desmos.com/calculator';
                 iframe.title = "Desmos Scientific Calculator";
                 let existingIframe = calculatorContainer.querySelector('iframe');
                 if(existingIframe) calculatorContainer.removeChild(existingIframe);
                 calculatorHeader?.insertAdjacentElement('afterend', iframe);
                 calculatorInitialized = true;
            }
            // Update content margin based on its *current* (non-maximized) width
            updateContentMargin();
        } else {
            // Store current position/size *before* hiding (only if not maximized)
            if (!isCalculatorMaximized) {
                 currentCalcLeft = calculatorContainer.offsetLeft;
                 currentCalcTop = calculatorContainer.offsetTop;
                 currentCalcWidth = calculatorContainer.offsetWidth; // Store size too
                 currentCalcHeight = calculatorContainer.offsetHeight;
            }
            updateContentMargin(); // Reset margin to 0
            // If closed while maximized, visually reset and update state
            if (isCalculatorMaximized) {
                 // Remove class immediately, let state update handle internal logic
                 calculatorContainer.classList.remove('maximized');
                 // Update icon/title
                 if(calcSizeToggleIcon) {
                    calcSizeToggleIcon.classList.remove('fa-compress');
                    calcSizeToggleIcon.classList.add('fa-expand');
                 }
                  if(calcSizeToggleBtn) calcSizeToggleBtn.title = "Maximize Calculator";
                 isCalculatorMaximized = false; // Reset state directly here when hiding
            }
        }
    }

    /** Updates the left margin of the main content based on calculator state. */
    function updateContentMargin() {
         // Only apply margin if calculator is visible AND *not* maximized
         // Use the container's *current actual* offsetWidth for accuracy during resize
         const marginSize = (isCalculatorVisible && !isCalculatorMaximized && calculatorContainer)
                            ? (calculatorContainer.offsetWidth + 20) : 0; // 20px gap
         document.documentElement.style.setProperty('--content-margin-left', `${marginSize}px`);
         console.log(`Set --content-margin-left to ${marginSize}px`);
    }


     /** Handles calculator dragging start. */
     function startDrag(e) {
         if (!e.target.closest('.calculator-header') || e.target.closest('.close-calculator-btn, .calc-size-toggle-btn') || isCalculatorMaximized || isResizingCalc) return;
         if (!calculatorContainer) return;
         isDraggingCalc = true;
         calculatorContainer.classList.add('dragging'); // Add class to disable iframe events
         const rect = calculatorContainer.getBoundingClientRect();
         calcOffsetX = e.clientX - rect.left;
         calcOffsetY = e.clientY - rect.top;
         calculatorContainer.style.cursor = 'grabbing';
         calculatorContainer.style.transition = 'none'; // Prevent animation lag during drag
         document.body.style.userSelect = 'none'; // Prevent text selection
         window.addEventListener('mousemove', dragMove);
         window.addEventListener('mouseup', stopDrag, { once: true });
         e.preventDefault();
          console.log("Started dragging calculator.");
     }

     /** Handles calculator dragging movement. */
     function dragMove(e) {
         if (!isDraggingCalc || !calculatorContainer) return; e.preventDefault();
         let newX = e.clientX - calcOffsetX; let newY = e.clientY - calcOffsetY;
         const mainBounds = testMain.getBoundingClientRect();
         const calcWidth = calculatorContainer.offsetWidth; const calcHeight = calculatorContainer.offsetHeight;
         // Constrain within the bounds of .test-main
         newX = Math.max(0, Math.min(newX, mainBounds.width - calcWidth));
         newY = Math.max(0, Math.min(newY, mainBounds.height - calcHeight));
         calculatorContainer.style.left = newX + 'px'; calculatorContainer.style.top = newY + 'px';
         // Store current position while dragging
          currentCalcLeft = newX;
          currentCalcTop = newY;
     }

     /** Handles calculator dragging end. */
     function stopDrag() {
          console.log("Stopping drag."); isDraggingCalc = false;
         if(calculatorContainer) {
             calculatorContainer.classList.remove('dragging'); // Re-enable iframe events
             calculatorContainer.style.cursor = 'move';
             calculatorContainer.style.transition = 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s'; // Restore only show/hide transition
         }
         document.body.style.userSelect = ''; // Re-allow text selection
         window.removeEventListener('mousemove', dragMove);
         // Final position is stored in currentCalcLeft, currentCalcTop
     }

    /** Handles calculator resizing start. */
    function startResize(e) {
         if (isCalculatorMaximized || isDraggingCalc) return;
        isResizingCalc = true;
        calculatorContainer.classList.add('resizing'); // Add class to disable iframe events
        calcResizeStartX = e.clientX; calcResizeStartY = e.clientY;
        calcResizeStartWidth = calculatorContainer.offsetWidth;
        calcResizeStartHeight = calculatorContainer.offsetHeight;
        calculatorContainer.style.transition = 'none';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', resizeMove);
        window.addEventListener('mouseup', stopResize, { once: true });
        e.preventDefault();
         console.log("Started resizing calculator.");
    }

    /** Handles calculator resizing movement. */
    function resizeMove(e) {
        if (!isResizingCalc) return; e.preventDefault();
        const minWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-min-width'));
        const minHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-min-height'));
        let newWidth = calcResizeStartWidth + (e.clientX - calcResizeStartX);
        let newHeight = calcResizeStartHeight + (e.clientY - calcResizeStartY);
        newWidth = Math.max(minWidth, newWidth);
        newHeight = Math.max(minHeight, newHeight);
        const mainBounds = testMain.getBoundingClientRect();
        const currentLeft = calculatorContainer.offsetLeft; const currentTop = calculatorContainer.offsetTop;
        newWidth = Math.min(newWidth, mainBounds.width - currentLeft);
        newHeight = Math.min(newHeight, mainBounds.height - currentTop);

        // Update element style directly for immediate feedback during resize
        calculatorContainer.style.width = `${newWidth}px`;
        calculatorContainer.style.height = `${newHeight}px`;

        // Update state variables (used on stopResize and restore)
        currentCalcWidth = newWidth;
        currentCalcHeight = newHeight;

        updateContentMargin(); // Update margin dynamically during resize
    }

    /** Handles calculator resizing end. */
    function stopResize() {
         console.log("Stopping resize."); isResizingCalc = false;
         if(calculatorContainer) {
             calculatorContainer.classList.remove('resizing'); // Re-enable iframe events
             calculatorContainer.style.transition = 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s';
         }
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', resizeMove);
        // Final dimensions are stored in currentCalcWidth/Height
         document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
         document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
    }

    /** Toggles the calculator between maximized and normal state. */
    function toggleMaximizeCalculator(forceState) {
         if (!calculatorContainer || !calcSizeToggleIcon || isDraggingCalc || isResizingCalc) return;
         const newState = typeof forceState === 'boolean' ? forceState : !isCalculatorMaximized;

         if (newState === isCalculatorMaximized) return; // No change needed

         console.log(`Toggling maximize. New state: ${newState}`);

         // Disable transitions temporarily during manual style changes if restoring
         const originalTransition = calculatorContainer.style.transition;
         calculatorContainer.style.transition = 'none'; // Disable transitions

         if (newState) {
             // --- Maximizing ---
             // Store current size/pos *before* maximizing
             currentCalcWidth = calculatorContainer.offsetWidth;
             currentCalcHeight = calculatorContainer.offsetHeight;
             currentCalcLeft = calculatorContainer.offsetLeft;
             currentCalcTop = calculatorContainer.offsetTop;

             // Add class. CSS handles the position/size change.
             calculatorContainer.classList.add('maximized');

         } else {
             // --- Restoring ---
             // Remove class.
             calculatorContainer.classList.remove('maximized');

             // Restore *last known* non-maximized size/position immediately
             calculatorContainer.style.width = `${currentCalcWidth}px`;
             calculatorContainer.style.height = `${currentCalcHeight}px`;
             calculatorContainer.style.left = `${currentCalcLeft}px`;
             calculatorContainer.style.top = `${currentCalcTop}px`;

             // Update CSS vars to match
             document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
             document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
         }

         // Use requestAnimationFrame to ensure the class/style changes are applied
         // before re-enabling transitions and updating state/UI
         requestAnimationFrame(() => {
             // Re-enable transitions *after* initial style changes for restore, or after adding class for maximize
             // For maximize, the CSS handles the transition. For restore, we allow show/hide transition.
              calculatorContainer.style.transition = originalTransition || 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out, visibility 0.2s'; // Restore or set default

             // Update internal state
             isCalculatorMaximized = newState;

             // Update icon and title
             calcSizeToggleIcon.classList.toggle('fa-expand', !isCalculatorMaximized);
             calcSizeToggleIcon.classList.toggle('fa-compress', isCalculatorMaximized);
             if(calcSizeToggleBtn) calcSizeToggleBtn.title = isCalculatorMaximized ? "Restore Calculator Size" : "Maximize Calculator";

             // Update content margin (will be 0 if maximized, restored if not)
             updateContentMargin();
         });
    }


    /** Main initialization function. */
    async function initTest() {
        console.log("Init test...");
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');
        if (!testId) { console.error("No Test ID in URL."); document.body.innerHTML = '<h1>Error: No Test ID.</h1>'; return; }
        if (userNameDisp) { try {const user = firebase.auth().currentUser; userNameDisp.textContent = user?.displayName || 'Student';} catch(e){} }
        else { console.warn("User name display element not found."); }

        await fetchAndGroupQuestions(testId);
        if (allQuestionsByModule.flat().length > 0) { console.log("Starting module 0."); startModule(0); }
        else { console.error("No questions loaded."); if(questionPaneContent) questionPaneContent.innerHTML = "<p>Could not load questions.</p>"; }

         // Set initial content margin
         updateContentMargin();
         // Set initial calculator size/pos via CSS vars *and* element style
          document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
          document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
          if(calculatorContainer) {
              calculatorContainer.style.width = `${currentCalcWidth}px`;
              calculatorContainer.style.height = `${currentCalcHeight}px`;
              calculatorContainer.style.left = `${currentCalcLeft}px`;
              calculatorContainer.style.top = `${currentCalcTop}px`;
          }
    }


    // --- Event Listeners ---

    // Modal Toggles, Next/Back, Answers, Mark Review, Modal Proceed Button
    if (toggleBtn) { toggleBtn.addEventListener('click', () => { if (modalProceedBtn) modalProceedBtn.style.display = 'none'; toggleModal(true); }); } else { console.warn("Nav Toggle Button missing."); }
    if (closeModalBtn) { closeModalBtn.addEventListener('click', () => toggleModal(false)); } else { console.warn("Modal Close Button missing."); }
    if (backdrop) { backdrop.addEventListener('click', () => toggleModal(false)); } else { console.warn("Modal Backdrop missing."); }
    if (nextBtn) { nextBtn.addEventListener('click', () => { const currentQs = allQuestionsByModule[currentModuleIndex] || []; if (currentQuestionIndex < currentQs.length - 1) { currentQuestionIndex++; renderQuestion(currentQuestionIndex); } else { showReviewScreen(true); } }); } else { console.warn("Next Button missing."); }
    if (backBtn) { backBtn.addEventListener('click', () => { if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(currentQuestionIndex); } }); } else { console.warn("Back Button missing."); }
    if (questionPaneContent) {
        questionPaneContent.addEventListener('change', (e) => { // Answers
            if (e.target.type === 'radio' && e.target.name) { userAnswers[e.target.name] = e.target.value; const wrapper = e.target.closest('.option-wrapper'); if (wrapper) { wrapper.classList.remove('stricken-through'); e.target.disabled = false; } updateModalGridHighlights(); }
            if (e.target.classList.contains('fill-in-input')) { const qId = e.target.dataset.questionId; if (qId) { userAnswers[qId] = e.target.value.trim(); updateModalGridHighlights(); } }
        });
        questionPaneContent.addEventListener('click', (e) => { // Strikethrough
            const strikeBtn = e.target.closest('.strikethrough-btn'); if (!strikeBtn) return; e.preventDefault(); e.stopPropagation(); const wrapper = strikeBtn.closest('.option-wrapper'); const radio = wrapper?.querySelector('input[type="radio"]'); if (!wrapper || !radio) return; const isStriking = !wrapper.classList.contains('stricken-through'); wrapper.classList.toggle('stricken-through', isStriking); radio.disabled = isStriking; if (isStriking && radio.checked) { radio.checked = false; const qId = radio.name; if (userAnswers[qId] === radio.value) { delete userAnswers[qId]; updateModalGridHighlights(); } }
        });
    } else { console.error("Question Pane Content missing!"); }
    document.body.addEventListener('change', (e) => { // Mark Review
        if (!e.target.classList.contains('mark-review-checkbox')) return; const qId = e.target.dataset.questionId; if (!qId) { console.warn("Mark review checkbox missing question ID."); return; } if (e.target.checked) markedQuestions[qId] = true; else delete markedQuestions[qId]; updateModalGridHighlights();
    });
    if (modalProceedBtn) {
        modalProceedBtn.addEventListener('click', () => { console.log("Modal Proceed clicked."); toggleModal(false); const nextIdx = findNextNonEmptyModule(currentModuleIndex + 1); if (nextIdx !== -1) startModule(nextIdx); else finishTest(); });
    } else { console.warn("Modal Proceed Button missing."); }

    // Highlighter
    if (highlighterBtn) { highlighterBtn.addEventListener('click', () => { isHighlighterActive = !isHighlighterActive; document.body.classList.toggle('highlighter-active', isHighlighterActive); highlighterBtn.classList.toggle('active', isHighlighterActive); }); } else { console.warn("Highlighter Button missing."); }
    document.body.addEventListener('contextmenu', (e) => { if (isHighlighterActive && e.target.closest('.main-content-body')) e.preventDefault(); });
    document.body.addEventListener('mouseup', (e) => { // Highlight selection logic
        const targetPane = e.target.closest('.stimulus-pane .pane-content') || e.target.closest('.question-pane .pane-content'); if (!isHighlighterActive || !targetPane) return; const sel = window.getSelection(); if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return; const range = sel.getRangeAt(0); if (!targetPane.contains(range.startContainer) || !targetPane.contains(range.endContainer)) { sel.removeAllRanges(); return; } const ancestor = range.commonAncestorContainer; if (ancestor.nodeType !== Node.TEXT_NODE && (ancestor.closest('.question-header-bar,.option-letter,.strikethrough-btn,input,button,label'))) { sel.removeAllRanges(); return; } const span = document.createElement('span'); span.className = 'highlight'; try { let startP = range.startContainer.parentNode; let endP = range.endContainer.parentNode; if (startP.classList?.contains('highlight') && startP === endP) { let text = startP.textContent; startP.parentNode.replaceChild(document.createTextNode(text), startP); } else if (startP.closest?.('.highlight') || endP.closest?.('.highlight')) { /* Avoid overlap */ } else { range.surroundContents(span); } } catch (err) { console.warn("Highlight wrap failed.", err); } sel.removeAllRanges();
    });


    // --- Calculator Event Listeners ---
    if (calculatorBtn) { calculatorBtn.addEventListener('click', () => { if (currentModuleIndex >= 2) toggleCalculator(); }); } else { console.warn("Calculator Button missing."); }
    if (closeCalculatorBtn) { closeCalculatorBtn.addEventListener('click', () => toggleCalculator(false)); } else { console.warn("Close Calculator Button missing."); }
    if (calculatorHeader) { calculatorHeader.addEventListener('mousedown', startDrag); } else { console.warn("Calculator Header missing."); }
    if (calcResizeHandle) { calcResizeHandle.addEventListener('mousedown', startResize); } else { console.warn("Calculator Resize Handle missing."); }
    if (calcSizeToggleBtn) { calcSizeToggleBtn.addEventListener('click', () => toggleMaximizeCalculator()); } else { console.warn("Calculator Size Toggle Button missing."); }


    // --- Initial Load ---
    initTest();

}); // --- END OF DOMContentLoaded ---

