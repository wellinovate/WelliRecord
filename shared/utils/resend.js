import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

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

export const sendVerificationEmail = async ({ email, fullName, token }) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@send.wellirecord.com>",
      to: email,
      subject: "Verify your email",
      html: `
        <div style="font-family: Arial;">
          <h2>Verify your email</h2>
          <p>Hello ${fullName || "there"},</p>
          <p>Click the button below to verify your account:</p>
          <a href="${verifyUrl}" 
             style="display:inline-block;padding:12px 18px;background:#0B1F3A;color:#fff;text-decoration:none;border-radius:6px;">
            Verify Email
          </a>
          <p>This link expires in 30 minutes.</p>
        </div>
      `,
    });

    if (response.error) {
      console.error("Resend rejected the email:", response.error);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return response;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};