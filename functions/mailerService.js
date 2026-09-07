// Shared SMTP sender - the general-purpose version of the transporter that
// used to live only inside otpService.js (it's still the only thing that
// sets up SMTP credentials; this file just makes sending an arbitrary email
// possible from OTHER Cloud Functions too, e.g. deviceSessionService.js's
// "signed in on a new device" security alert).
//
// Same four env vars as before (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS,
// firebase functions:secrets:set them and redeploy), same dev fallback of
// console-logging instead of sending when they're not set - so nothing here
// changes deployment/setup, only where the code lives.

const nodemailer = require('nodemailer');
const { logServerError } = require('./logService');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let cachedTransporter = null;
function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return cachedTransporter;
}

/**
 * Sends one email. Throws (as a plain Error, not HttpsError - callers in a
 * user-facing flow like otpService.sendOtp should wrap this themselves if
 * they want that) if a provider is configured but the send fails; silently
 * logs-and-returns if no provider is configured at all, same dev-fallback
 * behavior otpService always had.
 *   to       recipient address
 *   subject  subject line
 *   text     plain-text body
 *   html     html body
 *   context  optional string for the console/log line, e.g. 'otpService' -
 *            purely for readability in functions:log, not sent anywhere
 */
async function sendEmail({ to, subject, text, html, context }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // Dev fallback: no provider configured. Don't throw - the calling flow
    // should stay testable end-to-end. `firebase functions:log` shows this.
    console.warn(
      `[mailerService${context ? ':' + context : ''}] No SMTP provider configured ` +
        `(SMTP_HOST/SMTP_USER/SMTP_PASS). Would have emailed ${to}: ${subject}`
    );
    return;
  }
  try {
    await getTransporter().sendMail({ from: SMTP_FROM, to, subject, text, html });
  } catch (err) {
    console.error(`[mailerService${context ? ':' + context : ''}] Email send failed`, err);
    await logServerError(context || 'mailerService.sendEmail', err);
    throw err;
  }
}

module.exports = { sendEmail };
