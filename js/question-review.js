// js/question-review.js - Logic for the single question review page
// OPTIMIZED: Uses reviewIndex from result doc for prev/next navigation.
// Only fetches the single requested question doc for full content.

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase ---
    const db = firebase.firestore();
    const auth = firebase.auth();
    const MQ = MathQuill.getInterface(2);

    // === HELPER FUNCTIONS ===

    /** Checks if a fill-in answer is correct. */
    function isFillinCorrect(userAns, fillInAnswer) {
        if (!userAns || !fillInAnswer) return false;
        const correct = fillInAnswer.replace(/<[^>]*>/g, '').trim();
        if (!correct) return false;
        const possibleAnswers = correct.split(',').map(a => a.trim()).filter(a => a);
        const u = userAns.trim().toLowerCase();
        for (const ans of possibleAnswers) {
            const c = ans.toLowerCase();
            if (u === c) return true;
            const frMatch = s => { const m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/); return m ? parseFloat(m[1]) / parseFloat(m[2]) : parseFloat(s); };
            const uN = frMatch(u), cN = frMatch(c);
            if (!isNaN(uN) && !isNaN(cN) && Math.abs(uN - cN) < 0.0001) return true;
        }
        return false;
    }

    function getFillinText(q) {
        return q.fillInAnswer ? q.fillInAnswer.replace(/<[^>]*>/g, '').trim() : (q.correctAnswer || 'N/A');
    }

    /** Sorts a reviewIndex array by module asc, then questionNumber asc. */
    function sortReviewIndex(index) {
        return index.sort((a, b) => {
            if (a.module !== b.module) return a.module - b.module;
            return (a.questionNumber || 0) - (b.questionNumber || 0);
        });
    }

    /** Builds a reviewIndex from a full questions collection snapshot (fallback for old results). */
    function buildFallbackReviewIndexFromSnapshot(snapshot) {
        const index = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            index.push({
                id: doc.id,
                module: d.module || 1,
                questionNumber: d.questionNumber || 0,
                format: d.format || 'mcq',
                correctAnswer: d.correctAnswer || null,
                fillInAnswer: d.fillInAnswer || null
            });
        });
        return sortReviewIndex(index);
    }

    /**
     * Normalizes any options format from Firestore into the canonical {A, B, C, D} map.
     */
    function normalizeOptions(raw) {
        const result = { A: '', B: '', C: '', D: '' };
        if (!raw) return result;
        if (!Array.isArray(raw) && typeof raw === 'object') {
            const keys = Object.keys(raw);
            const hasLetterKeys = ['A', 'B', 'C', 'D'].some(k => keys.includes(k) || keys.includes(k.toLowerCase()));
            if (hasLetterKeys) {
                result.A = String(raw.A || raw.a || '');
                result.B = String(raw.B || raw.b || '');
                result.C = String(raw.C || raw.c || '');
                result.D = String(raw.D || raw.d || '');
            } else {
                const vals = Object.values(raw).filter(v => typeof v === 'string' && v.length > 0);
                ['A', 'B', 'C', 'D'].forEach((letter, i) => { result[letter] = vals[i] || ''; });
            }
            for (const k of ['A', 'B', 'C', 'D']) {
                let val = result[k].trim();
                if (val.match(new RegExp(`^${k}[).:]\\s*`, 'i'))) val = val.replace(new RegExp(`^${k}[).:]\\s*`, 'i'), '');
                result[k] = val;
            }
            return result;
        }
        if (Array.isArray(raw)) {
            const letters = ['A', 'B', 'C', 'D'];
            raw.slice(0, 4).forEach((item, i) => {
                const letter = letters[i];
                if (typeof item === 'string') {
                    result[letter] = item;
                } else if (typeof item === 'object' && item !== null) {
                    const text = item.text || item.option_text || item.label || item.content || '';
                    if (text) {
                        result[letter] = String(text);
                    } else {
                        const possibleTexts = Object.values(item)
                            .filter(v => typeof v === 'string' && v.length > 1 && v.toUpperCase() !== letter)
                            .sort((a, b) => b.length - a.length);
                        result[letter] = possibleTexts[0] || String(Object.values(item).find(v => typeof v === 'string') || '');
                    }
                }
            });
            for (const k of letters) {
                let val = result[k].trim();
                if (val.match(new RegExp(`^${k}[).:]\\s*`, 'i'))) val = val.replace(new RegExp(`^${k}[).:]\\s*`, 'i'), '');
                result[k] = val;
            }
            return result;
        }
        return result;
    }

    // --- Page Elements ---
    const loadingContainer = document.getElementById('review-loading-container');
    const contentBody = document.getElementById('review-content-body');
    const testMain = document.getElementById('review-main-content');

    const headerTitle = document.getElementById('review-header-title');
    const headerSubtitle = document.getElementById('review-header-subtitle');
    const backToResultsBtn = document.getElementById('back-to-results-btn');

    const stimulusPane = document.getElementById('review-stimulus-pane');
    const stimulusPaneContent = stimulusPane.querySelector('.pane-content');

    const mathHeader = document.getElementById('math-review-header');
    const rwHeader = document.getElementById('rw-review-header');

    const mqNumberDisplay = document.getElementById('math-q-number-display');
    const mqResultDisplay = document.getElementById('math-question-result-display');
    const rwNumberDisplay = document.getElementById('rw-q-number-display');
    const rwResultDisplay = document.getElementById('rw-question-result-display');

    const qPromptContent = document.getElementById('review-question-content');
    const qOptionsContent = document.getElementById('review-options-content');
    const qExplanationContent = document.getElementById('explanation-content');
    const qExplanationContainer = document.getElementById('review-explanation-container');

    const userNameDisp = document.getElementById('user-name-display');

    // --- State ---
    let resultId = null;
    let questionId = null;
    let resultData = null;
    let questionData = null;

    /**
     * Extract LaTeX segments from text using balanced-brace parsing.
     * Handles nested braces like \frac{\sqrt{2}}{2} correctly.
     */
    function extractLatexSegments(text) {
        const segments = [];
        let i = 0;
        
        // Match patterns: $...$, \command{...}, \command, ^{...}, ^2, _{...}, _n
        // This regex is slightly more aggressive to catch non-braced SAT math
        const latexRegex = /(\$[^\$]+\$|\\\(.*?\\\)|\\(?:[a-zA-Z]+)(?:\{.*?\})*|[\^_]\{.*?\}|[\^_][a-zA-Z0-9]|\\[a-zA-Z]+|\\leq|\\geq|\\neq|\\pi|\\theta|\\alpha|\\beta|\\gamma|\\delta|\\sigma|\\mu|\\lambda|\\infty|\\times|\\div|\\pm|\\approx|\\cdot|\\cos|\\sin|\\tan|\\log|\\ln)/g;
        
        let match;
        let lastIdx = 0;
        while ((match = latexRegex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                segments.push({ type: 'text', value: text.slice(lastIdx, match.index) });
            }
            let val = match[0];
            // Remove $ or \( delimiters for KaTeX
            if (val.startsWith('$') && val.endsWith('$')) val = val.slice(1, -1);
            if (val.startsWith('\\(') && val.endsWith('\\)')) val = val.slice(2, -2);
            
            segments.push({ type: 'formula', value: val });
            lastIdx = latexRegex.lastIndex;
        }
        if (lastIdx < text.length) {
            segments.push({ type: 'text', value: text.slice(lastIdx) });
        }
        return segments;
    }

    function renderAllMath() {
        if (typeof katex === 'undefined') return;
        try {
            // 1. Render standard .ql-formula spans
            document.querySelectorAll('.ql-formula').forEach(span => {
                const latex = span.dataset.value;
                if (!latex || span.querySelector('.katex')) return;
                try {
                    katex.render(latex, span, { throwOnError: false, displayMode: false });
                } catch (e) {
                    console.error("KaTeX render error:", e, "for latex:", latex);
                    if (window.MQ && span) { try { window.MQ.StaticMath(span).latex(latex); } catch (mqE) { } }
                }
            });

            // 2. Fix raw LaTeX that leaked into displayed text
            const scanAreas = document.querySelectorAll('.question-text, .option-text, .pane-content, .review-explanation');
            scanAreas.forEach(area => {
                // Use a more inclusive regex for detection
                const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT, null, false);
                const nodesToFix = [];
                let node;
                while (node = walker.nextNode()) {
                    if (/\\|\$|\^|_|\\leq|\\geq|\\pi|\\theta/.test(node.textContent)) {
                        nodesToFix.push(node);
                    }
                }
                nodesToFix.forEach(textNode => {
                    const text = textNode.textContent;
                    const segments = extractLatexSegments(text);
                    if (segments.length === 0) return;
                    
                    const container = document.createElement('span');
                    segments.forEach(seg => {
                        if (seg.type === 'formula') {
                            const span = document.createElement('span');
                            span.className = 'ql-formula';
                            span.dataset.value = seg.value;
                            try {
                                katex.render(seg.value, span, { throwOnError: false, displayMode: false });
                            } catch (e) {
                                span.textContent = seg.value;
                            }
                            container.appendChild(span);
                        } else {
                            container.appendChild(document.createTextNode(seg.value));
                        }
                    });
                    textNode.parentNode.replaceChild(container, textNode);
                });
            });
        } catch (e) { console.error("renderAllMath error:", e); }
    }

    /**
     * Main function to load and display the specific question.
     * Uses reviewIndex for navigation (0 extra reads).
     * Fetches only the single requested question doc (1 read).
     */
    async function loadQuestionReview() {
        const urlParams = new URLSearchParams(window.location.search);
        resultId = urlParams.get('resultId');
        questionId = urlParams.get('questionId');

        if (!resultId || !questionId) {
            showError("Missing Test or Question ID. Please return to results.");
            return;
        }

        if (backToResultsBtn) {
            backToResultsBtn.href = `results.html?resultId=${resultId}`;
        }

        const user = auth.currentUser;
        if (!user) {
            showError("You must be logged in to view results.");
            return;
        }
        if (userNameDisp) {
            userNameDisp.textContent = user.displayName || 'Student';
        }

        try {
            // --- 1. Fetch Result Data (1 Firestore read) ---
            const resultDoc = await db.collection('testResults').doc(resultId).get();
            if (!resultDoc.exists) {
                showError("Test result not found.");
                return;
            }
            resultData = resultDoc.data();

            // Security check
            if (resultData.userId !== user.uid) {
                try {
                    const adminDoc = await db.collection('admins').doc(user.uid).get();
                    if (!adminDoc.exists) {
                        showError("Access Denied.");
                        return;
                    }
                } catch(err) {
                    showError("Access Denied.");
                    return;
                }
            }

            // --- Proctored Review Access Control ---
            if (resultData.proctorCode) {
                try {
                    const sessionDoc = await db.collection('proctoredSessions').doc(resultData.proctorCode).get();
                    if (sessionDoc.exists && sessionDoc.data().status === 'revoked') {
                        showError("Question review is not available. This proctored session has been closed by the administrator.");
                        return;
                    }
                } catch (err) {
                    console.warn('Could not check proctored session status:', err);
                }
            }

            // --- 2. Fetch the Single Question Doc (1 Firestore read) ---
            const testId = resultData.testId;
            if (!testId) {
                showError("Test ID not found in result data.");
                return;
            }

            const questionDoc = await db.collection('tests').doc(testId).collection('questions').doc(questionId).get();
            if (!questionDoc.exists) {
                showError("Question data could not be found in the test.");
                return;
            }
            questionData = { id: questionDoc.id, ...questionDoc.data() };

            // Resolve tg:// image URLs before rendering
            if (questionData.imageUrl && questionData.imageUrl.startsWith('tg://')) {
                try {
                    questionData.imageUrl = await TelegramImages.resolveTelegramUrl(questionData.imageUrl);
                } catch (err) {
                    console.error('Failed to resolve tg:// URL for review:', err);
                }
            }

            // --- 3. Render Content ---
            renderPageContent();

            // --- 4. Build navigation from reviewIndex (0 extra Firestore reads) ---
            let reviewIndex = resultData.reviewIndex;

            if (!reviewIndex || !Array.isArray(reviewIndex) || reviewIndex.length === 0) {
                // FALLBACK for old result docs: fetch full questions collection once
                console.warn('[question-review.js] reviewIndex missing — fetching full questions collection as fallback.');
                const allQDocs = await db.collection('tests').doc(testId).collection('questions').get();
                reviewIndex = buildFallbackReviewIndexFromSnapshot(allQDocs);
            } else {
                reviewIndex = sortReviewIndex(reviewIndex);
            }

            const qIds = reviewIndex.map(q => q.id);
            let currentIdx = qIds.indexOf(questionId);

            const prevBtn = document.getElementById('review-prev-btn');
            const nextBtnNav = document.getElementById('review-next-btn');
            const counterEl = document.getElementById('review-question-counter');

            // --- SPA NAVIGATION & PRELOADING ---
            const questionCache = { [questionId]: questionData };

            function updateNavButtons() {
                if (counterEl && currentIdx >= 0) {
                    counterEl.textContent = `Question ${currentIdx + 1} of ${qIds.length}`;
                }

                if (prevBtn) {
                    prevBtn.disabled = (currentIdx === 0);
                    prevBtn.onclick = () => currentIdx > 0 && navigateToQuestionSPA(currentIdx - 1);
                }

                if (nextBtnNav) {
                    nextBtnNav.disabled = (currentIdx === qIds.length - 1);
                    nextBtnNav.onclick = () => currentIdx < qIds.length - 1 && navigateToQuestionSPA(currentIdx + 1);
                }

                // Preload NEXT question in background for zero-latency clicks
                if (currentIdx < qIds.length - 1) {
                    const nextQId = qIds[currentIdx + 1];
                    if (!questionCache[nextQId]) {
                        db.collection('tests').doc(testId).collection('questions').doc(nextQId).get().then(async doc => {
                            if (doc.exists) {
                                const data = { id: doc.id, ...doc.data() };
                                if (data.imageUrl && data.imageUrl.startsWith('tg://')) {
                                    try { data.imageUrl = await TelegramImages.resolveTelegramUrl(data.imageUrl); } catch (e) { }
                                }
                                questionCache[nextQId] = data;
                            }
                        }).catch(e => console.warn("Preload failed", e));
                    }
                }
            }

            async function navigateToQuestionSPA(idx) {
                const newQId = qIds[idx];
                currentIdx = idx;
                questionId = newQId;

                // Update URL without reloading
                const url = new URL(window.location);
                url.searchParams.set('questionId', newQId);
                window.history.pushState({ questionId: newQId }, '', url);

                updateNavButtons();

                if (questionCache[newQId]) {
                    // Instant load from cache
                    questionData = questionCache[newQId];
                    renderPageContent();
                    renderAllMath();
                } else {
                    // Fetch on demand (if user clicks too fast)
                    if (contentBody) contentBody.style.opacity = '0.5';
                    try {
                        const qDoc = await db.collection('tests').doc(testId).collection('questions').doc(newQId).get();
                        if (qDoc.exists) {
                            questionData = { id: qDoc.id, ...qDoc.data() };
                            if (questionData.imageUrl && questionData.imageUrl.startsWith('tg://')) {
                                try { questionData.imageUrl = await TelegramImages.resolveTelegramUrl(questionData.imageUrl); } catch (e) { }
                            }
                            questionCache[newQId] = questionData;
                            renderPageContent();
                            renderAllMath();
                        }
                    } catch (e) { console.error(e); }
                    if (contentBody) contentBody.style.opacity = '1';
                }
                window.scrollTo({ top: 0, behavior: 'instant' });
            }

            // Handle browser back/forward buttons
            window.addEventListener('popstate', (event) => {
                const p = new URLSearchParams(window.location.search);
                const pId = p.get('questionId');
                if (pId) {
                    const idx = qIds.indexOf(pId);
                    if (idx !== -1) {
                        currentIdx = idx;
                        questionId = pId;
                        updateNavButtons();
                        if (questionCache[pId]) {
                            questionData = questionCache[pId];
                            renderPageContent();
                            renderAllMath();
                        } else {
                            navigateToQuestionSPA(idx);
                        }
                    }
                }
            });

            updateNavButtons();

            // --- 5. Finalize ---
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (contentBody) contentBody.style.visibility = 'visible';
            renderAllMath();

        } catch (error) {
            console.error("Error loading question review:", error);
            showError("An error occurred while loading this review.");
        }
    }

    /** Renders all the dynamic content onto the page. */
    function renderPageContent() {
        if (!questionData) return;

        const isMath = questionData.module > 2;
        const moduleNum = (questionData.module % 2) === 0 ? 2 : 1;
        const sectionType = isMath ? 'Math' : 'Reading & Writing';

        if (headerTitle) headerTitle.textContent = `Review: ${sectionType}`;
        if (headerSubtitle) headerSubtitle.textContent = `Module ${moduleNum}, Question ${questionData.questionNumber}`;

        if (testMain) testMain.classList.toggle('math-layout-active', isMath);
        if (mathHeader) mathHeader.classList.toggle('hidden', !isMath);
        if (rwHeader) rwHeader.classList.toggle('hidden', isMath);

        const activeNumberDisplay = isMath ? mqNumberDisplay : rwNumberDisplay;
        const activeResultDisplay = isMath ? mqResultDisplay : rwResultDisplay;

        if (activeNumberDisplay) activeNumberDisplay.textContent = questionData.questionNumber;

        const isStimulusEmpty = (!questionData.passage || questionData.passage.trim() === '' || questionData.passage === '<p><br></p>') && !questionData.imageUrl;
        if (stimulusPane) stimulusPane.classList.toggle('is-empty', isStimulusEmpty);
        if (stimulusPaneContent) {
            const imgPos = questionData.imagePosition || 'above';
            const imgHTML = questionData.imageUrl ? `<img src="${questionData.imageUrl}" alt="Stimulus Image" style="width: ${questionData.imageWidth || '100%'};">` : '';
            const passageHTML = questionData.passage || '';
            stimulusPaneContent.innerHTML = (imgPos === 'below') ? (passageHTML + imgHTML) : (imgHTML + passageHTML);
        }

        const userAnswer = resultData.userAnswers[questionId];
        const correctAnswer = questionData.format === 'fill-in'
            ? getFillinText(questionData)
            : questionData.correctAnswer;
        const isCorrect = questionData.format === 'fill-in'
            ? isFillinCorrect(userAnswer, questionData.fillInAnswer)
            : userAnswer === questionData.correctAnswer;

        if (activeResultDisplay) {
            if (isCorrect) {
                activeResultDisplay.innerHTML = `<span class="correct"><i class="fa-solid fa-check"></i> Correct</span>`;
            } else {
                activeResultDisplay.innerHTML = `<span class="incorrect"><i class="fa-solid fa-xmark"></i> Incorrect</span>`;
            }
        }

        if (qPromptContent) {
            qPromptContent.innerHTML = `<div class="question-text">${questionData.prompt || ''}</div>`;
        }

        if (qOptionsContent) {
            if (questionData.format === 'mcq') {
                qOptionsContent.innerHTML = renderMCQOptions(questionData, userAnswer, correctAnswer);
            } else if (questionData.format === 'fill-in') {
                qOptionsContent.innerHTML = renderFillIn(questionData, userAnswer, correctAnswer);
            }
        }

        if (qExplanationContent) {
            const explanation = questionData.explanation || '<p><i>No explanation provided for this question.</i></p>';
            if (explanation === '<p><br></p>' || explanation.trim() === '') {
                qExplanationContent.innerHTML = '<p><i>No explanation provided for this question.</i></p>';
            } else {
                qExplanationContent.innerHTML = explanation;
            }
        }
    }

    /** Generates HTML for MCQ options with correct/incorrect highlighting. */
    function renderMCQOptions(q, userAns, correctAns) {
        const options = normalizeOptions(q.options);
        let html = '<div class="question-options">';
        ['A', 'B', 'C', 'D'].forEach(opt => {
            const optText = options[opt] || '';
            let classes = "option-wrapper";
            if (opt === correctAns) classes += " correct-answer";
            else if (opt === userAns) classes += " incorrect-answer";

            html += `
            <div class="${classes}">
                <label class="option">
                    <span class="option-letter">${opt}</span>
                    <span class="option-text">${optText}</span>
                </label>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    /** Generates HTML for fill-in-the-blank review. */
    function renderFillIn(q, userAns, correctAns) {
        const fillInText = getFillinText(q);
        const correct = isFillinCorrect(userAns, q.fillInAnswer);
        let userAnswerHtml = '';
        if (correct) {
            userAnswerHtml = `
            <div class="label">Your Answer</div>
            <div class="user-answer correct">${userAns}</div>`;
        } else {
            userAnswerHtml = `
            <div class="label">Your Answer</div>
            <div class="user-answer incorrect">${userAns || '<i>(No answer)</i>'}</div>`;
        }
        return `
        <div class="fill-in-answer-review">
            ${userAnswerHtml}
            <div class="label">Correct Answer</div>
            <div class="correct-answer">${fillInText}</div>
        </div>`;
    }

    /** Displays an error message. */
    function showError(message) {
        if (loadingContainer) loadingContainer.style.display = 'none';
        if (contentBody) contentBody.style.visibility = 'hidden';
        if (loadingContainer) {
            loadingContainer.style.display = 'flex';
            loadingContainer.innerHTML = `<p style="color: var(--error-red); font-weight: 600;">${message}</p>`;
        }
    }

    // --- Auth Check & Initial Load ---
    auth.onAuthStateChanged(user => {
        if (user) {
            loadQuestionReview();
        } else {
            showError("You must be logged in to view results.");
        }
    });

}); // --- END OF DOMContentLoaded ---
