// js/test-engine.js - Implement SAT Scoring and Result Saving

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase and MathQuill ---
    const db = firebase.firestore();
    const auth = firebase.auth(); // Get auth service
    const MQ = MathQuill.getInterface(2);

    // --- State Management ---
    let testId = null;
    let testName = "Practice Test"; // Store test name
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
    let isDraggingCalc = false, calcOffsetX = 0, calcOffsetY = 0;
    let isResizingCalc = false, calcResizeStartX = 0, calcResizeStartY = 0, calcResizeStartWidth = 0, calcResizeStartHeight = 0;
    let isCalculatorMaximized = false;
    let currentCalcWidth = 360, currentCalcHeight = 500, currentCalcLeft = 10, currentCalcTop = 10;
    try {
        currentCalcWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-width')) || 360;
        currentCalcHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calculator-height')) || 500;
    } catch (e) { console.warn("Could not read initial calc size."); }
    let selectionRange = null;

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
    const toggleBtn = document.getElementById('question-nav-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const selectionToolbar = document.getElementById('selection-toolbar');

    // +++ NEW: SAT SCORING CONVERSION TABLES +++
    // Based on the provided PDF (Digital SAT, non-adaptive)
    // Table for Reading & Writing (54 total questions)
    const rwScoreTable = {
        0: 200, 1: 200, 2: 200, 3: 210, 4: 220, 5: 230, 6: 240, 7: 250, 8: 260, 9: 280,
        10: 290, 11: 300, 12: 310, 13: 320, 14: 330, 15: 340, 16: 350, 17: 360, 18: 370,
        19: 380, 20: 390, 21: 400, 22: 410, 23: 420, 24: 430, 25: 440, 26: 450, 27: 460,
        28: 470, 29: 480, 30: 490, 31: 500, 32: 510, 33: 510, 34: 520, 35: 530, 36: 540,
        37: 550, 38: 560, 39: 570, 40: 580, 41: 590, 42: 600, 43: 610, 44: 630, 45: 640,
        46: 650, 47: 670, 48: 680, 49: 690, 50: 710, 51: 730, 52: 740, 53: 760, 54: 800
    };
    // Table for Math (44 total questions)
    const mathScoreTable = {
        0: 200, 1: 200, 2: 210, 3: 220, 4: 240, 5: 260, 6: 280, 7: 300, 8: 330, 9: 350,
        10: 360, 11: 380, 12: 390, 13: 410, 14: 430, 15: 440, 16: 460, 17: 470, 18: 490,
        19: 500, 20: 520, 21: 530, 22: 540, 23: 560, 24: 570, 25: 590, 26: 600, 27: 620,
        28: 630, 29: 640, 30: 660, 31: 670, 32: 690, 33: 700, 34: 720, 35: 730, 36: 750,
        37: 760, 38: 780, 39: 790, 40: 800, 41: 800, 42: 800, 43: 800, 44: 800
    };

    // --- Core Test Functions ---
    // [fetchAndGroupQuestions, startModule, renderAllMath, renderQuestion, renderOptions, updateUI, populateModalGrid, updateModalGridHighlights, startTimer]
    // ... (These functions remain exactly the same as the previous version) ...
    // --- [Start of Collapsed Core Functions] ---
    async function fetchAndGroupQuestions(id) {
        try {
            // Fetch test name first
            const testDoc = await db.collection('tests').doc(id).get();
            if (testDoc.exists) {
                testName = testDoc.data().name || "Practice Test";
            }
            
            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            allQuestionsByModule = [[], [], [], []];
            if (questionsSnapshot.empty) {
                console.warn("No questions found.");
                if(questionPaneContent) questionPaneContent.innerHTML = "<p>No questions available for this test.</p>";
                if(nextBtn) nextBtn.disabled = true; if(backBtn) backBtn.disabled = true; return;
            }
            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                if (question.module >= 1 && question.module <= 4) allQuestionsByModule[question.module - 1].push(question);
            });
            allQuestionsByModule.forEach(module => module.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0)));
        } catch (error) { console.error("Error fetching/grouping questions: ", error); if(questionPaneContent) questionPaneContent.innerHTML = "<p>Error loading questions.</p>"; }
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
        if (highlighterBtn) { highlighterBtn.style.display = 'none'; }
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
    // --- [End of Collapsed Core Functions] ---

    /**
     * +++ NEW SCORING ALGORITHM +++
     * Calculates the scaled SAT score based on raw scores from R&W and Math sections.
     * @returns {object} An object with totalScore, rwScore, mathScore, rwRaw, and mathRaw.
     */
    function calculateScore() {
        let rwRaw = 0;
        let mathRaw = 0;

        // Calculate R&W Raw Score (Modules 1 & 2)
        const rwQuestions = [...allQuestionsByModule[0], ...allQuestionsByModule[1]];
        rwQuestions.forEach(question => {
            if (question && question.id && userAnswers[question.id] === question.correctAnswer) {
                rwRaw++;
            }
        });

        // Calculate Math Raw Score (Modules 3 & 4)
        const mathQuestions = [...allQuestionsByModule[2], ...allQuestionsByModule[3]];
        mathQuestions.forEach(question => {
            if (question && question.id && userAnswers[question.id] === question.correctAnswer) {
                mathRaw++;
            }
        });

        // Convert Raw Scores to Scaled Scores using lookup tables
        // Use ?? 200 to default to minimum score if raw score is not in table (e.g., -1)
        const rwScore = rwScoreTable[rwRaw] ?? 200;
        const mathScore = mathScoreTable[mathRaw] ?? 200;

        // Total score is sum, minimum 400
        const totalScore = rwScore + mathScore; // This will naturally be at least 400

        console.log(`Scoring: R&W Raw: ${rwRaw}/${rwQuestions.length} -> ${rwScore}`);
        console.log(`Scoring: Math Raw: ${mathRaw}/${mathQuestions.length} -> ${mathScore}`);
        console.log(`Total Score: ${totalScore}`);

        return {
            totalScore: totalScore,
            rwScore: rwScore,
            mathScore: mathScore,
            rwRaw: rwRaw,
            mathRaw: mathRaw,
            rwTotal: rwQuestions.length,
            mathTotal: mathQuestions.length
        };
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

    /**
     * +++ MODIFIED FINISH TEST FUNCTION +++
     * Saves the test result to Firestore and redirects to the results page.
     */
    async function finishTest() {
        console.log("Finishing test...");
        clearInterval(timerInterval);
        
        const user = auth.currentUser;
        if (!user) {
            alert("You are not logged in. Cannot save results.");
            window.location.href = 'index.html';
            return;
        }

        // 1. Show loading state on button
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.textContent = "Saving...";
        }
        if (modalProceedBtn) {
             modalProceedBtn.disabled = true;
             modalProceedBtn.textContent = "Saving...";
        }
        
        // Hide modal if it's open
        toggleModal(false);

        try {
            // 2. Calculate score
            const scoreResult = calculateScore();

            // 3. Create result ID (user UID + test ID)
            const resultId = `${user.uid}_${testId}`;
            const resultRef = db.collection('testResults').doc(resultId);

            // 4. Create result data object
            const resultData = {
                userId: user.uid,
                testId: testId,
                testName: testName, // We fetched this in initTest
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                
                totalScore: scoreResult.totalScore,
                rwScore: scoreResult.rwScore,
                mathScore: scoreResult.mathScore,
                
                rwRaw: scoreResult.rwRaw,
                mathRaw: scoreResult.mathRaw,
                rwTotal: scoreResult.rwTotal,
                mathTotal: scoreResult.mathTotal,
                
                userAnswers: userAnswers, // Save all user answers
                // Save all questions for review page.
                allQuestions: allQuestionsByModule.flat() // Flatten array for easier iteration
            };

            // 5. Save to testResults collection
            await resultRef.set(resultData);
            console.log("Test result saved successfully to testResults:", resultId);

            // 6. Update the user's "completedTests" subcollection for the dashboard
            const userTestRef = db.collection('users').doc(user.uid).collection('completedTests').doc(testId);
            await userTestRef.set({
                score: scoreResult.totalScore,
                completedAt: resultData.completedAt, // Use the same timestamp
                resultId: resultId // Link to the full result doc
            });
            console.log("User's completedTests subcollection updated.");

            // 7. Redirect to the new results page
            window.location.href = `results.html?resultId=${resultId}`;

        } catch (error) {
            console.error("Error finishing test and saving results:", error);
            alert("An error occurred while saving your results. Please try again.");
            // Re-enable buttons if save failed
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.textContent = "Finish Module";
            }
             if (modalProceedBtn) {
                 modalProceedBtn.disabled = false;
                 modalProceedBtn.textContent = "Finish Test and See Results";
            }
        }
    }

    function toggleModal(show) {
        if (!modal || !backdrop) return;
        const shouldShow = typeof show === 'boolean' ? show : !modal.classList.contains('visible');
        if (shouldShow) {
            const header = modal.querySelector('.modal-header h4');
            if (header) {
                const type = currentModuleIndex < 2 ? "Reading & Writing" : "Math";
                const numDisp = (currentModuleIndex % 2) + 1; // 0->1, 1->2, 2->1, 3->2
                const sectionNumberDisplay = currentModuleIndex < 2 ? 1 : 2; // 0,1 -> 1; 2,3 -> 2
                header.textContent = `Section ${sectionNumberDisplay}, Module ${numDisp}: ${type} Questions`;
            }
            updateModalGridHighlights();
        } else { if (modalProceedBtn) modalProceedBtn.style.display = 'none'; }
        modal.classList.toggle('visible', shouldShow);
        backdrop.classList.toggle('visible', shouldShow);
        if(toggleBtn) toggleBtn.classList.toggle('open', shouldShow);
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


    // --- Custom Selection Toolbar Functions ---
    // (showSelectionToolbar, hideSelectionToolbar, applyFormat)
    // --- [Start of Collapsed Toolbar Functions] ---
    function showSelectionToolbar() {
        if (!selectionToolbar || !selectionRange) return;
        const rect = selectionRange.getBoundingClientRect();
        const mainRect = testMain.getBoundingClientRect();
        let top = rect.top - mainRect.top - selectionToolbar.offsetHeight - 5;
        let left = rect.left - mainRect.left + (rect.width / 2) - (selectionToolbar.offsetWidth / 2);
        top = Math.max(0, top);
        left = Math.max(0, Math.min(left, mainRect.width - selectionToolbar.offsetWidth));
        selectionToolbar.style.top = `${top}px`;
        selectionToolbar.style.left = `${left}px`;
        selectionToolbar.classList.add('visible');
    }
    function hideSelectionToolbar() {
        if (selectionToolbar) selectionToolbar.classList.remove('visible');
        selectionRange = null;
    }
    function applyFormat(command, value = null) {
        if (command === 'dismiss') {
             hideSelectionToolbar();
             window.getSelection().removeAllRanges();
             return;
        }
        if (!selectionRange) return;
        try {
            if (command === 'clearformat') {
                const content = selectionRange.extractContents();
                const wrappersToRemove = content.querySelectorAll('.custom-format-wrapper, .custom-underline, .highlight-yellow, .highlight-blue, .highlight-green');
                wrappersToRemove.forEach(wrap => wrap.replaceWith(...wrap.childNodes)); 
                selectionRange.insertNode(content);
            } else {
                const wrapper = document.createElement('span');
                if (command === 'highlight') wrapper.classList.add(value);
                else if (command === 'underline') wrapper.classList.add('custom-underline');
                wrapper.appendChild(selectionRange.extractContents());
                selectionRange.insertNode(wrapper);
                const parent = wrapper.parentNode;
                if (parent && parent.nodeName === 'SPAN' && parent.className === wrapper.className) {
                    parent.replaceChild(wrapper.firstChild, wrapper);
                    parent.normalize();
                }
            }
        } catch (e) { console.warn("Could not apply format:", e); }
        window.getSelection().removeAllRanges();
        hideSelectionToolbar();
    }
    // --- [End of Collapsed Toolbar Functions] ---


    /** Main initialization function. */
    async function initTest() {
        console.log("Init test...");
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');
        if (!testId) { console.error("No Test ID in URL."); document.body.innerHTML = '<h1>Error: No Test ID.</h1>'; return; }
        if (userNameDisp) { try {const user = auth.currentUser; userNameDisp.textContent = user?.displayName || 'Student';} catch(e){} }
        
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
    if (toggleBtn) { toggleBtn.addEventListener('click', () => { if (modalProceedBtn) modalProceedBtn.style.display = 'none'; toggleModal(true); }); }
    if (closeModalBtn) { closeModalBtn.addEventListener('click', () => toggleModal(false)); }
    if (backdrop) { backdrop.addEventListener('click', () => toggleModal(false)); }
    if (nextBtn) { nextBtn.addEventListener('click', () => { const currentQs = allQuestionsByModule[currentModuleIndex] || []; if (currentQuestionIndex < currentQs.length - 1) { currentQuestionIndex++; renderQuestion(currentQuestionIndex); } else { showReviewScreen(true); } }); }
    if (backBtn) { backBtn.addEventListener('click', () => { if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(currentQuestionIndex); } }); }
    if (questionPaneContent) {
        questionPaneContent.addEventListener('change', (e) => {
            if (e.target.type === 'radio' && e.target.name) { userAnswers[e.target.name] = e.target.value; const wrapper = e.target.closest('.option-wrapper'); if (wrapper) { wrapper.classList.remove('stricken-through'); e.target.disabled = false; } updateModalGridHighlights(); }
            if (e.target.classList.contains('fill-in-input')) { const qId = e.target.dataset.questionId; if (qId) { userAnswers[qId] = e.target.value.trim(); updateModalGridHighlights(); } }
        });
        questionPaneContent.addEventListener('click', (e) => {
            const strikeBtn = e.target.closest('.strikethrough-btn'); if (!strikeBtn) return; e.preventDefault(); e.stopPropagation(); const wrapper = strikeBtn.closest('.option-wrapper'); const radio = wrapper?.querySelector('input[type="radio"]'); if (!wrapper || !radio) return; const isStriking = !wrapper.classList.contains('stricken-through'); wrapper.classList.toggle('stricken-through', isStriking); radio.disabled = isStriking; if (isStriking && radio.checked) { radio.checked = false; const qId = radio.name; if (userAnswers[qId] === radio.value) { delete userAnswers[qId]; updateModalGridHighlights(); } }
        });
    }
    document.body.addEventListener('change', (e) => {
        if (!e.target.classList.contains('mark-review-checkbox')) return; const qId = e.target.dataset.questionId; if (!qId) return; if (e.target.checked) markedQuestions[qId] = true; else delete markedQuestions[qId]; updateModalGridHighlights();
    });
    if (modalProceedBtn) {
        modalProceedBtn.addEventListener('click', () => { toggleModal(false); const nextIdx = findNextNonEmptyModule(currentModuleIndex + 1); if (nextIdx !== -1) startModule(nextIdx); else finishTest(); });
    }
    if (highlighterBtn) { highlighterBtn.style.display = 'none'; }
    if (calculatorBtn) { calculatorBtn.addEventListener('click', () => { if (currentModuleIndex >= 2) toggleCalculator(); }); }
    if (closeCalculatorBtn) { closeCalculatorBtn.addEventListener('click', () => toggleCalculator(false)); }
    if (calculatorHeader) { calculatorHeader.addEventListener('mousedown', startDrag); }
    if (calcResizeHandle) { calcResizeHandle.addEventListener('mousedown', startResize); }
    if (calcSizeToggleBtn) { calcSizeToggleBtn.addEventListener('click', () => toggleMaximizeCalculator()); }
    
    // Custom Toolbar Listeners
    document.body.addEventListener('mouseup', (e) => {
        if (e.target.closest('#selection-toolbar')) return;
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                 const range = selection.getRangeAt(0);
                 const targetPane = range.commonAncestorContainer.parentNode.closest('.stimulus-pane .pane-content, .question-pane .pane-content');
                 if (targetPane) {
                     selectionRange = range.cloneRange();
                     window.getSelection().removeAllRanges();
                     showSelectionToolbar();
                 } else { hideSelectionToolbar(); }
            } else { hideSelectionToolbar(); }
        }, 1);
    }, { capture: true });
    document.body.addEventListener('mousedown', (e) => {
         if (e.target.closest('#selection-toolbar')) { e.preventDefault(); e.stopPropagation(); return; }
        hideSelectionToolbar();
    }, { capture: true });
    document.body.addEventListener('contextmenu', (e) => {
        const targetPane = e.target.closest('.stimulus-pane .pane-content, .question-pane .pane-content');
        if (targetPane) e.preventDefault();
    });
    document.body.addEventListener('copy', (e) => {
         const targetPane = e.target.closest('.stimulus-pane .pane-content, .question-pane .pane-content');
         if (targetPane) e.preventDefault();
    });
    if (selectionToolbar) {
        selectionToolbar.addEventListener('mousedown', (e) => {
            const button = e.target.closest('button');
            if (button) {
                 e.preventDefault(); e.stopPropagation();
                const command = button.dataset.command;
                const value = button.dataset.value || null;
                if (command && selectionRange) applyFormat(command, value);
            }
        });
    }

    // --- Initial Load ---
    initTest();

}); // --- END OF DOMContentLoaded ---

