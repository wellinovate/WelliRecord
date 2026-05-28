import {
  fetchIdentity,
  sendEmailOtp,
  verifyEmailOtp,
} from "./identity.service.js";

/**
 * GET /identity/me
 */
export const getMyIdentity = async (req, res) => {
  try {
    const accountId = req.user.id;

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
    const accountId = req.user.id;

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
    const accountId = req.user.id;
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