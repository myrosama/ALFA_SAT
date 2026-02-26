// js/ai-scoring-engine.js
// Score Processing Engine for ALFA SAT Proctored Tests
// Uses Gemini 2.5 Pro for score estimation
// Processes students one-by-one with IRT-inspired scoring prompts

// === LOGGING UTILITY ===
function scoringLog(level, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[SCORING ${timestamp}]`;
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
}

/**
 * Safely write to Firestore — tries set(merge), falls back to update, logs errors but doesn't throw.
 * Returns true if write succeeded, false otherwise.
 */
async function safeFirestoreWrite(docRef, data, label) {
    try {
        await docRef.set(data, { merge: true });
        scoringLog('info', `Write OK: ${label}`);
        return true;
    } catch (err1) {
        scoringLog('warn', `set(merge) failed for ${label}: ${err1.message}. Trying update()...`);
        try {
            await docRef.update(data);
            scoringLog('info', `Update OK: ${label}`);
            return true;
        } catch (err2) {
            scoringLog('error', `All writes failed for ${label}: ${err2.message}`);
            return false;
        }
    }
}

/**
 * Main queue processor: processes all students for a proctored session.
 * Called from admin panel.
 *
 * @param {string} sessionCode — the proctored session code
 * @param {function} onProgress — callback(scored, total, currentStudentName)
 * @returns {object} { success, scoredCount, errors }
 */
async function processSessionScores(sessionCode, onProgress) {
    const db = firebase.firestore();

    scoringLog('info', '=== SCORING PIPELINE START ===');
    scoringLog('info', 'Session code:', sessionCode);

    // 1. Get session info
    const sessionRef = db.collection('proctoredSessions').doc(sessionCode);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) throw new Error('Session not found');
    const sessionData = sessionDoc.data();
    const testId = sessionData.testId;
    scoringLog('info', 'Session found. Test ID:', testId, '| Test name:', sessionData.testName);

    // 2. Mark session as processing (non-blocking — don't fail if permissions deny)
    await safeFirestoreWrite(sessionRef, {
        scoringStatus: 'processing',
        scoringStartedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, 'proctoredSessions/' + sessionCode + ' → processing');

    // 3. Fetch ALL questions for this test
    scoringLog('info', 'Fetching questions...');
    const questionsSnap = await db.collection('tests').doc(testId).collection('questions').get();
    const allQuestions = [];
    questionsSnap.forEach(d => allQuestions.push({ id: d.id, ...d.data() }));
    allQuestions.sort((a, b) => {
        if (a.module !== b.module) return a.module - b.module;
        return (a.questionNumber || 0) - (b.questionNumber || 0);
    });
    scoringLog('info', `Loaded ${allQuestions.length} questions`);

    // 4. Fetch all completed participants
    const participantsSnap = await sessionRef.collection('participants')
        .where('status', '==', 'completed').get();

    const participants = [];
    participantsSnap.forEach(d => participants.push({ id: d.id, ...d.data() }));
    scoringLog('info', `Found ${participants.length} completed participants`);

    if (participants.length === 0) {
        await safeFirestoreWrite(sessionRef, { scoringStatus: 'scored', scoredCount: 0 },
            'proctoredSessions/' + sessionCode + ' → scored (0 students)');
        return { success: true, scoredCount: 0, errors: [] };
    }

    // 5. Collect all result docs
    scoringLog('info', 'Fetching result documents...');
    const resultDocs = [];
    for (const p of participants) {
        const resultId = `${p.id}_${testId}_${sessionCode}`;
        try {
            const resultDoc = await db.collection('testResults').doc(resultId).get();
            if (resultDoc.exists) {
                resultDocs.push({ resultId, participantId: p.id, data: resultDoc.data() });
                scoringLog('info', `  Result found: ${resultId}`);
            } else {
                scoringLog('warn', `  Result NOT found: ${resultId}`);
            }
        } catch (e) {
            scoringLog('error', `  Error reading result ${resultId}:`, e.message);
        }
    }
    scoringLog('info', `Collected ${resultDocs.length} result docs out of ${participants.length} participants`);

    if (resultDocs.length === 0) {
        scoringLog('error', 'No result documents found. Cannot score.');
        return { success: false, scoredCount: 0, errors: [{ resultId: 'N/A', error: 'No result documents found' }] };
    }

    // 6. Collect raw scores for group comparison
    const groupRawScores = resultDocs.map(r => ({
        name: r.data.userId,
        rwRaw: r.data.rwRaw || 0,
        mathRaw: r.data.mathRaw || 0,
        rwTotal: r.data.rwTotal || 54,
        mathTotal: r.data.mathTotal || 44
    }));

    // 7. Process each student one-by-one
    let scoredCount = 0;
    const errors = [];

    for (let i = 0; i < resultDocs.length; i++) {
        const result = resultDocs[i];
        scoringLog('info', `--- Student ${i + 1}/${resultDocs.length}: ${result.resultId} ---`);

        // Skip already-scored students on re-runs
        if (result.data.aiEstimatedScore) {
            scoringLog('info', `  Already scored (AI total: ${result.data.aiEstimatedScore.totalScore}). Skipping.`);
            scoredCount++;
            if (onProgress) onProgress(i + 1, resultDocs.length, `Student ${i + 1} already scored — skipped`);
            continue;
        }

        if (onProgress) onProgress(i, resultDocs.length, `Processing student ${i + 1}...`);

        try {
            // Rate limit: wait 12 seconds between calls (5 RPM = 1 per 12s)
            if (i > 0) {
                scoringLog('info', 'Rate limit: waiting 12 seconds...');
                await new Promise(r => setTimeout(r, 12000));
            }

            scoringLog('info', 'Calling Gemini API...');
            const aiScore = await scoreStudentWithAI(
                result.data,
                allQuestions,
                groupRawScores,
                sessionData.testName || 'SAT Practice'
            );

            if (aiScore) {
                scoringLog('info', `Score received: R&W=${aiScore.rwScore}, Math=${aiScore.mathScore}, Total=${aiScore.totalScore}`);

                // Write AI score to testResults
                const writeOk = await safeFirestoreWrite(
                    db.collection('testResults').doc(result.resultId),
                    {
                        aiEstimatedScore: aiScore,
                        scoringStatus: 'scored',
                        // Unify: also update top-level score fields so ALL consumers show the same score
                        totalScore: aiScore.totalScore,
                        rwScore: aiScore.rwScore,
                        mathScore: aiScore.mathScore
                    },
                    'testResults/' + result.resultId + ' → scored'
                );

                if (writeOk) {
                    scoredCount++;
                } else {
                    errors.push({ resultId: result.resultId, error: 'Failed to save score to Firestore' });
                }
            } else {
                scoringLog('warn', 'Scoring returned null for', result.resultId);
                errors.push({ resultId: result.resultId, error: 'Scoring returned null' });
            }

            // Update session progress (non-blocking)
            await safeFirestoreWrite(sessionRef, { scoredCount },
                'proctoredSessions/' + sessionCode + ' → progress ' + scoredCount);

        } catch (err) {
            scoringLog('error', `Error scoring ${result.resultId}:`, err.message);
            errors.push({ resultId: result.resultId, error: err.message });
        }

        if (onProgress) onProgress(i + 1, resultDocs.length, scoredCount === i + 1 ? 'Complete' : 'Error');
    }

    // 8. Second pass: comparison normalization (if all scored successfully)
    if (scoredCount === resultDocs.length && scoredCount > 1) {
        scoringLog('info', '=== NORMALIZATION PASS ===');
        if (onProgress) onProgress(scoredCount, resultDocs.length, 'Normalizing scores...');

        try {
            await new Promise(r => setTimeout(r, 12000)); // Rate limit
            await compareAndNormalizeScores(db, resultDocs, sessionCode, testId, allQuestions);
        } catch (err) {
            scoringLog('warn', 'Score comparison pass failed (individual scores still valid):', err.message);
        }
    }

    // 9. Mark session as scored
    const testCreatedAt = sessionData.createdAt?.toDate?.() || new Date();
    const publishAfter = new Date(testCreatedAt.getTime() + 12 * 60 * 60 * 1000);

    await safeFirestoreWrite(sessionRef, {
        scoringStatus: 'scored',
        scoredCount,
        totalParticipants: resultDocs.length,
        scoredAt: firebase.firestore.FieldValue.serverTimestamp(),
        publishAfter: firebase.firestore.Timestamp.fromDate(publishAfter)
    }, 'proctoredSessions/' + sessionCode + ' → scored (final)');

    scoringLog('info', `=== SCORING COMPLETE: ${scoredCount}/${resultDocs.length} scored, ${errors.length} errors ===`);
    if (onProgress) onProgress(scoredCount, resultDocs.length, 'Processing complete.');

    return { success: true, scoredCount, errors };
}


/**
 * Score a single student using Gemini 2.5 Pro with IRT-inspired prompt.
 */
async function scoreStudentWithAI(resultData, allQuestions, groupRawScores, testName) {
    if (typeof AI_API_KEY === 'undefined' || !AI_API_KEY) {
        scoringLog('error', 'AI_API_KEY not found — cannot score');
        return null;
    }

    const userAnswers = resultData.userAnswers || {};

    // Build detailed question analysis
    const wrongQuestions = [];
    const rightQuestions = [];

    allQuestions.forEach(q => {
        const studentAns = userAnswers[q.id];
        const effectiveCorrect = q.format === 'fill-in' && q.fillInAnswer
            ? q.fillInAnswer.replace(/<[^>]*>/g, '').trim()
            : q.correctAnswer;
        const correct = studentAns === effectiveCorrect;
        const info = {
            module: q.module,
            number: q.questionNumber,
            section: q.module <= 2 ? 'R&W' : 'Math',
            difficulty: q.difficulty || 'medium',
            skill: q.skill || q.domain || 'general',
            correctAnswer: effectiveCorrect,
            studentAnswer: studentAns || '(blank)'
        };
        if (correct) rightQuestions.push(info);
        else wrongQuestions.push(info);
    });

    // Determine module path (adaptive routing)
    const m1Questions = allQuestions.filter(q => q.module === 1);
    const m1Correct = m1Questions.filter(q => {
        const ec = q.format === 'fill-in' && q.fillInAnswer ? q.fillInAnswer.replace(/<[^>]*>/g, '').trim() : q.correctAnswer;
        return userAnswers[q.id] === ec;
    }).length;
    const m1Total = m1Questions.length;
    const m1Pct = m1Total > 0 ? (m1Correct / m1Total * 100).toFixed(0) : 0;

    const m3Questions = allQuestions.filter(q => q.module === 3);
    const m3Correct = m3Questions.filter(q => {
        const ec = q.format === 'fill-in' && q.fillInAnswer ? q.fillInAnswer.replace(/<[^>]*>/g, '').trim() : q.correctAnswer;
        return userAnswers[q.id] === ec;
    }).length;
    const m3Total = m3Questions.length;
    const m3Pct = m3Total > 0 ? (m3Correct / m3Total * 100).toFixed(0) : 0;

    // Group stats for comparison
    const avgRwRaw = groupRawScores.reduce((s, g) => s + g.rwRaw, 0) / groupRawScores.length;
    const avgMathRaw = groupRawScores.reduce((s, g) => s + g.mathRaw, 0) / groupRawScores.length;

    scoringLog('info', `Student stats: R&W ${resultData.rwRaw}/${resultData.rwTotal || 54}, Math ${resultData.mathRaw}/${resultData.mathTotal || 44}`);
    scoringLog('info', `Module paths: M1=${m1Pct}% (${Number(m1Pct) > 65 ? 'HARD' : 'EASY'}), M3=${m3Pct}% (${Number(m3Pct) > 65 ? 'HARD' : 'EASY'})`);
    scoringLog('info', `Wrong: ${wrongQuestions.length}, Right: ${rightQuestions.length}`);

    const prompt = `You are a College Board SAT scoring expert. You are tasked with estimating the ACCURATE scaled score for a student who took a Digital SAT practice test.

## Background: How Digital SAT Scoring Works
The Digital SAT uses Item Response Theory (IRT) and equating:
- Each section (R&W, Math) uses 2 modules. Module 1 is standard difficulty. Module 2 adapts based on Module 1 performance.
- If a student scores well on Module 1 (roughly >65% correct), they get a HARDER Module 2 with higher scoring ceiling.
- If a student scores poorly on Module 1 (<65%), they get an EASIER Module 2 with a scoring cap (~600).
- Question difficulty matters: getting a HARD question wrong is penalized less than getting an EASY question wrong.
- Getting a HARD question right is rewarded more than getting an EASY question right.
- The raw-to-scaled conversion is NOT linear — it's sigmoidal, with steeper jumps in the middle range.

## Official Score Ranges (Reference)
- R&W: 54 questions total. Raw 54 = 800, Raw 51-52 = 760-780, Raw 45-48 = 660-700, Raw 35-40 = 530-580
- Math: 44 questions total. Raw 44 = 800, Raw 41-42 = 780-800, Raw 35-38 = 730-780, Raw 25-30 = 590-660

## This Student's Performance

**Test:** ${testName}
**R&W Raw Score:** ${resultData.rwRaw}/${resultData.rwTotal || 54} correct
**Math Raw Score:** ${resultData.mathRaw}/${resultData.mathTotal || 44} correct
**Static Lookup Score (for reference only):** R&W ${resultData.rwScore}, Math ${resultData.mathScore}, Total ${resultData.totalScore}

**Module 1 (R&W) Performance:** ${m1Correct}/${m1Total} correct (${m1Pct}%) — ${Number(m1Pct) > 65 ? 'HARD Module 2 path' : 'EASY Module 2 path'}
**Module 3 (Math) Performance:** ${m3Correct}/${m3Total} correct (${m3Pct}%) — ${Number(m3Pct) > 65 ? 'HARD Module 2 path' : 'EASY Module 2 path'}

**Questions WRONG (${wrongQuestions.length} total):**
${wrongQuestions.map(q => `- ${q.section} M${q.module} Q${q.number}: difficulty=${q.difficulty}, skill=${q.skill}, student="${q.studentAnswer}", correct="${q.correctAnswer}"`).join('\n') || 'None — perfect score!'}

**Questions RIGHT (${rightQuestions.length} total):**
${rightQuestions.length} correct answers across both sections.
Breakdown: ${rightQuestions.filter(q => q.section === 'R&W').length} R&W correct, ${rightQuestions.filter(q => q.section === 'Math').length} Math correct.

**Group Context (${groupRawScores.length} students in this session):**
- Average R&W raw: ${avgRwRaw.toFixed(1)}/${resultData.rwTotal || 54}
- Average Math raw: ${avgMathRaw.toFixed(1)}/${resultData.mathTotal || 44}
- This student's R&W is ${resultData.rwRaw > avgRwRaw ? 'ABOVE' : 'BELOW'} average
- This student's Math is ${resultData.mathRaw > avgMathRaw ? 'ABOVE' : 'BELOW'} average

## Your Task
Analyze the student's performance considering:
1. The difficulty distribution of questions they got wrong vs right
2. Their module routing (hard/easy path)
3. IRT-based scoring principles (difficulty-weighted, not just count-based)
4. How their performance compares to the group
5. The standard College Board equating tables as baseline

Return ONLY valid JSON (no markdown, no code blocks):
{
    "rwScore": <number 200-800>,
    "mathScore": <number 200-800>,
    "totalScore": <number 400-1600>,
    "confidence": "high" | "medium" | "low",
    "explanation": "<2-3 sentence explanation of why you chose these scores, referencing difficulty and IRT>",
    "rwStrengths": ["<strength 1>", "<strength 2>"],
    "rwWeaknesses": ["<weakness 1>", "<weakness 2>"],
    "mathStrengths": ["<strength 1>", "<strength 2>"],
    "mathWeaknesses": ["<weakness 1>", "<weakness 2>"],
    "studyRecommendation": "<one actionable recommendation>"
}`;

    // Call Gemini 2.5 Pro
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent?key=${AI_API_KEY}`;

    scoringLog('info', 'Sending request to Gemini 2.5 Pro...');

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1500
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        scoringLog('error', 'Gemini 2.5 Pro HTTP error:', response.status, errText.substring(0, 200));
        scoringLog('info', 'Falling back to Gemini 2.0 Flash...');
        return await scoreStudentWithFlash(prompt);
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    scoringLog('info', 'Gemini response received. Length:', rawText.length, 'chars');

    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
        const parsed = JSON.parse(jsonStr);
        scoringLog('info', 'Parsed score:', JSON.stringify(parsed).substring(0, 150));
        return parsed;
    } catch (e) {
        scoringLog('error', 'Failed to parse response:', e.message);
        scoringLog('error', 'Raw response:', rawText.substring(0, 300));
        return null;
    }
}


