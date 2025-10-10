// js/review.js - CLEAN VERSION
document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('review-grid-container');
    const moduleTitle = document.getElementById('review-module-title');
    const finishBtn = document.getElementById('finish-review-btn');
    const reviewDataJSON = sessionStorage.getItem('reviewData');
    if (!reviewDataJSON) {
        gridContainer.innerHTML = "<p>Could not load review data.</p>";
        return;
    }
    const { questions, answers, marked, moduleIndex } = JSON.parse(reviewDataJSON);
    const moduleType = moduleIndex <= 1 ? 'Reading & Writing' : 'Math';
    const moduleNumber = moduleIndex <= 1 ? moduleIndex + 1 : moduleIndex - 1;
    moduleTitle.textContent = `${moduleType}, Module ${moduleNumber}`;
    if (moduleIndex >= 3) {
        finishBtn.textContent = 'Finish Test and See Results';
    }
    questions.forEach(question => {
        const item = document.createElement('div');
        item.classList.add('review-item');
        const questionId = question.id;
        let statusText = 'Unanswered';
        if (answers[questionId]) {
            item.classList.add('answered');
            statusText = `Answered: ${answers[questionId]}`;
        } else {
            item.classList.add('unanswered');
        }
        if (marked[questionId]) {
            item.classList.add('for-review');
        }
        item.innerHTML = `<div class="q-number">${question.questionNumber}</div><div class="q-status">${statusText}</div>`;
        item.addEventListener('click', () => {
            sessionStorage.setItem('returnToQuestion', question.questionNumber);
            window.location.href = `test.html?id=${sessionStorage.getItem('currentTestId')}`;
        });
        gridContainer.appendChild(item);
    });
    finishBtn.addEventListener('click', () => {
        sessionStorage.removeItem('reviewData');
        sessionStorage.removeItem('returnToQuestion');
        const nextModuleIndex = moduleIndex + 1;
        if (nextModuleIndex < 4) {
            sessionStorage.setItem('startModuleIndex', nextModuleIndex);
            window.location.href = `test.html?id=${sessionStorage.getItem('currentTestId')}`;
        } else {
            alert("Test Finished! Scoring is next.");
            window.location.href = 'dashboard.html';
        }
    });
});