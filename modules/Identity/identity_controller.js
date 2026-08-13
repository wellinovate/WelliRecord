import {
  fetchIdentity,
  sendEmailOtp,
  verifyEmailOtp,
} from "./identity.service.js";

/**
 * GET /identity/me
 *
 * BUGFIX: was reading req.user.id, which the JWT payload never sets
 * (see shared/utils/helper.js, signAccessToken — it signs `sub` for
 * the account id and `profileId` for the UserProfile id, never `id`).
 * fetchIdentity/sendEmailOtp/verifyEmailOtp all do Account.findById
 * with this value, so it needs to be `sub`.
 */
export const getMyIdentity = async (req, res) => {
  try {
    const accountId = req.user.sub;

    const identity = await fetchIdentity(accountId);

    return res.status(200).json({
      success: true,
      data: identity,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /identity/email/send
 */
export const sendEmailVerification = async (req, res) => {
  try {
    const accountId = req.user.sub;

    const result = await sendEmailOtp(accountId);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /identity/email/confirm
 */
export const confirmEmailVerification = async (req, res) => {
  try {
    const accountId = req.user.sub;
    const { otp } = req.body;

    const result = await verifyEmailOtp(accountId, otp);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};