/**
 * Fallback to Gemini 2.0 Flash if 2.5 Pro is unavailable.
 */
async function scoreStudentWithFlash(prompt) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_API_KEY}`;

    scoringLog('info', 'Sending request to Gemini 2.0 Flash (fallback)...');

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 1500 }
            })
        });

        if (!response.ok) {
            scoringLog('error', 'Flash HTTP error:', response.status);
            return null;
        }
        const result = await response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        scoringLog('info', 'Flash response received. Length:', rawText.length, 'chars');
        const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        scoringLog('info', 'Flash parsed score:', JSON.stringify(parsed).substring(0, 150));
        return parsed;
    } catch (e) {
        scoringLog('error', 'Flash fallback failed:', e.message);
        return null;
    }
}


/**
 * Second pass: compare all students' scores and normalize.
 */
async function compareAndNormalizeScores(db, resultDocs, sessionCode, testId, allQuestions) {
    scoringLog('info', 'Starting normalization pass...');

    const studentScores = [];
    for (const r of resultDocs) {
        const freshDoc = await db.collection('testResults').doc(r.resultId).get();
        const data = freshDoc.data();
        if (data?.aiEstimatedScore) {
            studentScores.push({
                resultId: r.resultId,
                rwRaw: data.rwRaw,
                mathRaw: data.mathRaw,
                aiRW: data.aiEstimatedScore.rwScore,
                aiMath: data.aiEstimatedScore.mathScore,
                aiTotal: data.aiEstimatedScore.totalScore,
                staticRW: data.rwScore,
                staticMath: data.mathScore,
                staticTotal: data.totalScore
            });
        }
    }

    if (studentScores.length < 2) {
        scoringLog('info', 'Only 1 student scored, skipping normalization');
        return;
    }

    scoringLog('info', `Normalizing ${studentScores.length} students...`);

    const comparisonPrompt = `You are an SAT score normalization expert. Review these ${studentScores.length} students' estimated scores and verify they are internally consistent.

