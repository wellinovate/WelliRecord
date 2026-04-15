import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "node:crypto";

import dotenv from "dotenv";
dotenv.config();
export const signAccessToken = (results) => {
  const { account, profile } = results;

  if (account.accountType === "organization") {
    return jwt.sign(
      {
        sub: account._id,
        isVerified: account.isVerified,
        orgId: profile.wrOrgId,
        organizationId: profile._id,
        email: account.email,
        fullName: profile.organizationName,
        accountType: account.accountType,
        role: account.accountType ?? null,
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "1d" },
    );
  } else {
    return jwt.sign(
      {
        sub: account._id,
        email: account.email,
        fullName: profile.fullName,
        accountType: account.accountType,
        role: account.role ?? null,
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "1d" },
    );
  }
};

export const signAccessTokenGoogle = (user) => {
  return jwt.sign(
    {
      // sub: user._id,
      sub: user.accountId,
      email: user.email,
      fullName: user.fullName || user.firstName || user.name || "",
      accountType: "user",
      role: user.role ?? null,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "1d" },
  );
};

export const normalizeEmail = (email) => {
  return String(email || "")
    .trim()
    .toLowerCase();
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

// utils/generateEncounterCode.js

export const generateEncounterCode = async (EncounterModel) => {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  const dateStr = `${year}${month}${day}`;

  // count today's encounters
  const startOfDay = new Date(year, today.getMonth(), today.getDate());
  const endOfDay = new Date(year, today.getMonth(), today.getDate() + 1);

  const count = await EncounterModel.countDocuments({
    createdAt: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
  });

  const sequence = String(count + 1).padStart(4, "0");

  return `ENC-${dateStr}-${sequence}`;
};

export const generateWelliRecordId = () => {
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `WR-${timestamp}-${random}`;
};


export const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // true only for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const generateEmailVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashVerificationToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const getVerificationTokenExpiry = () => {
  return new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
};
