// js/proctor-session.js - Live Proctored Session Statistics
// Uses Firestore onSnapshot for real-time updates

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

    // Get code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) {
        document.body.innerHTML = '<h1 style="text-align:center; margin-top:100px;">Error: No session code provided.</h1>';
        return;
    }

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
    });

    async function loadSessionInfo(code) {
        try {
            const sessionDoc = await db.collection('proctoredSessions').doc(code).get();
            if (!sessionDoc.exists) {
                if (sessionTestNameEl) sessionTestNameEl.textContent = 'Session not found';
                return;
            }

            const data = sessionDoc.data();
            if (sessionTestNameEl) sessionTestNameEl.textContent = data.testName || 'Unknown Test';

            if (sessionCreatedAtEl && data.createdAt) {
                const date = data.createdAt.toDate();
                sessionCreatedAtEl.textContent = `Created: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
            }
        } catch (err) {
            console.error('Error loading session info:', err);
            if (sessionTestNameEl) sessionTestNameEl.textContent = 'Error loading session';
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

            // Render table
            renderParticipantsTable(participants);
        }, (err) => {
            console.error('Participants listener error:', err);
            if (participantsTbody) {
                participantsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--error-red);">Error loading participants. Check Firestore rules.</td></tr>';
            }
        });
    }

    function renderParticipantsTable(participants) {
        if (!participantsTbody) return;

        if (participants.length === 0) {
            participantsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--dark-gray);">No participants yet. Share the code with your students.</td></tr>';
            return;
        }

        // Sort: completed first (by score desc), then taking, then waiting
        participants.sort((a, b) => {
            const order = { 'completed': 0, 'taking': 1, 'waiting': 2 };
            const statusDiff = (order[a.status] || 3) - (order[b.status] || 3);
            if (statusDiff !== 0) return statusDiff;
            // Within completed, sort by score descending
            if (a.status === 'completed' && b.status === 'completed') {
                return (b.score || 0) - (a.score || 0);
            }
            return 0;
        });

        let html = '';
        participants.forEach((p, i) => {
            const statusClass = p.status || 'waiting';
            const statusLabel = getStatusLabel(p.status);
            const moduleLabel = p.status === 'completed' ? '—' : (p.currentModule ? `Module ${p.currentModule}` : '—');
            const scoreLabel = p.status === 'completed' && p.score != null ? p.score : '—';
            const exitCount = p.fullscreenExitCount || 0;
            const exitClass = exitCount > 2 ? 'exit-warning' : '';

            html += `
                <tr class="participant-row ${statusClass}">
                    <td>${i + 1}</td>
                    <td class="participant-name">${p.userName || 'Student'}</td>
                    <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${moduleLabel}</td>
                    <td class="score-cell">${scoreLabel}</td>
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
