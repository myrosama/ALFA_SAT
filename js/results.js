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
            
            // --- 2. Render Header ---
            renderHeader(resultData);

            // --- 3. Filter and Render ALL Questions ---
            const allQuestions = resultData.allQuestions || [];
            
            // Get all R&W questions, not just incorrect ones
            const allRW = allQuestions
                .filter(q => (q.module === 1 || q.module === 2));
                // Sorting will be handled inside renderReviewSection

            // Get all Math questions, not just incorrect ones
            const allMath = allQuestions
                .filter(q => (q.module === 3 || q.module === 4));
                // Sorting will be handled inside renderReviewSection

            // Render the sections
            renderReviewSection("Reading & Writing", "rw-section", 1, 2, allRW, resultData);
            renderReviewSection("Math", "math-section", 3, 4, allMath, resultData);
            
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

