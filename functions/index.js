const functions = require("firebase-functions");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

if (!admin.apps.length) {
  admin.initializeApp();
}

// --- Existing: Admin Role Management ---
exports.addAdminRole = functions.https.onCall((data, context) => {
  const role = data.role || "premium_admin";
  const validRoles = ["real_exam_admin", "premium_admin"];
  if (!validRoles.includes(role)) {
    return {error: `Invalid role. Must be one of: ${validRoles.join(", ")}`};
  }

  let resolvedUser = null;

  return admin.auth().getUserByEmail(data.email).then((user) => {
    resolvedUser = user;
    return admin.auth().setCustomUserClaims(user.uid, {
      admin: true,
      adminRole: role,
    });
  }).then(() => {
    return admin.firestore().collection("admins").doc(resolvedUser.uid).set({
      email: data.email,
      role: role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  }).then(() => {
    return {
      message: `Success! ${data.email} has been made a ${role} admin.`,
    };
  }).catch((err) => {
    return {error: err.message};
  });
});

// --- NEW: Email Notification when Results are Published ---

// Configure email transport (using Gmail SMTP)
// Create a .env file in the functions directory with:
//   EMAIL_USER=your@gmail.com
//   EMAIL_PASS=your-app-password
const getTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASS || "",
    },
  });
};

/**
 * Triggered when a testResult document's scoringStatus changes to "published".
 * Sends a professional SAT-style score notification email to the student.
 */
exports.sendScoreEmail = onDocumentUpdated(
    "testResults/{resultId}",
    async (event) => {
      const before = event.data.before.data();
      const after = event.data.after.data();
      const resultId = event.params.resultId;

      // Only fire when scoringStatus transitions TO "published"
      if (before.scoringStatus === "published" ||
          after.scoringStatus !== "published") {
        return null;
      }

      // Only for proctored tests
      if (!after.proctorCode) {
        return null;
      }

      try {
        // Get user email
        const userId = after.userId;
        if (!userId) return null;

        const userRecord = await admin.auth().getUser(userId);
        const userEmail = userRecord.email;
        const userName = userRecord.displayName || "Student";

        if (!userEmail) {
          console.log(`No email for user ${userId}, skipping notification.`);
          return null;
        }

        // Build score data
        const totalScore = after.totalScore || "N/A";
        const rwScore = after.rwScore || "N/A";
        const mathScore = after.mathScore || "N/A";
        const testName = after.testName || "Practice Test";
        const testDate = after.completedAt ?
          new Date(after.completedAt.seconds * 1000)
              .toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }) :
          "Recent";

        const resultsUrl =
          `https://alfasat.uz/results.html?resultId=${resultId}`;

        // Build email HTML (SAT-official style)
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f4f7f6; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:580px; margin:0 auto; padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg, #003366, #6A0DAD); padding:32px 28px; border-radius:16px 16px 0 0; text-align:center;">
      <img src="https://alfasat.uz/assets/logo.png" alt="ALFA SAT" width="48" height="48" style="margin-bottom:12px;">
      <h1 style="color:#fff; margin:0; font-size:22px; font-weight:700; letter-spacing:0.5px;">ALFA SAT</h1>
      <p style="color:rgba(255,255,255,0.8); margin:6px 0 0; font-size:13px;">Score Report</p>
    </div>

    <!-- Body -->
    <div style="background:#fff; padding:32px 28px; border-left:1px solid #e8e8e8; border-right:1px solid #e8e8e8;">

      <h2 style="color:#003366; margin:0 0 6px; font-size:18px;">Your Scores Are Ready!</h2>
      <p style="color:#555; font-size:14px; line-height:1.6; margin:0 0 24px;">
        Hi <strong>${userName}</strong>, your scores for <strong>${testName}</strong> (${testDate}) have been published.
      </p>

      <!-- Score Cards -->
      <div style="display:flex; gap:12px; margin-bottom:24px;">
        <!-- Total -->
        <div style="flex:1.2; background:linear-gradient(135deg, #6A0DAD, #8a2be2); padding:20px; border-radius:12px; text-align:center;">
          <p style="color:rgba(255,255,255,0.8); font-size:12px; margin:0 0 4px; text-transform:uppercase; letter-spacing:1px;">Total Score</p>
          <p style="color:#fff; font-size:36px; font-weight:700; margin:0; line-height:1;">${totalScore}</p>
        </div>
        <!-- R&W -->
        <div style="flex:1; background:#003366; padding:16px 14px; border-radius:12px; text-align:center;">
          <p style="color:rgba(255,255,255,0.8); font-size:11px; margin:0 0 4px; text-transform:uppercase;">Reading & Writing</p>
          <p style="color:#fff; font-size:28px; font-weight:700; margin:0; line-height:1;">${rwScore}</p>
        </div>
        <!-- Math -->
        <div style="flex:1; background:#003366; padding:16px 14px; border-radius:12px; text-align:center;">
          <p style="color:rgba(255,255,255,0.8); font-size:11px; margin:0 0 4px; text-transform:uppercase;">Math</p>
          <p style="color:#fff; font-size:28px; font-weight:700; margin:0; line-height:1;">${mathScore}</p>
        </div>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center; margin-bottom:24px;">
        <a href="${resultsUrl}" style="display:inline-block; background:linear-gradient(135deg, #6A0DAD, #8a2be2); color:#fff; padding:14px 36px; border-radius:10px; text-decoration:none; font-weight:600; font-size:14px;">
          View Full Report →
        </a>
      </div>

      <div style="border-top:1px solid #e8e8e8; padding-top:18px;">
        <p style="color:#888; font-size:12px; line-height:1.6; margin:0;">
          <strong>What's included:</strong> Section scores, question-by-question review, AI-powered performance analysis, and downloadable score certificate.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8f9fa; padding:20px 28px; border-radius:0 0 16px 16px; border:1px solid #e8e8e8; border-top:none; text-align:center;">
      <p style="color:#999; font-size:11px; line-height:1.6; margin:0;">
        This is an automated message from ALFA SAT.<br>
        © ${new Date().getFullYear()} ALFA SAT — Digital SAT Practice Platform<br>
        <a href="https://alfasat.uz" style="color:#6A0DAD; text-decoration:none;">alfasat.uz</a>
      </p>
    </div>

  </div>
</body>
</html>`;

        // Send email
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"ALFA SAT" <${process.env.EMAIL_USER || "noreply@alfasat.uz"}>`,
          to: userEmail,
          subject: `Your ALFA SAT Score Report — ${testName}`,
          html: emailHtml,
        });

        console.log(`Score email sent to ${userEmail} for result ${resultId}`);

        // Mark that email was sent
        await event.data.after.ref.update({emailSent: true});

        return null;
      } catch (error) {
        console.error("Error sending score email:", error);
        return null;
      }
    });