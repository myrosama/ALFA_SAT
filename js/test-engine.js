// js/test-engine.js - Implement SAT Scoring and Result Saving
// ... existing comments ...
// UPDATED: To add fullscreen prompt on test start.
// FIXED: Timer now pauses on fullscreen exit and resumes on re-entry.
// FIXED: Added clearInterval to prevent double-timer bug.
// FIXED: Fullscreen button IDs now match the HTML.

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
    let currentTimerSeconds = 0; // +++ ADDED: To track remaining time
    const moduleTimers = [32 * 60, 32 * 60, 35 * 60, 35 * 60]; // 32, 32, 35, 35 minutes in seconds
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

    // +++ Proctored Mode State +++
    let proctorCode = null; // Set from URL param if present
    let fullscreenExitCount = 0;
    let testReady = false; // Flag: true once questions are loaded

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

    // +++ ADDED: Fullscreen Modal Elements +++
    const fullscreenPrompt = document.getElementById('fullscreen-prompt');
    const fullscreenBtn = document.getElementById('enter-fullscreen-btn');
    const proceedBtn = document.getElementById('proceed-without-fullscreen');
    const testWrapper = document.getElementById('test-wrapper');
    const fullscreenPromptTitle = document.getElementById('fullscreen-prompt-title');
    const fullscreenPromptDesc = document.getElementById('fullscreen-prompt-desc');
    const fullscreenLoadingSpinner = document.getElementById('fullscreen-loading-spinner');
    // +++ END of Fullscreen Elements +++


    // +++ NEW SCORING CONVERSION TABLES +++
    // Based on the provided PDF (Digital SAT, non-adaptive)
    // Table for Reading & Writing (54 total questions)
    const rwScoreTable = {
        0: 200, 1: 200, 2: 200, 3: 210, 4: 220, 5: 230, 6: 240, 7: 250, 8: 260, 9: 280,
        10: 290, 11: 300, 12: 310, 13: 320, 14: 330, 15: 340, 16: 350, 17: 360, 18: 370,
        19: 380, 20: 390, 21: 400, 22: 410, 23: 420, 24: 430, 25: 440, 26: 450, 27: 460,
        28: 470, 29: 480, 30: 490, 31: 500, 32: 510, 33: 510, 34: 520, 35: 530, 36: 540,
        37: 550, 38: 560, 39: 570, 40: 580, 41: 590, 42: 600, 43: 620, 44: 640, 45: 660,
        46: 670, 47: 690, 48: 700, 49: 720, 50: 740, 51: 760, 52: 770, 53: 790, 54: 800
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
    async function fetchAndGroupQuestions(id) {
        try {
            // Fetch test name first
            const testDoc = await db.collection('tests').doc(id).get();
            if (testDoc.exists) {
                testName = testDoc.data().name || "Practice Test";
            }
            console.log(`Fetching questions for test ID: ${id}`);

            const questionsSnapshot = await db.collection('tests').doc(id).collection('questions').get();
            console.log(`Fetched ${questionsSnapshot.size} questions.`);
            allQuestionsByModule = [[], [], [], []];
            if (questionsSnapshot.empty) {
                console.warn("No questions found.");
                if (questionPaneContent) questionPaneContent.innerHTML = "<p>No questions available for this test.</p>";
                if (stimulusPaneContent) stimulusPaneContent.innerHTML = "";
                if (nextBtn) nextBtn.disabled = true; if (backBtn) backBtn.disabled = true; return;
            }
            questionsSnapshot.forEach(doc => {
                const question = { id: doc.id, ...doc.data() };
                if (question.module >= 1 && question.module <= 4) allQuestionsByModule[question.module - 1].push(question);
            });
            allQuestionsByModule.forEach(module => module.sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0)));

            // +++ IMAGE PRELOADING: Cache all images as blob URLs +++
            await preloadAllImages();

        } catch (error) { console.error("Error fetching/grouping questions: ", error); if (questionPaneContent) questionPaneContent.innerHTML = "<p>Error loading questions.</p>"; }
    }

    /**
     * Preloads all images from questions.
     * 1. Resolves any tg://file_id URLs to fresh download URLs (with localStorage caching)
     * 2. Browser-caches all resolved URLs via Image() elements
     */
    async function preloadAllImages() {
        const allQuestions = allQuestionsByModule.flat();

        // Update loading screen
        if (fullscreenPromptTitle) fullscreenPromptTitle.textContent = 'Loading Test Resources...';
        if (fullscreenPromptDesc) fullscreenPromptDesc.textContent = 'Resolving images...';

        // Step 1: Resolve all tg:// URLs using the shared utility (with localStorage cache)
        await TelegramImages.resolveAllTelegramUrls(allQuestions, (loaded, total) => {
            if (fullscreenPromptDesc) {
                fullscreenPromptDesc.textContent = `Resolving images: ${loaded} / ${total}`;
            }
        });

        // Step 2: Collect all image URLs (now resolved) for browser pre-caching
        const allUrls = TelegramImages.collectImageUrls(allQuestions);
        const uniqueUrls = [...allUrls];

        if (uniqueUrls.length === 0) {
            console.log('No images to preload.');
            return;
        }

        console.log(`Browser-caching ${uniqueUrls.length} images...`);
        if (fullscreenPromptDesc) fullscreenPromptDesc.textContent = `Downloading images: 0 / ${uniqueUrls.length}`;

        let loaded = 0;
        let failed = 0;
        const BATCH_SIZE = 5;

        for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
            const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(url => new Promise(resolve => {
                const img = new Image();
                img.onload = () => { loaded++; resolve(); };
                img.onerror = () => { failed++; loaded++; resolve(); };
                img.src = url;
                setTimeout(() => { failed++; loaded++; resolve(); }, 15000);
            })));

            if (fullscreenPromptDesc) {
                fullscreenPromptDesc.textContent = `Downloading images: ${loaded} / ${uniqueUrls.length}`;
            }

            if (i + BATCH_SIZE < uniqueUrls.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        console.log(`Image preload complete: ${loaded - failed} success, ${failed} failed.`);
    }
    function startModule(moduleIndex) {
        currentModuleIndex = moduleIndex;
        currentQuestionIndex = 0; // ALWAYS start a new module at Q 0
        currentTimerSeconds = 0; // ALWAYS reset timer for a new module

        if (isCalculatorVisible) toggleCalculator(false);
        const currentModuleQuestions = allQuestionsByModule[currentModuleIndex] || [];
        if (currentModuleQuestions.length === 0) {
            const nextNonEmpty = findNextNonEmptyModule(moduleIndex + 1);
            if (nextNonEmpty !== -1) startModule(nextNonEmpty); else finishTest();
            return;
        }
        const isMathModuleStart = moduleIndex >= 2;
        if (testMain) testMain.classList.toggle('math-layout-active', isMathModuleStart);
        populateModalGrid();
        renderQuestion(currentQuestionIndex);

        // +++ Proctored: Track module change +++
        if (proctorCode && auth.currentUser) {
            db.collection('proctoredSessions').doc(proctorCode)
                .collection('participants').doc(auth.currentUser.uid)
                .update({ currentModule: moduleIndex + 1 })
                .catch(err => console.warn('Could not update module:', err));
        }

        const timerDuration = moduleTimers[currentModuleIndex] > 0 ? moduleTimers[currentModuleIndex] : 1800;
        startTimer(timerDuration);
    }
    function renderAllMath() {
        try {
            document.querySelectorAll('.ql-formula').forEach(span => {
                const latex = span.dataset.value;
                if (!latex) return;

                // If the span already contains KaTeX-rendered content (from editor save), skip it
                if (span.querySelector('.katex')) return;

                // Otherwise, render with MathQuill
                if (MQ && span) {
                    MQ.StaticMath(span).latex(latex);
                } else {
                    span.textContent = `[Math: ${latex}]`;
                }
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
        if (testMain) testMain.classList.toggle('math-layout-active', isMath);
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
            const imgHTML = question.imageUrl ? `<img src="${question.imageUrl}" alt="Stimulus Image" style="width: ${question.imageWidth || '100%'};" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<p style=\\'color:#999;text-align:center;padding:20px;\\'>Image could not be loaded</p>');">` : '';
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
        if (question.format === 'fill-in') { const savedVal = userAnswers[question.id] || ''; return `<div><input type="text" class="fill-in-input" data-question-id="${question.id}" placeholder="Type your answer here" value="${savedVal}" maxlength="6"></div>`; }
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

    /**
     * Starts the timer for a given duration in seconds.
     * Includes: persistent save every 10s, visual+audio warnings at 5min and 1min.
     * @param {number} duration - The total time for the timer.
     */
    function startTimer(duration) {
        if (typeof duration !== 'number' || duration <= 0) {
            // Timer expired — auto-advance immediately
            if (timerDisplay) timerDisplay.textContent = "00:00";
            clearInterval(timerInterval);
            timerInterval = null;
            console.log('Timer expired (duration <= 0), auto-advancing...');
            saveTestState();
            const nextIdx = findNextNonEmptyModule(currentModuleIndex + 1);
            if (nextIdx !== -1) {
                startModule(nextIdx);
            } else {
                finishTest();
            }
            return;
        }

        let timer = duration;
        let warned5min = duration <= 300; // Don't re-warn if already under 5min
        let warned1min = duration <= 60;

        clearInterval(timerInterval);
        currentTimerSeconds = timer;

        if (!timerDisplay) return;

        timerInterval = setInterval(() => {
            let mins = Math.floor(timer / 60);
            let secs = timer % 60;
            timerDisplay.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

            // Visual styling for low time
            if (timer <= 60) {
                timerDisplay.style.color = '#e74c3c';
                timerDisplay.style.fontWeight = '700';
                if (timer % 2 === 0) timerDisplay.style.opacity = '1';
                else timerDisplay.style.opacity = '0.6'; // Pulse effect
            } else if (timer <= 300) {
                timerDisplay.style.color = '#f39c12';
                timerDisplay.style.fontWeight = '600';
                timerDisplay.style.opacity = '1';
            } else {
                timerDisplay.style.color = '';
                timerDisplay.style.fontWeight = '';
                timerDisplay.style.opacity = '1';
            }

            // 5-minute warning
            if (!warned5min && timer === 300) {
                warned5min = true;
                showTimerWarning('5 minutes remaining!', '#f39c12');
                playWarningBeep(2);
            }

            // 1-minute warning
            if (!warned1min && timer === 60) {
                warned1min = true;
                showTimerWarning('1 minute remaining!', '#e74c3c');
                playWarningBeep(3);
            }

            currentTimerSeconds = --timer;

            // Persist timer every 10 seconds
            if (timer % 10 === 0) {
                saveTestState();
            }

            if (timer < 0) {
                clearInterval(timerInterval);
                timerDisplay.style.opacity = '1';
                // Close review modal if it's open
                toggleModal(false);
                // Auto-advance: silently move to next module or finish
                saveTestState();
                const nextIdx = findNextNonEmptyModule(currentModuleIndex + 1);
                if (nextIdx !== -1) {
                    startModule(nextIdx);
                } else {
                    finishTest();
                }
            }
        }, 1000);
    }

    /** Shows a temporary warning banner at the top of the test area */
    function showTimerWarning(message, color) {
        const existing = document.getElementById('timer-warning-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'timer-warning-banner';
        banner.innerHTML = `<i class="fa-solid fa-clock"></i> ${message}`;
        banner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; z-index: 10000;
            background: ${color}; color: white; text-align: center;
            padding: 10px 20px; font-weight: 700; font-size: 1rem;
            font-family: 'Poppins', sans-serif;
            animation: slideDown 0.3s ease;
        `;

        // Add animation keyframes if not already present
        if (!document.getElementById('timer-warning-styles')) {
            const style = document.createElement('style');
            style.id = 'timer-warning-styles';
            style.textContent = `
                @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(banner);

        // Auto-dismiss after 4 seconds
        setTimeout(() => {
            if (banner.parentNode) {
                banner.style.transition = 'opacity 0.5s';
                banner.style.opacity = '0';
                setTimeout(() => banner.remove(), 500);
            }
        }, 4000);
    }

    /** Plays a warning beep using Web Audio API (no external files needed) */
    function playWarningBeep(count) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.frequency.value = 880; // A5 note
                    osc.type = 'sine';
                    gain.gain.value = 0.3;
                    osc.start(audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
                    osc.stop(audioCtx.currentTime + 0.3);
                }, i * 400);
            }
        } catch (e) {
            // Audio not available — visual warning still works
        }
    }

    /**
     * Finishes the current module, saves state, and shows the review screen.
     * @param {boolean} [isEndOfModule=false] - True if called automatically by timer.
     */
    function showReviewScreen(isEndOfModule = false) {
        // Don't kill the timer here — let it keep running so auto-advance fires at 00:00.
        // The timer auto-advance at line 414 handles the actual module transition.
        if (modalProceedBtn) {
            const nextNonEmpty = findNextNonEmptyModule(currentModuleIndex + 1);
            modalProceedBtn.textContent = (nextNonEmpty === -1) ? `Finish Test and See Results` : `Continue to Next Module`;
            // Always show the proceed button so user can advance manually
            modalProceedBtn.style.display = 'inline-block';
        }
        toggleModal(true);
    }
    function findNextNonEmptyModule(startIndex) {
        for (let i = startIndex; i < allQuestionsByModule.length; i++) { if (allQuestionsByModule[i]?.length > 0) return i; }
        return -1;
    }

    // --- Answer Equivalence Helpers (for free-response / fill-in questions) ---
    function parseMathValue(str) {
        // Handle fractions like "3/4" or "-1/2"
        const fractionMatch = str.match(/^(-?\d+)\s*\/\s*(\d+)$/);
        if (fractionMatch) {
            const denom = parseFloat(fractionMatch[2]);
            if (denom === 0) return null;
            return parseFloat(fractionMatch[1]) / denom;
        }
        // Handle decimals like ".75", "0.75", "-3"
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    }

    function areAnswersEquivalent(userAns, correctAns) {
        if (!userAns && !correctAns) return true;
        if (!userAns || !correctAns) return false;

        // Support multiple correct answers separated by commas (e.g. "-0.4, -2/5")
        const possibleAnswers = correctAns.split(',').map(a => a.trim()).filter(a => a.length > 0);

        const u = userAns.trim().toLowerCase();

        for (const ans of possibleAnswers) {
            const c = ans.toLowerCase();
            // 1. Exact match
            if (u === c) return true;
            // 2. Numeric equivalence (handles 3/4 vs 0.75, .5 vs 1/2, etc.)
            const uNum = parseMathValue(u);
            const cNum = parseMathValue(c);
            if (uNum !== null && cNum !== null && Math.abs(uNum - cNum) < 0.0001) return true;
        }
        return false;
    }

    /**
     * +++ MODIFIED FINISH TEST FUNCTION +++
     * Calculates the scaled SAT score based on raw scores from R&W and Math sections.
     * @returns {object} An object with totalScore, rwScore, mathScore, rwRaw, and mathRaw.
     */
    function calculateScore() {
        let rwRaw = 0;
        let mathRaw = 0;

        // Calculate R&W Raw Score (Modules 1 & 2)
        const rwQuestions = [...allQuestionsByModule[0], ...allQuestionsByModule[1]];
        rwQuestions.forEach(question => {
            if (!question || !question.id) return;
            const ua = userAnswers[question.id];
            if (question.format === 'fill-in') {
                // Use smart equivalence check for fill-in (handles fractions, decimals, etc.)
                const correctFillIn = question.fillInAnswer ? question.fillInAnswer.replace(/<[^>]*>/g, '').trim() : null;
                if (correctFillIn && areAnswersEquivalent(ua, correctFillIn)) rwRaw++;
            } else {
                if (ua === question.correctAnswer) rwRaw++;
            }
        });

        // Calculate Math Raw Score (Modules 3 & 4)
        const mathQuestions = [...allQuestionsByModule[2], ...allQuestionsByModule[3]];
        mathQuestions.forEach(question => {
            if (!question || !question.id) return;
            const ua = userAnswers[question.id];
            if (question.format === 'fill-in') {
                const correctFillIn = question.fillInAnswer ? question.fillInAnswer.replace(/<[^>]*>/g, '').trim() : null;
                if (correctFillIn && areAnswersEquivalent(ua, correctFillIn)) mathRaw++;
            } else {
                if (ua === question.correctAnswer) mathRaw++;
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

        // Build result ID before try block so it's accessible in catch for redirect
        const resultId = proctorCode
            ? `${user.uid}_${testId}_${proctorCode}`
            : `${user.uid}_${testId}`;

        try {
            // +++ ADDED: Clear saved state on finish +++
            const key = `inProgressTest_${auth.currentUser.uid}_${testId}`;
            localStorage.removeItem(key);

            // 2. Calculate score
            const scoreResult = calculateScore();

            // 3. Use result ID built above
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
                proctorCode: proctorCode || null, // Store proctor code for access control
                scoringStatus: proctorCode ? 'pending_review' : 'published'
                // Note: Questions are NOT stored here to avoid exceeding Firestore's 1MB limit.
                // The results page fetches questions directly from the test document.
            };

            // 5. Save to testResults collection
            await resultRef.set(resultData);
            console.log("Test result saved successfully to testResults:", resultId);

            // 6. Update the user's "completedTests" subcollection for the dashboard
            const userTestRef = db.collection('users').doc(user.uid).collection('completedTests').doc(testId);
            await userTestRef.set({
                score: scoreResult.totalScore,
                completedAt: resultData.completedAt,
                resultId: resultId,
                proctorCode: proctorCode || null,
                scoringStatus: proctorCode ? 'pending_review' : 'published',
                testName: testName || 'Practice Test'
            });
            console.log("User's completedTests subcollection updated.");

            // +++ Proctored Mode: Mark participant as completed +++
            if (proctorCode) {
                try {
                    await db.collection('proctoredSessions').doc(proctorCode)
                        .collection('participants').doc(user.uid)
                        .update({
                            status: 'completed',
                            score: scoreResult.totalScore,
                            rwScore: scoreResult.rwScore,
                            mathScore: scoreResult.mathScore,
                            completedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    console.log('Proctored participant marked as completed.');
                } catch (err) {
                    console.warn('Could not update proctored participant completion:', err);
                }
            }

            // 7. Remove beforeunload to prevent "leave page" dialog
            window.removeEventListener('beforeunload', saveTestState);

            // 8. Redirect based on test type
            if (proctorCode) {
                // PROCTORED: Show submission complete page (results released later)
                window.location.href = `results.html?resultId=${resultId}&submitted=true`;
            } else {
                // NORMAL: Show results immediately
                window.location.href = `results.html?resultId=${resultId}`;
            }

        } catch (error) {
            console.error("Error finishing test and saving results:", error);

            // Even if Firestore save fails, try to redirect so student isn't stuck
            if (error.code === 'permission-denied' || error.message?.includes('permissions')) {
                alert("Your results could not be saved due to a server configuration issue. Please contact your instructor. Redirecting...");
                // Still try to redirect — at least the student isn't stuck
                window.removeEventListener('beforeunload', saveTestState);
                if (proctorCode) {
                    window.location.href = `results.html?resultId=${resultId}&submitted=true&saveError=true`;
                } else {
                    window.location.href = `results.html?resultId=${resultId}&saveError=true`;
                }
            } else {
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
        if (toggleBtn) toggleBtn.classList.toggle('open', shouldShow);
    }


    // --- Calculator Specific Functions ---
    // (toggleCalculator, updateContentMargin, startDrag, dragMove, stopDrag,
    // startResize, resizeMove, stopResize, toggleMaximizeCalculator)
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
                if (existingIframe) calculatorContainer.removeChild(existingIframe);
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
        if (calculatorContainer) {
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
        if (calculatorContainer) {
            calculatorContainer.classList.remove('resizing'); // Re-enable iframe events
            calculatorContainer.style.transition = ''; // Restore transitions from CSS
        }
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', resizeMove);
        document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
        document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
    }
    function toggleMaximizeCalculator() {
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
            if (calcSizeToggleBtn) calcSizeToggleBtn.title = isCalculatorMaximized ? "Restore Calculator Size" : "Maximize Calculator";
        });
    }


    // --- Custom Selection Toolbar Functions ---
    // (showSelectionToolbar, hideSelectionToolbar, applyFormat)
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
    function hideSelectionToolbar() {
        if (selectionToolbar) selectionToolbar.classList.remove('visible');
        selectionRange = null;
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


    // +++ NEW: Fullscreen Logic +++
    function requestFullScreen() {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => {
                console.warn(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else if (elem.mozRequestFullScreen) { /* Firefox */
            elem.mozRequestFullScreen();
        } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE/Edge */
            elem.msRequestFullscreen();
        }
    }

    function exitFullScreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) { /* Firefox */
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE/Edge */
            document.msExitFullscreen();
        }
    }

    function isFullscreen() {
        return document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;
    }

    function startTest() {
        // This function now just shows the test, assuming fullscreen is handled.
        if (!testReady) return; // +++ FIX: Don't start if questions aren't loaded yet
        if (fullscreenPrompt) fullscreenPrompt.style.display = 'none';
        if (testWrapper) testWrapper.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('visible');

        // +++ Proctored: Update status to 'taking' +++
        if (proctorCode && auth.currentUser) {
            db.collection('proctoredSessions').doc(proctorCode)
                .collection('participants').doc(auth.currentUser.uid)
                .update({ status: 'taking', currentModule: currentModuleIndex + 1 })
                .catch(err => console.warn('Could not update participant status:', err));
        }

        // +++ UPDATED: Smarter test start/resume logic +++
        if (timerInterval === null && currentTimerSeconds > 0) {
            renderQuestion(currentQuestionIndex);
            populateModalGrid();
            startTimer(currentTimerSeconds);
        } else if (allQuestionsByModule.flat().length > 0) {
            startModule(currentModuleIndex);
        }
    }

    function handleFullscreenChange() {
        if (!isFullscreen()) {
            // User exited fullscreen, show the prompt again
            if (fullscreenPrompt) fullscreenPrompt.style.display = 'flex';
            if (testWrapper) testWrapper.classList.add('hidden');
            if (backdrop) backdrop.classList.add('visible');
            if (fullscreenPromptTitle) fullscreenPromptTitle.textContent = 'Please Re-enter Fullscreen Mode';
            if (fullscreenPromptDesc) fullscreenPromptDesc.textContent = 'To continue your test, please return to fullscreen mode.';
            if (fullscreenLoadingSpinner) fullscreenLoadingSpinner.style.display = 'none';
            if (fullscreenBtn) fullscreenBtn.style.display = 'flex';
            if (proceedBtn) proceedBtn.style.display = 'block';

            // +++ Track fullscreen exit count for proctoring +++
            fullscreenExitCount++;
            if (proctorCode && auth.currentUser) {
                db.collection('proctoredSessions').doc(proctorCode)
                    .collection('participants').doc(auth.currentUser.uid)
                    .update({ fullscreenExitCount: fullscreenExitCount })
                    .catch(err => console.warn('Could not update exit count:', err));
            }

            // Pause the timer
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                saveTestState();
            }
        } else {
            // User entered fullscreen, start the test (or resume it)
            if (testReady) {
                startTest();
            }
        }
    }
    // +++ End of Fullscreen Logic +++

    // +++ NEW: Save/Load State Functions +++

    /**
     * Saves the current test state to localStorage.
     */
    function saveTestState() {
        if (!testId || !auth.currentUser) {
            // Don't save if test isn't loaded or user is logged out
            return;
        }
        const state = {
            moduleIndex: currentModuleIndex,
            questionIndex: currentQuestionIndex,
            answers: userAnswers,
            marked: markedQuestions,
            remainingTime: currentTimerSeconds
        };

        // Use a key specific to the test and user
        const key = `inProgressTest_${auth.currentUser.uid}_${testId}`;
        localStorage.setItem(key, JSON.stringify(state));
    }

    /**
     * Loads a test state from localStorage, if one exists.
     * @returns {boolean} True if state was loaded, false otherwise.
     */
    function loadTestState() {
        if (!testId || !auth.currentUser) {
            return false;
        }

        const key = `inProgressTest_${auth.currentUser.uid}_${testId}`;
        const savedState = localStorage.getItem(key);

        if (savedState) {
            try {
                const data = JSON.parse(savedState);
                currentModuleIndex = data.moduleIndex || 0;
                currentQuestionIndex = data.questionIndex || 0;
                userAnswers = data.answers || {};
                markedQuestions = data.marked || {};
                currentTimerSeconds = data.remainingTime || 0;

                console.log(`Resuming test "${testId}" at Module ${currentModuleIndex + 1}, Question ${currentQuestionIndex + 1} with ${currentTimerSeconds}s left.`);
                return true;
            } catch (e) {
                console.error("Error parsing saved test state:", e);
                localStorage.removeItem(key); // Clear corrupted data
                return false;
            }
        }
        return false; // No state found
    }
    // +++ END: Save/Load State Functions +++


    /** Main initialization function. */
    async function initTest() {
        console.log("Init test...");
        const urlParams = new URLSearchParams(window.location.search);
        testId = urlParams.get('id');
        proctorCode = urlParams.get('proctorCode') || null;
        if (!testId) { console.error("No Test ID in URL."); document.body.innerHTML = '<h1>Error: No Test ID.</h1>'; return; }

        // Show loading state immediately
        if (fullscreenPrompt) fullscreenPrompt.style.display = 'flex';
        if (fullscreenPromptTitle) fullscreenPromptTitle.textContent = 'Preparing Your Test...';
        if (fullscreenPromptDesc) fullscreenPromptDesc.textContent = 'Loading questions, please wait.';
        if (fullscreenLoadingSpinner) fullscreenLoadingSpinner.style.display = 'block';
        if (fullscreenBtn) fullscreenBtn.style.display = 'none';
        if (proceedBtn) proceedBtn.style.display = 'none';

        // Wait for auth to be ready
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                if (userNameDisp) { userNameDisp.textContent = user.displayName || 'Student'; }

                // +++ UPDATED: Load state AFTER we have user and testId +++
                loadTestState();

                // Fetch questions but don't start the test yet
                await fetchAndGroupQuestions(testId);

                // +++ Mark test as ready to prevent race condition +++
                testReady = true;

                // Switch from loading to ready state
                if (fullscreenPromptTitle) fullscreenPromptTitle.textContent = 'Ready to Begin';
                if (fullscreenPromptDesc) fullscreenPromptDesc.textContent = 'Enter fullscreen mode for the best test experience.';
                if (fullscreenLoadingSpinner) fullscreenLoadingSpinner.style.display = 'none';
                if (fullscreenBtn) fullscreenBtn.style.display = 'flex';
                if (proceedBtn) proceedBtn.style.display = 'block';

                // +++ Proctored Mode: Register participant (with re-entry guard) +++
                if (proctorCode && user) {
                    const participantRef = db.collection('proctoredSessions').doc(proctorCode)
                        .collection('participants').doc(user.uid);

                    // Re-entry guard: check if already completed (separate try/catch so
                    // registration still works even if the read is blocked by rules)
                    try {
                        const participantDoc = await participantRef.get();
                        if (participantDoc.exists && participantDoc.data().status === 'completed') {
                            alert('You have already completed this test. You cannot re-enter.');
                            window.location.href = 'dashboard.html';
                            return;
                        }
                    } catch (readErr) {
                        console.warn('Could not check participant status (likely permissions):', readErr.code || readErr);
                        // Continue anyway — registration is more important
                    }

                    // Register participant
                    try {
                        await participantRef.set({
                            userName: user.displayName || 'Student',
                            email: user.email || '',
                            status: 'waiting',
                            startedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            currentModule: 0,
                            fullscreenExitCount: 0,
                            score: null,
                            completedAt: null
                        }, { merge: true });
                        console.log('Proctored participant registered.');
                    } catch (writeErr) {
                        console.warn('Could not register proctored participant:', writeErr);
                    }
                }

                // Set up calculator defaults
                updateContentMargin();
                document.documentElement.style.setProperty('--calculator-width', `${currentCalcWidth}px`);
                document.documentElement.style.setProperty('--calculator-height', `${currentCalcHeight}px`);
                if (calculatorContainer) {
                    calculatorContainer.style.width = `${currentCalcWidth}px`;
                    calculatorContainer.style.height = `${currentCalcHeight}px`;
                    calculatorContainer.style.left = `${currentCalcLeft}px`;
                    calculatorContainer.style.top = `${currentCalcTop}px`;
                }
            } else {
                // Not logged in
                console.error("User is not logged in.");
                document.body.innerHTML = '<h1>Error: You must be logged in to take a test.</h1>';
            }
        });
    }


    // --- Event Listeners ---
    if (toggleBtn) { toggleBtn.addEventListener('click', () => { if (modalProceedBtn) modalProceedBtn.style.display = 'none'; toggleModal(true); }); }
    if (closeModalBtn) { closeModalBtn.addEventListener('click', () => toggleModal(false)); }
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            // Only hide the question modal, not the fullscreen prompt
            if (modal.classList.contains('visible')) {
                toggleModal(false);
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const currentQs = allQuestionsByModule[currentModuleIndex] || [];
            if (currentQuestionIndex < currentQs.length - 1) {
                currentQuestionIndex++;
                renderQuestion(currentQuestionIndex);
            } else {
                showReviewScreen(true);
            }
            saveTestState(); // +++ ADDED
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentQuestionIndex > 0) {
                currentQuestionIndex--;
                renderQuestion(currentQuestionIndex);
            }
            saveTestState(); // +++ ADDED
        });
    }
    if (questionPaneContent) {
        questionPaneContent.addEventListener('change', (e) => {
            if (e.target.type === 'radio' && e.target.name) {
                userAnswers[e.target.name] = e.target.value;
                const wrapper = e.target.closest('.option-wrapper');
                if (wrapper) { wrapper.classList.remove('stricken-through'); e.target.disabled = false; }
                updateModalGridHighlights();
                saveTestState(); // +++ ADDED
            }
            if (e.target.classList.contains('fill-in-input')) {
                const qId = e.target.dataset.questionId;
                if (qId) {
                    userAnswers[qId] = e.target.value.trim();
                    updateModalGridHighlights();
                    saveTestState(); // +++ ADDED
                }
            }
        });
        // +++ Fill-in character cap: 5 chars max, 6 if starts with '-' +++
        questionPaneContent.addEventListener('input', (e) => {
            if (e.target.classList.contains('fill-in-input')) {
                let val = e.target.value;
                const maxLen = val.startsWith('-') ? 6 : 5;
                if (val.length > maxLen) {
                    e.target.value = val.substring(0, maxLen);
                    val = e.target.value;
                }
                const qId = e.target.dataset.questionId;
                if (qId) {
                    userAnswers[qId] = val.trim();
                    updateModalGridHighlights();
                }
            }
        });
        questionPaneContent.addEventListener('click', (e) => {
            const strikeBtn = e.target.closest('.strikethrough-btn'); if (!strikeBtn) return; e.preventDefault(); e.stopPropagation(); const wrapper = strikeBtn.closest('.option-wrapper'); const radio = wrapper?.querySelector('input[type="radio"]'); if (!wrapper || !radio) return; const isStriking = !wrapper.classList.contains('stricken-through'); wrapper.classList.toggle('stricken-through', isStriking); radio.disabled = isStriking; if (isStriking && radio.checked) { radio.checked = false; const qId = radio.name; if (userAnswers[qId] === radio.value) { delete userAnswers[qId]; updateModalGridHighlights(); } }
        });
    }
    document.body.addEventListener('change', (e) => {
        if (!e.target.classList.contains('mark-review-checkbox')) return;
        const qId = e.target.dataset.questionId;
        if (!qId) return;
        if (e.target.checked) markedQuestions[qId] = true;
        else delete markedQuestions[qId];
        updateModalGridHighlights();
        saveTestState(); // +++ ADDED
    });
    if (modalProceedBtn) {
        modalProceedBtn.addEventListener('click', () => {
            console.log("Modal Proceed clicked.");
            toggleModal(false);
            const nextIdx = findNextNonEmptyModule(currentModuleIndex + 1);
            if (nextIdx !== -1) {
                startModule(nextIdx);
            } else {
                finishTest();
            }
            // Save is not needed here, as startModule/finishTest handle it
        });
    } else { console.warn("Modal Proceed Button missing."); }

    // OLD Highlighter button - now hidden by updateUI
    if (highlighterBtn) { highlighterBtn.style.display = 'none'; } // Explicitly hide old button
    if (calculatorBtn) { calculatorBtn.addEventListener('click', () => toggleCalculator()); } else { console.warn("Calculator Button missing."); }
    if (closeCalculatorBtn) { closeCalculatorBtn.addEventListener('click', () => { isCalculatorVisible = true; toggleCalculator(false); }); } else { console.warn("Close Calculator Button missing."); }
    if (calculatorHeader) { calculatorHeader.addEventListener('mousedown', startDrag); } else { console.warn("Calculator Header missing."); }
    if (calcResizeHandle) { calcResizeHandle.addEventListener('mousedown', startResize); } else { console.warn("Calculator Resize Handle missing."); }
    if (calcSizeToggleBtn) { calcSizeToggleBtn.addEventListener('click', () => toggleMaximizeCalculator()); } else { console.warn("Calculator Size Toggle Button missing."); }

    // Custom Toolbar Listeners
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

    // +++ ADDED: Fullscreen Event Listeners +++
    // This is where the fix is applied.
    // The variables 'fullscreenBtn' and 'proceedBtn' now correctly point
    // to the elements with IDs 'fullscreen-btn' and 'proceed-anyway-link'.
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', requestFullScreen);
    }
    if (proceedBtn) {
        proceedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Just start the test without fullscreen
            startTest();
        });
    }


    // Listen for changes in fullscreen state
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // +++ ADDED: Save state on tab close/reload +++
    window.addEventListener('beforeunload', saveTestState);

    // +++ END: Event Listeners +++


    // --- Initial Load ---
    initTest();

}); // --- END OF DOMContentLoaded ---