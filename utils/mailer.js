const nodemailer = require("nodemailer");

/*
 * BENEDICT email delivery.
 *
 * Configure a real SMTP provider (Resend, SendGrid, Mailgun, Postmark,
 * Gmail App Password, ...) through environment variables:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM
 */

let transporter = null;

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS"
    );
  }

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return transporter;
}

function fromAddress() {
  return process.env.MAIL_FROM || `BENEDICT <${process.env.SMTP_USER}>`;
}

async function sendPasswordResetEmail({ to, username, code, expiresInMinutes }) {
  const minutes = expiresInMinutes || 15;
  const name = username || "there";

  const text = [
    `Hi ${name},`,
    "",
    `Your BENEDICT password reset code is: ${code}`,
    "",
    `This code expires in ${minutes} minutes and can only be used once.`,
    "If you did not request a password reset, you can ignore this email.",
    "",
    "- BENEDICT"
  ].join("\n");

  const html = `
  <div style="background:#0b0b0b;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5">
    <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid #d4af37;border-radius:14px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px;color:#d4af37;letter-spacing:1px">BENEDICT</h1>
      <p style="margin:0 0 12px">Hi ${name},</p>
      <p style="margin:0 0 18px">Use this code to reset your password:</p>
      <p style="margin:0 0 18px;font-size:30px;font-weight:bold;letter-spacing:6px;color:#d4af37">${code}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#bdbdbd">
        This code expires in ${minutes} minutes and can only be used once.
      </p>
      <p style="margin:0;font-size:13px;color:#bdbdbd">
        If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: fromAddress(),
    to,
    subject: "Your BENEDICT password reset code",
    text,
    html
  });
}

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail
};
