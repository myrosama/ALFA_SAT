// js/proctor-session.js - Live Proctored Session Statistics
// Uses Firestore onSnapshot for real-time updates
// Includes AI scoring controls and publisher

document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // DOM Elements
    const sessionCodeEl = document.getElementById('session-code');
    const sessionTestNameEl = document.getElementById('session-test-name');
    const sessionCreatedAtEl = document.getElementById('session-created-at');
    const statTotal = document.getElementById('stat-total');
    const statTaking = document.getElementById('stat-taking');
    const statCompleted = document.getElementById('stat-completed');
    const statWaiting = document.getElementById('stat-waiting');
    const participantsTbody = document.getElementById('participants-tbody');

    // Scoring UI Elements
    const scoringSection = document.getElementById('scoring-section');
    const scoringStatusBadge = document.getElementById('scoring-status-badge');
    const scoringProgress = document.getElementById('scoring-progress');
    const scoringProgressFill = document.getElementById('scoring-progress-fill');
    const scoringProgressText = document.getElementById('scoring-progress-text');
    const processScoresBtn = document.getElementById('process-scores-btn');
    const publishResultsBtn = document.getElementById('publish-results-btn');
    const scoringNote = document.getElementById('scoring-note');

    // State
    let sessionCode = null;
    let sessionData = null;
    let isProcessing = false;

    // Get code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) {
        document.body.innerHTML = '<h1 style="text-align:center; margin-top:100px;">Error: No session code provided.</h1>';
        return;
    }

    sessionCode = code;

    // Display formatted code
    if (sessionCodeEl) {
        sessionCodeEl.textContent = code.slice(0, 3) + '-' + code.slice(3);
    }

    // Auth guard - only admins can view
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        try {
            const adminDoc = await db.collection('admins').doc(user.uid).get();
            if (!adminDoc.exists) {
                document.body.innerHTML = '<h1 style="text-align:center; margin-top:100px;">Access Denied. Admin only.</h1>';
                return;
            }
        } catch (err) {
            console.error('Admin check failed:', err);
            return;
        }

        // Load session info
        loadSessionInfo(code);

        // Start real-time listener for participants
        startParticipantsListener(code);

        // Wire scoring buttons
        wireScoringSectionButtons();
    });

    async function loadSessionInfo(code) {
        try {
            const sessionDoc = await db.collection('proctoredSessions').doc(code).get();
            if (!sessionDoc.exists) {
                if (sessionTestNameEl) sessionTestNameEl.textContent = 'Session not found';
                return;
            }

            sessionData = sessionDoc.data();
            if (sessionTestNameEl) sessionTestNameEl.textContent = sessionData.testName || 'Unknown Test';

            if (sessionCreatedAtEl && sessionData.createdAt) {
                const date = sessionData.createdAt.toDate();
                sessionCreatedAtEl.textContent = `Created: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
            }

            // Update scoring UI based on session status
            updateScoringUI(sessionData);

        } catch (err) {
            console.error('Error loading session info:', err);
            if (sessionTestNameEl) sessionTestNameEl.textContent = 'Error loading session';
        }
    }

    function updateScoringUI(data) {
        const status = data?.scoringStatus || 'pending';

        // Status badge
        if (scoringStatusBadge) {
            const labels = {
                'pending': '<i class="fa-solid fa-clock"></i> Pending',
                'processing': '<i class="fa-solid fa-spinner fa-spin"></i> Processing...',
                'scored': '<i class="fa-solid fa-check"></i> Scored',
                'published': '<i class="fa-solid fa-bullhorn"></i> Published'
            };
            scoringStatusBadge.innerHTML = labels[status] || labels.pending;
            scoringStatusBadge.className = 'scoring-status-badge ' + status;
        }

        // Progress bar
        if (scoringProgress) {
            if (status === 'processing' || status === 'scored') {
                scoringProgress.style.display = 'block';
                const scored = data.scoredCount || 0;
                const total = data.totalParticipants || 0;
                const pct = total > 0 ? (scored / total * 100) : 0;
                if (scoringProgressFill) scoringProgressFill.style.width = pct + '%';
                if (scoringProgressText) scoringProgressText.textContent = `${scored}/${total} students scored`;
            } else {
                scoringProgress.style.display = 'none';
            }
        }

        // Buttons
        if (processScoresBtn) {
            processScoresBtn.disabled = status === 'processing' || status === 'scored' || status === 'published';
            if (status === 'scored') processScoresBtn.innerHTML = '<i class="fa-solid fa-check"></i> Scores Processed';
            if (status === 'published') processScoresBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Published';
        }
        if (publishResultsBtn) {
            publishResultsBtn.disabled = status !== 'scored';
            if (status === 'published') {
                publishResultsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Published';
                publishResultsBtn.disabled = true;
            }
        }

        // Note
        if (scoringNote) {
            if (status === 'scored' && data.publishAfter) {
                const pubDate = data.publishAfter.toDate?.() || new Date(data.publishAfter);
                scoringNote.innerHTML = `<i class="fa-solid fa-clock"></i> Auto-publish scheduled for: <strong>${pubDate.toLocaleString()}</strong>. You can publish early with "Publish Results Now".`;
            } else if (status === 'published') {
                scoringNote.innerHTML = `<i class="fa-solid fa-check-circle"></i> Results have been published and a Telegram announcement was sent to the channel.`;
            }
        }
    }

    function wireScoringSectionButtons() {
        // Process Scores button
        if (processScoresBtn) {
            processScoresBtn.addEventListener('click', async () => {
                if (isProcessing) return;
                if (!confirm('Start AI scoring for all completed students? This may take several minutes.')) return;

                isProcessing = true;
                processScoresBtn.disabled = true;
                processScoresBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

                if (scoringProgress) scoringProgress.style.display = 'block';
                if (scoringNote) scoringNote.innerHTML = '<i class="fa-solid fa-brain"></i> AI is analyzing each student\'s performance. This will take a few minutes per student. <strong>Do not close this page.</strong>';

                try {
                    const result = await processSessionScores(sessionCode, (scored, total, message) => {
                        // Progress callback
                        const pct = total > 0 ? (scored / total * 100) : 0;
                        if (scoringProgressFill) scoringProgressFill.style.width = pct + '%';
                        if (scoringProgressText) scoringProgressText.textContent = `${scored}/${total} — ${message}`;
                    });

                    processScoresBtn.innerHTML = '<i class="fa-solid fa-check"></i> Scores Processed';
                    publishResultsBtn.disabled = false;

                    if (scoringNote) {
                        scoringNote.innerHTML = `<i class="fa-solid fa-check-circle"></i> <strong>${result.scoredCount} students scored.</strong> ${result.errors.length > 0 ? result.errors.length + ' errors.' : 'No errors.'}`;
                    }

                    // Refresh session data
                    const freshSession = await db.collection('proctoredSessions').doc(sessionCode).get();
                    updateScoringUI(freshSession.data());

                } catch (err) {
                    console.error('Scoring error:', err);
                    processScoresBtn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Error — Retry';
                    processScoresBtn.disabled = false;
                    if (scoringNote) scoringNote.innerHTML = `<i class="fa-solid fa-exclamation-circle"></i> Error: ${err.message}. You can retry.`;
                }

                isProcessing = false;
            });
        }

        // Publish Results button
        if (publishResultsBtn) {
            publishResultsBtn.addEventListener('click', async () => {
                if (!confirm('Publish all results now? Students will be able to see their scores and a Telegram announcement will be sent.')) return;

                publishResultsBtn.disabled = true;
                publishResultsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';

                try {
                    const result = await publishSessionResults(sessionCode);
                    publishResultsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Published';

                    if (scoringNote) {
                        scoringNote.innerHTML = `<i class="fa-solid fa-check-circle"></i> Results published for ${result.published} students. Telegram announcement sent!`;
                    }

                    // Refresh
                    const freshSession = await db.collection('proctoredSessions').doc(sessionCode).get();
                    updateScoringUI(freshSession.data());

                } catch (err) {
                    console.error('Publish error:', err);
                    publishResultsBtn.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Error';
                    publishResultsBtn.disabled = false;
                    if (scoringNote) scoringNote.innerHTML = `<i class="fa-solid fa-exclamation-circle"></i> Publish error: ${err.message}`;
                }
            });
        }
    }

    function startParticipantsListener(code) {
        const participantsRef = db.collection('proctoredSessions').doc(code).collection('participants');

        participantsRef.onSnapshot((snapshot) => {
            const participants = [];
            snapshot.forEach(doc => {
                participants.push({ id: doc.id, ...doc.data() });
            });

            // Update stats
            const total = participants.length;
            const taking = participants.filter(p => p.status === 'taking').length;
            const completed = participants.filter(p => p.status === 'completed').length;
            const waiting = participants.filter(p => p.status === 'waiting').length;

            if (statTotal) statTotal.textContent = total;
            if (statTaking) statTaking.textContent = taking;
            if (statCompleted) statCompleted.textContent = completed;
            if (statWaiting) statWaiting.textContent = waiting;

            // Render table — also fetch AI scores from testResults
            renderParticipantsTableWithScores(participants, code);
        }, (err) => {
            console.error('Participants listener error:', err);
            if (participantsTbody) {
                participantsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--error-red);">Error loading participants. Check Firestore rules.</td></tr>';
            }
        });
    }

    async function renderParticipantsTableWithScores(participants, code) {
        if (!participantsTbody) return;

        if (participants.length === 0) {
            participantsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--dark-gray);">No participants yet. Share the code with your students.</td></tr>';
            return;
        }

        // Sort: completed first (by score desc), then taking, then waiting
        participants.sort((a, b) => {
            const order = { 'completed': 0, 'taking': 1, 'waiting': 2 };
            const statusDiff = (order[a.status] || 3) - (order[b.status] || 3);
            if (statusDiff !== 0) return statusDiff;
            if (a.status === 'completed' && b.status === 'completed') {
                return (b.score || 0) - (a.score || 0);
            }
            return 0;
        });

        // Fetch AI scores from testResults for completed participants
        const testId = sessionData?.testId;
        const aiScores = {};
        if (testId) {
            const completedIds = participants.filter(p => p.status === 'completed').map(p => p.id);
            for (const uid of completedIds) {
                try {
                    const resultId = `${uid}_${testId}_${code}`;
                    const resultDoc = await db.collection('testResults').doc(resultId).get();
                    if (resultDoc.exists) {
                        const rd = resultDoc.data();
                        aiScores[uid] = {
                            ai: rd.aiEstimatedScore || null,
                            status: rd.scoringStatus || 'pending_review'
                        };
                    }
                } catch (e) { /* silent */ }
            }
        }

        let html = '';
        participants.forEach((p, i) => {
            const statusClass = p.status || 'waiting';
            const statusLabel = getStatusLabel(p.status);
            const moduleLabel = p.status === 'completed' ? '—' : (p.currentModule ? `Module ${p.currentModule}` : '—');
            const rawScore = p.status === 'completed' && p.score != null ? p.score : '—';
            const exitCount = p.fullscreenExitCount || 0;
            const exitClass = exitCount > 2 ? 'exit-warning' : '';

            // AI Score column
            let aiScoreLabel = '—';
            const aiData = aiScores[p.id];
            if (aiData) {
                if (aiData.ai) {
                    aiScoreLabel = `<span class="ai-score-value">${aiData.ai.totalScore}</span>`;
                } else if (aiData.status === 'pending_review') {
                    aiScoreLabel = '<span class="status-badge pending">Pending</span>';
                } else if (aiData.status === 'scored') {
                    aiScoreLabel = '<span class="status-badge scored">Scored</span>';
                }
            }

            html += `
                <tr class="participant-row ${statusClass}">
                    <td>${i + 1}</td>
                    <td class="participant-name">${p.userName || 'Student'}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${moduleLabel}</td>
                    <td class="score-cell">${rawScore}</td>
                    <td class="score-cell">${aiScoreLabel}</td>
                    <td class="${exitClass}">${exitCount}</td>
                </tr>
            `;
        });

        participantsTbody.innerHTML = html;
    }

    function getStatusLabel(status) {
        switch (status) {
            case 'taking': return '<i class="fa-solid fa-pen"></i> Taking';
            case 'completed': return '<i class="fa-solid fa-check"></i> Done';
            case 'waiting': return '<i class="fa-solid fa-clock"></i> Waiting';
            default: return status || 'Unknown';
        }
    }
});
