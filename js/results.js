// js/results.js - Logic for the new Test Results page
// UPDATED: To show all questions (correct & incorrect) and link to a new review page.

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
            
            // --- 2. Render Header ---
            renderHeader(resultData);

            // --- 3. Filter and Render ALL Questions ---
            const allQuestions = resultData.allQuestions || [];
            
            // Get all R&W questions, not just incorrect ones
            const allRW = allQuestions
                .filter(q => (q.module === 1 || q.module === 2))
                .sort((a, b) => (a.module - b.module) || (a.questionNumber - b.questionNumber)); // Sort

            // Get all Math questions, not just incorrect ones
            const allMath = allQuestions
                .filter(q => (q.module === 3 || q.module === 4))
                .sort((a, b) => (a.module - b.module) || (a.questionNumber - b.questionNumber)); // Sort

            // Render the sections
            renderReviewSection("Reading & Writing", "rw-section", allRW, resultData);
            renderReviewSection("Math", "math-section", allMath, resultData);
            
            // --- 4. Finalize ---
            loadingContainer.style.display = 'none'; // Hide loading spinner
            resultsContainer.classList.add('loaded'); // Fade in content

            // Render any math formulas in the dynamically added content
            renderAllMath(); 

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
        headerClone.getElementById('total-score-display').textContent = data.totalScore || 'N/A';
        headerClone.getElementById('rw-score-display').textContent = data.rwScore || 'N/A';
        headerClone.getElementById('math-score-display').textContent = data.mathScore || 'N/A';
        headerClone.getElementById('rw-raw-display').textContent = `${data.rwRaw} / ${data.rwTotal} Correct`;
        headerClone.getElementById('math-raw-display').textContent = `${data.mathRaw} / ${data.mathTotal} Correct`;

        resultsContainer.appendChild(headerClone);
    }

    /**
     * Renders a review section (R&W or Math) with its grid of ALL questions.
     * @param {string} title - The section title (e.g., "Reading & Writing").
     * @param {string} cssClass - The CSS class to add (e.g., "rw-section").
     * @param {Array} allSectionQuestions - An array of ALL question objects for this section.
     * @param {object} data - The main result data object.
     */
    function renderReviewSection(title, cssClass, allSectionQuestions, data) {
        const sectionClone = sectionTemplate.content.cloneNode(true);
        const titleEl = sectionClone.querySelector('.section-title');
        const gridEl = sectionClone.querySelector('.review-grid');
        const rawScoreEl = sectionClone.querySelector('.section-raw-score');

        titleEl.classList.add(cssClass);
        sectionClone.querySelector('.title-text').textContent = `Review: ${title}`;

        // Set the raw score display for the section
        if (cssClass === 'rw-section') {
            rawScoreEl.textContent = `${data.rwRaw} / ${data.rwTotal} Correct`;
        } else if (cssClass === 'math-section') {
            rawScoreEl.textContent = `${data.mathRaw} / ${data.mathTotal} Correct`;
        }

        if (allSectionQuestions.length === 0) {
            gridEl.innerHTML = `<p class="no-incorrect">No questions found for this section.</p>`;
        } else {
            const userAnswers = data.userAnswers || {};
            
            allSectionQuestions.forEach(q => {
                const isCorrect = userAnswers[q.id] === q.correctAnswer;
                
                const qBtnClone = qNumTemplate.content.cloneNode(true);
                const qBtnEl = qBtnClone.querySelector('.q-number-btn');
                
                // Add correct/incorrect class for styling
                qBtnEl.classList.add(isCorrect ? 'correct' : 'incorrect');
                
                // Get the display module/section number
                const moduleNum = (q.module % 2) === 0 ? 2 : 1; // 1->1, 2->2, 3->1, 4->2
                
                qBtnClone.querySelector('.q-number').textContent = `M${moduleNum} : Q${q.questionNumber}`;
                
                // Store data on the button to find it later
                qBtnEl.dataset.questionId = q.id; 
                
                // UPDATED: Add event listener to link to the new review page
                qBtnEl.addEventListener('click', () => {
                    window.location.href = `question-review.html?resultId=${currentResultId}&questionId=${q.id}`;
                });
                
                gridEl.appendChild(qBtnClone);
            });
        }
        
        resultsContainer.appendChild(sectionClone);
    }


    /**
     * Displays a final error message to the user.
     * @param {string} message - The error message to show.
     */
    function showError(message) {
        if (loadingContainer) loadingContainer.style.display = 'none';
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
