import { UserProfile } from "../users/user_profile_model.js";
import { NinAttempt } from "./nin_attempt_model.js";
import { lookupNin, ninConfig } from "./nin_client.js";
import { verifyNin } from "./nin_service.js";

const deps = {
  getProfile: (accountId) =>
    UserProfile.findOne({ accountId }).select("fullName firstName middleName lastName dateOfBirth identityVerifiedAt").lean(),
  countAttempts: (accountId, since, outcomes) =>
    NinAttempt.countDocuments({ accountId, createdAt: { $gte: since }, outcome: { $in: outcomes } }),
  countAllAttempts: (since) => NinAttempt.countDocuments({ createdAt: { $gte: since } }),
  recordAttempt: (row) => NinAttempt.create(row),
  markVerified: (accountId, at) =>
    UserProfile.updateOne(
      { accountId },
      { $set: { identityVerifiedAt: at, identityVerifiedBy: "system", identityVerifiedMethod: "nin_2am" } },
    ),
  lookup: lookupNin,
};

export const ninStatusController = async (req, res) => {
  try {
    const accountId = req.user?.sub;
    if (!accountId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const p = await UserProfile.findOne({ accountId }).select("identityVerifiedAt identityVerifiedMethod").lean();
    if (!p) return res.status(404).json({ success: false, message: "Profile not found." });
    return res.json({
      success: true,
      data: {
        verified: Boolean(p.identityVerifiedAt),
        verifiedAt: p.identityVerifiedAt || null,
        method: p.identityVerifiedMethod || null,
        available: ninConfig().enabled,
      },
    });
  } catch (error) {
    console.error("ninStatusController:", error?.message);
    return res.status(500).json({ success: false, message: "Could not load your status. Try again." });
  }
};

export const ninVerifyController = async (req, res) => {
  try {
    const accountId = req.user?.sub;
    if (!accountId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const r = await verifyNin({ accountId, nin: req.body?.nin, consent: req.body?.consent, deps });
    if (!r.ok) return res.status(r.status).json({ success: false, code: r.code, message: r.message });
    return res.json({ success: true, data: { verified: true, already: r.already, verifiedAt: r.verifiedAt } });
  } catch (error) {
    console.error("ninVerifyController:", error?.message); // message only: the request body holds the NIN
    return res.status(500).json({ success: false, message: "Could not complete the check. Try again." });
  }
};
