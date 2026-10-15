// WelliPay partner API. WelliPay asks WelliRecord to prove that a person
// controls a WR-ID, without WelliPay ever seeing the person's phone or email.
//
//   POST /wellipay/v1/verifications                  { requestId, reference }
//   POST /wellipay/v1/verifications/:requestId/confirm   { code }
//
// Calls carry "Authorization: Bearer <WELLIPAY_PARTNER_KEY>", a Unix-second
// X-WelliPay-Timestamp and X-WelliPay-Signature (HMAC-SHA256 of
// "<timestamp>.<raw body>"). The start call always answers 202, so it cannot
// be used to find out which WR-IDs exist.
import express from "express";
import rateLimit from "express-rate-limit";
import { UserProfile } from "../users/user_profile_model.js";
import WellipayVerification from "./wellipay_verification_model.js";
import { sendSms } from "../../shared/utils/termii.js";
import { sendWellipayCodeEmail } from "../../shared/utils/resend.js";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_CODES_PER_WINDOW,
  checkRequestAuth,
  generateCode,
  hashCode,
  normalizeReference,
  safeEqual,
  smsText,
  validCode,
  validRequestId,
} from "./wellipay_partner_logic.js";

const router = express.Router();
const partnerKey = () => process.env.WELLIPAY_PARTNER_KEY?.trim();

// Keep the raw body: the signature is computed over it.
router.use(
  express.json({
    limit: "10kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

router.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests." },
  }),
);

router.use((req, res, next) => {
  const result = checkRequestAuth({
    key: partnerKey(),
    authorization: req.get("authorization"),
    timestamp: req.get("x-wellipay-timestamp"),
    signature: req.get("x-wellipay-signature"),
    rawBody: req.rawBody,
  });
  if (!result.ok) {
    if (result.status === 503) console.error("WELLIPAY_PARTNER_KEY is not set. WelliPay verification calls are refused.");
    return res.status(result.status).json({ error: "Not authorised." });
  }
  next();
});

// Finds the patient behind a WR-ID, or null. Only patient accounts can be linked.
async function findPatient(reference) {
  const profile = await UserProfile.findOne({ wrId: reference }).populate("accountId", "role accountType");
  const account = profile?.accountId;
  if (!profile || !account || account.accountType !== "user" || account.role !== "patient") return null;
  return profile;
}

// SMS when the patient has a phone number, email otherwise.
async function sendCode(profile, code) {
  if (profile.phone) {
    await sendSms({ phoneNumber: profile.phone, message: smsText(code) });
    return;
  }
  if (profile.email) {
    await sendWellipayCodeEmail({ email: profile.email, text: smsText(code) });
    return;
  }
  console.warn(`WelliPay verification: ${profile.wrId} has no phone or email; no code sent.`);
}

router.post("/verifications", async (req, res) => {
  const requestId = req.body?.requestId;
  const reference = normalizeReference(req.body?.reference);
  if (!validRequestId(requestId) || !reference) return res.status(400).json({ error: "Invalid request." });

  // Answer first. Everything below happens after the reply, so the response
  // time and body are the same whether or not the WR-ID exists.
  res.status(202).json({ accepted: true });

  try {
    if (await WellipayVerification.exists({ requestId })) return;
    const profile = await findPatient(reference);
    if (!profile) return;

    const recent = await WellipayVerification.countDocuments({
      reference,
      createdAt: { $gt: new Date(Date.now() - CODE_TTL_MS) },
    });
    if (recent >= MAX_CODES_PER_WINDOW) return;

    const code = generateCode();
    await WellipayVerification.create({
      requestId,
      reference,
      userProfileId: profile._id,
      codeHash: hashCode(partnerKey(), requestId, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    await sendCode(profile, code);
  } catch (err) {
    console.error("WelliPay verification start failed:", err?.message || err);
  }
});

router.post("/verifications/:requestId/confirm", async (req, res) => {
  const { requestId } = req.params;
  const code = req.body?.code;
  if (!validRequestId(requestId) || !validCode(code)) return res.status(400).json({ verified: false });

  try {
    const now = new Date();
    // Count the attempt first, in one atomic step, so parallel guesses cannot beat the limit.
    const row = await WellipayVerification.findOneAndUpdate(
      { requestId, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    if (!row) return res.status(200).json({ verified: false });
    if (!safeEqual(row.codeHash, hashCode(partnerKey(), requestId, code))) {
      return res.status(200).json({ verified: false });
    }
    // A code works once.
    const used = await WellipayVerification.findOneAndUpdate({ _id: row._id, consumedAt: null }, { consumedAt: now });
    if (!used) return res.status(200).json({ verified: false });
    return res.status(200).json({ verified: true, reference: row.reference });
  } catch (err) {
    console.error("WelliPay verification confirm failed:", err?.message || err);
    return res.status(500).json({ error: "Could not check the code." });
  }
});

export default router;
