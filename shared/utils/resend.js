import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendAppointmentConfirmationEmail = async ({
  email,
  patientName,
  organizationName,
  providerName,
  scheduledFor,
}) => {
  const dateStr = new Date(scheduledFor).toLocaleString("en-NG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: `Appointment confirmed — ${organizationName || "your facility"}`,
      html: `
        <div style="font-family: Arial;">
          <h2>Appointment confirmed</h2>
          <p>Hi ${patientName || "there"},</p>
          <p>Your appointment at <strong>${organizationName || "your facility"}</strong>${providerName ? ` with ${providerName}` : ""} is confirmed for:</p>
          <p style="font-size: 16px; font-weight: bold;">${dateStr}</p>
          <p>You'll get a reminder about an hour before your appointment.</p>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the appointment confirmation email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }
    return response;
  } catch (error) {
    console.error("Appointment confirmation email failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};

export const sendLabResultReadyEmail = async ({ email, patientName, isCritical = false }) => {
  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: isCritical
        ? "🚨 Urgent: Your Lab Result Is Ready to View - WelliRecord™"
        : "Your Lab Result Is Ready to View - WelliRecord™",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            
            <!-- Brand Header -->
            <div style="background-color: #0b2447; padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">WelliRecord<span style="color: #38bdf8;">™</span></h1>
              <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0; font-weight: 500;">One patient. One trusted record. Accessible when it matters.</p>
            </div>

            <!-- Main Content -->
            <div style="padding: 36px 32px;">
              <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">
                ${isCritical ? "🚨 Urgent: Your Lab Result Is Ready to View" : "Your Lab Result Is Ready to View"}
              </h2>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
                Hi <strong>${patientName || "there"}</strong>,
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                A new laboratory result has been securely added to your <strong>WelliRecord™</strong>.
              </p>

              <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                You can now sign in to your account to view your result and keep it safely with your health records.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="https://wellirecord.com/vault" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);">
                  Log in to View Your Result Securely
                </a>
              </div>

              <!-- Security Tip Box -->
              <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 6px 0; color: #0369a1; font-size: 14px; font-weight: 700;">🔐 Security Tip</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #0c4a6e;">
                  Your health information is private. <strong>Never share your WelliRecord password, verification code, or login link with anyone.</strong> Always access your result through the official WelliRecord platform.
                </p>
              </div>

              <!-- Medical Tip Box -->
              <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 6px 0; color: #854d0e; font-size: 14px; font-weight: 700;">🩺 Medical Tip</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #713f12;">
                  A laboratory result should be interpreted in the context of your symptoms, medical history, and other clinical findings. <strong>If your result is abnormal, unexpected, or marked as requiring follow-up, speak with your healthcare provider before making medical decisions.</strong>
                </p>
              </div>

              <p style="font-size: 13px; line-height: 1.5; color: #64748b;">
                Your result remains available in your WelliRecord, helping you maintain a continuous and accessible history of your healthcare information.
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">WelliRecord™</p>
              <p style="font-size: 12px; font-style: italic; color: #64748b; margin: 0 0 12px 0;">One patient. One trusted record. Accessible when it matters.</p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">© WelliRecord™ | Secure digital health records</p>
            </div>

          </div>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the lab result email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }
    return response;
  } catch (error) {
    console.error("Lab result ready email failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};

export const sendTeamInviteEmail = async ({
  email,
  fullName,
  organizationName,
  membershipRole,
  token,
}) => {
  const acceptUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`;
  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: `You've been invited to join ${organizationName || "a team"} on WelliRecord`,
      html: `
        <div style="font-family: Arial;">
          <h2>You're invited</h2>
          <p>Hello ${fullName || "there"},</p>
          <p>${organizationName || "A facility"} has invited you to join their WelliRecord team as a <strong>${membershipRole}</strong>.</p>
          <a href="${acceptUrl}"
             style="display:inline-block;padding:12px 18px;background:#0B1F3A;color:#fff;text-decoration:none;border-radius:6px;">
            Accept Invitation
          </a>
          <p>This link expires in 7 days.</p>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the invite email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return response;
  } catch (error) {
    console.error("Invite email sending failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};

export const sendRadiologyReportReadyEmail = async ({
  email,
  patientName,
  examName,
  isCritical = false,
}) => {
  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: isCritical
        ? "🚨 Urgent: Your Imaging Report Is Ready to View - WelliRecord™"
        : "Your Imaging Report Is Ready to View - WelliRecord™",
      html: `
        <div style="font-family: Arial;">
          <h2>${isCritical ? "🚨 Urgent: Your Imaging Report Is Ready" : "Your Imaging Report Is Ready"}</h2>
          <p>Hi ${patientName || "there"},</p>
          <p>Your report for <strong>${examName || "your imaging exam"}</strong> has been securely added to your WelliRecord.</p>
          <a href="https://wellirecord.com/vault"
             style="display:inline-block;padding:12px 18px;background:#0B1F3A;color:#fff;text-decoration:none;border-radius:6px;">
            Log in to View Your Report
          </a>
          ${isCritical ? "<p>If your result is abnormal, unexpected, or marked urgent, speak with your healthcare provider before making medical decisions.</p>" : ""}
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the radiology report email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return response;
  } catch (error) {
    console.error("Radiology report ready email failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};

export const sendPasswordResetEmail = async ({ email, fullName, token }) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: "Reset your WelliRecord password",
      html: `
        <div style="font-family: Arial;">
          <h2>Reset your password</h2>
          <p>Hello ${fullName || "there"},</p>
          <p>We received a request to reset the password on your WelliRecord account. Click the button below to choose a new one:</p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 18px;background:#0B1F3A;color:#fff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
          <p>This link expires in 30 minutes.</p>
          <p>If you didn't request this, you can ignore this email — your password will stay the same.</p>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the password reset email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return response;
  } catch (error) {
    console.error("Password reset email failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};

export const sendVerificationEmail = async ({ email, fullName, userName, token }) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const rawName = fullName || userName || "";
  const displayName = rawName && !rawName.includes("@") ? rawName : (email && email.includes("@") ? email.split("@")[0] : "there");
  const currentYear = new Date().getFullYear();

  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: "Verify your email address - WelliRecord™",
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 16px; margin: 0; color: #1e293b;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
            
            <!-- Header with WelliRecord Brand -->
            <div style="background-color: #071B3F; padding: 28px 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">WelliRecord<span style="color: #38bdf8; font-size: 16px; vertical-align: top;">™</span></h1>
              <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 12px; font-weight: 500; letter-spacing: 0.5px; font-weight: 500; text-transform: uppercase;">One patient. One trusted record. Accessible when it matters.</p>
            </div>

            <!-- Body Content -->
            <div style="padding: 36px 32px 32px 32px;">
              <p style="font-size: 16px; color: #334155; margin: 0 0 16px 0;">Hello <strong>${displayName}</strong>,</p>
              
              <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 14px 0; line-height: 1.3;">Verify your email address</h2>
              
              <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 12px 0;">
                Welcome to <strong>WelliRecord™</strong>.
              </p>
              
              <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 28px 0;">
                Please click the button below to confirm your email address and activate your account.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 28px;">
                <a href="${verifyUrl}" 
                   style="display: inline-block; background-color: #062B67; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(6, 43, 103, 0.2);">
                  Verify Email Address
                </a>
              </div>

              <!-- Expiry Note -->
              <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 28px 0; text-align: center; background-color: #f8fafc; padding: 10px 16px; border-radius: 8px;">
                ⏱ This verification link expires in <strong>30 minutes</strong>. If you did not create this account, you can safely ignore this email.
              </p>

              <!-- Security Tip Box -->
              <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px 18px; border-radius: 8px; margin-bottom: 18px;">
                <h4 style="margin: 0 0 6px 0; color: #0369a1; font-size: 14px; font-weight: 700;">🔐 Security Tip</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #0c4a6e;">
                  Never share your verification link, password, or login credentials with anyone. WelliRecord™ will never ask you to send your password by email.
                </p>
              </div>

              <!-- Medical Tip Box -->
              <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px 18px; border-radius: 8px; margin-bottom: 28px;">
                <h4 style="margin: 0 0 6px 0; color: #854d0e; font-size: 14px; font-weight: 700;">🩺 Medical Tip</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #713f12;">
                  Keeping your health information accurate and up to date can help healthcare providers make better-informed decisions when you need care.
                </p>
              </div>

              <!-- Fallback Link -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-bottom: 10px;">
                <p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px 0;">
                  If the button above does not work, copy and paste this link into your browser:
                </p>
                <p style="font-size: 12px; color: #0284c7; word-break: break-all; margin: 0;">
                  <a href="${verifyUrl}" style="color: #0284c7; text-decoration: underline;">${verifyUrl}</a>
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f1f5f9; padding: 28px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 14px; font-weight: 800; color: #071B3F; margin: 0 0 4px 0;">WelliRecord™</p>
              <p style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 8px 0;">One patient. One trusted record. Accessible when it matters.</p>
              <p style="font-size: 11px; color: #64748b; margin: 0 0 14px 0; line-height: 1.4;">
                Patient-Owned Health Records • Secure & Encrypted • Consent-Driven Access • Audit Trail
              </p>
              <p style="font-size: 12px; color: #475569; margin: 0 0 14px 0;">
                Need help? <a href="mailto:support@wellirecord.com" style="color: #0284c7; font-weight: 700; text-decoration: none;">Contact WelliRecord™ Support</a>
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                © ${currentYear} WelliRecord™. All rights reserved.
              </p>
            </div>

          </div>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the verification email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return response;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};

export const sendLoginOtpEmail = async ({ email, code, fullName, userName }) => {
  const rawName = fullName || userName || "";
  const displayName = rawName && !rawName.includes("@") ? rawName : (email && email.includes("@") ? email.split("@")[0] : "there");
  const currentYear = new Date().getFullYear();

  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: "🔐 Verify your WelliRecord™ account - Login Code",
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 16px; margin: 0; color: #1e293b;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
            
            <!-- Header with WelliRecord Brand -->
            <div style="background-color: #071B3F; padding: 28px 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">WelliRecord<span style="color: #38bdf8; font-size: 16px; vertical-align: top;">™</span></h1>
              <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 12px; font-weight: 500; letter-spacing: 0.5px; font-weight: 500; text-transform: uppercase;">One patient. One trusted record. Accessible when it matters.</p>
            </div>

            <!-- Body Content -->
            <div style="padding: 36px 32px 32px 32px;">
              <p style="font-size: 16px; color: #334155; margin: 0 0 16px 0;">Hello <strong>${displayName}</strong>,</p>
              
              <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 14px 0; line-height: 1.3;">🔐 Verify your WelliRecord™ account</h2>
              
              <p style="font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                Use the verification code below to continue with your WelliRecord™ account securely.
              </p>

              <!-- OTP Code Display Card -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px 20px; text-align: center; margin-bottom: 24px;">
                <p style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #166534; margin: 0 0 8px 0;">Your verification code</p>
                <div style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #062B67; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; margin: 4px 0 10px 0;">
                  ${code}
                </div>
                <p style="font-size: 13px; font-weight: 600; color: #15803d; margin: 0;">⏱ Expires in 10 minutes</p>
              </div>

              <!-- Security Notices -->
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 14px 0;">
                For your security, <strong>do not share this code with anyone</strong>. WelliRecord™ will never ask you to provide your verification code by phone, email, or message.
              </p>
              
              <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 28px 0;">
                If you did not request this code, you can safely ignore this email. Your account remains secure.
              </p>

              <!-- Medical Tip Box -->
              <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px 18px; border-radius: 8px; margin-bottom: 18px;">
                <h4 style="margin: 0 0 6px 0; color: #854d0e; font-size: 14px; font-weight: 700;">🩺 Medical Tip</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #713f12;">
                  Keep your health information accurate and up to date. Complete and maintain your health profile so your trusted record is ready when you need it.
                </p>
              </div>

              <!-- Security Tip Box -->
              <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px 18px; border-radius: 8px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 6px 0; color: #0369a1; font-size: 14px; font-weight: 700;">🔐 Security Tip</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #0c4a6e;">
                  Use a strong, unique password for your WelliRecord™ account and never share your login credentials with anyone.
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f1f5f9; padding: 28px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 14px; font-weight: 800; color: #071B3F; margin: 0 0 4px 0;">WelliRecord™</p>
              <p style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 8px 0;">One patient. One trusted record. Accessible when it matters.</p>
              <p style="font-size: 11px; color: #64748b; margin: 0 0 14px 0; line-height: 1.4;">
                Patient-Owned Health Records • Secure & Encrypted • Consent-Driven Access • Audit Trail
              </p>
              <p style="font-size: 12px; color: #475569; margin: 0 0 14px 0;">
                Need help? <a href="mailto:support@wellirecord.com" style="color: #0284c7; font-weight: 700; text-decoration: none;">Contact WelliRecord™ Support</a>
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                © 2026 WelliRecord™. All rights reserved.
              </p>
            </div>

          </div>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the login OTP email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return response;
  } catch (error) {
    console.error("Login OTP email sending failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};
