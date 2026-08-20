import axios from "axios";
import { AppError } from "../errors/AppError.js";
import dotenv from "dotenv";
dotenv.config();

const TERMII_API_KEY = process.env.TERMII_API_KEY?.trim();
const TERMII_BASE_URL =
  process.env.TERMII_BASE_URL?.trim() || "https://api.ng.termii.com";
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID?.trim() || "WelliRecord";
const TERMII_OTP_CHANNEL = process.env.TERMII_OTP_CHANNEL?.trim() || "dnd";
const TERMII_EMAIL_CONFIGURATION_ID = process.env.TERMII_EMAIL_CONFIGURATION_ID?.trim();

const allowedOtpChannels = ["dnd", "generic", "whatsapp"];

if (TERMII_OTP_CHANNEL && !allowedOtpChannels.includes(TERMII_OTP_CHANNEL)) {
  console.warn(
    `Invalid TERMII_OTP_CHANNEL="${TERMII_OTP_CHANNEL}". Use one of: ${allowedOtpChannels.join(
      ", "
    )}`
  );
}

export const sendSms = async ({ phoneNumber, message }) => {
  if (!TERMII_API_KEY) {
    throw new AppError(
      "SMS service is not configured",
      500,
      "SMS_NOT_CONFIGURED",
    );
  }
  if (!phoneNumber || !message) {
    throw new AppError(
      "Phone number and message are required",
      400,
      "SMS_PARAMS_REQUIRED",
    );
  }

  const phone = normalizeNigerianPhone(phoneNumber);

  const { data } = await axios.post(`${TERMII_BASE_URL}/api/sms/send`, {
    api_key: TERMII_API_KEY,
    to: phone,
    from: TERMII_SENDER_ID,
    sms: message,
    type: "plain",
    channel: TERMII_OTP_CHANNEL,
  });

  // Termii can return HTTP 200 with a body indicating failure (e.g. no
  // balance, invalid sender ID, undelivered route) — axios only throws on
  // non-2xx, so that failure has to be checked explicitly or it silently
  // looks like success.
  // The message-check clause below already guards against a false
  // positive when Termii still returns a message_id (proof the send
  // was actually accepted) — the balance check didn't have that same
  // guard, so a response like "balance: 0, message_id: <real id>"
  // (this send used the account's last credit and succeeded) still
  // got thrown as a failure. That's a false negative: the SMS above
  // this fix was reported "failed" and retried/logged as such despite
  // actually being delivered — confirmed against a real Termii
  // response shape where message_id is present on success.
  const looksFailed =
    (data?.balance === 0 && !data?.message_id) ||
    (typeof data?.code === "string" && data.code.toLowerCase() !== "ok") ||
    (typeof data?.message === "string" &&
      /balance|insufficient|invalid|fail|error|reject/i.test(data.message) &&
      !data?.message_id);

  if (looksFailed) {
    console.error("Termii send SMS returned a failure body:", data);
    throw new AppError(
      data?.message || "SMS was not accepted for delivery",
      502,
      "SMS_SEND_FAILED",
    );
  }

  return data;
};

export const sendLoginOtp = async ({ phoneNumber }) => {
  if (!TERMII_API_KEY) {
    throw new AppError(
      "SMS service is not configured",
      500,
      "SMS_NOT_CONFIGURED"
    );
  }

  if (!phoneNumber) {
    throw new AppError(
      "Phone number is required for SMS login",
      400,
      "PHONE_REQUIRED"
    );
  }

  const phone = normalizeNigerianPhone(phoneNumber)

  try {
    const { data } = await axios.post(`${TERMII_BASE_URL}/api/sms/otp/send`, {
      api_key: TERMII_API_KEY,
      message_type: "NUMERIC",
      to: phone,
      from: TERMII_SENDER_ID,
      channel: TERMII_OTP_CHANNEL,
      pin_attempts: 3,
      pin_time_to_live: 5,
      pin_length: 6,
      pin_placeholder: "< 123456 >",
      message_text:
        "Your WelliRecord Verification PIN is < 123456 >. It expires in 5 minutes. For security, never share this code.",
      pin_type: "NUMERIC",
    });

    console.log("Termii OTP sent:", {
      pinId: data?.pinId || data?.pin_id,
      to: phoneNumber,
      channel: TERMII_OTP_CHANNEL,
    });

    if (!data?.pinId && !data?.pin_id) {
      console.error("Unexpected Termii OTP response:", data);

      throw new AppError(
        "Unable to start SMS verification",
        502,
        "SMS_OTP_FAILED"
      );
    }

    return {
      pinId: data.pinId || data.pin_id,
      raw: data,
    };
  } catch (error) {
    console.error("Termii send OTP error:", error.response?.data || error.message);

    throw new AppError(
      "Unable to send login code. Please try again.",
      502,
      "SMS_OTP_FAILED"
    );
  }
};

