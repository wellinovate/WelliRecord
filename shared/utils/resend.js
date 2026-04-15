import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();



const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async ({ email, fullName, token }) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  try {
    const response = await resend.emails.send({
      from: "WelliRecord <noreply@wellirecord.com>",
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

    return response;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
};