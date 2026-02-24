// js/ai-analysis.js — Post-test AI Score Analysis using Gemini
// Analyzes student performance and provides personalized insights

/**
 * Calls Gemini to analyze test results and provide insights.
 * @param {object} scoreResult - Score data from calculateScore()
 * @param {object} userAnswers - Map of questionId -> student's answer
 * @param {Array} allQuestionsByModule - Array of 4 module arrays of question objects
 * @returns {object} AI analysis result
 */
async function runAIScoreAnalysis(scoreResult, userAnswers, allQuestionsByModule) {
    // Check if API key exists
    if (typeof AI_API_KEY === 'undefined' || !AI_API_KEY) {
        console.warn('AI_API_KEY not found in config.js, skipping AI analysis.');
        return null;
    }

    try {
        // Build question summary for the prompt (avoid sending full stimulus text to save tokens)
        const questionSummary = [];
        let qNum = 0;

        for (let modIdx = 0; modIdx < allQuestionsByModule.length; modIdx++) {
            const moduleQuestions = allQuestionsByModule[modIdx] || [];
            const section = modIdx < 2 ? 'Reading & Writing' : 'Math';
            const moduleNum = modIdx < 2 ? modIdx + 1 : modIdx - 1;

            moduleQuestions.forEach(q => {
                qNum++;
                const studentAnswer = userAnswers[q.id] || 'No answer';
                const isCorrect = studentAnswer === q.correctAnswer;

                questionSummary.push({
                    number: qNum,
                    section: section,
                    module: moduleNum,
                    correct: isCorrect,
                    studentAnswer: studentAnswer,
                    correctAnswer: q.correctAnswer,
                    // Include skill/domain if available
                    skill: q.skill || q.domain || 'Unknown',
                    difficulty: q.difficulty || 'Unknown'
                });
            });
        }

        const correctCount = questionSummary.filter(q => q.correct).length;
        const totalCount = questionSummary.length;
        const rwQuestions = questionSummary.filter(q => q.section === 'Reading & Writing');
        const mathQuestions = questionSummary.filter(q => q.section === 'Math');

        const prompt = `You are an expert SAT tutor and score analyst. A student just completed a practice SAT test. Analyze their performance and provide personalized insights.

## Test Results
- **Total Score:** ${scoreResult.totalScore} / 1600
- **Reading & Writing Score:** ${scoreResult.rwScore} / 800 (${scoreResult.rwRaw} out of ${scoreResult.rwTotal} correct)
- **Math Score:** ${scoreResult.mathScore} / 800 (${scoreResult.mathRaw} out of ${scoreResult.mathTotal} correct)
- **Overall:** ${correctCount} out of ${totalCount} questions correct

## Questions the Student Got WRONG:
${questionSummary.filter(q => !q.correct).map(q =>
            `- Q${q.number} (${q.section}, Module ${q.module}) — Student: "${q.studentAnswer}", Correct: "${q.correctAnswer}", Skill: ${q.skill}, Difficulty: ${q.difficulty}`
        ).join('\n') || 'None — perfect score!'}

## Questions the Student Got RIGHT:
${questionSummary.filter(q => q.correct).length} questions answered correctly across both sections.

## Your Task
Provide a JSON response with the following structure ONLY (no markdown, no code blocks, just pure JSON):
{
    "scoreConfidence": "A string: 'Accurate', 'Slightly High', or 'Slightly Low' based on your assessment of whether the raw-to-scaled score seems appropriate",
    "scoreAssessment": "A 1-2 sentence assessment of the overall score",
    "rwAnalysis": {
        "strengths": ["List 2-3 specific strength areas based on correct answers"],
        "weaknesses": ["List 2-3 specific areas needing improvement based on wrong answers"],
        "tip": "One actionable study tip for R&W improvement"
    },
    "mathAnalysis": {
        "strengths": ["List 2-3 specific strength areas"],
        "weaknesses": ["List 2-3 specific areas needing improvement"],
        "tip": "One actionable study tip for Math improvement"
    },
    "overallTip": "One motivational and strategic overall study recommendation",
    "estimatedScoreRange": {
        "low": number,
        "high": number,
        "explanation": "Brief explanation of this range estimate"
    }
}`;

        // Call Gemini API
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_API_KEY}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Gemini API error:', response.status, errText);
            return null;
        }

        const result = await response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Parse JSON from response (strip any markdown formatting if present)
        const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const analysis = JSON.parse(jsonStr);

        console.log('AI Analysis complete:', analysis);
        return analysis;

    } catch (error) {
        console.error('AI Analysis failed:', error);
        return null;
    }
}

/**
 * Renders AI analysis results into the results page.
 * @param {object} analysis - The parsed AI analysis object
 * @param {HTMLElement} container - The results container to append to
 */
function renderAIAnalysis(analysis, container) {
    if (!analysis || !container) return;

    const section = document.createElement('div');
    section.className = 'ai-analysis-section';
    section.innerHTML = `
        <div class="ai-analysis-card">
            <div class="ai-header">
                <div class="ai-badge">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> AI Score Analysis
                </div>
                <span class="ai-confidence ${getConfidenceClass(analysis.scoreConfidence)}">
                    ${analysis.scoreConfidence || 'N/A'}
                </span>
            </div>

            <p class="ai-assessment">${analysis.scoreAssessment || ''}</p>

            ${analysis.estimatedScoreRange ? `
                <div class="ai-score-range">
                    <i class="fa-solid fa-chart-line"></i>
                    <strong>Estimated True Score Range:</strong>
                    ${analysis.estimatedScoreRange.low} - ${analysis.estimatedScoreRange.high}
                    <span class="range-explanation">${analysis.estimatedScoreRange.explanation || ''}</span>
                </div>
            ` : ''}

            <div class="ai-sections-grid">
                ${renderAnalysisColumn('Reading & Writing', 'fa-book', analysis.rwAnalysis)}
                ${renderAnalysisColumn('Math', 'fa-calculator', analysis.mathAnalysis)}
            </div>

            ${analysis.overallTip ? `
                <div class="ai-overall-tip">
                    <i class="fa-solid fa-lightbulb"></i>
                    <p>${analysis.overallTip}</p>
                </div>
            ` : ''}
        </div>
    `;

    container.appendChild(section);
}

function renderAnalysisColumn(title, icon, sectionData) {
    if (!sectionData) return '';
    return `
        <div class="ai-section-column">
            <h4><i class="fa-solid ${icon}"></i> ${title}</h4>
            <div class="ai-sw-group">
                <div class="ai-strengths">
                    <strong><i class="fa-solid fa-check-circle"></i> Strengths</strong>
                    <ul>${(sectionData.strengths || []).map(s => `<li>${s}</li>`).join('')}</ul>
                </div>
                <div class="ai-weaknesses">
                    <strong><i class="fa-solid fa-times-circle"></i> Areas to Improve</strong>
                    <ul>${(sectionData.weaknesses || []).map(w => `<li>${w}</li>`).join('')}</ul>
                </div>
            </div>
            ${sectionData.tip ? `<p class="ai-tip"><i class="fa-solid fa-arrow-right"></i> ${sectionData.tip}</p>` : ''}
        </div>
    `;
}

function getConfidenceClass(confidence) {
    if (!confidence) return '';
    const c = confidence.toLowerCase();
    if (c.includes('accurate')) return 'confidence-accurate';
    if (c.includes('high')) return 'confidence-high';
    if (c.includes('low')) return 'confidence-low';
    return '';
}
