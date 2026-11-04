import nodemailer from "nodemailer";

interface SendPasswordResetParams {
  to: string;
  name: string;
  resetLink: string;
}

export const sendPasswordResetEmail = async ({
  to,
  name,
  resetLink,
}: SendPasswordResetParams): Promise<{ success: boolean; fallback?: boolean; error?: string }> => {
  const host = process.env.SMTP_HOST || "mail.infograins.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const isSecure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === "true" : port === 465;
  const user = process.env.SMTP_USER || "karanpushpad@infograins.com";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || `"Infograins HRMS" <${user}>`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0; color: #1e293b; }
    .email-container { max-width: 560px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .email-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px; text-align: center; }
    .email-header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .email-header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; }
    .email-body { padding: 36px 32px; }
    .greeting { font-size: 17px; font-weight: 600; color: #0f172a; margin-bottom: 14px; }
    .text { font-size: 15px; line-height: 1.6; color: #475569; margin: 12px 0; }
    .btn-container { text-align: center; margin: 32px 0; }
    .reset-btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 8px; box-shadow: 0 3px 8px rgba(37,99,235,0.3); transition: background-color 0.2s ease; }
    .reset-btn:hover { background-color: #1d4ed8; }
    .link-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; color: #64748b; word-break: break-all; margin: 20px 0; }
    .link-box a { color: #2563eb; text-decoration: none; }
    .expiry-note { font-size: 13px; color: #64748b; background-color: #eff6ff; border-left: 3px solid #3b82f6; padding: 10px 14px; border-radius: 0 6px 6px 0; margin-top: 24px; }
    .email-footer { background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>INFOGRAINS HRMS</h1>
      <p>Security & Account Access</p>
    </div>
    <div class="email-body">
      <div class="greeting">Hello ${name || "Team Member"},</div>
      <p class="text">We received a request to reset the password for your Infograins HRMS account associated with <strong>${to}</strong>.</p>
      <p class="text">Click the button below to choose a new, secure password:</p>
      <div class="btn-container">
        <a href="${resetLink}" class="reset-btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
      </div>
      <p class="text" style="font-size: 13px;">If the button above does not work, copy and paste this link into your web browser:</p>
      <div class="link-box">
        <a href="${resetLink}" target="_blank" rel="noopener noreferrer">${resetLink}</a>
      </div>
      <div class="expiry-note">
        ⏰ <strong>Important:</strong> This password reset link is valid for <strong>1 hour</strong>. If you did not make this request, you can safely disregard this email; your account remains secure.
      </div>
    </div>
    <div class="email-footer">
      <p>&copy; ${new Date().getFullYear()} Infograins. All rights reserved.</p>
      <p>This is an automated system notification. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
`;

  const textContent = `
INFOGRAINS HRMS - Password Reset Request

Hello ${name || "Team Member"},

We received a request to reset the password for your Infograins HRMS account (${to}).

To reset your password, please open the following link in your browser:
${resetLink}

This link is valid for 1 hour. If you did not request this change, please ignore this email.

Best regards,
Infograins HRMS Team
`;

  console.log(`\n======================================================`);
  console.log(`🔑 PASSWORD RESET REQUEST:`);
  console.log(`   To: ${to} (${name})`);
  console.log(`   Link: ${resetLink}`);
  console.log(`======================================================\n`);

  if (!pass) {
    console.warn(`[MailService] SMTP_PASS is not configured in backend/.env. Mail skipped; use console link above.`);
    return { success: true, fallback: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });

    await transporter.sendMail({
      from,
      to,
      subject: "Reset your Infograins HRMS password",
      text: textContent,
      html: htmlContent,
    });

    console.log(`[MailService] Password reset email successfully delivered to ${to} via ${host}:${port}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[MailService] Failed to deliver email to ${to} via SMTP:`, err.message || err);
    // Return success: true with fallback flag so user is not blocked during testing
    return { success: true, fallback: true, error: err.message };
  }
};

