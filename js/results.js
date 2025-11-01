// js/results.js - Logic for the new Test Results page

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
        const resultId = urlParams.get('resultId');

        if (!resultId) {
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
            const resultDoc = await db.collection('testResults').doc(resultId).get();
            
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

            // --- 3. Filter and Render Incorrect Questions ---
            const allQuestions = resultData.allQuestions || [];
            const userAnswers = resultData.userAnswers || {};

            const incorrectRW = allQuestions.filter(q => 
                (q.module === 1 || q.module === 2) && 
                userAnswers[q.id] !== q.correctAnswer
            );

            const incorrectMath = allQuestions.filter(q => 
                (q.module === 3 || q.module === 4) && 
                userAnswers[q.id] !== q.correctAnswer
            );

            // Render the sections
            renderReviewSection("Reading & Writing", "rw-section", incorrectRW, resultData);
            renderReviewSection("Math", "math-section", incorrectMath, resultData);
            
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
     * Renders a review section (R&W or Math) with its grid of incorrect questions.
     * @param {string} title - The section title (e.g., "Reading & Writing").
     * @param {string} cssClass - The CSS class to add (e.g., "rw-section").
     * @param {Array} incorrectQuestions - An array of incorrect question objects.
     * @param {object} data - The main result data object.
     */
    function renderReviewSection(title, cssClass, incorrectQuestions, data) {
        const sectionClone = sectionTemplate.content.cloneNode(true);
        const sectionEl = sectionClone.querySelector('.review-section');
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

        if (incorrectQuestions.length === 0) {
            gridEl.innerHTML = `<p class="no-incorrect">No incorrect questions in this section. Great job!</p>`;
        } else {
            // Sort by module then question number
            incorrectQuestions.sort((a, b) => {
                if (a.module !== b.module) return a.module - b.module;
                return a.questionNumber - b.questionNumber;
            });
            
            incorrectQuestions.forEach(q => {
                const qBtnClone = qNumTemplate.content.cloneNode(true);
                const qBtnEl = qBtnClone.querySelector('.q-number-btn');
                
                // Get the display module/section number
                const sectionNum = q.module < 3 ? 1 : 2;
                const moduleNum = (q.module % 2) === 0 ? 2 : 1; // 1->1, 2->2, 3->1, 4->2
                
                qBtnClone.querySelector('.q-number').textContent = `M${moduleNum} : Q${q.questionNumber}`;
                
                // Store data on the button to find it later
                qBtnEl.dataset.questionId = q.id; 
                
                qBtnEl.addEventListener('click', () => {
                    // TODO: Implement the click-to-review logic
                    console.log("Clicked question:", q.id);
                    alert(`Review for question ${q.id} coming soon!`);
                    // We will make this open a new page or modal in the next batch
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
        loadingContainer.style.display = 'none';
        resultsContainer.innerHTML = `<div class="results-header"><p>${message}</p></div>`;
        resultsContainer.classList.add('loaded');
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
