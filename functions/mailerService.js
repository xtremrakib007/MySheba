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

async function sendEmail({ to, subject, text, html, context }) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const err = new Error('Verification email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS for the Cloud Functions runtime, then redeploy.');
    console.error(`[mailerService${context ? ':' + context : ''}] ${err.message}`);
    await logServerError(context || 'mailerService.sendEmail', err).catch(() => {});
    throw err;
  }

  try {
    await getTransporter().sendMail({ from: SMTP_FROM, to, subject, text, html });
  } catch (err) {
    console.error(`[mailerService${context ? ':' + context : ''}] Email send failed`, err);
    await logServerError(context || 'mailerService.sendEmail', err).catch(() => {});
    throw err;
  }
}

module.exports = { sendEmail };
