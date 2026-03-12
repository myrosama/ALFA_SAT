// js/bug-report.js — ALFA SAT In-Test Bug Report System
// Allows students to report question issues during tests.
// Reports are processed by Gemini AI, then forwarded to admin via Telegram.

(function () {
    'use strict';

    // --- State ---
    let reportModalOpen = false;
    let screenshotBase64 = null;
    let screenshotFileName = null;

    // --- DOM References (set after DOMContentLoaded) ---
    let reportBtn, reportModal, reportBackdrop, reportForm;
    let reportType, reportMessage, reportScreenshotInput, reportScreenshotPreview;
    let reportSubmitBtn, reportCancelBtn, reportRemoveScreenshot;
    let reportStatusEl;

    // --- Helpers to get current question context from test-engine ---
    function getCurrentQuestionContext() {
        const qNumEl = document.querySelector('.question-header-bar:not(.hidden) .q-number-display');
        const moduleEl = document.querySelector('.test-title span');
        const sectionEl = document.querySelector('.test-title h4');
        const promptEl = document.querySelector('.question-pane .question-text');
        const passageEl = document.querySelector('.stimulus-pane .pane-content');
        const optionEls = document.querySelectorAll('.question-pane .option-text');

        const options = {};
        const letters = ['A', 'B', 'C', 'D'];
        optionEls.forEach((el, i) => {
            if (letters[i]) options[letters[i]] = el.textContent.trim().substring(0, 100);
        });

        // Get testId from URL
        const urlParams = new URLSearchParams(window.location.search);
        const testId = urlParams.get('id') || 'unknown';

        // Get test name: try global var from test-engine.js, then document title, then testId
        let tName = 'Unknown Test';
        if (typeof window.__alfaTestName === 'string' && window.__alfaTestName) {
            tName = window.__alfaTestName;
        } else {
            // Fallback: parse from document.title or derive from test ID
            const titleMatch = document.title.match(/^(.+?)\s*[—–|-]/);
            if (titleMatch) tName = titleMatch[1].trim();
            else if (testId !== 'unknown') tName = testId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        return {
            testId: testId,
            testName: tName,
            questionNumber: qNumEl ? qNumEl.textContent.trim() : '?',
            module: moduleEl ? moduleEl.textContent.trim() : '?',
            section: sectionEl ? sectionEl.textContent.trim() : '?',
            prompt: promptEl ? promptEl.textContent.trim().substring(0, 300) : '',
            passage: passageEl ? passageEl.textContent.trim().substring(0, 200) : '',
            options: options
        };
    }

    // --- Modal Controls ---
    function openReportModal() {
        if (reportModalOpen) return;
        reportModalOpen = true;
        const ctx = getCurrentQuestionContext();

        const ctxDisplay = reportModal.querySelector('#report-context-info');
        if (ctxDisplay) {
            ctxDisplay.textContent = `📝 ${ctx.testName} → ${ctx.section} — ${ctx.module} — Q${ctx.questionNumber}`;
        }

        reportModal.classList.add('visible');
        reportBackdrop.classList.add('visible');
        reportMessage.value = '';
        reportType.value = 'wrong-answer';
        clearScreenshot();
        setReportStatus('', '');
    }

    function closeReportModal() {
        reportModalOpen = false;
        reportModal.classList.remove('visible');
        reportBackdrop.classList.remove('visible');
    }

    function clearScreenshot() {
        screenshotBase64 = null;
        screenshotFileName = null;
        if (reportScreenshotPreview) {
            reportScreenshotPreview.style.display = 'none';
            reportScreenshotPreview.src = '';
        }
        if (reportRemoveScreenshot) reportRemoveScreenshot.style.display = 'none';
        if (reportScreenshotInput) reportScreenshotInput.value = '';
    }

    function handleScreenshotSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        screenshotFileName = file.name;
        const reader = new FileReader();
        reader.onload = function (ev) {
            screenshotBase64 = ev.target.result;
            if (reportScreenshotPreview) {
                reportScreenshotPreview.src = screenshotBase64;
                reportScreenshotPreview.style.display = 'block';
            }
            if (reportRemoveScreenshot) reportRemoveScreenshot.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    }

    function setReportStatus(msg, type) {
        if (!reportStatusEl) return;
        reportStatusEl.textContent = msg;
        reportStatusEl.className = 'report-status ' + type;
    }

    // --- AI Analysis via Gemini ---
    async function analyzeWithAI(ctx, issueType, userMessage) {
        const prompt = `You are an AI assistant for ALFA SAT, a Digital SAT practice test platform.

A student has reported an issue with a question. Analyze the report and determine:
1. Is the report likely valid?
2. What specific fix should be applied?
3. Priority: LOW (cosmetic), MEDIUM (confusing), HIGH (wrong answer/missing content)
4. The exact location of the error (which part of the question or passage)

QUESTION CONTEXT:
- Test: "${ctx.testName}" (ID: ${ctx.testId})
- Section: ${ctx.section}, ${ctx.module}, Question ${ctx.questionNumber}
- Question prompt: "${ctx.prompt}"
- Answer options: ${JSON.stringify(ctx.options)}
- Passage excerpt: "${ctx.passage}"

STUDENT REPORT:
- Issue type: ${issueType}
- Student message: "${userMessage}"

Respond in this exact JSON format:
{"valid": true/false, "priority": "LOW/MEDIUM/HIGH", "analysis": "your brief analysis", "error_location": "exact location of the error (e.g. passage paragraph 2, option C, question prompt)", "suggested_fix": "what should be changed"}`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${AI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
                })
            });

            if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Parse JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { valid: true, priority: 'MEDIUM', analysis: text.substring(0, 300), suggested_fix: 'Manual review needed' };
        } catch (err) {
            console.error('AI analysis failed:', err);
            return { valid: true, priority: 'MEDIUM', analysis: 'AI analysis unavailable — forwarding report as-is.', suggested_fix: 'Please review manually.' };
        }
    }

    // --- Send to Telegram (with inline approve/reject buttons) ---
    async function sendToTelegram(ctx, issueType, userMessage, aiResult) {
        const priorityEmoji = { LOW: '🟡', MEDIUM: '🟠', HIGH: '🔴' };
        const typeLabels = {
            'wrong-answer': '❌ Wrong Answer',
            'typo': '📝 Typo / Text Error',
            'image-issue': '🖼️ Image Missing/Wrong',
            'other': '💬 Other'
        };

        // Build a unique report ID from timestamp
        const reportId = `rpt_${Date.now()}`;

        // Escape markdown special chars in user message
        const safeMsg = userMessage.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

        // Escape test name for MarkdownV2
        const safeTestName = (ctx.testName || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        const safeTestId = (ctx.testId || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        const safeErrorLoc = (aiResult.error_location || 'Not specified').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

        const message = `🐛 *BUG REPORT*
━━━━━━━━━━━━━━━
📋 *Test:* ${safeTestName}
🆔 *Test ID:* ${safeTestId}
📝 *Section:* ${ctx.section} — ${ctx.module}
❓ *Question:* Q${ctx.questionNumber}
🏷️ *Type:* ${typeLabels[issueType] || issueType}
${priorityEmoji[aiResult.priority] || '⚪'} *Priority:* ${aiResult.priority}

💬 *Student says:*
"${safeMsg}"

📍 *Error Location:*
${safeErrorLoc}

🤖 *AI Analysis:*
${(aiResult.analysis || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')}

🔧 *Suggested Fix:*
${(aiResult.suggested_fix || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')}

✅ Valid report: ${aiResult.valid ? 'Yes' : 'Likely not'}`;

        const url = `https://api.telegram.org/bot${BUG_REPORT_BOT_TOKEN}/sendMessage`;

        // Build inline keyboard with Approve / Dismiss buttons
        const inlineKeyboard = {
            inline_keyboard: [[
                { text: '✅ Approve Fix', callback_data: `approve_${reportId}` },
                { text: '❌ Dismiss', callback_data: `dismiss_${reportId}` }
            ]]
        };

        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: BUG_REPORT_ADMIN_CHAT_ID,
                    text: message,
                    parse_mode: 'MarkdownV2',
                    reply_markup: inlineKeyboard
                })
            });
        } catch (err) {
            console.error('Telegram send failed, retrying with plain text:', err);
            // Fallback: send without markdown if MarkdownV2 fails
            try {
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: BUG_REPORT_ADMIN_CHAT_ID,
                        text: `🐛 BUG REPORT\n${ctx.section} — ${ctx.module} — Q${ctx.questionNumber}\nType: ${typeLabels[issueType] || issueType}\n\nStudent: "${userMessage}"\n\nAI: ${aiResult.analysis}\nFix: ${aiResult.suggested_fix}`,
                        reply_markup: inlineKeyboard
                    })
                });
            } catch (err2) {
                console.error('Telegram fallback also failed:', err2);
            }
        }

        // Send screenshot if attached
        if (screenshotBase64) {
            try {
                const byteString = atob(screenshotBase64.split(',')[1]);
                const mimeString = screenshotBase64.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                const blob = new Blob([ab], { type: mimeString });

                const formData = new FormData();
                formData.append('chat_id', BUG_REPORT_ADMIN_CHAT_ID);
                formData.append('photo', blob, screenshotFileName || 'screenshot.png');
                formData.append('caption', `📎 Screenshot for Q${ctx.questionNumber} report`);

                await fetch(`https://api.telegram.org/bot${BUG_REPORT_BOT_TOKEN}/sendPhoto`, {
                    method: 'POST', body: formData
                });
            } catch (err) {
                console.error('Telegram screenshot send failed:', err);
            }
        }
    }

    // --- Submit Handler ---
    async function handleSubmit(e) {
        if (e) e.preventDefault();

        const issueType = reportType.value;
        const userMessage = reportMessage.value.trim();

        if (!userMessage) {
            setReportStatus('Please describe the issue.', 'error');
            return;
        }

        reportSubmitBtn.disabled = true;
        reportSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
        setReportStatus('AI is analyzing your report...', 'loading');

        const ctx = getCurrentQuestionContext();

        // Step 1: AI Analysis
        const aiResult = await analyzeWithAI(ctx, issueType, userMessage);

        // Step 2: Send to Telegram (with inline buttons)
        setReportStatus('Sending report to admin...', 'loading');
        await sendToTelegram(ctx, issueType, userMessage, aiResult);

        // Done!
        reportSubmitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Report Sent!';
        setReportStatus('Thank you! Your report has been sent to the admin.', 'success');

        setTimeout(() => {
            closeReportModal();
            reportSubmitBtn.disabled = false;
            reportSubmitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Report';
        }, 2000);
    }

    // --- Initialize ---
    document.addEventListener('DOMContentLoaded', () => {
        reportBtn = document.getElementById('report-bug-btn');
        reportModal = document.getElementById('report-modal');
        reportBackdrop = document.getElementById('report-backdrop');
        reportType = document.getElementById('report-type');
        reportMessage = document.getElementById('report-message');
        reportScreenshotInput = document.getElementById('report-screenshot-input');
        reportScreenshotPreview = document.getElementById('report-screenshot-preview');
        reportSubmitBtn = document.getElementById('report-submit-btn');
        reportCancelBtn = document.getElementById('report-cancel-btn');
        reportRemoveScreenshot = document.getElementById('report-remove-screenshot');
        reportStatusEl = document.getElementById('report-status');

        if (reportBtn) reportBtn.addEventListener('click', openReportModal);
        if (reportCancelBtn) reportCancelBtn.addEventListener('click', closeReportModal);
        if (reportBackdrop) reportBackdrop.addEventListener('click', closeReportModal);
        if (reportSubmitBtn) reportSubmitBtn.addEventListener('click', handleSubmit);
        if (reportScreenshotInput) reportScreenshotInput.addEventListener('change', handleScreenshotSelect);
        if (reportRemoveScreenshot) reportRemoveScreenshot.addEventListener('click', clearScreenshot);
    });
})();
