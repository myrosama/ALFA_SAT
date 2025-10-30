// js/test-engine.js - Added Custom Selection Toolbar

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
    
    // +++ State for Custom Selection Toolbar +++
    let selectionRange = null; // Stores the last selected text Range object


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
    const highlighterBtn = document.querySelector('.tool-btn[title="Highlighter"]'); // This button is now overridden by the new toolbar
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
    const toggleBtn = document.getElementById('question-nav-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    
    // +++ Reference for Custom Selection Toolbar +++
    const selectionToolbar = document.getElementById('selection-toolbar');


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
        // The old highlighter button is hidden by default now, so this line is safe
        if (highlighterBtn) { highlighterBtn.style.display = 'none'; } // We hide the old button
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
                // +++ FIX FOR SECTION NUMBER +++
                const sectionNumberDisplay = currentModuleIndex < 2 ? 1 : 2;
                const moduleNumberDisplay = (currentModuleIndex % 2) + 1;
                header.textContent = `Section ${sectionNumberDisplay}, Module ${moduleNumberDisplay}: ${type} Questions`;
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
    // (toggleCalculator, updateContentMargin, startDrag, dragMove, stopDrag,
    // startResize, resizeMove, stopResize, toggleMaximizeCalculator)
    // --- [Start of Collapsed Calculator Functions] ---
    function toggleCalculator(show) {
        if (!testMain || !calculatorContainer || !calculatorBtn) { console.warn("Calculator elements missing."); return; }
        const newState = typeof show === 'boolean' ? show : !isCalculatorVisible;
        if (newState === isCalculatorVisible) return;
        isCalculatorVisible = newState;
        console.log(isCalculatorVisible ? "Showing calculator." : "Hiding calculator.");

        if (isCalculatorVisible) {
            if (isCalculatorMaximized) { toggleMaximizeCalculator(false); }
            else {
                calculatorContainer.style.width = `${currentCalcWidth}px`;
                calculatorContainer.style.height = `${currentCalcHeight}px`;
                calculatorContainer.style.left = `${currentCalcLeft}px`;
                calculatorContainer.style.top = `${currentCalcTop}px`;
            }
            // REMOVED: calculatorContainer.style.transition = '...';
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
            // +++ FIX FOR TELEPORT GLITCH +++
            updateContentMargin(); // Set target margin
            requestAnimationFrame(() => { // Add active classes in next frame
                testMain.classList.add('calculator-active');
                calculatorBtn.classList.add('active');
            });
        } else {
            if (!isCalculatorMaximized) {
                 currentCalcLeft = calculatorContainer.offsetLeft;
                 currentCalcTop = calculatorContainer.offsetTop;
                 currentCalcWidth = calculatorContainer.offsetWidth;
                 currentCalcHeight = calculatorContainer.offsetHeight;
            }
            updateContentMargin(); // Reset margin to 0
            testMain.classList.remove('calculator-active');
            calculatorBtn.classList.remove('active');
            if (isCalculatorMaximized) {
                 toggleMaximizeCalculator(false); 
            }
        }
    }
    function updateContentMargin() {
         let marginSize = 0;
         if (isCalculatorVisible) {
             if (isCalculatorMaximized) { marginSize = '50%'; }
             else if (calculatorContainer) { marginSize = `${calculatorContainer.offsetWidth + 20}px`; }
         }
         document.documentElement.style.setProperty('--content-margin-left', `${marginSize}`);
         console.log(`Set --content-margin-left to ${marginSize}`);
    }
     function startDrag(e) {
         if (!e.target.closest('.calculator-header') || e.target.closest('.close-calculator-btn, .calc-size-toggle-btn') || isCalculatorMaximized || isResizingCalc) return;
         if (!calculatorContainer || !testMain) return;
         isDraggingCalc = true;
         calculatorContainer.classList.add('dragging'); // Disables iframe pointer-events via CSS
         const rect = calculatorContainer.getBoundingClientRect();
         const mainBounds = testMain.getBoundingClientRect();
         calcOffsetX = e.clientX - rect.left;
         calcOffsetY = e.clientY - rect.top;
         currentCalcLeft = rect.left - mainBounds.left;
         currentCalcTop = rect.top - mainBounds.top;
         calculatorContainer.style.cursor = 'grabbing';
         calculatorContainer.style.transition = 'none';
         document.body.style.userSelect = 'none';
         window.addEventListener('mousemove', dragMove);
         window.addEventListener('mouseup', stopDrag, { once: true });
         e.preventDefault();
     }
     function dragMove(e) {
         if (!isDraggingCalc || !calculatorContainer) return; e.preventDefault();
         const mainBounds = testMain.getBoundingClientRect();
         let newViewportX = e.clientX - calcOffsetX; let newViewportY = e.clientY - calcOffsetY;
         let newParentX = newViewportX - mainBounds.left; let newParentY = newViewportY - mainBounds.top;
         const calcWidth = calculatorContainer.offsetWidth; const calcHeight = calculatorContainer.offsetHeight;
         newParentX = Math.max(0, Math.min(newParentX, mainBounds.width - calcWidth));
         newParentY = Math.max(0, Math.min(newParentY, mainBounds.height - calcHeight));
         calculatorContainer.style.left = newParentX + 'px'; calculatorContainer.style.top = newParentY + 'px';
          currentCalcLeft = newParentX; currentCalcTop = newParentY;
     }
     function stopDrag() {
         isDraggingCalc = false;
         if(calculatorContainer) {
             calculatorContainer.classList.remove('dragging'); // Re-enable iframe events
             calculatorContainer.style.cursor = 'move';
             calculatorContainer.style.transition = ''; // Restore transitions from CSS
         }
         document.body.style.userSelect = '';
         window.removeEventListener('mousemove', dragMove);
     }
    function startResize(e) {
         if (isCalculatorMaximized || isDraggingCalc) return;
        isResizingCalc = true;
        calculatorContainer.classList.add('resizing'); // Disables iframe pointer-events via CSS
        calcResizeStartX = e.clientX; calcResizeStartY = e.clientY;
        calcResizeStartWidth = calculatorContainer.offsetWidth;
        calcResizeStartHeight = calculatorContainer.offsetHeight;
        calculatorContainer.style.transition = 'none';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', resizeMove);
        window.addEventListener('mouseup', stopResize, { once: true });
        e.preventDefault();
    }
    function resizeMove(e) {
        if (!isResizingCalc) return; e.preventDefault();
        const minWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-min-width'));
        const minHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-min-height'));
        let newWidth = calcResizeStartWidth + (e.clientX - calcResizeStartX);
        let newHeight = calcResizeStartHeight + (e.clientY - calcResizeStartY);
        newWidth = Math.max(minWidth, newWidth); newHeight = Math.max(minHeight, newHeight);
        const mainBounds = testMain.getBoundingClientRect();
        const currentLeft = calculatorContainer.offsetLeft; const currentTop = calculatorContainer.offsetTop;
        newWidth = Math.min(newWidth, mainBounds.width - currentLeft);
        newHeight = Math.min(newHeight, mainBounds.height - currentTop);
        calculatorContainer.style.width = `${newWidth}px`;
        calculatorContainer.style.height = `${newHeight}px`;
        currentCalcWidth = newWidth; currentCalcHeight = newHeight;
        updateContentMargin();
    }
    function stopResize() {
         isResizingCalc = false;
         if(calculatorContainer) {
             calculatorContainer.classList.remove('resizing'); // Re-enable iframe events
             calculatorContainer.style.transition = ''; // Restore transitions from CSS
         }
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', resizeMove);
         document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
         document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
    }
    function toggleMaximizeCalculator(forceState) {
         if (!calculatorContainer || !calcSizeToggleIcon || isDraggingCalc || isResizingCalc) return;
         const newState = typeof forceState === 'boolean' ? forceState : !isCalculatorMaximized;
         if (newState === isCalculatorMaximized) return;
         console.log(`Toggling maximize. New state: ${newState}`);
         calculatorContainer.style.transition = 'none'; // Disable transitions
         if (newState) {
             currentCalcWidth = calculatorContainer.offsetWidth;
             currentCalcHeight = calculatorContainer.offsetHeight;
             currentCalcLeft = calculatorContainer.offsetLeft;
             currentCalcTop = calculatorContainer.offsetTop;
             calculatorContainer.classList.add('maximized');
         } else {
             calculatorContainer.classList.remove('maximized');
             calculatorContainer.style.width = `${currentCalcWidth}px`;
             calculatorContainer.style.height = `${currentCalcHeight}px`;
             calculatorContainer.style.left = `${currentCalcLeft}px`;
             calculatorContainer.style.top = `${currentCalcTop}px`;
             document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
             document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
         }
         isCalculatorMaximized = newState;
         updateContentMargin();
         requestAnimationFrame(() => {
             calculatorContainer.style.transition = ''; // Let CSS handle all transitions
             calcSizeToggleIcon.classList.toggle('fa-expand', !isCalculatorMaximized);
             calcSizeToggleIcon.classList.toggle('fa-compress', isCalculatorMaximized);
             if(calcSizeToggleBtn) calcSizeToggleBtn.title = isCalculatorMaximized ? "Restore Calculator Size" : "Maximize Calculator";
         });
    }
    // --- [End of Collapsed Calculator Functions] ---


    // +++ NEW: Custom Selection Toolbar Functions +++
    
    /**
     * Shows the custom selection toolbar above the user's selection.
     */
    function showSelectionToolbar() {
        if (!selectionToolbar || !selectionRange) return;

        const rect = selectionRange.getBoundingClientRect();
        const mainRect = testMain.getBoundingClientRect(); // Get bounds of the main test area

        // Position toolbar 10px above the selection
        let top = rect.top - mainRect.top - selectionToolbar.offsetHeight - 10;
        let left = rect.left - mainRect.left + (rect.width / 2) - (selectionToolbar.offsetWidth / 2);

        // Keep toolbar inside the main test area bounds
        top = Math.max(0, top); // Don't go above the top
        left = Math.max(0, Math.min(left, mainRect.width - selectionToolbar.offsetWidth)); // Don't go off-sides

        selectionToolbar.style.top = `${top}px`;
        selectionToolbar.style.left = `${left}px`;
        selectionToolbar.classList.add('visible');
    }

    /**
     * Hides the custom selection toolbar.
     */
    function hideSelectionToolbar() {
        if (selectionToolbar) selectionToolbar.classList.remove('visible');
        selectionRange = null; // Clear saved range
    }

    /**
     * Wraps the current selectionRange with a new element (span)
     * and applies the specified command (highlight, underline, etc.).
     * @param {string} command - The command to apply (e.g., 'highlight', 'underline').
     * @param {string} [value] - The value for the command (e.g., a color hex).
     */
    function applyFormat(command, value = null) {
        if (!selectionRange) return;

        try {
            // Create a wrapper element
            const wrapper = document.createElement('span');
            wrapper.classList.add('custom-format-wrapper'); // Base class

            if (command === 'highlight') {
                // Apply background color directly for highlighting
                wrapper.style.backgroundColor = value;
            } else if (command === 'underline') {
                wrapper.classList.add('custom-underline');
            } else if (command === 'clearformat') {
                // This is more complex: we need to unwrap
                const content = selectionRange.extractContents(); // Pull content out of document
                
                // Find and remove our wrappers *inside* the pulled content
                const wrappersToRemove = content.querySelectorAll('.custom-format-wrapper, .custom-underline');
                wrappersToRemove.forEach(wrap => {
                    // Replace the wrapper (e.g., <span style="..."><node></span>)
                    // with just its contents (<node>)
                    wrap.replaceWith(...wrap.childNodes); 
                });
                
                // Put the "clean" content back
                selectionRange.insertNode(content);
                document.getSelection().removeAllRanges(); // Clear selection
                hideSelectionToolbar();
                return; // Stop here for clearformat
            }

            // For highlight/underline, wrap the selected content
            wrapper.appendChild(selectionRange.extractContents());
            selectionRange.insertNode(wrapper);
            
            // Clean up: un-nest identical wrappers (e.g., highlight inside highlight)
            // This is basic and can be expanded
            const parent = wrapper.parentNode;
            if (parent.classList.contains('custom-format-wrapper') && command === 'highlight') {
                parent.style.backgroundColor = value; // Apply new color to parent
                parent.replaceChild(wrapper.firstChild, wrapper); // Remove inner wrapper
            }
            if (parent.classList.contains('custom-underline') && command === 'underline') {
                 parent.replaceChild(wrapper.firstChild, wrapper); // Just remove inner
            }


        } catch (e) {
            console.warn("Could not apply format (selection might span complex elements):", e);
        }

        // Clear selection and hide toolbar after applying
        document.getSelection().removeAllRanges();
        hideSelectionToolbar();
    }
    // +++ [End of Custom Selection Toolbar Functions] +++


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
         
         updateContentMargin();
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
    
    // OLD Highlighter button - now hidden by updateUI
    if (highlighterBtn) { highlighterBtn.style.display = 'none'; } // Explicitly hide old button
    
    // --- Calculator Event Listeners ---
    if (calculatorBtn) { calculatorBtn.addEventListener('click', () => { if (currentModuleIndex >= 2) toggleCalculator(); }); } else { console.warn("Calculator Button missing."); }
    if (closeCalculatorBtn) { closeCalculatorBtn.addEventListener('click', () => toggleCalculator(false)); } else { console.warn("Close Calculator Button missing."); }
    if (calculatorHeader) { calculatorHeader.addEventListener('mousedown', startDrag); } else { console.warn("Calculator Header missing."); }
    if (calcResizeHandle) { calcResizeHandle.addEventListener('mousedown', startResize); } else { console.warn("Calculator Resize Handle missing."); }
    if (calcSizeToggleBtn) { calcSizeToggleBtn.addEventListener('click', () => toggleMaximizeCalculator()); } else { console.warn("Calculator Size Toggle Button missing."); }


    // +++ NEW: Event Listeners for Custom Toolbar +++

    // 1. Show toolbar on text selection
    document.body.addEventListener('mouseup', (e) => {
        // Hide toolbar if clicking anywhere (will be re-shown if it's a new selection)
        // Check if click was *on* the toolbar itself first
        if (e.target.closest('#selection-toolbar')) {
            return; // Don't hide if clicking a toolbar button
        }
        
        const selection = window.getSelection();
        
        // Check if selection is valid, not empty, and inside a content area
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
             const range = selection.getRangeAt(0);
             const targetPane = range.commonAncestorContainer.parentNode.closest('.stimulus-pane .pane-content, .question-pane .pane-content');
             
             // Only show if selection is within a valid pane
             if (targetPane) {
                 selectionRange = range.cloneRange(); // Save the selection
                 showSelectionToolbar(); // Position and show
             } else {
                 hideSelectionToolbar(); // Selection is outside valid area
             }
        } else {
             hideSelectionToolbar(); // No selection, hide
        }
        
    }, { capture: true }); // <-- ADD THIS CAPTURE FLAG

    // 2. Hide toolbar on mousedown (clears old selection)
    document.body.addEventListener('mousedown', (e) => {
         // Don't hide if clicking *on* the toolbar
         if (e.target.closest('#selection-toolbar')) {
            e.preventDefault(); // Prevent mousedown from blurring selection
            return;
        }
        hideSelectionToolbar();
    }, { capture: true }); // <-- ADD THIS CAPTURE FLAG

    // 3. Disable default context menu (right-click) in content panes
    document.body.addEventListener('contextmenu', (e) => {
        const targetPane = e.target.closest('.stimulus-pane .pane-content, .question-pane .pane-content');
        if (targetPane) {
            e.preventDefault(); // Disable right-click menu
        }
    });

    // 4. Disable default copy action
    document.body.addEventListener('copy', (e) => {
         const targetPane = e.target.closest('.stimulus-pane .pane-content, .question-pane .pane-content');
         if (targetPane) {
             e.preventDefault(); // Disable Ctrl+C / Cmd+C
             console.log("Copying is disabled."); // Optional feedback
         }
    });
    
    // 5. Handle clicks on the toolbar buttons
    if (selectionToolbar) {
        selectionToolbar.addEventListener('mousedown', (e) => {
             // Use mousedown so it fires before the mouseup that clears the selection
            const button = e.target.closest('button');
            if (button) {
                 e.preventDefault(); // Prevent button click from hiding toolbar
                 e.stopPropagation(); // <-- ADD THIS LINE
                const command = button.dataset.command;
                const value = button.dataset.value || null;
                
                if (command && selectionRange) {
                    applyFormat(command, value);
                }
            }
        });
    } else { console.warn("Selection Toolbar element not found."); }
    

    // --- Initial Loader ---
    initTest();

}); // --- END OF DOMContentLoaded ---

