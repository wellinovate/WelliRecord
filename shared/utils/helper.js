import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
export const signAccessToken = (account) => {
  return jwt.sign(
    {
      sub: account._id,
      name: account.email,
      accountType: account.accountType,
      role: account.role ?? null,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "1d" }
  );
};

export const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

export const normalizePhone = (phone) => {
  if (!phone) return "";

  let value = String(phone).trim().replace(/\s+/g, "");

  if (value.startsWith("0")) {
    value = `+234${value.slice(1)}`;
  } else if (value.startsWith("234")) {
    value = `+${value}`;
  }

  return value;
};

export const maskEmail = (email) => {
  if (!email) return null;

  const [local, domain] = email.split("@");
  if (!domain) return null;

  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
};

export const maskPhone = (phone) => {
  if (!phone) return null;

  const cleaned = String(phone);
  if (cleaned.length < 7) return "******";

  return `${cleaned.slice(0, 6)}*****${cleaned.slice(-3)}`;
};