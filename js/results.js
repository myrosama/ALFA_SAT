// js/results.js - Logic for the new Test Results page
// UPDATED: To show all questions (correct & incorrect) and link to a new review page.
// UPDATED AGAIN: To separate question grids by Module.
// UPDATED AGAIN: To show only the question number (e.g., "1") instead of "M1: Q1".

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase ---
    const db = firebase.firestore();
    const auth = firebase.auth();
    const MQ = MathQuill.getInterface(2); // For rendering math

    // --- Page Elements ---
    const resultsContainer = document.getElementById('results-container');
    const loadingContainer = document.getElementById('loading-container');

    // --- Templates ---
    const headerTemplate = document.getElementById('results-header-template');
    const sectionTemplate = document.getElementById('results-review-section-template');
    const qNumTemplate = document.getElementById('question-number-template');

    // --- State ---
    let resultData = null; // Will hold the doc from Firestore
    let currentResultId = null; // Store the resultId for linking

    /**
     * Renders all MathQuill static math blocks on the page.
     */
    function renderAllMath() {
        try {
            const formulaSpans = document.querySelectorAll('.ql-formula');
            formulaSpans.forEach(span => {
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
     */
    async function loadResults() {
        const urlParams = new URLSearchParams(window.location.search);
        currentResultId = urlParams.get('resultId'); // Store for later use

        if (!currentResultId) {
            showError("No Result ID found in URL. Please go back to the dashboard.");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            // This should be caught by main.js auth guard, but good to double-check
            showError("You must be logged in to view results.");
            return;
        }

        try {
            // --- 1. Fetch Result Data ---
            const resultDoc = await db.collection('testResults').doc(currentResultId).get();

            if (!resultDoc.exists) {
                showError("Test result not found. It may have been deleted or the link is incorrect.");
                return;
            }

            resultData = resultDoc.data();

            // Security check: Ensure the logged-in user owns this result
            if (resultData.userId !== user.uid) {
                showError("Access Denied. You do not have permission to view this result.");
                return;
            }

            // --- PROCTORED TEST CHECK (must be BEFORE renderHeader to prevent flash) ---
            const isSubmitted = urlParams.get('submitted') === 'true';
            const scoringStatus = resultData.scoringStatus || 'published';

            // Fresh proctored submission — show animated upload experience
            if (isSubmitted && resultData.proctorCode) {
                loadingContainer.style.display = 'none';
                resultsContainer.classList.add('loaded');

                // Phase 1: Uploading animation (3.5 seconds)
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

                // Animate stage text
                const stages = ['Saving responses...', 'Verifying data...', 'Uploading to server...', 'Finalizing...'];
                const stageEl = document.getElementById('upload-stage-text');
                for (let s = 1; s < stages.length; s++) {
                    setTimeout(() => { if (stageEl) stageEl.textContent = stages[s]; }, s * 900);
                }

                // Phase 2: Confirmation screen after 3.5s
                setTimeout(() => {
                    resultsContainer.innerHTML = `
                        <style>
                            @keyframes fadeSlideUp { from { opacity:0; transform:translateY(25px); } to { opacity:1; transform:translateY(0); } }
                            @keyframes checkPop { 0% { transform:scale(0); opacity:0; } 60% { transform:scale(1.15); } 100% { transform:scale(1); opacity:1; } }
                        </style>
                        <div style="text-align:center; padding:60px 20px; max-width:520px; margin:0 auto; animation:fadeSlideUp 0.5s ease-out;">
                            <div style="width:80px; height:80px; border-radius:50%; background:#e8f5e9; margin:0 auto 24px; display:flex; align-items:center; justify-content:center; animation:checkPop 0.4s ease-out 0.1s both;">
                                <i class="fa-solid fa-check" style="font-size:2.5rem; color:#2e7d32;"></i>
                            </div>
                            <h2 style="color:var(--primary-blue); margin:0 0 14px; font-size:1.4rem;">Test Submitted Successfully</h2>
                            <p style="color:var(--dark-gray); font-size:0.95rem; line-height:1.7; margin:0 0 10px;">
                                Your test has been received and is currently being reviewed.
                            </p>
                            <p style="color:var(--text-color); font-size:1rem; font-weight:600; margin:0 0 20px;">
                                Results will be available within 24 hours.
                            </p>
                            <p style="color:var(--dark-gray); font-size:0.85rem; margin:0 0 28px; line-height:1.5;">
                                Score releases will be announced on our official Telegram channel.
                            </p>
                            <a href="https://t.me/SAT_ALFA" target="_blank" rel="noopener"
                                style="display:inline-flex; align-items:center; gap:8px; background:var(--primary-blue); color:white; padding:14px 28px; border-radius:10px; text-decoration:none; font-weight:600; font-size:0.95rem;">
                                <i class="fa-brands fa-telegram"></i> ALFA SAT Channel
                            </a>
                            <br><br>
                            <a href="dashboard.html" style="color:var(--dark-gray); font-size:0.85rem; text-decoration:underline;">Back to Dashboard</a>
                        </div>
                    `;
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
                    // pending_review or processing
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

            // --- 3. Fetch Questions from the Original Test Document ---
            // Questions are NOT stored in testResults to avoid Firestore's 1MB limit.
            const testId = resultData.testId;
            if (!testId) {
                showError("Test ID not found in result data.");
                return;
            }

            const questionsSnapshot = await db.collection('tests').doc(testId).collection('questions').get();
            const allQuestions = [];
            questionsSnapshot.forEach(doc => {
                allQuestions.push({ id: doc.id, ...doc.data() });
            });

            // Get all R&W questions
            const allRW = allQuestions
                .filter(q => (q.module === 1 || q.module === 2));

            // Get all Math questions
            const allMath = allQuestions
                .filter(q => (q.module === 3 || q.module === 4));

            // Render the sections
            renderReviewSection("Reading & Writing", "rw-section", 1, 2, allRW, resultData);
            renderReviewSection("Math", "math-section", 3, 4, allMath, resultData);

            // --- 4. Finalize ---
            loadingContainer.style.display = 'none'; // Hide loading spinner
            resultsContainer.classList.add('loaded'); // Fade in content

            // Render any math formulas in the dynamically added content
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
                        // Hide all review sections (question grids)
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


            // --- 8. AI Score Analysis (Optional for Normal Tests) ---
            if (typeof renderAIAnalysis === 'function') {
                if (resultData.aiAnalysis) {
                    // Already analyzed — render
                    renderAIAnalysis(resultData.aiAnalysis, resultsContainer);
                } else if (!resultData.proctorCode) {
                    // Normal test: show optional "Analyze with AI" button
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
                            // Build question data for AI
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
     * @param {object} data - The result data from Firestore.
     */
    function renderHeader(data) {
        const headerClone = headerTemplate.content.cloneNode(true);

        headerClone.getElementById('test-name-display').textContent += (data.testName || 'Practice Test');

        // Use AI-estimated score if available, otherwise static
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

        // Show AI analysis card if available
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
     * Populates a given grid element with question buttons.
     * @param {HTMLElement} gridEl - The .review-grid element to populate.
     * @param {Array} questions - An array of question objects for this grid.
     * @param {object} userAnswers - The user's answers map.
     */
    function populateGrid(gridEl, questions, userAnswers) {
        if (questions.length === 0) {
            gridEl.innerHTML = `<p class="no-questions-in-module">No questions found for this module.</p>`;
            return;
        }

        questions.forEach(q => {
            const isCorrect = userAnswers[q.id] === q.correctAnswer;

            const qBtnClone = qNumTemplate.content.cloneNode(true);
            const qBtnEl = qBtnClone.querySelector('.q-number-btn');

            // Add correct/incorrect class for styling
            qBtnEl.classList.add(isCorrect ? 'correct' : 'incorrect');

            // Get the display module/section number
            const moduleNum = (q.module % 2) === 0 ? 2 : 1; // 1->1, 2->2, 3->1, 4->2

            // UPDATED: Show only the question number
            qBtnClone.querySelector('.q-number').textContent = q.questionNumber;

            // Store data on the button to find it later
            qBtnEl.dataset.questionId = q.id;

            // UPDATED: Add event listener to link to the new review page
            qBtnEl.addEventListener('click', () => {
                window.location.href = `question-review.html?resultId=${currentResultId}&questionId=${q.id}`;
            });

            gridEl.appendChild(qBtnClone);
        });
    }

    /**
     * Renders a review section (R&W or Math) and internally creates sub-grids for each module.
     * @param {string} title - The section title (e.g., "Reading & Writing").
     * @param {string} cssClass - The CSS class to add (e.g., "rw-section").
     * @param {number} moduleNumA - The first module number (e.g., 1 for R&W, 3 for Math).
     * @param {number} moduleNumB - The second module number (e.g., 2 for R&W, 4 for Math).
     * @param {Array} allSectionQuestions - An array of ALL question objects for this section.
     * @param {object} data - The main result data object.
     */
    function renderReviewSection(title, cssClass, moduleNumA, moduleNumB, allSectionQuestions, data) {
        const sectionClone = sectionTemplate.content.cloneNode(true);
        const sectionEl = sectionClone.querySelector('.review-section');
        const titleEl = sectionClone.querySelector('.section-title');
        const rawScoreEl = sectionClone.querySelector('.section-raw-score');

        titleEl.classList.add(cssClass);
        sectionClone.querySelector('.title-text').textContent = `Review: ${title}`;

        // Set the raw score display for the section
        if (cssClass === 'rw-section') {
            rawScoreEl.textContent = `${data.rwRaw} / ${data.rwTotal} Correct`;
        } else if (cssClass === 'math-section') {
            rawScoreEl.textContent = `${data.mathRaw} / ${data.mathTotal} Correct`;
        }

        const userAnswers = data.userAnswers || {};

        // Filter and sort questions for Module A
        const moduleA_Qs = allSectionQuestions
            .filter(q => q.module === moduleNumA)
            .sort((a, b) => a.questionNumber - b.questionNumber);

        // Filter and sort questions for Module B
        const moduleB_Qs = allSectionQuestions
            .filter(q => q.module === moduleNumB)
            .sort((a, b) => a.questionNumber - b.questionNumber);

        // --- Create Module A Container ---
        const moduleA_Container = document.createElement('div');
        moduleA_Container.className = 'module-review-container';

        const moduleA_Title = document.createElement('h4');
        moduleA_Title.className = 'module-title';
        moduleA_Title.textContent = `Module ${moduleNumA <= 2 ? 1 : 1}`; // 1->1, 3->1
        moduleA_Container.appendChild(moduleA_Title);

        const moduleA_Grid = document.createElement('div');
        moduleA_Grid.className = 'review-grid';
        populateGrid(moduleA_Grid, moduleA_Qs, userAnswers);
        moduleA_Container.appendChild(moduleA_Grid);

        sectionEl.appendChild(moduleA_Container);

        // --- Create Module B Container ---
        const moduleB_Container = document.createElement('div');
        moduleB_Container.className = 'module-review-container';

        const moduleB_Title = document.createElement('h4');
        moduleB_Title.className = 'module-title';
        moduleB_Title.textContent = `Module ${moduleNumB <= 2 ? 2 : 2}`; // 2->2, 4->2
        moduleB_Container.appendChild(moduleB_Title);

        const moduleB_Grid = document.createElement('div');
        moduleB_Grid.className = 'review-grid';
        populateGrid(moduleB_Grid, moduleB_Qs, userAnswers);
        moduleB_Container.appendChild(moduleB_Grid);

        sectionEl.appendChild(moduleB_Container);

        // Append the whole section to the page
        resultsContainer.appendChild(sectionClone);
    }


    /**
     * Displays a final error message to the user.
     * @param {string} message - The error message to show.
     */
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
            // User is logged in, proceed to load results
            loadResults();
        } else {
            // User is not logged in, main.js should handle redirect,
            // but we'll show an error just in case.
            showError("You must be logged in to view results.");
        }
    });

}); // --- END OF DOMContentLoaded ---

