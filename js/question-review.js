// js/question-review.js - Logic for the new single question review page

document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Firebase ---
    const db = firebase.firestore();
    const auth = firebase.auth();
    const MQ = MathQuill.getInterface(2); // For rendering math

    // --- Page Elements ---
    const loadingContainer = document.getElementById('review-loading-container');
    const contentBody = document.getElementById('review-content-body');
    const testMain = document.getElementById('review-main-content');
    
    const headerTitle = document.getElementById('review-header-title');
    const headerSubtitle = document.getElementById('review-header-subtitle');
    const backToResultsBtn = document.getElementById('back-to-results-btn');
    
    const stimulusPane = document.getElementById('review-stimulus-pane');
    const stimulusPaneContent = stimulusPane.querySelector('.pane-content');
    
    const qNumberDisplay = document.getElementById('q-number-display');
    const qResultDisplay = document.getElementById('question-result-display');
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
     * Main function to load and display the specific question.
     */
    async function loadQuestionReview() {
        const urlParams = new URLSearchParams(window.location.search);
        resultId = urlParams.get('resultId');
        questionId = urlParams.get('questionId');

        if (!resultId || !questionId) {
            showError("Missing Test or Question ID. Please return to results.");
            return;
        }

        // Set back button URL
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
            // --- 1. Fetch Result Data ---
            const resultDoc = await db.collection('testResults').doc(resultId).get();
            if (!resultDoc.exists) {
                showError("Test result not found.");
                return;
            }
            resultData = resultDoc.data();

            // Security check
            if (resultData.userId !== user.uid) {
                 showError("Access Denied.");
                 return;
            }

            // --- 2. Find the Specific Question ---
            questionData = (resultData.allQuestions || []).find(q => q.id === questionId);
            if (!questionData) {
                showError("Question data could not be found within the test result.");
                return;
            }

            // --- 3. Render Content ---
            renderPageContent();

            // --- 4. Finalize ---
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (contentBody) contentBody.style.visibility = 'visible';
            renderAllMath();

        } catch (error) {
            console.error("Error loading question review:", error);
            showError("An error occurred while loading this review.");
        }
    }

    /**
     * Renders all the dynamic content onto the page.
     */
    function renderPageContent() {
        if (!questionData) return;

        const isMath = questionData.module > 2;
        const moduleNum = (questionData.module % 2) === 0 ? 2 : 1;
        const sectionType = isMath ? 'Math' : 'Reading & Writing';

        // --- Header ---
        if (headerTitle) headerTitle.textContent = `Review: ${sectionType}`;
        if (headerSubtitle) headerSubtitle.textContent = `Module ${moduleNum}, Question ${questionData.questionNumber}`;
        if (qNumberDisplay) qNumberDisplay.textContent = questionData.questionNumber;

        // --- Layout ---
        if (testMain) testMain.classList.toggle('math-layout-active', isMath);

        // --- Stimulus ---
        const isStimulusEmpty = (!questionData.passage || questionData.passage.trim() === '' || questionData.passage === '<p><br></p>') && !questionData.imageUrl;
        if (stimulusPane) stimulusPane.classList.toggle('is-empty', isStimulusEmpty);
        if (stimulusPaneContent) {
            const imgPos = questionData.imagePosition || 'above';
            const imgHTML = questionData.imageUrl ? `<img src="${questionData.imageUrl}" alt="Stimulus Image" style="width: ${questionData.imageWidth || '100%'};">` : '';
            const passageHTML = questionData.passage || '';
            stimulusPaneContent.innerHTML = (imgPos === 'below') ? (passageHTML + imgHTML) : (imgHTML + passageHTML);
        }

        // --- Question & Result ---
        const userAnswer = resultData.userAnswers[questionId];
        const correctAnswer = questionData.correctAnswer;
        const isCorrect = userAnswer === correctAnswer;

        if (qResultDisplay) {
            if (isCorrect) {
                qResultDisplay.innerHTML = `<span class="correct"><i class="fa-solid fa-check"></i> Correct</span>`;
            } else {
                qResultDisplay.innerHTML = `<span class="incorrect"><i class="fa-solid fa-xmark"></i> Incorrect</span>`;
            }
        }
        
        if (qPromptContent) {
            qPromptContent.innerHTML = `<div class="question-text">${questionData.prompt || ''}</div>`;
        }

        // --- Options / Fill-in ---
        if (qOptionsContent) {
            if (questionData.format === 'mcq') {
                qOptionsContent.innerHTML = renderMCQOptions(questionData, userAnswer, correctAnswer);
            } else if (questionData.format === 'fill-in') {
                qOptionsContent.innerHTML = renderFillIn(questionData, userAnswer, correctAnswer);
            }
        }
        
        // --- Explanation ---
        if (qExplanationContent) {
            const explanation = questionData.explanation || '<p><i>No explanation provided for this question.</i></p>';
            if (explanation === '<p><br></p>' || explanation.trim() === '') {
                 qExplanationContent.innerHTML = '<p><i>No explanation provided for this question.</i></p>';
            } else {
                qExplanationContent.innerHTML = explanation;
            }
        }
    }

    /**
     * Generates HTML for Multiple Choice Options
     */
    function renderMCQOptions(q, userAns, correctAns) {
        const options = q.options || {};
        let html = '<div class="question-options">';
        ['A', 'B', 'C', 'D'].forEach(opt => {
            const optText = options[opt] || '';
            let classes = "option-wrapper";
            
            if (opt === correctAns) {
                classes += " correct-answer";
            } else if (opt === userAns) {
                classes += " incorrect-answer";
            }

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

    /**
     * Generates HTML for Fill-in-the-Blank review
     */
    function renderFillIn(q, userAns, correctAns) {
        let userAnswerHtml = '';
        if (userAns === correctAns) {
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
                <div class="correct-answer">${q.correctAnswer || 'N/A'}</div>
            </div>`;
    }

    /**
     * Displays a final error message to the user.
     */
    function showError(message) {
        if (loadingContainer) loadingContainer.style.display = 'none';
        if (contentBody) contentBody.style.visibility = 'hidden';
        
        // Re-use loading container for error message
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
            // main.js will also trigger a redirect
        }
    });

}); // --- END OF DOMContentLoaded ---