export const verifyLoginOtp = async ({ pinId, pin }) => {
  if (!TERMII_API_KEY) {
    throw new AppError(
      "SMS service is not configured",
      500,
      "SMS_NOT_CONFIGURED"
    );
  }

  try {
    const { data } = await axios.post(`${TERMII_BASE_URL}/api/sms/otp/verify`, {
      api_key: TERMII_API_KEY,
      pin_id: pinId,
      pin,
    });

    return data;
  } catch (error) {
    console.error(
      "Termii verify OTP error:",
      error.response?.data || error.message
    );

    throw new AppError(
      "Invalid or expired login code",
      400,
      "INVALID_LOGIN_CODE"
    );
  }
};

export const generateOtpCode = (length = 6) => {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
};

// Termii's email OTP endpoint only delivers a code we supply — it does not
// generate or store one, and their Verify Token API cannot check email
// OTPs at all. Generation and verification of the code happen on our side
// (see hashOtpCode / verifyLoginCodeService in auth_services.js).
export const sendEmailOtp = async ({ email, code }) => {
  if (!TERMII_API_KEY) {
    throw new AppError(
      "Email OTP service is not configured",
      500,
      "EMAIL_OTP_NOT_CONFIGURED",
    );
  }
  if (!TERMII_EMAIL_CONFIGURATION_ID) {
    throw new AppError(
      "Email OTP configuration is missing",
      500,
      "EMAIL_OTP_NOT_CONFIGURED",
    );
  }
  if (!email || !code) {
    throw new AppError(
      "Email and code are required",
      400,
      "EMAIL_OTP_PARAMS_REQUIRED",
    );
  }

  try {
    const { data } = await axios.post(`${TERMII_BASE_URL}/api/email/otp/send`, {
      api_key: TERMII_API_KEY,
      email_address: email,
      code,
      email_configuration_id: TERMII_EMAIL_CONFIGURATION_ID,
    });

    const looksFailed =
      (typeof data?.code === "string" && data.code.toLowerCase() !== "ok") ||
      (typeof data?.message === "string" &&
        /balance|insufficient|invalid|fail|error|reject/i.test(data.message) &&
        !data?.message_id);

    if (looksFailed) {
      console.error("Termii send email OTP returned a failure body:", data);
      throw new AppError(
        data?.message || "Email OTP was not accepted for delivery",
        502,
        "EMAIL_OTP_SEND_FAILED",
      );
    }

    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;

    console.error(
      "Termii send email OTP error:",
      error.response?.data || error.message,
    );

    throw new AppError(
      "Unable to send login code by email. Please try again.",
      502,
      "EMAIL_OTP_SEND_FAILED",
    );
  }
};

export const normalizeNigerianPhone = (phone) => {
  if (!phone) {
    throw new Error("Phone number is required");
  }

  let value = String(phone).trim();

  // Remove spaces, hyphens, brackets
  value = value.replace(/[\s\-()]/g, "");

  // Remove leading +
  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  // Convert 08012345678 to 2348012345678
  if (value.startsWith("0")) {
    value = `234${value.slice(1)}`;
  }

  // Convert 8012345678 to 2348012345678
  if (value.length === 10 && value.startsWith("8")) {
    value = `234${value}`;
  }

  // Validate final Nigerian international format
  if (!/^234[789][01]\d{8}$/.test(value)) {
    throw new Error("Invalid Nigerian phone number format");
  }

  return value;
};