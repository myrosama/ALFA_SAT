const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// This is our function to make someone an admin.
// To run it, you'll need to call its URL.
exports.addAdminRole = functions.https.onCall((data, context) => {
  // Check if the user making the request is an admin themselves.
  // This is a security measure for the future. For the FIRST admin, we will bypass this.
  // if (context.auth.token.admin !== true) {
  //   return { error: "Only admins can add other admins." };
  // }

  // Get user by email and add the custom claim.
  return admin.auth().getUserByEmail(data.email).then((user) => {
    return admin.auth().setCustomUserClaims(user.uid, {
      admin: true,
    });
  }).then(() => {
    return {
      message: `Success! ${data.email} has been made an admin.`,
    };
  }).catch((err) => {
    return { error: err.message };
  });
});