import { emailConfigured, sendTestEmail } from "./notify";

if (!emailConfigured()) {
  console.error("Set RESEND_API_KEY and EMAIL_TO first.");
  process.exitCode = 1;
} else {
  sendTestEmail()
    .then(() => console.log("Test email sent."))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}
