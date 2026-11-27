import { requestClaim, completeClaim } from "./claim_service.js";

export const requestClaimController = async (req, res, next) => {
  try {
    const data = await requestClaim({ identifier: req.body?.identifier });
    res.status(202).json({
      success: true,
      message: "If this record can be claimed, a code was sent to its phone.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const completeClaimController = async (req, res, next) => {
  try {
    const data = await completeClaim({
      requestId: req.body?.requestId,
      code: req.body?.code,
      email: req.body?.email,
      password: req.body?.password,
    });
    res.status(200).json({ success: true, message: "Record claimed. You can now log in.", data });
  } catch (error) {
    next(error);
  }
};
