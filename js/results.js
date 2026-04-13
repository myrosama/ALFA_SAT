// js/results.js - Logic for the Test Results page
// OPTIMIZED: Uses reviewIndex from result doc to avoid fetching full questions collection.

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase ---
    const db = firebase.firestore();
    const auth = firebase.auth();
    const MQ = MathQuill.getInterface(2);

    // === HELPER FUNCTIONS ===

    /** Checks if a fill-in answer is correct (supports comma-separated and numeric equivalence). */
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

    /** Determines correctness from a lightweight index item + user answer. */
    function isQuestionCorrectFromIndexItem(item, userAns) {
        if (item.format === 'fill-in') {
            return isFillinCorrect(userAns, item.fillInAnswer);
        }
        return userAns === item.correctAnswer;
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
                fillInAnswer: d.fillInAnswer || null,
                domain: d.domain || '',
                skill: d.skill || ''
            });
        });
        return sortReviewIndex(index);
    }

    // --- Page Elements ---
    const resultsContainer = document.getElementById('results-container');
    const loadingContainer = document.getElementById('loading-container');

    // --- Templates ---
    const headerTemplate = document.getElementById('results-header-template');
    const sectionTemplate = document.getElementById('results-review-section-template');
    const qNumTemplate = document.getElementById('question-number-template');

    // --- State ---
    let resultData = null;
    let currentResultId = null;

    /** Renders all MathQuill static math blocks on the page. */
    function renderAllMath() {
        try {
            document.querySelectorAll('.ql-formula').forEach(span => {
                const latex = span.dataset.value;
                if (latex && MQ && span) {
                    MQ.StaticMath(span).latex(latex);
                } else if (latex && span) {
                    span.textContent = `[Math: ${latex}]`;
                }
            });
        } catch (e) { console.error("renderAllMath error:", e); }
    }

    /**
     * Main function to load and display results.
     * Uses reviewIndex from resultData when available (1 read).
     * Falls back to fetching full questions collection for old results.
     */
    async function loadResults() {
        const urlParams = new URLSearchParams(window.location.search);
        currentResultId = urlParams.get('resultId');

        if (!currentResultId) {
            showError("No Result ID found in URL. Please go back to the dashboard.");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            showError("You must be logged in to view results.");
            return;
        }

        try {
            // --- 1. Fetch Result Data (1 Firestore read) ---
            const resultDoc = await db.collection('testResults').doc(currentResultId).get();

            if (!resultDoc.exists) {
                showError("Test result not found. It may have been deleted or the link is incorrect.");
                return;
            }

            resultData = resultDoc.data();

            // Security check — allow result owner OR admin
            if (resultData.userId !== user.uid) {
                const adminDoc = await db.collection('admins').doc(user.uid).get();
                if (!adminDoc.exists) {
                    showError("Access Denied. You do not have permission to view this result.");
                    return;
                }
            }

            // --- PROCTORED TEST CHECK ---
            const isSubmitted = urlParams.get('submitted') === 'true';
            const scoringStatus = resultData.scoringStatus || 'published';

            // Fresh proctored submission — show animated upload experience
            if (isSubmitted && resultData.proctorCode) {
                loadingContainer.style.display = 'none';
                resultsContainer.classList.add('loaded');

                resultsContainer.innerHTML = `
                    <style>
                        @keyframes uploadFill { from { width: 0%; } to { width: 100%; } }
                        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
                        @keyframes checkPop { 0% { transform:scale(0); opacity:0; } 60% { transform:scale(1.2); } 100% { transform:scale(1); opacity:1; } }
                        .upload-stage { font-size:0.85rem; color:var(--dark-gray); transition: opacity 0.3s; }
                    </style>
                    <div id="upload-phase" style="text-align:center; padding:80px 20px; max-width:420px; margin:0 auto;">
                        <div style="width:56px; height:56px; border-radius:50%; background:#f0f0f0; margin:0 auto 24px; display:flex; align-items:center; justify-content:center;">
                            <i class="fa-solid fa-cloud-arrow-up" style="font-size:1.6rem; color:var(--primary-blue);"></i>
                        </div>
                        <h2 style="color:var(--primary-blue); margin:0 0 8px; font-size:1.25rem;">Submitting Your Test</h2>
                        <p class="upload-stage" id="upload-stage-text">Saving responses...</p>
                        <div style="width:100%; height:6px; background:#e9ecef; border-radius:8px; overflow:hidden; margin:20px 0;">
                            <div id="upload-bar" style="height:100%; background:var(--primary-blue); border-radius:8px; animation:uploadFill 3.5s ease-out forwards;"></div>
                        </div>
                        <p style="font-size:0.75rem; color:#999;">Please wait</p>
                    </div>
                `;

                const stages = ['Saving responses...', 'Verifying data...', 'Uploading to server...', 'Finalizing...'];
                const stageEl = document.getElementById('upload-stage-text');
                for (let s = 1; s < stages.length; s++) {
                    setTimeout(() => { if (stageEl) stageEl.textContent = stages[s]; }, s * 900);
                }

                setTimeout(() => {
                    resultsContainer.innerHTML = `
                        <style>
                            @keyframes fadeSlideUp { from { opacity:0; transform:translateY(25px); } to { opacity:1; transform:translateY(0); } }
                            @keyframes checkPop { 0% { transform:scale(0) rotate(-45deg); opacity:0; } 60% { transform:scale(1.1) rotate(0deg); } 100% { transform:scale(1) rotate(0deg); opacity:1; } }
                            @keyframes confettiDrift { 0% { transform: translateY(0) rotate(0deg); opacity:1; } 100% { transform: translateY(80px) rotate(720deg); opacity:0; } }
                            @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                            @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(46,125,50,0.2); } 50% { box-shadow: 0 0 0 16px rgba(46,125,50,0); } }
                            .submit-success-card { background:#fff; border-radius:20px; box-shadow:0 8px 40px rgba(0,0,0,0.08); max-width:520px; margin:0 auto; padding:48px 36px 40px; text-align:center; animation:fadeSlideUp 0.5s ease-out; position:relative; overflow:hidden; }
                            .submit-success-card::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg, #6A0DAD, #2e7d32, #003366); }
                            .confetti-container { position:absolute; top:0; left:0; right:0; height:100px; pointer-events:none; overflow:hidden; }
                            .confetti { position:absolute; width:8px; height:8px; border-radius:2px; animation: confettiDrift 2s ease-out forwards; }
                            .check-circle { width:88px; height:88px; border-radius:50%; background:linear-gradient(135deg, #e8f5e9, #c8e6c9); margin:0 auto 28px; display:flex; align-items:center; justify-content:center; animation: checkPop 0.5s ease-out 0.15s both, pulseGlow 2s ease-in-out infinite; }
                            .check-circle i { font-size:2.8rem; background:linear-gradient(135deg, #2e7d32, #43a047); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
                            .submit-title { color:var(--primary-blue); margin:0 0 8px; font-size:1.5rem; font-weight:700; }
                            .submit-subtitle { color:var(--dark-gray); font-size:0.92rem; line-height:1.7; margin:0 0 24px; }
                            .timeline-card { background:linear-gradient(135deg, #f8f9ff, #f0f4ff); border:1px solid #e3e8f0; border-radius:14px; padding:20px 24px; margin:0 0 24px; text-align:left; }
                            .timeline-card h4 { margin:0 0 14px; color:var(--primary-blue); font-size:0.9rem; display:flex; align-items:center; gap:8px; }
                            .timeline-step { display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; }
                            .timeline-step:last-child { margin-bottom:0; }
                            .timeline-dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:0.65rem; color:#fff; }
                            .timeline-dot.done { background:#2e7d32; }
                            .timeline-dot.pending { background:linear-gradient(135deg, #e0e0e0 25%, #bdbdbd 50%, #e0e0e0 75%); background-size:200% 100%; animation: shimmer 2s infinite linear; }
                            .timeline-text { font-size:0.85rem; color:var(--dark-gray); line-height:1.4; padding-top:2px; }
                            .timeline-text strong { color:var(--text-color); }
                            .notify-hint { font-size:0.82rem; color:var(--dark-gray); margin:0 0 24px; line-height:1.5; }
                            .notify-hint i { color:var(--primary-purple); }
                            .submit-actions { display:flex; flex-direction:column; gap:10px; align-items:center; }
                            .tg-btn { display:inline-flex; align-items:center; gap:10px; background:linear-gradient(135deg, var(--primary-blue), #004080); color:white; padding:14px 32px; border-radius:12px; text-decoration:none; font-weight:600; font-size:0.92rem; transition:transform 0.2s, box-shadow 0.2s; }
                            .tg-btn:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,51,102,0.3); }
                            .back-link { color:var(--dark-gray); font-size:0.82rem; text-decoration:none; padding:8px; transition:color 0.2s; }
                            .back-link:hover { color:var(--primary-purple); text-decoration:underline; }
                            @media (max-width:480px) {
                                .submit-success-card { padding:32px 20px 28px; border-radius:16px; }
                                .check-circle { width:72px; height:72px; }
                                .check-circle i { font-size:2.2rem; }
                                .submit-title { font-size:1.25rem; }
                                .timeline-card { padding:16px; }
                                .tg-btn { width:100%; justify-content:center; padding:14px 24px; }
                            }
                        </style>
                        <div class="submit-success-card">
                            <div class="confetti-container" id="confetti-box"></div>
                            <div class="check-circle">
                                <i class="fa-solid fa-check"></i>
                            </div>
                            <h2 class="submit-title">Test Submitted Successfully!</h2>
                            <p class="submit-subtitle">
                                Great job completing your test! Your answers have been securely recorded and are now being processed.
                            </p>
                            <div class="timeline-card">
                                <h4><i class="fa-solid fa-list-check"></i> What Happens Next</h4>
                                <div class="timeline-step">
                                    <div class="timeline-dot done"><i class="fa-solid fa-check"></i></div>
                                    <div class="timeline-text"><strong>Answers Received</strong> — Your responses have been saved.</div>
                                </div>
                                <div class="timeline-step">
                                    <div class="timeline-dot pending"></div>
                                    <div class="timeline-text"><strong>Scoring in Progress</strong> — Our team is reviewing and scoring your test.</div>
                                </div>
                                <div class="timeline-step">
                                    <div class="timeline-dot pending"></div>
                                    <div class="timeline-text"><strong>Results Published</strong> — Scores will be available within <strong>24 hours</strong>.</div>
                                </div>
                            </div>
                            <p class="notify-hint">
                                <i class="fa-solid fa-bell"></i> You'll receive an email notification when your scores are ready. Score releases will also be announced on our Telegram channel.
                            </p>
                            <div class="submit-actions">
                                <a href="https://t.me/SAT_ALFA" target="_blank" rel="noopener" class="tg-btn">
                                    <i class="fa-brands fa-telegram"></i> Join ALFA SAT Channel
                                </a>
                                <a href="dashboard.html" class="back-link">← Back to Dashboard</a>
                            </div>
                        </div>
                    `;
                    // Spawn confetti
                    const confettiBox = document.getElementById('confetti-box');
                    if (confettiBox) {
                        const colors = ['#6A0DAD', '#2e7d32', '#003366', '#f0c040', '#e74c3c', '#3498db'];
                        for (let i = 0; i < 30; i++) {
                            const c = document.createElement('div');
                            c.className = 'confetti';
                            c.style.left = Math.random() * 100 + '%';
                            c.style.top = '-10px';
                            c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                            c.style.animationDelay = (Math.random() * 0.8) + 's';
                            c.style.animationDuration = (1.5 + Math.random()) + 's';
                            confettiBox.appendChild(c);
                        }
                    }
                }, 3500);

                return;
            }

            // Returning student — proctored test not yet published
            if (resultData.proctorCode && scoringStatus !== 'published') {
                loadingContainer.style.display = 'none';
                resultsContainer.classList.add('loaded');

                let title, desc;
                if (scoringStatus === 'scored') {
                    title = 'Results Under Review';
                    desc = 'Your scores have been calculated and are currently being finalized. They will be released shortly.';
                } else {
                    title = 'Results Pending';
                    desc = 'Your test is currently being reviewed and scored. Please check back later for your results.';
                }

                resultsContainer.innerHTML = `
                    <style>
                        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(25px); } to { opacity:1; transform:translateY(0); } }
                        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                    </style>
                    <div style="text-align:center; padding:60px 20px; max-width:520px; margin:0 auto; animation:fadeSlideUp 0.5s ease-out;">
                        <div style="width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,#fff3cd,#ffeeba); margin:0 auto 24px; display:flex; align-items:center; justify-content:center;">
                            <i class="fa-solid fa-clock" style="font-size:2.2rem; color:#856404;"></i>
                        </div>
                        <h2 style="color:#856404; margin:0 0 14px; font-size:1.4rem;">${title}</h2>
                        <p style="color:var(--dark-gray); font-size:0.95rem; line-height:1.7; margin:0 0 24px;">${desc}</p>
                        <div style="width:180px; height:3px; margin:0 auto 28px; border-radius:3px; background:linear-gradient(90deg,#e0e0e0 25%,#c9a600 50%,#e0e0e0 75%); background-size:200% 100%; animation:shimmer 2s infinite linear;"></div>
                        <a href="https://t.me/SAT_ALFA" target="_blank" rel="noopener"
                            style="display:inline-flex; align-items:center; gap:8px; background:#856404; color:white; padding:14px 28px; border-radius:10px; text-decoration:none; font-weight:600; font-size:0.95rem;">
                            <i class="fa-brands fa-telegram"></i> ALFA SAT Channel
                        </a>
                        <br><br>
                        <a href="dashboard.html" style="color:var(--dark-gray); font-size:0.85rem; text-decoration:underline;">Back to Dashboard</a>
                    </div>
                `;
                return;
            }

            // --- PUBLISHED OR NORMAL TEST: Render full results ---

            // --- 2. Render Header ---
            renderHeader(resultData);

            // --- 3. Get review index (0 reads if reviewIndex present, ~N reads as fallback) ---
            let reviewIndex = resultData.reviewIndex;

            if (!reviewIndex || !Array.isArray(reviewIndex) || reviewIndex.length === 0) {
                // FALLBACK for old result docs: fetch full questions collection once
                console.warn('[results.js] reviewIndex missing — fetching full questions collection as fallback.');
                const testId = resultData.testId;
                if (!testId) {
                    showError("Test ID not found in result data.");
                    return;
                }
                const questionsSnapshot = await db.collection('tests').doc(testId).collection('questions').get();
                reviewIndex = buildFallbackReviewIndexFromSnapshot(questionsSnapshot);
                // Store snapshot for AI analysis fallback
                window._fallbackQuestionsSnapshot = questionsSnapshot;
            } else {
                reviewIndex = sortReviewIndex(reviewIndex);
            }

            // Split into R&W and Math
            const allRW = reviewIndex.filter(q => q.module === 1 || q.module === 2);
            const allMath = reviewIndex.filter(q => q.module === 3 || q.module === 4);

            // Render the sections using lightweight index items
            renderReviewSection("Reading & Writing", "rw-section", 1, 2, allRW, resultData);
            renderReviewSection("Math", "math-section", 3, 4, allMath, resultData);

            // --- 4. Finalize ---
            loadingContainer.style.display = 'none';
            resultsContainer.classList.add('loaded');
            renderAllMath();

            // --- 5. Wire Certificate Download Button ---
            const certBtn = document.getElementById('download-cert-btn');
            if (certBtn && typeof generateCertificatePDF === 'function') {
                certBtn.addEventListener('click', async () => {
                    certBtn.disabled = true;
                    certBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';
                    try {
                        const userName = auth.currentUser?.displayName || 'Student';
                        await generateCertificatePDF(resultData, userName);
                    } catch (err) {
                        console.error('Certificate generation error:', err);
                        alert('Error generating certificate. Please try again.');
                    }
                    certBtn.disabled = false;
                    certBtn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Download Score Certificate';
                });
            }

            // --- 6. Proctored Review Access Control ---
            if (resultData.proctorCode) {
                try {
                    const sessionDoc = await db.collection('proctoredSessions').doc(resultData.proctorCode).get();
                    if (sessionDoc.exists && sessionDoc.data().status === 'revoked') {
                        document.querySelectorAll('.review-section').forEach(section => {
                            section.innerHTML = `
                                <div style="text-align: center; padding: 30px; color: var(--dark-gray);">
                                    <i class="fa-solid fa-lock" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                                    <p><strong>Question review is not available.</strong></p>
                                    <p style="font-size: 0.85rem;">This proctored session has been closed by the administrator.</p>
                                </div>
                            `;
                        });
                    }
                } catch (err) {
                    console.warn('Could not check proctored session status:', err);
                }
            }

            // --- 7. AI Score Analysis ---
            if (typeof renderAIAnalysis === 'function') {
                if (resultData.aiAnalysis) {
                    renderAIAnalysis(resultData.aiAnalysis, resultsContainer);
                } else if (!resultData.proctorCode) {
                    const aiOptDiv = document.createElement('div');
                    aiOptDiv.className = 'ai-analysis-section';
                    aiOptDiv.innerHTML = `
                        <div class="ai-analysis-card" style="text-align:center; padding:20px 30px;">
                            <p style="margin:0 0 12px; color:var(--dark-gray);">Want personalized insights on your performance?</p>
                            <button id="ai-analyze-btn" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px; padding:10px 22px;">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Analyze with AI
                            </button>
                        </div>
                    `;
                    resultsContainer.appendChild(aiOptDiv);

                    document.getElementById('ai-analyze-btn')?.addEventListener('click', async function () {
                        const btn = this;
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

                        try {
                            // For AI analysis we need full question data — fetch if not already cached
                            let questionsSnapshot = window._fallbackQuestionsSnapshot;
                            if (!questionsSnapshot) {
                                questionsSnapshot = await db.collection('tests').doc(resultData.testId).collection('questions').get();
                            }

                            const allQ = [];
                            questionsSnapshot.forEach(d => allQ.push({ id: d.id, ...d.data() }));
                            const byModule = [[], [], [], []];
                            allQ.forEach(q => { if (q.module >= 1 && q.module <= 4) byModule[q.module - 1].push(q); });

                            const scoreResult = {
                                totalScore: resultData.totalScore,
                                rwScore: resultData.rwScore,
                                mathScore: resultData.mathScore,
                                rwRaw: resultData.rwRaw,
                                mathRaw: resultData.mathRaw,
                                rwTotal: resultData.rwTotal,
                                mathTotal: resultData.mathTotal
                            };

                            const analysis = await runAIScoreAnalysis(scoreResult, resultData.userAnswers, byModule);
                            if (analysis) {
                                await db.collection('testResults').doc(currentResultId).update({ aiAnalysis: analysis });
                                aiOptDiv.remove();
                                renderAIAnalysis(analysis, resultsContainer);
                            } else {
                                btn.disabled = false;
                                btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze with AI';
                                alert('AI analysis could not be completed. Please try again later.');
                            }
                        } catch (err) {
                            console.error('AI analysis error:', err);
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze with AI';
                        }
                    });
                }
            }

        } catch (error) {
            console.error("Error loading results:", error);
            showError("An error occurred while loading your results. Please try again.");
        }
    }

    /**
     * Renders the top score header.
     */
    function renderHeader(data) {
        const headerClone = headerTemplate.content.cloneNode(true);

        headerClone.getElementById('test-name-display').textContent += (data.testName || 'Practice Test');

        const aiScore = data.aiEstimatedScore;
        if (aiScore && aiScore.totalScore) {
            headerClone.getElementById('total-score-display').textContent = aiScore.totalScore;
            headerClone.getElementById('rw-score-display').textContent = aiScore.rwScore;
            headerClone.getElementById('math-score-display').textContent = aiScore.mathScore;
        } else {
            headerClone.getElementById('total-score-display').textContent = data.totalScore || 'N/A';
            headerClone.getElementById('rw-score-display').textContent = data.rwScore || 'N/A';
            headerClone.getElementById('math-score-display').textContent = data.mathScore || 'N/A';
        }

        headerClone.getElementById('rw-raw-display').textContent = `${data.rwRaw} / ${data.rwTotal} Correct`;
        headerClone.getElementById('math-raw-display').textContent = `${data.mathRaw} / ${data.mathTotal} Correct`;

        resultsContainer.appendChild(headerClone);

        if (aiScore && aiScore.explanation) {
            const aiCard = document.createElement('div');
            aiCard.className = 'ai-analysis-section';
            aiCard.innerHTML = `
                <div class="ai-analysis-card" style="margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                        <i class="fa-solid fa-chart-line" style="color:var(--primary-blue); font-size:1.1rem;"></i>
                        <h3 style="margin:0; color:var(--primary-blue);">Score Analysis</h3>
                    </div>
                    <p style="color:var(--dark-gray); margin:0 0 12px; font-size:0.9rem;">${aiScore.explanation || ''}</p>
                    ${aiScore.studyRecommendation ? `<p style="background:#f0f0f0; padding:10px 14px; border-radius:8px; margin:0; font-size:0.85rem;"><i class="fa-solid fa-lightbulb" style="color:#e67e22;"></i> <strong>Recommendation:</strong> ${aiScore.studyRecommendation}</p>` : ''}
                </div>
            `;
            resultsContainer.appendChild(aiCard);
        }
    }

    /**
     * Populates a grid with question buttons using lightweight index items.
     * No full question data needed — only id, questionNumber, format, correctAnswer, fillInAnswer.
     */
    function populateGrid(gridEl, indexItems, userAnswers) {
        if (indexItems.length === 0) {
            gridEl.innerHTML = `<p class="no-questions-in-module">No questions found for this module.</p>`;
            return;
        }

        indexItems.forEach(item => {
            const isCorrect = isQuestionCorrectFromIndexItem(item, userAnswers[item.id]);

            const qBtnClone = qNumTemplate.content.cloneNode(true);
            const qBtnEl = qBtnClone.querySelector('.q-number-btn');

            qBtnEl.classList.add(isCorrect ? 'correct' : 'incorrect');
            qBtnClone.querySelector('.q-number').textContent = item.questionNumber;
            qBtnEl.dataset.questionId = item.id;

            qBtnEl.addEventListener('click', () => {
                window.location.href = `question-review.html?resultId=${currentResultId}&questionId=${item.id}`;
            });

            gridEl.appendChild(qBtnClone);
        });
    }

    /**
     * Renders a review section (R&W or Math) using lightweight index items.
     */
    function renderReviewSection(title, cssClass, moduleNumA, moduleNumB, sectionItems, data) {
        const sectionClone = sectionTemplate.content.cloneNode(true);
        const sectionEl = sectionClone.querySelector('.review-section');
        const titleEl = sectionClone.querySelector('.section-title');
        const rawScoreEl = sectionClone.querySelector('.section-raw-score');

        titleEl.classList.add(cssClass);
        sectionClone.querySelector('.title-text').textContent = `Review: ${title}`;

        if (cssClass === 'rw-section') {
            rawScoreEl.textContent = `${data.rwRaw} / ${data.rwTotal} Correct`;
        } else if (cssClass === 'math-section') {
            rawScoreEl.textContent = `${data.mathRaw} / ${data.mathTotal} Correct`;
        }

        const userAnswers = data.userAnswers || {};

        const moduleA_Items = sectionItems
            .filter(q => q.module === moduleNumA)
            .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));

        const moduleB_Items = sectionItems
            .filter(q => q.module === moduleNumB)
            .sort((a, b) => (a.questionNumber || 0) - (b.questionNumber || 0));

        // --- Module A ---
        const moduleA_Container = document.createElement('div');
        moduleA_Container.className = 'module-review-container';
        const moduleA_Title = document.createElement('h4');
        moduleA_Title.className = 'module-title';
        moduleA_Title.textContent = `Module 1`;
        moduleA_Container.appendChild(moduleA_Title);
        const moduleA_Grid = document.createElement('div');
        moduleA_Grid.className = 'review-grid';
        populateGrid(moduleA_Grid, moduleA_Items, userAnswers);
        moduleA_Container.appendChild(moduleA_Grid);
        sectionEl.appendChild(moduleA_Container);

        // --- Module B ---
        const moduleB_Container = document.createElement('div');
        moduleB_Container.className = 'module-review-container';
        const moduleB_Title = document.createElement('h4');
        moduleB_Title.className = 'module-title';
        moduleB_Title.textContent = `Module 2`;
        moduleB_Container.appendChild(moduleB_Title);
        const moduleB_Grid = document.createElement('div');
        moduleB_Grid.className = 'review-grid';
        populateGrid(moduleB_Grid, moduleB_Items, userAnswers);
        moduleB_Container.appendChild(moduleB_Grid);
        sectionEl.appendChild(moduleB_Container);

        resultsContainer.appendChild(sectionClone);
    }

    /** Displays a final error message. */
    function showError(message) {
        loadingContainer.style.display = 'none';
        if (resultsContainer) {
            resultsContainer.innerHTML = `<div class="results-header"><p>${message}</p></div>`;
            resultsContainer.classList.add('loaded');
        }
    }

    // --- Auth Check & Initial Load ---
    auth.onAuthStateChanged(user => {
        if (user) {
            loadResults();
        } else {
            showError("You must be logged in to view results.");
        }
    });

}); // --- END OF DOMContentLoaded ---
