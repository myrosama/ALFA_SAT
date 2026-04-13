const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onCall} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

// --- Secrets ---
const resendApiKey = defineSecret("RESEND_API_KEY");

// === EXISTING: Admin Role Management ===
exports.addAdminRole = onCall(async (request) => {
  const data = request.data;
  const role = data.role || "premium_admin";
  const validRoles = ["real_exam_admin", "premium_admin"];
  if (!validRoles.includes(role)) {
    return {error: `Invalid role. Must be one of: ${validRoles.join(", ")}`};
  }

  try {
    const user = await admin.auth().getUserByEmail(data.email);
    await admin.auth().setCustomUserClaims(user.uid, {
      admin: true,
      adminRole: role,
    });
    await admin.firestore().collection("admins").doc(user.uid).set({
      email: data.email,
      role: role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      message: `Success! ${data.email} has been made a ${role} admin.`,
    };
  } catch (err) {
    return {error: err.message};
  }
});

// === TEST: Send a sample score email (callable, for testing only) ===
exports.testSendEmail = onCall(
    {secrets: [resendApiKey]},
    async (request) => {
      const to = request.data.to || "sadrikov49@gmail.com";
      const apiKey = resendApiKey.value();

      const testTask = {
        userName: "Test Student",
        userEmail: to,
        totalScore: 1420,
        rwScore: 720,
        mathScore: 700,
        resultsUrl: "https://alfasat.uz/dashboard.html",
      };

      try {
        const result = await sendScoreEmailViaResend(
            apiKey, testTask, "March 2026 SAT Practice", "April 14, 2026",
        );
        return {success: true, resendId: result.id, sentTo: to};
      } catch (err) {
        return {success: false, error: err.message};
      }
    },
);

// ==========================================================
// === NEW: Email Notification when Proctored Results Published
// ==========================================================
//
// Firestore Schema:
//   proctoredSessions/{code}
//     .testId, .testName, .scoringStatus, .publishedAt
//     /participants/{userId}  — .status ('completed')
//
//   testResults/{resultId}
//     resultId format: "{userId}_{testId}_{sessionCode}"
//     .userId, .testId, .testName, .totalScore, .rwScore, .mathScore
//     .scoringStatus ('pending_review' → 'scored' → 'published')
//
//   users/{userId}
//     .displayName, email from Firebase Auth
//
// Trigger: proctoredSessions/{code}.scoringStatus flips to 'published'
//   → query all completed participants
//   → fetch each participant's testResult + Auth email
//   → send personalized SAT-style email via Resend
// ==========================================================

exports.sendScoreEmails = onDocumentUpdated(
    {
      document: "proctoredSessions/{sessionCode}",
      secrets: [resendApiKey],
    },
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      const sessionCode = event.params.sessionCode;

      // Only fire when scoringStatus transitions TO "published"
      if (before.scoringStatus === "published" ||
          after.scoringStatus !== "published") {
        return null;
      }

      // Prevent duplicate sends
      if (after.emailsSent) {
        console.log(`Emails already sent for session ${sessionCode}`);
        return null;
      }

      const db = admin.firestore();
      const testId = after.testId;
      const testName = after.testName || "SAT Practice Test";

      console.log(`=== SENDING SCORE EMAILS for session ${sessionCode} ===`);
      console.log(`Test: ${testName} (${testId})`);

      try {
        // 1. Get all completed participants
        const participantsSnap = await db
            .collection("proctoredSessions")
            .doc(sessionCode)
            .collection("participants")
            .where("status", "==", "completed")
            .get();

        if (participantsSnap.empty) {
          console.log("No completed participants found.");
          return null;
        }

        console.log(`Found ${participantsSnap.size} completed participants`);

        // 2. Build email tasks
        const emailTasks = [];

        for (const pDoc of participantsSnap.docs) {
          const userId = pDoc.id;
          const resultId = `${userId}_${testId}_${sessionCode}`;

          try {
            // Get user email from Firebase Auth
            const userRecord = await admin.auth().getUser(userId);
            const userEmail = userRecord.email;
            const userName = userRecord.displayName || "Student";

            if (!userEmail) {
              console.log(`No email for user ${userId}, skipping.`);
              continue;
            }

            // Get test result for scores
            const resultDoc = await db
                .collection("testResults").doc(resultId).get();

            if (!resultDoc.exists) {
              console.log(`Result ${resultId} not found, skipping.`);
              continue;
            }

            const resultData = resultDoc.data();
            const totalScore = resultData.totalScore || "N/A";
            const rwScore = resultData.rwScore || "N/A";
            const mathScore = resultData.mathScore || "N/A";
            const resultsUrl =
              `https://alfasat.uz/results.html?resultId=${resultId}`;

            emailTasks.push({
              userId,
              userEmail,
              userName,
              totalScore,
              rwScore,
              mathScore,
              resultsUrl,
              resultId,
            });
          } catch (err) {
            console.error(`Error preparing email for ${userId}:`, err.message);
          }
        }

        console.log(`Prepared ${emailTasks.length} email tasks`);

        if (emailTasks.length === 0) return null;

        // 3. Send all emails with Promise.allSettled (no single failure kills batch)
        const apiKey = resendApiKey.value();
        const testDate = new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const results = await Promise.allSettled(
            emailTasks.map((task) => sendScoreEmailViaResend(
                apiKey, task, testName, testDate,
            )),
        );

        // 4. Log results
        let successCount = 0;
        let failCount = 0;

        results.forEach((result, i) => {
          if (result.status === "fulfilled") {
            successCount++;
            console.log(`✓ Email sent to ${emailTasks[i].userEmail}`);
          } else {
            failCount++;
            console.error(
                `✗ Failed: ${emailTasks[i].userEmail}:`,
                result.reason?.message || result.reason,
            );
          }
        });

        console.log(
            `=== EMAIL COMPLETE: ${successCount} sent, ${failCount} failed ===`,
        );

        // 5. Mark session as emails sent
        await event.data.after.ref.update({
          emailsSent: true,
          emailsSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailsSentCount: successCount,
          emailsFailedCount: failCount,
        });

        return null;
      } catch (error) {
        console.error("Error in sendScoreEmails:", error);
        return null;
      }
    },
);