Students:
${studentScores.map((s, i) => `Student ${i + 1}: rwRaw=${s.rwRaw}, mathRaw=${s.mathRaw}, estRW=${s.aiRW}, estMath=${s.aiMath}, estTotal=${s.aiTotal}, staticRW=${s.staticRW}, staticMath=${s.staticMath}`).join('\n')}

Rules:
- Higher raw scores MUST result in higher or equal scaled scores
- The gap between students with similar raw scores should be small
- Scores should follow standard SAT distribution patterns
- If any inconsistency is found, suggest corrections

Return ONLY valid JSON (no markdown):
{
    "adjustments": [
        { "studentIndex": 0, "newRW": 750, "newMath": 690, "newTotal": 1440, "reason": "..." },
        ...
    ],
    "groupAnalysis": "Brief analysis of this cohort's performance"
}

If no adjustments needed, return: { "adjustments": [], "groupAnalysis": "..." }`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent?key=${AI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: comparisonPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        })
    });

    if (!response.ok) {
        scoringLog('error', 'Normalization API error:', response.status);
        return;
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
        const comparison = JSON.parse(jsonStr);
        scoringLog('info', 'Normalization result:', comparison.adjustments?.length || 0, 'adjustments');

        if (comparison.adjustments?.length > 0) {
            for (const adj of comparison.adjustments) {
                const student = studentScores[adj.studentIndex];
                if (student) {
                    await safeFirestoreWrite(
                        db.collection('testResults').doc(student.resultId),
                        {
                            'aiEstimatedScore.rwScore': adj.newRW,
                            'aiEstimatedScore.mathScore': adj.newMath,
                            'aiEstimatedScore.totalScore': adj.newTotal,
                            'aiEstimatedScore.adjustmentReason': adj.reason,
                            'aiEstimatedScore.groupAnalysis': comparison.groupAnalysis,
                            // Unify: also update top-level score fields
                            totalScore: adj.newTotal,
                            rwScore: adj.newRW,
                            mathScore: adj.newMath
                        },
                        'testResults/' + student.resultId + ' → adjustment'
                    );
                }
            }
        }

        for (const s of studentScores) {
            await safeFirestoreWrite(
                db.collection('testResults').doc(s.resultId),
                { 'aiEstimatedScore.groupAnalysis': comparison.groupAnalysis },
                'testResults/' + s.resultId + ' → groupAnalysis'
            );
        }
    } catch (e) {
        scoringLog('error', 'Normalization parse error:', e.message);
    }
}


/**
 * Publish results: mark all as published and send Telegram announcement.
 */
async function publishSessionResults(sessionCode) {
    const db = firebase.firestore();
    const sessionRef = db.collection('proctoredSessions').doc(sessionCode);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) throw new Error('Session not found');
    const sessionData = sessionDoc.data();
    const testId = sessionData.testId;

    scoringLog('info', '=== PUBLISHING RESULTS ===');
    scoringLog('info', 'Session:', sessionCode, '| Test:', testId);

    // 1. Update all test results to published
    const participantsSnap = await sessionRef.collection('participants')
        .where('status', '==', 'completed').get();

    const publishedStudents = [];

    for (const pDoc of participantsSnap.docs) {
        const userId = pDoc.id;
        const resultId = `${userId}_${testId}_${sessionCode}`;

        // Update testResults to published
        await safeFirestoreWrite(
            db.collection('testResults').doc(resultId),
            { scoringStatus: 'published' },
            'testResults/' + resultId + ' → published'
        );

        // Also update the user's completedTests for dashboard display
        try {
            const resultDoc = await db.collection('testResults').doc(resultId).get();
            const resultData = resultDoc.data();
            const finalScore = resultData?.totalScore || 'N/A';
            const finalRW = resultData?.rwScore || null;
            const finalMath = resultData?.mathScore || null;
            await safeFirestoreWrite(
                db.collection('users').doc(userId).collection('completedTests').doc(testId),
                { scoringStatus: 'published', score: finalScore },
                'users/' + userId + '/completedTests/' + testId + ' → published'
            );
            // Also update participant doc with final scores
            await safeFirestoreWrite(
                sessionRef.collection('participants').doc(userId),
                { score: finalScore, rwScore: finalRW, mathScore: finalMath },
                'participants/' + userId + ' → final scores'
            );
        } catch (e) {
            scoringLog('warn', 'Could not update completedTests for user:', userId, e.message);
        }

        publishedStudents.push(userId);
    }

    // 2. Update session status
    await safeFirestoreWrite(sessionRef, {
        scoringStatus: 'published',
        publishedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, 'proctoredSessions/' + sessionCode + ' → published');

    // 3. Send Telegram announcement
    scoringLog('info', 'Sending Telegram announcement...');
    await sendTelegramAnnouncement(sessionData.testName || 'SAT Practice Test', publishedStudents.length);

    scoringLog('info', `=== PUBLISH COMPLETE: ${publishedStudents.length} students ===`);
    return { published: publishedStudents.length };
}


/**
 * Send announcement to Telegram channel.
 */
async function sendTelegramAnnouncement(testName, studentCount) {
    if (typeof TELEGRAM_BOT_TOKEN === 'undefined' || typeof TELEGRAM_CHANNEL_ID === 'undefined') {
        scoringLog('warn', 'Telegram bot config not found, skipping announcement');
        return;
    }

    const message = `*ALFA SAT — Score Report Release*

*${testName}*

Score reports for ${studentCount} student${studentCount !== 1 ? 's' : ''} are now available.

Please log in to your ALFA SAT account to access your official score report and detailed performance analysis.

[Access Your Results](https://alfasat.uz)

ALFA SAT | 2026`;

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHANNEL_ID,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            })
        });
        const data = await res.json();
        if (!data.ok) scoringLog('warn', 'Telegram send failed:', data);
        else scoringLog('info', 'Telegram announcement sent successfully');
    } catch (err) {
        scoringLog('error', 'Telegram API error:', err.message);
    }
}


/**
 * Check if a session's results should be auto-published (12 hours elapsed).
 */
function isReadyToPublish(sessionData) {
    if (sessionData.scoringStatus !== 'scored') return false;
    if (!sessionData.publishAfter) return false;

    const publishTime = sessionData.publishAfter.toDate?.() || new Date(sessionData.publishAfter);
    return new Date() >= publishTime;
}
