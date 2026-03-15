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
    let reportType, reportMessage, reportScreenshotPreview, autoScreenshotStatus;
    let reportSubmitBtn, reportCancelBtn;
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
    async function openReportModal() {
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
        
        // Auto screen capture
        if (autoScreenshotStatus) {
            autoScreenshotStatus.innerHTML = '<span class="status-badge loading"><i class="fa-solid fa-spinner fa-spin"></i> Capturing screen...</span>';
        }
        
        try {
            // Give modal animation a tiny bit to get out of the way, or just capture the main test area immediately
            // Better to capture just the test main area to avoid the modal covering it if we wait!
            const testMain = document.querySelector('.test-main');
            if (testMain) {
                const canvas = await html2canvas(testMain, {
                    scale: 1, // Keep it relatively small for the upload payload
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                screenshotBase64 = canvas.toDataURL('image/jpeg', 0.8);
                screenshotFileName = `Q${ctx.questionNumber}_auto_screenshot.jpg`;
                
                if (reportScreenshotPreview) {
                    reportScreenshotPreview.src = screenshotBase64;
                    reportScreenshotPreview.style.display = 'block';
                }
                if (autoScreenshotStatus) {
                    autoScreenshotStatus.innerHTML = '<span class="status-badge success"><i class="fa-solid fa-check"></i> Captured successfully</span>';
                }
            } else {
                throw new Error("Test main element not found");
            }
        } catch (err) {
            console.error("Auto screenshot failed:", err);
            if (autoScreenshotStatus) {
                autoScreenshotStatus.innerHTML = '<span class="status-badge error"><i class="fa-solid fa-triangle-exclamation"></i> Screen capture failed</span>';
            }
        }
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
        if (autoScreenshotStatus) {
            autoScreenshotStatus.innerHTML = '<span class="status-badge"><i class="fa-solid fa-camera"></i> Waiting...</span>';
        }
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
4. The exact location of the error.
5. Provide a machine-readable fix payload that can modify the question data directly if approved.

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
{
  "valid": true/false,
  "priority": "LOW" | "MEDIUM" | "HIGH",
  "analysis": "your brief analysis of the bug",
  "error_location": "exact location of the error",
  "suggested_fix": "human readable explanation of the fix",
  "fix_payload": {
    "action": "update",
    "field": "field_name_(e.g._prompt/_correctAnswer/_passage)",
    "newValue": "the strictly corrected text or answer letter",
    "requires_pdf_sync": boolean
  }
}

CRITICAL: If the issue requires extracting a completely missing passage from the original PDF that you cannot see, set requires_pdf_sync to true, and leave newValue empty. For typos, wrong correctAnswers, formatting (like unclosed tags or missing KaTeX $ signs), fix them directly in newValue.`;

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
            return {
                valid: true,
                priority: 'MEDIUM',
                analysis: 'AI analysis unavailable — forwarding report as-is.',
                suggested_fix: 'Please review manually.',
                fix_payload: { action: "manual_review", requires_pdf_sync: false }
            };
        }
    }

    // --- Save Report to Firestore ---
    async function saveReportToFirestore(ctx, issueType, userMessage, aiResult) {
        if (!firebase.auth().currentUser) throw new Error("User must be logged in to report a bug");
        
        const reportData = {
            testId: ctx.testId,
            testName: ctx.testName,
            module: ctx.module,
            section: ctx.section,
            questionNumber: parseInt(ctx.questionNumber) || ctx.questionNumber,
            issueType: issueType,
            userMessage: userMessage,
            status: "pending",
            priority: aiResult.priority || "MEDIUM",
            aiAnalysis: aiResult.analysis || "",
            aiSuggestedFix: aiResult.suggested_fix || "",
            fixPayload: aiResult.fix_payload || { action: "none" },
            submittedBy: firebase.auth().currentUser.uid,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection("bug_reports").add(reportData);
        return docRef.id;
    }

    // --- Send to Telegram (via Render Webhook for reliability) ---
    async function sendToTelegram(ctx, issueType, userMessage, aiResult, reportId) {
        const typeLabels = {
            'wrong-answer': '❌ Wrong Answer',
            'typo': '📝 Typo / Text Error',
            'image-issue': '🖼️ Image Missing/Wrong',
            'other': '💬 Other'
        };

        const webhookUrl = 'https://bug-report-webhook.onrender.com/send-bug-report';
        
        // Construct the message for the webhook (server handles Telegram HTML)
        const payload = {
            report_id: reportId || `manual_rpt_${Date.now()}`,
            message: `<b>🐛 BUG REPORT</b>
━━━━━━━━━━━━━━━
📋 <b>Test:</b> ${ctx.testName}
🆔 <b>Test ID:</b> ${ctx.testId}
📝 <b>Section:</b> ${ctx.section} — ${ctx.module}
❓ <b>Question:</b> Q${ctx.questionNumber}
🏷️ <b>Type:</b> ${typeLabels[issueType] || issueType}
Priority: ${aiResult.priority}

💬 <b>Student says:</b>
"${userMessage}"

📍 <b>Error Location:</b>
${aiResult.error_location || 'Not specified'}

🤖 <b>AI Analysis:</b>
${aiResult.analysis || ''}

🔧 <b>Suggested Fix:</b>
${aiResult.suggested_fix || ''}

✅ Valid report: ${aiResult.valid ? 'Yes' : 'Likely not'}
${aiResult.fix_payload?.requires_pdf_sync ? '⚠️ <b>REQUIRES LOCAL PDF SYNC</b>' : '⚡ <b>Auto-Fix Ready</b>'}
ID: ${reportId}`,
            questionNumber: ctx.questionNumber,
            screenshot_base64: screenshotBase64,
            screenshot_filename: screenshotFileName
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for Render cold start

            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Webhook error: ${res.status}`);
            }
            console.log("Bug report sent successfully via webhook");
        } catch (err) {
            const isTimeout = err.name === 'AbortError';
            console.error(isTimeout ? 'Webhook request timed out' : `Webhook notification failed: ${err.message}`, err);
            
            // Minimal fallback if webhook is down or timed out
            try {
                const url = `https://api.telegram.org/bot${BUG_REPORT_BOT_TOKEN}/sendMessage`;
                const errorMsg = isTimeout ? "RENDER COLD START / TIMEOUT" : "WEBHOOK ERROR / CORS";
                
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: BUG_REPORT_ADMIN_CHAT_ID,
                        text: `⚠️ ${errorMsg}: Bug Report Q${ctx.questionNumber} for ${ctx.testId}. Student: ${userMessage.slice(0, 50)}...`
                    })
                });
            } catch (fallbackErr) {
                console.error("Critical: Telegram fallback also failed", fallbackErr);
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

        // Step 2: Save metadata to Firestore
        setReportStatus('Saving report securely...', 'loading');
        let reportId = `manual_rpt_${Date.now()}`;
        try {
            reportId = await saveReportToFirestore(ctx, issueType, userMessage, aiResult);
        } catch (err) {
            console.error('Failed to save to Firestore:', err);
            // Fallback to manual ID if firestore fails (e.g. not logged in during testing)
        }

        // Step 3: Send to Telegram (with inline buttons)
        setReportStatus('Sending report to admin...', 'loading');
        await sendToTelegram(ctx, issueType, userMessage, aiResult, reportId);

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
        reportScreenshotPreview = document.getElementById('report-screenshot-preview');
        autoScreenshotStatus = document.getElementById('auto-screenshot-status');
        reportSubmitBtn = document.getElementById('report-submit-btn');
        reportCancelBtn = document.getElementById('report-cancel-btn');
        reportStatusEl = document.getElementById('report-status');

        if (reportBtn) reportBtn.addEventListener('click', openReportModal);
        if (reportCancelBtn) reportCancelBtn.addEventListener('click', closeReportModal);
        if (reportBackdrop) reportBackdrop.addEventListener('click', closeReportModal);
        if (reportSubmitBtn) reportSubmitBtn.addEventListener('click', handleSubmit);
    });
})();
