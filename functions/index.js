const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Create admin accounts with roles: "real_exam_admin" | "premium_admin"
exports.addAdminRole = functions.https.onCall((data, context) => {
  const role = data.role || "premium_admin";
  const validRoles = ["real_exam_admin", "premium_admin"];
  if (!validRoles.includes(role)) {
    return { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` };
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
    }, { merge: true });
  }).then(() => {
    return {
      message: `Success! ${data.email} has been made a ${role} admin.`,
    };
  }).catch((err) => {
    return { error: err.message };
  });
});