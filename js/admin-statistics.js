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
    const chartInstances = {};

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

            // Destroy old charts before re-rendering
            Object.keys(chartInstances).forEach(k => { chartInstances[k].destroy(); delete chartInstances[k]; });

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
        chartInstances['completions'] = new Chart(document.getElementById('chart-completions'), {
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
        chartInstances['scores'] = new Chart(document.getElementById('chart-scores'), {
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
        chartInstances['rwmath'] = new Chart(document.getElementById('chart-rw-math'), {
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
        chartInstances['toptests'] = new Chart(document.getElementById('chart-top-tests'), {
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

        // Individual scores — clickable to open student result page
        const indEl = document.getElementById('individual-' + testId);
        indEl.innerHTML = results.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
            .map(r => {
                const u = allUsers[r.userId];
                const name = u?.fullName || u?.email || r.userId.substring(0, 12);
                return `<a href="results.html?resultId=${r.id}" target="_blank" class="mini-stat-row" style="text-decoration:none;cursor:pointer;border-radius:6px;padding:5px 8px;margin:0 -8px;" onmouseover="this.style.background='var(--light-gray)'" onmouseout="this.style.background=''"><span class="label" style="color:var(--primary-blue);">${esc(name)} <i class='fa-solid fa-arrow-up-right-from-square' style='font-size:0.65rem;opacity:0.5;margin-left:4px;'></i></span><span class="value">${scoreBadge(r.totalScore)}</span></a>`;
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
                <div class="expand-content" id="udetail-${uid}"><p style="color:#999;text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading details...</p></div>
            </td></tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">No user data yet.</td></tr>';

        tbody.querySelectorAll('.expandable').forEach(row => {
            row.addEventListener('click', () => {
                const uid = row.dataset.uid;
                const exp = document.getElementById('uexpand-' + uid);
                const icon = row.querySelector('i');
                const isOpen = exp.classList.contains('visible');
                document.querySelectorAll('#users-table-body .expand-row.visible').forEach(r => r.classList.remove('visible'));
                document.querySelectorAll('#users-table-body .expandable i').forEach(i => i.style.transform = '');
                if (!isOpen) {
                    exp.classList.add('visible');
                    icon.style.transform = 'rotate(90deg)';
                    loadUserDetails(uid);
                }
            });
        });

        document.getElementById('user-search').addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            tbody.querySelectorAll('.expandable').forEach(row => {
                const text = row.children[1].textContent.toLowerCase();
                row.style.display = text.includes(q) ? '' : 'none';
            });
        });
    }

    function loadUserDetails(uid) {
        const container = document.getElementById('udetail-' + uid);
        if (container.dataset.loaded) return;
        container.dataset.loaded = '1';

        const results = allResults.filter(r => r.userId === uid);
        const u = allUsers[uid];
        const name = u?.fullName || 'Unknown';
        const scores = results.map(r => r.totalScore).filter(s => s > 0);
        const rwScores = results.map(r => r.rwScore).filter(s => s > 0);
        const mathScores = results.map(r => r.mathScore).filter(s => s > 0);
        const avg = calcAvg(scores), best = scores.length ? Math.max(...scores) : 0, worst = scores.length ? Math.min(...scores) : 0;

        const chrono = [...results].sort((a, b) => {
            const ta = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
            const tb = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
            return ta - tb;
        });
        const chronoDesc = [...results].sort((a, b) => {
            const ta = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
            const tb = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
            return tb - ta;
        });

        const chronScores = chrono.map(r => r.totalScore).filter(s => s > 0);
        const imp = chronScores.length >= 2 ? chronScores[chronScores.length - 1] - chronScores[0] : null;
        const impColor = imp === null ? '#999' : (imp >= 0 ? '#0d6832' : '#e74c3c');
        const impText = imp === null ? '—' : ((imp >= 0 ? '+' : '') + imp + ' pts');

        // Domain analysis
        const domC = {}, domT = {};
        results.forEach(r => {
            (r.reviewIndex || []).forEach(item => {
                const d = item.domain || 'Unknown';
                domT[d] = (domT[d] || 0) + 1;
                domC[d] = domC[d] || 0;
                const ua = (r.userAnswers || {})[item.id];
                if (item.format === 'fill-in' ? isFillinCorrect(ua, item.fillInAnswer) : ua === item.correctAnswer) domC[d]++;
            });
        });
        const domEntries = Object.entries(domT).sort((a, b) => b[1] - a[1]);
        const strengths = domEntries.filter(([d, t]) => ((domC[d] || 0) / t) >= 0.7).slice(0, 3);
        const weaknesses = domEntries.filter(([d, t]) => ((domC[d] || 0) / t) < 0.5).sort((a, b) => ((domC[a[0]] || 0) / a[1]) - ((domC[b[0]] || 0) / b[1])).slice(0, 3);
        const rwAvg = calcAvg(rwScores), mAvg = calcAvg(mathScores);
        const stronger = rwAvg > mAvg ? 'R&W' : mAvg > rwAvg ? 'Math' : 'Equal';

        container.innerHTML = `
        <div class="expand-grid" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="expand-mini-card" style="grid-column:span 2;"><h4><i class="fa-solid fa-chart-line"></i> Score Trend</h4>
                <div style="height:180px;position:relative;"><canvas id="uchart-${uid}"></canvas></div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-gauge-high"></i> Performance</h4>
                <div class="mini-stat-row"><span class="label">Tests Taken</span><span class="value">${results.length}</span></div>
                <div class="mini-stat-row"><span class="label">Average</span><span class="value">${scoreBadge(avg)}</span></div>
                <div class="mini-stat-row"><span class="label">Best</span><span class="value" style="color:#0d6832;font-weight:700;">${best}</span></div>
                <div class="mini-stat-row"><span class="label">Worst</span><span class="value" style="color:#e74c3c;font-weight:700;">${worst}</span></div>
                <div class="mini-stat-row"><span class="label">Median</span><span class="value">${median(scores)}</span></div>
                <div class="mini-stat-row"><span class="label">Improvement</span><span class="value" style="color:${impColor};font-weight:700;">${impText}</span></div>
                <div class="mini-stat-row"><span class="label">Std Dev</span><span class="value">${stdDev(scores)}</span></div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-scale-balanced"></i> Section Comparison</h4>
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <div style="flex:1;text-align:center;padding:12px 8px;background:var(--light-gray);border-radius:8px;">
                        <div style="font-size:0.7rem;color:var(--dark-gray);font-weight:600;text-transform:uppercase;margin-bottom:4px;">R&W</div>
                        <div style="font-size:1.3rem;font-weight:700;color:var(--primary-blue);">${rwAvg}</div>
                        <div style="font-size:0.7rem;color:#999;">Best: ${rwScores.length ? Math.max(...rwScores) : '—'}</div>
                    </div>
                    <div style="flex:1;text-align:center;padding:12px 8px;background:var(--light-gray);border-radius:8px;">
                        <div style="font-size:0.7rem;color:var(--dark-gray);font-weight:600;text-transform:uppercase;margin-bottom:4px;">Math</div>
                        <div style="font-size:1.3rem;font-weight:700;color:var(--primary-purple);">${mAvg}</div>
                        <div style="font-size:0.7rem;color:#999;">Best: ${mathScores.length ? Math.max(...mathScores) : '—'}</div>
                    </div>
                </div>
                <div style="font-size:0.8rem;color:var(--dark-gray);text-align:center;">
                    <i class="fa-solid fa-arrow-trend-up" style="color:#0d6832;"></i> Stronger in ${stronger}
                    <span style="color:#999;"> by ${Math.abs(rwAvg - mAvg)} pts</span>
                </div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-clock-rotate-left"></i> Test History (${results.length})</h4>
                <div style="max-height:220px;overflow-y:auto;">${chronoDesc.map(r => {
                    const dt = r.completedAt?.toDate ? r.completedAt.toDate().toLocaleDateString() : '';
                    return `<a href="results.html?resultId=${r.id}" target="_blank" class="mini-stat-row" style="text-decoration:none;cursor:pointer;border-radius:6px;padding:6px 8px;margin:0 -8px;" onmouseover="this.style.background='var(--light-gray)'" onmouseout="this.style.background=''">
                        <span class="label" style="display:flex;flex-direction:column;color:var(--primary-blue);">
                            <span style="font-weight:600;">${esc(r.testName || r.testId)}</span>
                            <span style="font-size:0.7rem;color:#999;">${dt}${r.rwScore ? ' · R&W: ' + r.rwScore + ' · M: ' + r.mathScore : ''}</span>
                        </span>
                        <span class="value" style="display:flex;align-items:center;gap:5px;">${scoreBadge(r.totalScore)}<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.6rem;color:#ccc;"></i></span>
                    </a>`;
                }).join('')}</div>
            </div>
            <div class="expand-mini-card" style="grid-column:span 2;"><h4><i class="fa-solid fa-bullseye"></i> Domain Analysis</h4>
                ${domEntries.length === 0 ? '<p style="color:#999;font-size:0.85rem;">No domain data available.</p>' : `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                    <div style="padding:10px;background:#e6f7eb;border-radius:8px;">
                        <div style="font-size:0.75rem;font-weight:600;color:#0d6832;margin-bottom:4px;"><i class="fa-solid fa-thumbs-up"></i> Strengths</div>
                        ${strengths.length ? strengths.map(([d, t]) => `<div style="font-size:0.8rem;color:#0d6832;">${esc(d)} <b>${Math.round(((domC[d]||0)/t)*100)}%</b></div>`).join('') : '<div style="font-size:0.8rem;color:#999;">Need more data</div>'}
                    </div>
                    <div style="padding:10px;background:#fef2f2;border-radius:8px;">
                        <div style="font-size:0.75rem;font-weight:600;color:var(--error-red);margin-bottom:4px;"><i class="fa-solid fa-triangle-exclamation"></i> Needs Work</div>
                        ${weaknesses.length ? weaknesses.map(([d, t]) => `<div style="font-size:0.8rem;color:var(--error-red);">${esc(d)} <b>${Math.round(((domC[d]||0)/t)*100)}%</b></div>`).join('') : '<div style="font-size:0.8rem;color:#999;">Looking good!</div>'}
                    </div>
                </div>
                <div style="max-height:150px;overflow-y:auto;">${domEntries.map(([d, t]) => {
                    const pct = Math.round(((domC[d] || 0) / t) * 100);
                    return `<div class="domain-bar-row"><span class="domain-bar-label">${esc(d)} (${t})</span>
                        <div class="domain-bar-bg"><div class="domain-bar-fill" style="width:${pct}%;background:${pct >= 70 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c'}"></div></div>
                        <span class="domain-bar-pct" style="color:${pct >= 70 ? '#0d6832' : pct >= 50 ? '#856404' : '#e74c3c'}">${pct}%</span></div>`;
                }).join('')}</div>`}
            </div>
        </div>
        <div style="text-align:right;margin-top:8px;"><span style="font-size:0.7rem;color:#999;font-family:monospace;">UID: ${uid}</span></div>`;

        // Score trend chart
        if (chrono.length >= 2) {
            const cv = document.getElementById('uchart-' + uid);
            if (cv) {
                if (chartInstances['u-' + uid]) chartInstances['u-' + uid].destroy();
                chartInstances['u-' + uid] = new Chart(cv, {
                    type: 'line',
                    data: {
                        labels: chrono.map(r => { const d = r.completedAt?.toDate ? r.completedAt.toDate() : null; return d ? d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''; }),
                        datasets: [
                            { label: 'Total', data: chrono.map(r => r.totalScore || 0), borderColor: '#6A0DAD', backgroundColor: 'rgba(106,13,173,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#6A0DAD' },
                            { label: 'R&W', data: chrono.map(r => r.rwScore || 0), borderColor: '#003366', borderDash: [5, 3], tension: 0.4, pointRadius: 2 },
                            { label: 'Math', data: chrono.map(r => r.mathScore || 0), borderColor: '#27ae60', borderDash: [5, 3], tension: 0.4, pointRadius: 2 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'bottom', labels: { font: { family: 'Poppins', size: 10 }, usePointStyle: true, padding: 12 } } },
                        scales: {
                            x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 10 }, color: '#999' } },
                            y: { grid: { color: '#eee' }, ticks: { font: { family: 'Poppins', size: 10 }, color: '#999' }, min: 200, max: 1600 }
                        }
                    }
                });
            }
        }
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

        // Group member row expand handlers
        container.querySelectorAll('.gm-expandable').forEach(row => {
            row.addEventListener('click', e => {
                e.stopPropagation();
                const uid = row.dataset.gmuid;
                const gid = row.dataset.gid;
                const exp = document.getElementById('gmexp-' + gid + '-' + uid);
                const icon = row.querySelector('i');
                if (!exp) return;
                const isOpen = exp.classList.contains('visible');
                // Close all other expanded rows in this group
                container.querySelectorAll(`.gm-expandable[data-gid="${gid}"]`).forEach(r => {
                    const eid = 'gmexp-' + gid + '-' + r.dataset.gmuid;
                    const el = document.getElementById(eid);
                    if (el) el.classList.remove('visible');
                    const ic = r.querySelector('i');
                    if (ic) ic.style.transform = '';
                });
                if (!isOpen) {
                    exp.classList.add('visible');
                    icon.style.transform = 'rotate(90deg)';
                    loadGroupMemberDetails(gid, uid);
                }
            });
        });
    }

    function loadGroupMemberDetails(gid, uid) {
        const container = document.getElementById('gmdetail-' + gid + '-' + uid);
        if (!container || container.dataset.loaded) return;
        container.dataset.loaded = '1';

        const group = allGroups.find(g => g.id === gid);
        const assignedTests = group?.assignedTests || [];
        const results = allResults.filter(r => r.userId === uid);
        const groupResults = results.filter(r => assignedTests.includes(r.testId));
        const u = allUsers[uid];
        const name = u?.fullName || 'Unknown';
        const scores = groupResults.map(r => r.totalScore).filter(s => s > 0);
        const rwScores = groupResults.map(r => r.rwScore).filter(s => s > 0);
        const mathScores = groupResults.map(r => r.mathScore).filter(s => s > 0);
        const avg = calcAvg(scores), best = scores.length ? Math.max(...scores) : 0, worst = scores.length ? Math.min(...scores) : 0;
        const rwAvg = calcAvg(rwScores), mAvg = calcAvg(mathScores);
        const stronger = rwAvg > mAvg ? 'R&W' : mAvg > rwAvg ? 'Math' : 'Equal';

        const chrono = [...groupResults].sort((a, b) => {
            const ta = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
            const tb = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
            return ta - tb;
        });
        const chronoDesc = [...groupResults].sort((a, b) => {
            const ta = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
            const tb = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
            return tb - ta;
        });

        const chronScores = chrono.map(r => r.totalScore).filter(s => s > 0);
        const imp = chronScores.length >= 2 ? chronScores[chronScores.length - 1] - chronScores[0] : null;
        const impColor = imp === null ? '#999' : (imp >= 0 ? '#0d6832' : '#e74c3c');
        const impText = imp === null ? '—' : ((imp >= 0 ? '+' : '') + imp + ' pts');

        // Domain analysis
        const domC = {}, domT = {};
        groupResults.forEach(r => {
            (r.reviewIndex || []).forEach(item => {
                const d = item.domain || 'Unknown';
                domT[d] = (domT[d] || 0) + 1; domC[d] = domC[d] || 0;
                const ua = (r.userAnswers || {})[item.id];
                if (item.format === 'fill-in' ? isFillinCorrect(ua, item.fillInAnswer) : ua === item.correctAnswer) domC[d]++;
            });
        });
        const domEntries = Object.entries(domT).sort((a, b) => b[1] - a[1]);
        const strengths = domEntries.filter(([d, t]) => ((domC[d] || 0) / t) >= 0.7).slice(0, 3);
        const weaknesses = domEntries.filter(([d, t]) => ((domC[d] || 0) / t) < 0.5).sort((a, b) => ((domC[a[0]]||0)/a[1]) - ((domC[b[0]]||0)/b[1])).slice(0, 3);

        // Completion status for assigned tests
        const testStatus = assignedTests.map(tid => {
            const r = groupResults.find(r => r.testId === tid);
            return { tid, name: allTests[tid]?.name || tid, result: r };
        });

        const chartId = 'gmchart-' + gid + '-' + uid;
        container.innerHTML = `
        <div class="expand-grid" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="expand-mini-card" style="grid-column:span 2;"><h4><i class="fa-solid fa-chart-line"></i> Score Trend (Group Tests)</h4>
                <div style="height:160px;position:relative;"><canvas id="${chartId}"></canvas></div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-gauge-high"></i> Performance</h4>
                <div class="mini-stat-row"><span class="label">Completed</span><span class="value">${groupResults.length}/${assignedTests.length}</span></div>
                <div class="mini-stat-row"><span class="label">Average</span><span class="value">${scoreBadge(avg)}</span></div>
                <div class="mini-stat-row"><span class="label">Best</span><span class="value" style="color:#0d6832;font-weight:700;">${best}</span></div>
                <div class="mini-stat-row"><span class="label">Worst</span><span class="value" style="color:#e74c3c;font-weight:700;">${worst}</span></div>
                <div class="mini-stat-row"><span class="label">Improvement</span><span class="value" style="color:${impColor};font-weight:700;">${impText}</span></div>
                <div class="mini-stat-row"><span class="label">Median</span><span class="value">${median(scores)}</span></div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-scale-balanced"></i> Section Comparison</h4>
                <div style="display:flex;gap:10px;margin-bottom:8px;">
                    <div style="flex:1;text-align:center;padding:10px 6px;background:var(--light-gray);border-radius:8px;">
                        <div style="font-size:0.65rem;color:var(--dark-gray);font-weight:600;text-transform:uppercase;">R&W</div>
                        <div style="font-size:1.2rem;font-weight:700;color:var(--primary-blue);">${rwAvg}</div>
                    </div>
                    <div style="flex:1;text-align:center;padding:10px 6px;background:var(--light-gray);border-radius:8px;">
                        <div style="font-size:0.65rem;color:var(--dark-gray);font-weight:600;text-transform:uppercase;">Math</div>
                        <div style="font-size:1.2rem;font-weight:700;color:var(--primary-purple);">${mAvg}</div>
                    </div>
                </div>
                <div style="font-size:0.78rem;color:var(--dark-gray);text-align:center;">Stronger in ${stronger} <span style="color:#999;">by ${Math.abs(rwAvg - mAvg)} pts</span></div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-list-check"></i> Assigned Tests</h4>
                <div style="max-height:200px;overflow-y:auto;">${testStatus.map(ts => {
                    if (ts.result) {
                        return `<a href="results.html?resultId=${ts.result.id}" target="_blank" class="mini-stat-row" style="text-decoration:none;cursor:pointer;border-radius:6px;padding:5px 8px;margin:0 -8px;" onmouseover="this.style.background='var(--light-gray)'" onmouseout="this.style.background=''">
                            <span class="label" style="display:flex;flex-direction:column;color:var(--primary-blue);">
                                <span style="font-weight:600;">${esc(ts.name)} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.6rem;opacity:0.5;"></i></span>
                                <span style="font-size:0.7rem;color:#999;">${ts.result.rwScore ? 'R&W: ' + ts.result.rwScore + ' · Math: ' + ts.result.mathScore : ''}</span>
                            </span>
                            <span class="value" style="display:flex;align-items:center;">${scoreBadge(ts.result.totalScore)}</span>
                        </a>`;
                    }
                    return `<div class="mini-stat-row"><span class="label" style="color:#999;">${esc(ts.name)}</span><span class="value" style="font-size:0.75rem;color:#999;">Not taken</span></div>`;
                }).join('')}</div>
            </div>
            ${domEntries.length > 0 ? `<div class="expand-mini-card" style="grid-column:span 2;"><h4><i class="fa-solid fa-bullseye"></i> Domain Analysis</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="padding:8px;background:#e6f7eb;border-radius:8px;">
                        <div style="font-size:0.7rem;font-weight:600;color:#0d6832;margin-bottom:3px;"><i class="fa-solid fa-thumbs-up"></i> Strengths</div>
                        ${strengths.length ? strengths.map(([d, t]) => `<div style="font-size:0.78rem;color:#0d6832;">${esc(d)} <b>${Math.round(((domC[d]||0)/t)*100)}%</b></div>`).join('') : '<div style="font-size:0.78rem;color:#999;">Need more data</div>'}
                    </div>
                    <div style="padding:8px;background:#fef2f2;border-radius:8px;">
                        <div style="font-size:0.7rem;font-weight:600;color:var(--error-red);margin-bottom:3px;"><i class="fa-solid fa-triangle-exclamation"></i> Needs Work</div>
                        ${weaknesses.length ? weaknesses.map(([d, t]) => `<div style="font-size:0.78rem;color:var(--error-red);">${esc(d)} <b>${Math.round(((domC[d]||0)/t)*100)}%</b></div>`).join('') : '<div style="font-size:0.78rem;color:#999;">Looking good!</div>'}
                    </div>
                </div>
                <div style="max-height:120px;overflow-y:auto;">${domEntries.map(([d, t]) => {
                    const pct = Math.round(((domC[d] || 0) / t) * 100);
                    return `<div class="domain-bar-row"><span class="domain-bar-label">${esc(d)} (${t})</span>
                        <div class="domain-bar-bg"><div class="domain-bar-fill" style="width:${pct}%;background:${pct >= 70 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c'}"></div></div>
                        <span class="domain-bar-pct" style="color:${pct >= 70 ? '#0d6832' : pct >= 50 ? '#856404' : '#e74c3c'}">${pct}%</span></div>`;
                }).join('')}</div>
            </div>` : ''}
        </div>
        <div style="text-align:right;margin-top:6px;"><span style="font-size:0.65rem;color:#999;font-family:monospace;">UID: ${uid}</span></div>`;

        // Score trend chart
        if (chrono.length >= 2) {
            const cv = document.getElementById(chartId);
            if (cv) {
                if (chartInstances[chartId]) chartInstances[chartId].destroy();
                chartInstances[chartId] = new Chart(cv, {
                    type: 'line',
                    data: {
                        labels: chrono.map(r => { const d = r.completedAt?.toDate ? r.completedAt.toDate() : null; return d ? d.toLocaleDateString('en', { month:'short', day:'numeric' }) : ''; }),
                        datasets: [
                            { label: 'Total', data: chrono.map(r => r.totalScore || 0), borderColor: '#6A0DAD', backgroundColor: 'rgba(106,13,173,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#6A0DAD' },
                            { label: 'R&W', data: chrono.map(r => r.rwScore || 0), borderColor: '#003366', borderDash: [5, 3], tension: 0.4, pointRadius: 2 },
                            { label: 'Math', data: chrono.map(r => r.mathScore || 0), borderColor: '#27ae60', borderDash: [5, 3], tension: 0.4, pointRadius: 2 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, position: 'bottom', labels: { font: { family: 'Poppins', size: 9 }, usePointStyle: true, padding: 10 } } },
                        scales: {
                            x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 9 }, color: '#999' } },
                            y: { grid: { color: '#eee' }, ticks: { font: { family: 'Poppins', size: 9 }, color: '#999' }, min: 200, max: 1600 }
                        }
                    }
                });
            }
        }
    }

    function renderGroupMembers(g) {
        const members = g.memberIds || [];
        if (!members.length) return '<p style="color:#999;font-size:0.85rem;padding:12px 0;">No members.</p>';
        return `<table class="data-table" style="margin-top:10px;"><thead><tr><th style="width:30px;"></th><th>User</th><th>Tests Taken</th><th>Avg Score</th><th>Best</th><th>R&W</th><th>Math</th></tr></thead><tbody>` +
            members.map(uid => {
                const u = allUsers[uid], name = u?.fullName || u?.email || uid, email = u?.email || '';
                const res = allResults.filter(r => r.userId === uid && (g.assignedTests || []).includes(r.testId));
                const allRes = allResults.filter(r => r.userId === uid);
                const sc = res.map(r => r.totalScore).filter(s => s > 0);
                const rwAvg = calcAvg(res.map(r => r.rwScore).filter(s => s > 0));
                const mAvg = calcAvg(res.map(r => r.mathScore).filter(s => s > 0));
                return `<tr class="expandable gm-expandable" data-gmuid="${uid}" data-gid="${g.id}" style="cursor:pointer;">
                    <td><i class="fa-solid fa-chevron-right" style="color:#999;font-size:0.7rem;transition:transform 0.2s;"></i></td>
                    <td><div class="user-info"><div class="user-avatar">${(name[0]||'?').toUpperCase()}</div><div><div class="user-name">${esc(name)}</div>${email ? `<div class="user-email">${esc(email)}</div>` : ''}<div style="font-size:0.6rem;color:#bbb;font-family:monospace;">${uid.substring(0,14)}…</div></div></div></td>
                    <td>${res.length}/${(g.assignedTests||[]).length}</td><td>${scoreBadge(calcAvg(sc))}</td><td style="color:#0d6832;font-weight:600;">${sc.length ? Math.max(...sc) : '—'}</td>
                    <td>${rwAvg}</td><td>${mAvg}</td>
                </tr>
                <tr class="expand-row" id="gmexp-${g.id}-${uid}"><td colspan="7">
                    <div class="expand-content" id="gmdetail-${g.id}-${uid}"><p style="color:#999;text-align:center;padding:16px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>
                </td></tr>`;
            }).join('') + '</tbody></table>';
    }

    function renderGroupStats(g) {
        const members = g.memberIds || [], tests = g.assignedTests || [];
        if (!members.length || !tests.length) return '<p style="color:#999;font-size:0.85rem;padding:12px 0;">Add members and assign tests to see statistics.</p>';
        const res = allResults.filter(r => members.includes(r.userId) && tests.includes(r.testId));
        const sc = res.map(r => r.totalScore).filter(s => s > 0);
        const rwAll = res.map(r => r.rwScore).filter(s => s > 0);
        const mAll = res.map(r => r.mathScore).filter(s => s > 0);

        // Completion rate per member
        const completionRates = members.map(uid => {
            const done = res.filter(r => r.userId === uid).length;
            return { uid, done, total: tests.length, pct: Math.round((done / tests.length) * 100) };
        });
        const avgCompletion = calcAvg(completionRates.map(c => c.pct));

        // Domain analysis across group
        const domC = {}, domT = {};
        res.forEach(r => {
            (r.reviewIndex || []).forEach(item => {
                const d = item.domain || 'Unknown';
                domT[d] = (domT[d] || 0) + 1;
                domC[d] = domC[d] || 0;
                const ua = (r.userAnswers || {})[item.id];
                if (item.format === 'fill-in' ? isFillinCorrect(ua, item.fillInAnswer) : ua === item.correctAnswer) domC[d]++;
            });
        });
        const domEntries = Object.entries(domT).sort((a, b) => b[1] - a[1]).slice(0, 10);

        return `<div class="expand-grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px;">
            <div class="expand-mini-card"><h4><i class="fa-solid fa-chart-pie"></i> Group Overview</h4>
                <div class="mini-stat-row"><span class="label">Members</span><span class="value">${members.length}</span></div>
                <div class="mini-stat-row"><span class="label">Assigned Tests</span><span class="value">${tests.length}</span></div>
                <div class="mini-stat-row"><span class="label">Completions</span><span class="value">${res.length} / ${members.length * tests.length}</span></div>
                <div class="mini-stat-row"><span class="label">Completion Rate</span><span class="value" style="font-weight:700;color:${avgCompletion >= 80 ? '#0d6832' : avgCompletion >= 50 ? '#856404' : '#e74c3c'};">${avgCompletion}%</span></div>
                <div class="mini-stat-row"><span class="label">Average Score</span><span class="value">${scoreBadge(calcAvg(sc))}</span></div>
                <div class="mini-stat-row"><span class="label">Highest</span><span class="value" style="color:#0d6832;font-weight:700;">${sc.length ? Math.max(...sc) : 0}</span></div>
                <div class="mini-stat-row"><span class="label">Lowest</span><span class="value" style="color:#e74c3c;font-weight:700;">${sc.length ? Math.min(...sc) : 0}</span></div>
                <div class="mini-stat-row"><span class="label">Median</span><span class="value">${median(sc)}</span></div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-scale-balanced"></i> Section Comparison</h4>
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <div style="flex:1;text-align:center;padding:12px 8px;background:var(--light-gray);border-radius:8px;">
                        <div style="font-size:0.7rem;color:var(--dark-gray);font-weight:600;text-transform:uppercase;margin-bottom:4px;">R&W</div>
                        <div style="font-size:1.3rem;font-weight:700;color:var(--primary-blue);">${calcAvg(rwAll)}</div>
                        <div style="font-size:0.7rem;color:#999;">Best: ${rwAll.length ? Math.max(...rwAll) : '—'}</div>
                    </div>
                    <div style="flex:1;text-align:center;padding:12px 8px;background:var(--light-gray);border-radius:8px;">
                        <div style="font-size:0.7rem;color:var(--dark-gray);font-weight:600;text-transform:uppercase;margin-bottom:4px;">Math</div>
                        <div style="font-size:1.3rem;font-weight:700;color:var(--primary-purple);">${calcAvg(mAll)}</div>
                        <div style="font-size:0.7rem;color:#999;">Best: ${mAll.length ? Math.max(...mAll) : '—'}</div>
                    </div>
                </div>
                <div style="font-size:0.8rem;color:var(--dark-gray);text-align:center;">
                    Group stronger in ${calcAvg(rwAll) > calcAvg(mAll) ? 'R&W' : 'Math'}
                    <span style="color:#999"> by ${Math.abs(calcAvg(rwAll) - calcAvg(mAll))} pts</span>
                </div>
            </div>
            <div class="expand-mini-card"><h4><i class="fa-solid fa-list-check"></i> Per-Test Breakdown</h4>
                <div style="max-height:220px;overflow-y:auto;">${tests.map(tid => {
                    const tr = res.filter(r => r.testId === tid);
                    const tsc = tr.map(r => r.totalScore).filter(s => s > 0);
                    const completed = tr.length;
                    return `<div style="padding:6px 0;border-bottom:1px solid var(--border-color);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                            <span style="font-size:0.85rem;font-weight:600;color:var(--primary-blue);">${esc(allTests[tid]?.name || tid)}</span>
                            ${scoreBadge(calcAvg(tsc))}
                        </div>
                        <div style="display:flex;gap:12px;font-size:0.75rem;color:#999;">
                            <span>${completed}/${members.length} completed</span>
                            ${tsc.length ? `<span>Hi: ${Math.max(...tsc)}</span><span>Lo: ${Math.min(...tsc)}</span>` : ''}
                        </div>
                    </div>`;
                }).join('')}</div>
            </div>
            ${domEntries.length > 0 ? `<div class="expand-mini-card" style="grid-column:span 3;"><h4><i class="fa-solid fa-bullseye"></i> Group Domain Analysis</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${domEntries.map(([d, t]) => {
                    const pct = Math.round(((domC[d] || 0) / t) * 100);
                    return `<div class="domain-bar-row"><span class="domain-bar-label">${esc(d)} (${t})</span>
                        <div class="domain-bar-bg"><div class="domain-bar-fill" style="width:${pct}%;background:${pct >= 70 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c'}"></div></div>
                        <span class="domain-bar-pct" style="color:${pct >= 70 ? '#0d6832' : pct >= 50 ? '#856404' : '#e74c3c'}">${pct}%</span></div>`;
                }).join('')}</div>
            </div>` : ''}
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