/**
 * Send a single score notification email via Resend REST API.
 * @param {string} apiKey - Resend API key
 * @param {object} task - { userEmail, userName, totalScore, rwScore,
 *                          mathScore, resultsUrl }
 * @param {string} testName - Name of the test
 * @param {string} testDate - Formatted date string
 * @returns {Promise<object>} - Resend API response
 */
async function sendScoreEmailViaResend(apiKey, task, testName, testDate) {
  const emailHtml = buildScoreEmailHtml(task, testName, testDate);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ALFA SAT <results@alfasat.uz>",
      to: [task.userEmail],
      subject: `Your ALFA SAT Score Report — ${testName}`,
      html: emailHtml,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Resend API ${response.status}: ${errBody}`);
  }

  return response.json();
}


/**
 * Build the SAT-official style score notification email HTML.
 */
function buildScoreEmailHtml(task, testName, testDate) {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ALFA SAT Score Report</title>
</head>
<body style="margin:0; padding:0; background:#f4f7f6; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:580px; margin:0 auto; padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg, #003366, #6A0DAD); padding:32px 28px; border-radius:16px 16px 0 0; text-align:center;">
      <img src="https://alfasat.uz/assets/logo.png" alt="ALFA SAT" width="48" height="48" style="margin-bottom:12px;">
      <h1 style="color:#fff; margin:0; font-size:22px; font-weight:700; letter-spacing:0.5px;">ALFA SAT</h1>
      <p style="color:rgba(255,255,255,0.8); margin:6px 0 0; font-size:13px;">Official Score Report</p>
    </div>

    <!-- Body -->
    <div style="background:#fff; padding:32px 28px; border-left:1px solid #e8e8e8; border-right:1px solid #e8e8e8;">

      <h2 style="color:#003366; margin:0 0 6px; font-size:18px;">Your Scores Are Ready!</h2>
      <p style="color:#555; font-size:14px; line-height:1.6; margin:0 0 24px;">
        Hi <strong>${task.userName}</strong>, your scores for <strong>${testName}</strong> (${testDate}) have been published.
      </p>

      <!-- Score Cards (table-based for email compatibility) -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr>
          <!-- Total Score -->
          <td style="padding:0 6px 0 0; vertical-align:top;" width="40%">
            <div style="background:linear-gradient(135deg, #6A0DAD, #8a2be2); padding:22px 16px; border-radius:12px; text-align:center;">
              <p style="color:rgba(255,255,255,0.8); font-size:11px; margin:0 0 4px; text-transform:uppercase; letter-spacing:1px;">Total Score</p>
              <p style="color:#fff; font-size:38px; font-weight:700; margin:0; line-height:1;">${task.totalScore}</p>
            </div>
          </td>
          <!-- R&W Score -->
          <td style="padding:0 3px; vertical-align:top;" width="30%">
            <div style="background:#003366; padding:18px 12px; border-radius:12px; text-align:center;">
              <p style="color:rgba(255,255,255,0.8); font-size:10px; margin:0 0 4px; text-transform:uppercase;">Reading &amp; Writing</p>
              <p style="color:#fff; font-size:28px; font-weight:700; margin:0; line-height:1;">${task.rwScore}</p>
            </div>
          </td>
          <!-- Math Score -->
          <td style="padding:0 0 0 6px; vertical-align:top;" width="30%">
            <div style="background:#003366; padding:18px 12px; border-radius:12px; text-align:center;">
              <p style="color:rgba(255,255,255,0.8); font-size:10px; margin:0 0 4px; text-transform:uppercase;">Math</p>
              <p style="color:#fff; font-size:28px; font-weight:700; margin:0; line-height:1;">${task.mathScore}</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center; margin-bottom:24px;">
        <a href="${task.resultsUrl}" style="display:inline-block; background:linear-gradient(135deg, #6A0DAD, #8a2be2); color:#fff; padding:14px 40px; border-radius:10px; text-decoration:none; font-weight:600; font-size:14px;">
          View Full Report →
        </a>
      </div>

      <!-- What's Included -->
      <div style="border-top:1px solid #e8e8e8; padding-top:18px;">
        <p style="color:#888; font-size:12px; line-height:1.6; margin:0;">
          <strong>Your report includes:</strong> Section scores, question-by-question review, answer key comparison, AI-powered performance analysis, and a downloadable score certificate.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8f9fa; padding:20px 28px; border-radius:0 0 16px 16px; border:1px solid #e8e8e8; border-top:none; text-align:center;">
      <p style="color:#999; font-size:11px; line-height:1.6; margin:0;">
        This is an automated message from ALFA SAT.<br>
        &copy; ${year} ALFA SAT — Digital SAT Practice Platform<br>
        <a href="https://alfasat.uz" style="color:#6A0DAD; text-decoration:none;">alfasat.uz</a> &middot;
        <a href="https://t.me/SAT_ALFA" style="color:#6A0DAD; text-decoration:none;">Telegram</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}