// js/admin-statistics.js — Admin Statistics Dashboard & Study Groups
// Reads from: testResults, tests, users, studyGroups
// Writes to: studyGroups (CRUD), tests (whitelist updates for batch assign)

document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- State ---
    let allResults = [];
    let allTests = {};
    let allUsers = {};
    let allGroups = [];
    let editingGroupId = null;

    const loadingEl = document.getElementById('stats-loading');
    const overviewTab = document.getElementById('tab-overview');

    // --- Auth Guard: wait for Firebase auth to initialize ---
    auth.onAuthStateChanged(async user => {
        if (!user) {
            window.location.href = 'admin-login.html';
            return;
        }
        try {
            const adminDoc = await db.collection('admins').doc(user.uid).get();
            if (!adminDoc.exists) {
                alert('Access Denied. Not an admin account.');
                auth.signOut();
                window.location.href = 'admin-login.html';
                return;
            }
            // Admin verified — now load data
            await loadAllData();
        } catch (e) {
            console.error('Admin check error:', e);
            alert('Error verifying admin access. Please try again.');
        }
    });

    // --- Tab Switching ---
    document.querySelectorAll('.stats-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById('tab-' + tab.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // --- Data Loading ---
    async function loadAllData() {
        try {
            // Fetch all collections in parallel
            const [resultsSnap, testsSnap, usersSnap] = await Promise.all([
                db.collection('testResults').get(),
                db.collection('tests').get(),
                db.collection('users').get()
            ]);

            allResults = [];
            resultsSnap.forEach(d => allResults.push({ id: d.id, ...d.data() }));

            allTests = {};
            testsSnap.forEach(d => { allTests[d.id] = { id: d.id, ...d.data() }; });

            allUsers = {};
            usersSnap.forEach(d => { allUsers[d.id] = { id: d.id, ...d.data() }; });

            // studyGroups may not exist yet — handle gracefully
            allGroups = [];
            try {
                const groupsSnap = await db.collection('studyGroups').get();
                groupsSnap.forEach(d => allGroups.push({ id: d.id, ...d.data() }));
            } catch (e) {
                console.warn('studyGroups collection not found or no access:', e.message);
            }

            // Hide loading, show content
            if (loadingEl) loadingEl.style.display = 'none';
            if (overviewTab) overviewTab.style.display = '';

            renderOverview();
            renderTestsTab();
            renderUsersTab();
            renderGroupsTab();
        } catch (e) {
            console.error('Data load error:', e);
            if (loadingEl) {
                loadingEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i><p>Error loading data: ${e.message}</p><p style="font-size:0.85rem;">Make sure your Firestore rules allow admin reads.</p>`;
            }
        }
    }

    // ===========================
    // OVERVIEW TAB
    // ===========================
    function renderOverview() {
        const published = allResults.filter(r => r.scoringStatus !== 'pending_review' || !r.proctorCode);
        const totalCompletions = published.length;
        const uniqueUsers = new Set(published.map(r => r.userId)).size;
        const scores = published.map(r => r.totalScore).filter(s => s > 0);
        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        document.getElementById('overview-cards').innerHTML = `
            <div class="stat-card">
                <div class="card-icon"><i class="fa-solid fa-file-lines"></i></div>
                <div class="card-value">${Object.keys(allTests).length}</div>
                <div class="card-label">Total Tests Created</div>
            </div>
            <div class="stat-card blue">
                <div class="card-icon"><i class="fa-solid fa-check-double"></i></div>
                <div class="card-value">${totalCompletions}</div>
                <div class="card-label">Total Completions</div>
            </div>
            <div class="stat-card green">
                <div class="card-icon"><i class="fa-solid fa-users"></i></div>
                <div class="card-value">${uniqueUsers}</div>
                <div class="card-label">Active Students</div>
            </div>
            <div class="stat-card amber">
                <div class="card-icon"><i class="fa-solid fa-trophy"></i></div>
                <div class="card-value">${avgScore}</div>
                <div class="card-label">Average Score</div>
            </div>`;

        renderCompletionsChart(published);
        renderScoreDistChart(scores);
        renderRWMathChart(published);
        renderTopTestsChart(published);
    }

    function renderCompletionsChart(results) {
        const byDate = {};
        results.forEach(r => {
            if (!r.completedAt) return;
            const d = r.completedAt.toDate ? r.completedAt.toDate() : new Date(r.completedAt);
            const key = d.toISOString().slice(0, 10);
            byDate[key] = (byDate[key] || 0) + 1;
        });
        const sorted = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
        new Chart(document.getElementById('chart-completions'), {
            type: 'line',
            data: {
                labels: sorted.map(e => e[0]),
                datasets: [{ label: 'Completions', data: sorted.map(e => e[1]), borderColor: '#6A0DAD', backgroundColor: 'rgba(106,13,173,0.08)', fill: true, tension: 0.4, pointRadius: 3 }]
            },
            options: chartOpts()
        });
    }

    function renderScoreDistChart(scores) {
        const buckets = { '400-600': 0, '600-800': 0, '800-1000': 0, '1000-1200': 0, '1200-1400': 0, '1400-1600': 0 };
        scores.forEach(s => {
            if (s < 600) buckets['400-600']++;
            else if (s < 800) buckets['600-800']++;
            else if (s < 1000) buckets['800-1000']++;
            else if (s < 1200) buckets['1000-1200']++;
            else if (s < 1400) buckets['1200-1400']++;
            else buckets['1400-1600']++;
        });
        new Chart(document.getElementById('chart-scores'), {
            type: 'bar',
            data: {
                labels: Object.keys(buckets),
                datasets: [{ label: 'Students', data: Object.values(buckets), backgroundColor: ['#e74c3c', '#f39c12', '#f1c40f', '#27ae60', '#3498db', '#6A0DAD'], borderRadius: 6 }]
            },
            options: chartOpts()
        });
    }

    function renderRWMathChart(results) {
        const rwScores = results.map(r => r.rwScore).filter(s => s > 0);
        const mathScores = results.map(r => r.mathScore).filter(s => s > 0);
        const avgRW = calcAvg(rwScores);
        const avgMath = calcAvg(mathScores);
        new Chart(document.getElementById('chart-rw-math'), {
            type: 'doughnut',
            data: {
                labels: ['R&W Average', 'Math Average'],
                datasets: [{ data: [avgRW, avgMath], backgroundColor: ['#003366', '#6A0DAD'], borderWidth: 2, borderColor: '#fff' }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { family: 'Poppins' } } } } }
        });
    }

    function renderTopTestsChart(results) {
        const counts = {};
        results.forEach(r => { counts[r.testId] = (counts[r.testId] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        new Chart(document.getElementById('chart-top-tests'), {
            type: 'bar',
            data: {
                labels: sorted.map(e => (allTests[e[0]]?.name || e[0]).substring(0, 22)),
                datasets: [{ label: 'Completions', data: sorted.map(e => e[1]), backgroundColor: '#003366', borderRadius: 6 }]
            },
            options: { ...chartOpts(), indexAxis: 'y' }
        });
    }

    function chartOpts() {
        return {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: '#eee' }, ticks: { color: '#555', font: { family: 'Poppins', size: 11 } } },
                y: { grid: { color: '#eee' }, ticks: { color: '#555', font: { family: 'Poppins', size: 11 } } }
            }
        };
    }

    // ===========================
    // PER-TEST TAB
    // ===========================
    function renderTestsTab() {
        const tbody = document.getElementById('tests-table-body');
        const byTest = {};
        allResults.forEach(r => { if (!byTest[r.testId]) byTest[r.testId] = []; byTest[r.testId].push(r); });

        let html = '';
        Object.entries(byTest).sort((a, b) => b[1].length - a[1].length).forEach(([testId, results]) => {
            const scores = results.map(r => r.totalScore).filter(s => s > 0);
            const avg = calcAvg(scores);
            const hi = scores.length ? Math.max(...scores) : 0;
            const lo = scores.length ? Math.min(...scores) : 0;
            const rwAvg = calcAvg(results.map(r => r.rwScore).filter(s => s > 0));
            const mathAvg = calcAvg(results.map(r => r.mathScore).filter(s => s > 0));
            const name = allTests[testId]?.name || testId;

            html += `<tr class="expandable" data-testid="${testId}">
                <td><i class="fa-solid fa-chevron-right" style="color:#999;font-size:0.7rem;transition:transform 0.2s;"></i></td>
                <td style="font-weight:600;color:var(--primary-blue);">${esc(name)}</td>
                <td>${results.length}</td>
                <td>${scoreBadge(avg)}</td>
                <td style="color:#0d6832;font-weight:600;">${hi}</td>
                <td style="color:var(--error-red);font-weight:600;">${lo}</td>
                <td>${rwAvg}</td><td>${mathAvg}</td>
            </tr>
            <tr class="expand-row" id="expand-${testId}"><td colspan="8">
                <div class="expand-content"><div class="expand-grid">
                    <div class="expand-mini-card"><h4><i class="fa-solid fa-skull-crossbones"></i> Hardest Questions</h4>
                        <div class="hardest-list" id="hardest-${testId}"><p style="color:#999;font-size:0.85rem;">Click to load...</p></div>
                    </div>
                    <div class="expand-mini-card"><h4><i class="fa-solid fa-chart-simple"></i> Domain Accuracy</h4>
                        <div id="domains-${testId}"><p style="color:#999;font-size:0.85rem;">Click to load...</p></div>
                    </div>
                    <div class="expand-mini-card"><h4><i class="fa-solid fa-user-check"></i> Student Scores</h4>
                        <div id="individual-${testId}" style="max-height:200px;overflow-y:auto;"><p style="color:#999;font-size:0.85rem;">Click to load...</p></div>
                    </div>
                    <div class="expand-mini-card"><h4><i class="fa-solid fa-info-circle"></i> Summary</h4>
                        <div class="mini-stat-row"><span class="label">Completions</span><span class="value">${results.length}</span></div>
                        <div class="mini-stat-row"><span class="label">Average</span><span class="value">${avg}</span></div>
                        <div class="mini-stat-row"><span class="label">Median</span><span class="value">${median(scores)}</span></div>
                        <div class="mini-stat-row"><span class="label">Std Dev</span><span class="value">${stdDev(scores)}</span></div>
                        <div class="mini-stat-row"><span class="label">Avg R&W</span><span class="value">${rwAvg}</span></div>
                        <div class="mini-stat-row"><span class="label">Avg Math</span><span class="value">${mathAvg}</span></div>
                    </div>
                </div></div>
            </td></tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">No test results yet.</td></tr>';

        // Expand/collapse
        tbody.querySelectorAll('.expandable').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.testid;
                const expandRow = document.getElementById('expand-' + id);
                const icon = row.querySelector('i');
                const isOpen = expandRow.classList.contains('visible');
                document.querySelectorAll('.expand-row.visible').forEach(r => r.classList.remove('visible'));
                document.querySelectorAll('.expandable i').forEach(i => i.style.transform = '');
                if (!isOpen) {
                    expandRow.classList.add('visible');
                    icon.style.transform = 'rotate(90deg)';
                    loadTestDetails(id);
                }
            });
        });

        // Search
        document.getElementById('test-search').addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            tbody.querySelectorAll('.expandable').forEach(row => {
                const name = row.children[1].textContent.toLowerCase();
                row.style.display = name.includes(q) ? '' : 'none';
                if (!name.includes(q)) {
                    const exp = document.getElementById('expand-' + row.dataset.testid);
                    if (exp) exp.classList.remove('visible');
                }
            });
        });
    }

    function loadTestDetails(testId) {
        const results = allResults.filter(r => r.testId === testId);
        const qErrors = {}, qTotals = {};

        results.forEach(r => {
            (r.reviewIndex || []).forEach(item => {
                if (!qTotals[item.id]) { qTotals[item.id] = 0; qErrors[item.id] = 0; }
                qTotals[item.id]++;
                const ua = (r.userAnswers || {})[item.id];
                const correct = item.format === 'fill-in' ? isFillinCorrect(ua, item.fillInAnswer) : ua === item.correctAnswer;
                if (!correct) qErrors[item.id]++;
            });
        });

        // Hardest questions
        const hardestEl = document.getElementById('hardest-' + testId);
        const sorted = Object.entries(qErrors)
            .map(([qId, errors]) => ({ qId, rate: qTotals[qId] ? (errors / qTotals[qId]) * 100 : 0 }))
            .sort((a, b) => b.rate - a.rate).slice(0, 8);

        hardestEl.innerHTML = sorted.length === 0
            ? '<p style="color:#999;font-size:0.85rem;">No question-level data available.</p>'
            : sorted.map(q => `<div class="hardest-item">
                <span class="q-label">${esc(q.qId)}</span>
                <div class="error-bar-bg"><div class="error-bar-fill" style="width:${q.rate}%"></div></div>
                <span class="error-pct">${Math.round(q.rate)}%</span>
            </div>`).join('');

        // Domain breakdown
        const domainCorrect = {}, domainTotal = {};
        results.forEach(r => {
            (r.reviewIndex || []).forEach(item => {
                const d = item.domain || 'Unknown';
                if (!domainTotal[d]) { domainTotal[d] = 0; domainCorrect[d] = 0; }
                domainTotal[d]++;
                const ua = (r.userAnswers || {})[item.id];
                if (item.format === 'fill-in' ? isFillinCorrect(ua, item.fillInAnswer) : ua === item.correctAnswer) domainCorrect[d]++;
            });
        });

        const domainsEl = document.getElementById('domains-' + testId);
        const domEntries = Object.entries(domainTotal).sort((a, b) => b[1] - a[1]);
        domainsEl.innerHTML = domEntries.length === 0
            ? '<p style="color:#999;font-size:0.85rem;">No domain data.</p>'
            : domEntries.map(([domain, total]) => {
                const pct = Math.round(((domainCorrect[domain] || 0) / total) * 100);
                return `<div class="domain-bar-row">
                    <span class="domain-bar-label">${esc(domain)}</span>
                    <div class="domain-bar-bg"><div class="domain-bar-fill" style="width:${pct}%"></div></div>
                    <span class="domain-bar-pct">${pct}%</span>
                </div>`;
            }).join('');

        // Individual scores
        const indEl = document.getElementById('individual-' + testId);
        indEl.innerHTML = results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
            .map(r => {
                const u = allUsers[r.userId];
                const name = u?.fullName || u?.email || r.userId.substring(0, 12);
                return `<div class="mini-stat-row"><span class="label">${esc(name)}</span><span class="value">${scoreBadge(r.totalScore)}</span></div>`;
            }).join('') || '<p style="color:#999;font-size:0.85rem;">No results.</p>';
    }

    // ===========================
    // PER-USER TAB
    // ===========================
    function renderUsersTab() {
        const tbody = document.getElementById('users-table-body');
        const byUser = {};
        allResults.forEach(r => { if (!byUser[r.userId]) byUser[r.userId] = []; byUser[r.userId].push(r); });

        let html = '';
        Object.entries(byUser).sort((a, b) => b[1].length - a[1].length).forEach(([uid, results]) => {
            const u = allUsers[uid];
            const name = u?.fullName || 'Unknown';
            const email = u?.email || '';
            const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const scores = results.map(r => r.totalScore).filter(s => s > 0);
            const avg = calcAvg(scores);
            const best = scores.length ? Math.max(...scores) : 0;
            const rwAvg = calcAvg(results.map(r => r.rwScore).filter(s => s > 0));
            const mathAvg = calcAvg(results.map(r => r.mathScore).filter(s => s > 0));
            const lastDate = results.reduce((latest, r) => {
                const t = r.completedAt?.toDate ? r.completedAt.toDate() : null;
                return t && (!latest || t > latest) ? t : latest;
            }, null);

            html += `<tr class="expandable" data-uid="${uid}">
                <td><i class="fa-solid fa-chevron-right" style="color:#999;font-size:0.7rem;transition:transform 0.2s;"></i></td>
                <td><div class="user-info"><div class="user-avatar">${initials}</div><div><div class="user-name">${esc(name)}</div><div class="user-email">${esc(email)}</div></div></div></td>
                <td>${results.length}</td>
                <td>${scoreBadge(avg)}</td>
                <td style="color:#0d6832;font-weight:600;">${best}</td>
                <td>${rwAvg}</td><td>${mathAvg}</td>
                <td style="color:#999;">${lastDate ? lastDate.toLocaleDateString() : '—'}</td>
            </tr>
            <tr class="expand-row" id="uexpand-${uid}"><td colspan="8">
                <div class="expand-content"><div class="expand-grid">
                    <div class="expand-mini-card"><h4><i class="fa-solid fa-history"></i> Test History</h4>
                        <div style="max-height:200px;overflow-y:auto;">${results.sort((a,b) => {
                            const ta = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
                            const tb = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
                            return tb - ta;
                        }).map(r => `<div class="mini-stat-row"><span class="label">${esc(r.testName || r.testId)}</span><span class="value">${scoreBadge(r.totalScore)}</span></div>`).join('')}</div>
                    </div>
                    <div class="expand-mini-card"><h4><i class="fa-solid fa-chart-line"></i> Performance</h4>
                        <div class="mini-stat-row"><span class="label">Tests Taken</span><span class="value">${results.length}</span></div>
                        <div class="mini-stat-row"><span class="label">Average</span><span class="value">${avg}</span></div>
                        <div class="mini-stat-row"><span class="label">Best</span><span class="value">${best}</span></div>
                        <div class="mini-stat-row"><span class="label">Avg R&W</span><span class="value">${rwAvg}</span></div>
                        <div class="mini-stat-row"><span class="label">Avg Math</span><span class="value">${mathAvg}</span></div>
                        <div class="mini-stat-row"><span class="label">Improvement</span><span class="value" style="color:${scores.length >= 2 ? (scores[scores.length-1] >= scores[0] ? '#0d6832' : '#e74c3c') : '#999'}">${scores.length >= 2 ? ((scores[scores.length-1] - scores[0] >= 0 ? '+' : '') + (scores[scores.length-1] - scores[0])) : '—'}</span></div>
                        <div class="mini-stat-row"><span class="label">User ID</span><span class="value" style="font-size:0.7rem;color:#999;font-family:monospace;">${uid.substring(0,20)}…</span></div>
                    </div>
                </div></div>
            </td></tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">No user data yet.</td></tr>';

        // Expand/collapse
        tbody.querySelectorAll('.expandable').forEach(row => {
            row.addEventListener('click', () => {
                const uid = row.dataset.uid;
                const exp = document.getElementById('uexpand-' + uid);
                const icon = row.querySelector('i');
                const isOpen = exp.classList.contains('visible');
                document.querySelectorAll('#users-table-body .expand-row.visible').forEach(r => r.classList.remove('visible'));
                document.querySelectorAll('#users-table-body .expandable i').forEach(i => i.style.transform = '');
                if (!isOpen) { exp.classList.add('visible'); icon.style.transform = 'rotate(90deg)'; }
            });
        });

        // Search
        document.getElementById('user-search').addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            tbody.querySelectorAll('.expandable').forEach(row => {
                const text = row.children[1].textContent.toLowerCase();
                row.style.display = text.includes(q) ? '' : 'none';
            });
        });
    }

    // ===========================
    // STUDY GROUPS TAB
    // ===========================
    function renderGroupsTab() {
        const container = document.getElementById('groups-container');
        if (allGroups.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-group"></i><p>No study groups yet. Create one to get started!</p></div>';
            return;
        }
        container.innerHTML = allGroups.map(g => {
            const mc = (g.memberIds || []).length;
            const tc = (g.assignedTests || []).length;
            return `<div class="group-card" data-gid="${g.id}">
                <div class="group-card-header">
                    <div class="group-name"><i class="fa-solid fa-user-group"></i> ${esc(g.name || 'Unnamed')}</div>
                    <div style="display:flex;align-items:center;gap:14px;">
                        <div class="group-meta">
                            <span class="group-meta-item"><i class="fa-solid fa-users"></i> ${mc} members</span>
                            <span class="group-meta-item"><i class="fa-solid fa-file-lines"></i> ${tc} tests</span>
                        </div>
                        <div class="group-actions">
                            <button onclick="event.stopPropagation();window._editGroup('${g.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button class="danger" onclick="event.stopPropagation();window._deleteGroup('${g.id}','${esc(g.name)}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>
                <div class="group-body" id="gbody-${g.id}">
                    <div class="group-body-tabs">
                        <button class="group-body-tab active" data-gtab="members" data-gid="${g.id}">Members</button>
                        <button class="group-body-tab" data-gtab="stats" data-gid="${g.id}">Statistics</button>
                    </div>
                    <div class="group-tab-content active" id="gtab-members-${g.id}">${renderGroupMembers(g)}</div>
                    <div class="group-tab-content" id="gtab-stats-${g.id}">${renderGroupStats(g)}</div>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.group-card-header').forEach(hdr => {
            hdr.addEventListener('click', () => hdr.nextElementSibling.classList.toggle('visible'));
        });

        container.querySelectorAll('.group-body-tab').forEach(tab => {
            tab.addEventListener('click', e => {
                e.stopPropagation();
                const gid = tab.dataset.gid;
                document.querySelectorAll(`.group-body-tab[data-gid="${gid}"]`).forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll(`[id^="gtab-"][id$="-${gid}"]`).forEach(c => c.classList.remove('active'));
                document.getElementById('gtab-' + tab.dataset.gtab + '-' + gid).classList.add('active');
            });
        });
    }

    function renderGroupMembers(g) {
        const members = g.memberIds || [];
        if (!members.length) return '<p style="color:#999;font-size:0.85rem;padding:12px 0;">No members.</p>';
        return `<table class="data-table" style="margin-top:10px;"><thead><tr><th>User</th><th>Tests Taken</th><th>Avg Score</th><th>Best</th></tr></thead><tbody>` +
            members.map(uid => {
                const u = allUsers[uid], name = u?.fullName || uid.substring(0, 16), email = u?.email || '';
                const res = allResults.filter(r => r.userId === uid && (g.assignedTests || []).includes(r.testId));
                const sc = res.map(r => r.totalScore).filter(s => s > 0);
                return `<tr><td><div class="user-info"><div class="user-avatar">${(name[0]||'?').toUpperCase()}</div><div><div class="user-name">${esc(name)}</div><div class="user-email">${esc(email)}</div></div></div></td>
                    <td>${res.length}</td><td>${scoreBadge(calcAvg(sc))}</td><td>${sc.length ? Math.max(...sc) : '—'}</td></tr>`;
            }).join('') + '</tbody></table>';
    }

    function renderGroupStats(g) {
        const members = g.memberIds || [], tests = g.assignedTests || [];
        if (!members.length || !tests.length) return '<p style="color:#999;font-size:0.85rem;padding:12px 0;">Add members and assign tests to see statistics.</p>';
        const res = allResults.filter(r => members.includes(r.userId) && tests.includes(r.testId));
        const sc = res.map(r => r.totalScore).filter(s => s > 0);
        const perTest = tests.map(tid => {
            const tr = res.filter(r => r.testId === tid);
            return `<div class="mini-stat-row"><span class="label">${esc(allTests[tid]?.name || tid)} (${tr.length}/${members.length})</span><span class="value">${scoreBadge(calcAvg(tr.map(r=>r.totalScore).filter(s=>s>0)))}</span></div>`;
        }).join('');
        return `<div class="expand-grid" style="margin-top:10px;">
            <div class="expand-mini-card"><h4>Group Overview</h4>
                <div class="mini-stat-row"><span class="label">Total Completions</span><span class="value">${res.length}</span></div>
                <div class="mini-stat-row"><span class="label">Average</span><span class="value">${calcAvg(sc)}</span></div>
                <div class="mini-stat-row"><span class="label">Highest</span><span class="value" style="color:#0d6832;">${sc.length ? Math.max(...sc) : 0}</span></div>
                <div class="mini-stat-row"><span class="label">Lowest</span><span class="value" style="color:#e74c3c;">${sc.length ? Math.min(...sc) : 0}</span></div>
                <div class="mini-stat-row"><span class="label">Avg R&W</span><span class="value">${calcAvg(res.map(r=>r.rwScore).filter(s=>s>0))}</span></div>
                <div class="mini-stat-row"><span class="label">Avg Math</span><span class="value">${calcAvg(res.map(r=>r.mathScore).filter(s=>s>0))}</span></div>
            </div>
            <div class="expand-mini-card"><h4>Per-Test</h4>${perTest || '<p style="color:#999;">No results.</p>'}</div>
        </div>`;
    }

    // --- Group Modal ---
    const modal = document.getElementById('group-modal');
    document.getElementById('btn-create-group').addEventListener('click', () => {
        editingGroupId = null;
        document.getElementById('group-modal-title').textContent = 'Create Study Group';
        document.getElementById('group-name-input').value = '';
        document.getElementById('group-members-input').value = '';
        populateTestCheckboxes([]);
        modal.classList.add('visible');
    });
    document.getElementById('group-modal-cancel').addEventListener('click', () => modal.classList.remove('visible'));

    document.getElementById('group-modal-save').addEventListener('click', async () => {
        const name = document.getElementById('group-name-input').value.trim();
        const membersRaw = document.getElementById('group-members-input').value.trim();
        if (!name) { alert('Please enter a group name.'); return; }
        const memberIds = membersRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        const assignedTests = [];
        document.querySelectorAll('#group-tests-grid input:checked').forEach(cb => assignedTests.push(cb.value));

        const btn = document.getElementById('group-modal-save');
        btn.textContent = 'Saving...'; btn.disabled = true;

        try {
            const data = { name, memberIds, assignedTests, createdBy: auth.currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (editingGroupId) {
                await db.collection('studyGroups').doc(editingGroupId).update(data);
            } else {
                await db.collection('studyGroups').add(data);
            }

            // Batch-assign: add members to each test's whitelist
            if (memberIds.length > 0 && assignedTests.length > 0) {
                const batch = db.batch();
                for (const tid of assignedTests) {
                    batch.update(db.collection('tests').doc(tid), {
                        whitelist: firebase.firestore.FieldValue.arrayUnion(...memberIds),
                        visibility: 'private'
                    });
                }
                await batch.commit();
            }

            modal.classList.remove('visible');
            await loadAllData();
        } catch (e) {
            console.error('Save group error:', e);
            alert('Error: ' + e.message);
        }
        btn.textContent = 'Save Group'; btn.disabled = false;
    });

    function populateTestCheckboxes(selected) {
        document.getElementById('group-tests-grid').innerHTML = Object.values(allTests).map(t =>
            `<label class="test-checkbox-item"><input type="checkbox" value="${t.id}" ${selected.includes(t.id) ? 'checked' : ''}> ${esc(t.name || t.id)}</label>`
        ).join('') || '<p style="color:#999;">No tests available.</p>';
    }

    window._editGroup = function(gid) {
        const g = allGroups.find(x => x.id === gid);
        if (!g) return;
        editingGroupId = gid;
        document.getElementById('group-modal-title').textContent = 'Edit Study Group';
        document.getElementById('group-name-input').value = g.name || '';
        document.getElementById('group-members-input').value = (g.memberIds || []).join('\n');
        populateTestCheckboxes(g.assignedTests || []);
        modal.classList.add('visible');
    };

    window._deleteGroup = async function(gid, name) {
        if (!confirm(`Delete group "${name}"?`)) return;
        try { await db.collection('studyGroups').doc(gid).delete(); await loadAllData(); }
        catch (e) { alert('Error: ' + e.message); }
    };

    // ===========================
    // HELPERS
    // ===========================
    function calcAvg(a) { return a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0; }
    function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m-1] + s[m]) / 2); }
    function stdDev(a) { if (a.length < 2) return 0; const avg = a.reduce((s, v) => s + v, 0) / a.length; return Math.round(Math.sqrt(a.reduce((s, v) => s + (v - avg) ** 2, 0) / a.length)); }
    function scoreBadge(s) { let c = 'low'; if (s >= 1400) c = 'excellent'; else if (s >= 1100) c = 'good'; else if (s >= 800) c = 'average'; return `<span class="score-badge ${c}">${s}</span>`; }
    function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
    function isFillinCorrect(u, f) {
        if (!u || !f) return false;
        const c = f.replace(/<[^>]*>/g, '').trim(); if (!c) return false;
        const ans = c.split(',').map(a => a.trim()).filter(a => a);
        const ul = u.trim().toLowerCase();
        for (const a of ans) { if (ul === a.toLowerCase()) return true; const fr = s => { const m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/); return m ? parseFloat(m[1])/parseFloat(m[2]) : parseFloat(s); }; if (Math.abs(fr(ul) - fr(a.toLowerCase())) < 0.0001) return true; }
        return false;
    }
});
