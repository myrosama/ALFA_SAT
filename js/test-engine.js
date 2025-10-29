// js/test-engine.js - With Draggable Calculator Logic

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
    let calcOffsetX = 0; // Mouse offset X relative to calculator's top-left
    let calcOffsetY = 0; // Mouse offset Y relative to calculator's top-left


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
    const timerDisplay = document.getElementById('timer-display'); // Use ID
    const modal = document.getElementById('question-navigator-modal');
    const backdrop = document.getElementById('modal-backdrop');
    const reviewBtn = modal ? modal.querySelector('.modal-footer button') : null;
    const testMain = document.querySelector('.test-main');
    const calculatorContainer = document.getElementById('calculator-container');
    const closeCalculatorBtn = document.getElementById('close-calculator-btn');
    // ++ Calculator Draggable Header ++
    const calculatorHeader = document.getElementById('calculator-header');


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
            allQuestionsByModule = [[], [], [], []]; // Clear existing

            if (questionsSnapshot.empty) {
                console.warn("No questions found for this test.");
                if(questionPaneContent) questionPaneContent.innerHTML = "<p>No questions available for this test.</p>";
                if(stimulusPaneContent) stimulusPaneContent.innerHTML = "";
                if(nextBtn) nextBtn.disabled = true; if(backBtn) backBtn.disabled = true;
                return;
            }

            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                if (question.module >= 1 && question.module <= 4) {
                    allQuestionsByModule[question.module - 1].push(question);
                } else {
                    console.warn(`Question ${doc.id} has invalid module number: ${question.module}`);
                }
            });

            allQuestionsByModule.forEach((module, index) => {
                module.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));
                console.log(`Module ${index + 1} sorted with ${module.length} questions.`);
            });

        } catch (error) {
            console.error("Error fetching/grouping questions: ", error);
            if(questionPaneContent) questionPaneContent.innerHTML = "<p>Error loading questions.</p>";
            if(stimulusPaneContent) stimulusPaneContent.innerHTML = "";
        }
    }

     /**
      * Starts a specific module.
      * @param {number} moduleIndex - 0-based index of the module.
      */
     function startModule(moduleIndex) {
         console.log(`Starting module index: ${moduleIndex}`);
         currentModuleIndex = moduleIndex;
         currentQuestionIndex = 0;

         if (isCalculatorVisible) toggleCalculator(false); // Close calc on module start

         const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];
         console.log(`Module ${moduleIndex + 1} question count: ${currentModuleQuestions.length}`);

         if (currentModuleQuestions.length === 0) {
              console.warn(`Module ${moduleIndex + 1} is empty.`);
             const nextNonEmpty = findNextNonEmptyModule(moduleIndex + 1);
             if (nextNonEmpty !== -1) {
                  console.log(`Skipping to module index: ${nextNonEmpty}`);
                  startModule(nextNonEmpty);
             } else {
                  console.log("No more non-empty modules, finishing test.");
                 finishTest();
             }
             return;
         }

         const isMathModuleStart = moduleIndex >= 2;
         if(testMain) testMain.classList.toggle('math-layout-active', isMathModuleStart);

         populateModalGrid();
         renderQuestion(currentQuestionIndex); // Render first question of this module
         startTimer(moduleTimers[currentModuleIndex]);
     }

     /** Renders MathQuill formulas. */
    function renderAllMath() {
        const formulaSpans = document.querySelectorAll('.ql-formula');
        formulaSpans.forEach(span => {
            const latex = span.dataset.value;
            if (latex) {
                try { MQ.StaticMath(span).latex(latex); }
                catch (e) { console.error("MathQuill error:", e, latex); span.textContent = `[Math Error]`; }
            }
        });
    }

    /** Renders the specified question. */
    function renderQuestion(index) {
        // Basic validation
        if (!allQuestionsByModule[currentModuleIndex] || !allQuestionsByModule[currentModuleIndex][index]) {
            console.error(`Render Error: Invalid question index ${index} for module ${currentModuleIndex}.`);
            if (questionPaneContent) questionPaneContent.innerHTML = "<p>Error: Could not load question data.</p>";
            // Consider disabling nav buttons if this happens
            return;
        }

        const question = allQuestionsByModule[currentModuleIndex][index];
        console.log(`Rendering question index: ${index}, ID: ${question.id}, Number: ${question.questionNumber}`);

        const isMath = question.module > 2;
        const stimulusPane = document.querySelector('.stimulus-pane');
        const mathHeader = document.getElementById('math-question-header');
        const rwHeader = document.getElementById('rw-question-header');

        // --- Layout and Visibility ---
        if(testMain) testMain.classList.toggle('math-layout-active', isMath);
        if (!isMath && isCalculatorVisible) toggleCalculator(false); // Close calc if switching to R&W
        if (mathHeader) mathHeader.classList.toggle('hidden', !isMath);
        if (rwHeader) rwHeader.classList.toggle('hidden', isMath);

        // --- Populate Active Header ---
        const activeHeader = isMath ? mathHeader : rwHeader;
        if (activeHeader) {
            const qNumDisp = activeHeader.querySelector('.q-number-display');
            const markCheck = activeHeader.querySelector('.mark-review-checkbox');
            if (qNumDisp) qNumDisp.textContent = question.questionNumber || (index + 1);
            if (markCheck) {
                markCheck.checked = !!markedQuestions[question.id];
                markCheck.dataset.questionId = question.id; // Ensure ID is set for listener
            }
        } else { console.warn("Active header bar not found."); }

        // --- Populate Stimulus Pane ---
        const isStimulusEmpty = (!question.passage || question.passage.trim() === '' || question.passage === '<p><br></p>') && !question.imageUrl;
        if (stimulusPane) stimulusPane.classList.toggle('is-empty', isStimulusEmpty);
        if (stimulusPaneContent) {
            const imgPos = question.imagePosition || 'above';
            const imgHTML = question.imageUrl ? `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'};">` : '';
            const passageHTML = question.passage || '';
            stimulusPaneContent.innerHTML = (imgPos === 'below') ? (passageHTML + imgHTML) : (imgHTML + passageHTML);
        } else { console.warn("Stimulus pane content area not found."); }

        // --- Populate Question Pane ---
        if (questionPaneContent) {
            questionPaneContent.innerHTML = `
                <div class="question-text">${question.prompt || ''}</div>
                <div class="question-options">${renderOptions(question)}</div>`;
        } else { console.error("Question pane content area not found!"); return; }

        renderAllMath(); // Render math after content insertion

        // --- Restore Answer State ---
        const savedAnswer = userAnswers[question.id];
        if (savedAnswer) {
            if (question.format === 'mcq') {
                const radio = questionPaneContent.querySelector(`input[type="radio"][name="${question.id}"][value="${savedAnswer}"]`);
                if (radio) radio.checked = true;
                else console.warn(`Couldn't find radio button for saved answer '${savedAnswer}'`);
            } else if (question.format === 'fill-in') {
                const input = questionPaneContent.querySelector(`.fill-in-input[data-question-id="${question.id}"]`);
                if (input) input.value = savedAnswer;
                 else console.warn(`Couldn't find fill-in input for saved answer`);
            }
        }

        updateUI(question); // Update buttons, titles etc.
    }

    /** Generates HTML for question options. */
    function renderOptions(question) {
        if (!question || !question.id) return '<p>Invalid question data.</p>';
        if (question.format === 'mcq') {
            const options = question.options || {};
            return ['A', 'B', 'C', 'D'].map(opt => {
                const optText = options[opt] || '';
                return `
                    <div class="option-wrapper">
                        <label class="option">
                            <input type="radio" name="${question.id}" value="${opt}">
                            <span class="option-letter">${opt}</span>
                            <span class="option-text">${optText}</span>
                        </label>
                        <button class="strikethrough-btn" title="Eliminate choice"><i class="fa-solid fa-ban"></i></button>
                    </div>`;
            }).join('');
        }
        if (question.format === 'fill-in') {
             const savedVal = userAnswers[question.id] || '';
            return `<div><input type="text" class="fill-in-input" data-question-id="${question.id}" placeholder="Type your answer here" value="${savedVal}"></div>`;
        }
        return '<p>Question format not supported.</p>';
    }

    /** Updates static UI elements. */
    function updateUI(question) {
        if (!question) { console.warn("updateUI: Invalid question."); return; }
        const currentModuleQs = allQuestionsByModule[currentModuleIndex] || [];
        const isMath = question.module > 2;
        const totalQs = currentModuleQs.length;
        const currentQNum = currentQuestionIndex + 1;

        if (testTitleHeader) testTitleHeader.textContent = isMath ? 'Math' : 'Reading & Writing';
        if (moduleTitleHeader) {
            const modNumDisp = isMath ? question.module - 2 : question.module;
            moduleTitleHeader.textContent = `Module ${modNumDisp}`;
        }
        if (questionNavBtnText) questionNavBtnText.textContent = totalQs > 0 ? `Question ${currentQNum} of ${totalQs}` : "No Questions";
        if (backBtn) backBtn.disabled = currentQuestionIndex === 0;
        if (nextBtn) {
            nextBtn.disabled = totalQs === 0;
            nextBtn.textContent = (currentQuestionIndex === totalQs - 1) ? 'Finish Module' : 'Next';
        }
        if (calculatorBtn) {
            calculatorBtn.style.display = isMath ? 'inline-block' : 'none';
            if (!isMath) calculatorBtn.classList.remove('active');
        }
        if (testMain) testMain.classList.toggle('math-layout-active', isMath);
        updateModalGridHighlights();
    }

    /** Populates the question navigator modal grid. */
    function populateModalGrid() {
        if (!modalGrid) return;
        modalGrid.innerHTML = '';
        const currentModuleQs = allQuestionsByModule[currentModuleIndex] || [];
        if (currentModuleQs.length === 0) { modalGrid.innerHTML = '<p>No questions.</p>'; return; }
        currentModuleQs.forEach((q, index) => {
            const qBtn = document.createElement('div');
            qBtn.className = 'q-number';
            qBtn.textContent = q.questionNumber || (index + 1);
            qBtn.dataset.index = index;
            qBtn.addEventListener('click', () => { currentQuestionIndex = index; renderQuestion(index); toggleModal(false); });
            modalGrid.appendChild(qBtn);
        });
        updateModalGridHighlights();
    }

    /** Updates visual state of modal grid buttons. */
    function updateModalGridHighlights() {
        if (!modalGrid) return;
        const qBtns = modalGrid.querySelectorAll('.q-number');
        const currentModuleQs = allQuestionsByModule[currentModuleIndex] || [];
        qBtns.forEach((btn) => {
            const index = parseInt(btn.dataset.index, 10);
            if (isNaN(index) || index < 0 || index >= currentModuleQs.length || !currentModuleQs[index] || !currentModuleQs[index].id) { btn.style.opacity = '0.5'; return; }
            const qId = currentModuleQs[index].id;
            btn.classList.remove('current', 'answered', 'reviewed');
            if (userAnswers[qId]) btn.classList.add('answered');
            if (markedQuestions[qId]) btn.classList.add('reviewed');
            if (index === currentQuestionIndex) btn.classList.add('current');
        });
    }

    /** Starts the timer. */
    function startTimer(duration) {
        if (typeof duration !== 'number' || duration <= 0) { console.error(`Invalid timer duration: ${duration}.`); if (timerDisplay) timerDisplay.textContent = "00:00"; return; }
        let timer = duration; clearInterval(timerInterval);
        if (!timerDisplay) { console.warn("Timer display not found."); return; }
        console.log(`Starting timer: ${duration}s`);
        timerInterval = setInterval(() => {
            let mins = Math.floor(timer / 60); let secs = timer % 60;
            timerDisplay.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
            if (--timer < 0) { clearInterval(timerInterval); alert("Time's up!"); showReviewScreen(true); }
        }, 1000);
    }

    /** Calculates placeholder score. */
    function calculateScore() {
        let correct = 0; const flatQs = allQuestionsByModule.flat(); const total = flatQs.length;
        if (total === 0) return { correct: 0, total: 0, score: 0 };
        flatQs.forEach(q => { if (q && q.id && userAnswers[q.id] === q.correctAnswer) { correct++; } });
        const scaled = Math.round((correct / total) * 800) * 2; // Placeholder
        console.log(`Score: ${correct}/${total}, Scaled: ${scaled}`);
        return { correct, total, score: scaled };
    }

    /** Shows the review screen (modal). */
    function showReviewScreen(isEndOfModule = false) {
        console.log(`Show review. End of module: ${isEndOfModule}`);
        clearInterval(timerInterval); if (timerDisplay) timerDisplay.textContent = "00:00";
        if (reviewBtn) {
            const nextNonEmpty = findNextNonEmptyModule(currentModuleIndex + 1);
            reviewBtn.textContent = (nextNonEmpty === -1) ? `Finish Test and See Results` : `Continue to Next Module`;
            reviewBtn.style.display = isEndOfModule ? 'block' : 'none';
        } else { console.warn("Review button not found."); }
        toggleModal(true);
    }

    /** Finds the index of the next module with questions. */
    function findNextNonEmptyModule(startIndex) {
        for (let i = startIndex; i < allQuestionsByModule.length; i++) {
            if (allQuestionsByModule[i]?.length > 0) return i;
            console.log(`Skipping empty module ${i + 1}`);
        }
        return -1; // Not found
    }

    /** Finalizes the test. */
    function finishTest() {
        console.log("Finishing test."); clearInterval(timerInterval);
        const result = calculateScore();
        sessionStorage.setItem('lastTestResult', JSON.stringify(result));
        sessionStorage.setItem('lastTestId', testId);
        alert(`Test Complete! Correct: ${result.correct}/${result.total}, Score: ${result.score}`); // Replace Alert
        window.location.href = 'dashboard.html';
    }

    /** Toggles the question navigator modal. */
    function toggleModal(show) {
        if (!modal || !backdrop) { console.warn("Modal/Backdrop not found."); return; }
        const shouldShow = typeof show === 'boolean' ? show : !modal.classList.contains('visible');
        console.log(shouldShow ? "Opening modal." : "Closing modal.");
        if (shouldShow) {
            const header = modal.querySelector('.modal-header h4');
            if (header) {
                const type = currentModuleIndex < 2 ? "Reading & Writing" : "Math";
                const numDisp = currentModuleIndex < 2 ? currentModuleIndex + 1 : currentModuleIndex - 1;
                header.textContent = `Section ${currentModuleIndex + 1}, Module ${numDisp}: ${type} Questions`;
            } else { console.warn("Modal header title not found."); }
            updateModalGridHighlights();
        }
        modal.classList.toggle('visible', shouldShow);
        backdrop.classList.toggle('visible', shouldShow);
        const navBtn = document.getElementById('question-nav-btn');
        if(navBtn) navBtn.classList.toggle('open', shouldShow);
    }

    /** Toggles the calculator visibility and loads iframe. */
    function toggleCalculator(show) {
        if (!testMain || !calculatorContainer || !calculatorBtn) { console.warn("Calculator elements missing."); return; }
        isCalculatorVisible = typeof show === 'boolean' ? show : !isCalculatorVisible;
        console.log(isCalculatorVisible ? "Showing calculator." : "Hiding calculator.");
        testMain.classList.toggle('calculator-active', isCalculatorVisible);
        calculatorBtn.classList.toggle('active', isCalculatorVisible);
        if (isCalculatorVisible && !calculatorInitialized) {
            console.log("Initializing Desmos iframe.");
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.desmos.com/calculator';
            iframe.title = "Desmos Scientific Calculator";
            let existingIframe = calculatorContainer.querySelector('iframe');
            if(existingIframe) calculatorContainer.removeChild(existingIframe);
            const calcHeader = calculatorContainer.querySelector('.calculator-header');
            if (calcHeader) calcHeader.insertAdjacentElement('afterend', iframe);
            else calculatorContainer.appendChild(iframe); // Fallback
            calculatorInitialized = true;
        }
         // Reset position when hiding (optional - keeps position otherwise)
         if (!isCalculatorVisible) {
             // calculatorContainer.style.left = '10px';
             // calculatorContainer.style.top = '10px';
         }
    }

     // +++ Drag and Drop Functions +++
     function startDrag(e) {
         // Allow drag only via header, ignore iframe/close button
         if (!e.target.closest('.calculator-header') || e.target.closest('.close-calculator-btn')) return;
         if (!calculatorContainer) return;

         isDraggingCalc = true;
         // Calculate offset relative to the calculator element itself
         const rect = calculatorContainer.getBoundingClientRect();
         calcOffsetX = e.clientX - rect.left;
         calcOffsetY = e.clientY - rect.top;

         // Apply dragging styles
         calculatorContainer.style.cursor = 'grabbing'; // Use grabbing cursor
         calculatorContainer.style.opacity = '0.85';
         document.body.style.userSelect = 'none'; // Prevent text selection globally

         window.addEventListener('mousemove', dragMove);
         window.addEventListener('mouseup', stopDrag, { once: true }); // Use once option for cleanup

         e.preventDefault(); // Prevent text selection on header
          console.log("Started dragging calculator.");
     }

     function dragMove(e) {
         if (!isDraggingCalc || !calculatorContainer) return;
         e.preventDefault();

         // Calculate new absolute position based on mouse coords and offset
         let newX = e.clientX - calcOffsetX;
         let newY = e.clientY - calcOffsetY;

         // Bounds checking relative to the viewport/testMain
         const mainBounds = testMain.getBoundingClientRect(); // Get bounds of the container
         const calcWidth = calculatorContainer.offsetWidth;
         const calcHeight = calculatorContainer.offsetHeight;


         // Adjust calculations to be relative to testMain's top/left if it's not at 0,0
         const mainOffsetX = mainBounds.left;
         const mainOffsetY = mainBounds.top;

         // Ensure left/top edges don't go out of bounds
         if (newX < 0) newX = 0;
         if (newY < 0) newY = 0;

         // Ensure right/bottom edges don't go out of bounds
          // Use mainBounds.width/height directly as container coords are relative
         if (newX + calcWidth > mainBounds.width) newX = mainBounds.width - calcWidth;
         if (newY + calcHeight > mainBounds.height) newY = mainBounds.height - calcHeight;


         calculatorContainer.style.left = newX + 'px';
         calculatorContainer.style.top = newY + 'px';
     }

     function stopDrag() {
          console.log("Stopping drag.");
         isDraggingCalc = false;
         // Reset styles
         if(calculatorContainer) {
             calculatorContainer.style.cursor = 'move'; // Reset to move cursor on header
             calculatorContainer.style.opacity = '1';
         }
         document.body.style.userSelect = ''; // Re-enable text selection

         // Remove window listeners (already handled by {once: true} on mouseup)
         window.removeEventListener('mousemove', dragMove);
         // window.removeEventListener('mouseup', stopDrag); // Removed due to {once: true}
     }


    /** Main initialization function. */
    async function initTest() {
        console.log("Init test...");
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');
        if (!testId) {
            console.error("No Test ID in URL."); document.body.innerHTML = '<h1>Error: No Test ID.</h1>'; return;
        }
        const userNameDisp = document.getElementById('user-name-display');
        if (userNameDisp) { const user = firebase.auth().currentUser; userNameDisp.textContent = user?.displayName || 'Student'; }
        console.log(`Test ID: ${testId}`);
        await fetchAndGroupQuestions(testId);
        if (allQuestionsByModule.flat().length > 0) { console.log("Starting module 0."); startModule(0); }
        else { console.error("No questions loaded."); if(questionPaneContent) questionPaneContent.innerHTML = "<p>Could not load questions.</p>"; }
    }


    // --- Event Listeners ---

    // Modal Toggles
    const toggleBtn = document.getElementById('question-nav-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (toggleBtn) { toggleBtn.addEventListener('click', () => { if (reviewBtn) reviewBtn.style.display = 'none'; toggleModal(true); }); } else { console.warn("Nav Toggle Button missing."); }
    if (closeModalBtn) { closeModalBtn.addEventListener('click', () => toggleModal(false)); } else { console.warn("Modal Close Button missing."); }
    if (backdrop) { backdrop.addEventListener('click', () => toggleModal(false)); } else { console.warn("Modal Backdrop missing."); }

    // Next/Back
    if (nextBtn) { nextBtn.addEventListener('click', () => {
        const currentQs = allQuestionsByModule[currentModuleIndex] || [];
        if (currentQuestionIndex < currentQs.length - 1) { currentQuestionIndex++; renderQuestion(currentQuestionIndex); } else { showReviewScreen(true); } });
    } else { console.warn("Next Button missing."); }
    if (backBtn) { backBtn.addEventListener('click', () => { if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(currentQuestionIndex); } }); }
    else { console.warn("Back Button missing."); }

    // Answers, Strikethrough, Mark Review
    if (questionPaneContent) {
        questionPaneContent.addEventListener('change', (e) => { // Answers
            if (e.target.type === 'radio' && e.target.name) { /* MCQ logic */ userAnswers[e.target.name] = e.target.value; const wrapper = e.target.closest('.option-wrapper'); if (wrapper) { wrapper.classList.remove('stricken-through'); e.target.disabled = false; } updateModalGridHighlights(); }
            if (e.target.classList.contains('fill-in-input')) { /* Fill-in logic */ const qId = e.target.dataset.questionId; if (qId) { userAnswers[qId] = e.target.value.trim(); updateModalGridHighlights(); } }
        });
        questionPaneContent.addEventListener('click', (e) => { // Strikethrough
            const strikeBtn = e.target.closest('.strikethrough-btn'); if (!strikeBtn) return; e.preventDefault(); e.stopPropagation(); const wrapper = strikeBtn.closest('.option-wrapper'); const radio = wrapper?.querySelector('input[type="radio"]'); if (!wrapper || !radio) return; const isStriking = !wrapper.classList.contains('stricken-through'); wrapper.classList.toggle('stricken-through', isStriking); radio.disabled = isStriking; if (isStriking && radio.checked) { radio.checked = false; const qId = radio.name; if (userAnswers[qId] === radio.value) { delete userAnswers[qId]; updateModalGridHighlights(); } }
        });
    } else { console.error("Question Pane Content missing!"); }
    document.body.addEventListener('change', (e) => { // Mark Review
        if (!e.target.classList.contains('mark-review-checkbox')) return; const qId = e.target.dataset.questionId; if (!qId) { console.warn("Mark review checkbox missing question ID."); return; } if (e.target.checked) markedQuestions[qId] = true; else delete markedQuestions[qId]; updateModalGridHighlights();
    });

    // Review Button (Modal Footer)
    if (reviewBtn) { reviewBtn.addEventListener('click', () => { toggleModal(false); const nextIdx = findNextNonEmptyModule(currentModuleIndex + 1); if (nextIdx !== -1) startModule(nextIdx); else finishTest(); }); }
    else { console.warn("Review Button missing."); }

    // Highlighter
    if (highlighterBtn) { highlighterBtn.addEventListener('click', () => { isHighlighterActive = !isHighlighterActive; document.body.classList.toggle('highlighter-active', isHighlighterActive); highlighterBtn.classList.toggle('active', isHighlighterActive); }); }
    else { console.warn("Highlighter Button missing."); }
    document.body.addEventListener('contextmenu', (e) => { if (isHighlighterActive && e.target.closest('.main-content-body')) e.preventDefault(); });
    document.body.addEventListener('mouseup', (e) => { // Highlight selection logic (complex, kept concise)
        const targetPane = e.target.closest('.stimulus-pane .pane-content') || e.target.closest('.question-pane .pane-content'); if (!isHighlighterActive || !targetPane) return; const sel = window.getSelection(); if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return; const range = sel.getRangeAt(0); if (!targetPane.contains(range.startContainer) || !targetPane.contains(range.endContainer)) { sel.removeAllRanges(); return; } const ancestor = range.commonAncestorContainer; if (ancestor.nodeType !== Node.TEXT_NODE && (ancestor.closest('.question-header-bar,.option-letter,.strikethrough-btn,input,button,label'))) { sel.removeAllRanges(); return; } const span = document.createElement('span'); span.className = 'highlight'; try { let startP = range.startContainer.parentNode; let endP = range.endContainer.parentNode; if (startP.classList?.contains('highlight') && startP === endP) { let text = startP.textContent; startP.parentNode.replaceChild(document.createTextNode(text), startP); } else if (startP.closest?.('.highlight') || endP.closest?.('.highlight')) { /* Avoid overlap */ } else { range.surroundContents(span); } } catch (err) { console.warn("Highlight wrap failed.", err); } sel.removeAllRanges();
    });

    // Calculator Toggles & Drag
    if (calculatorBtn) { calculatorBtn.addEventListener('click', () => { if (currentModuleIndex >= 2) toggleCalculator(); }); } else { console.warn("Calculator Button missing."); }
    if (closeCalculatorBtn) { closeCalculatorBtn.addEventListener('click', () => toggleCalculator(false)); } else { console.warn("Close Calculator Button missing."); }
    if (calculatorHeader) { calculatorHeader.addEventListener('mousedown', startDrag); } else { console.warn("Calculator Header missing."); }


    // --- Initial Load ---
    initTest();

}); // --- END OF DOMContentLoaded ---

