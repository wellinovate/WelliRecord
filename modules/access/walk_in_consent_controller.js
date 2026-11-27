import { createWalkInRequest, confirmWalkInRequest } from "./walk_in_consent_service.js";

export const requestWalkInConsent = async (req, res, next) => {
  try {
    const data = await createWalkInRequest({
      authUser: req.user,
      phone: req.body?.phone,
      categories: req.body?.categories,
      newPatient: req.body?.newPatient,
    });
    res.status(202).json({
      success: true,
      message: "If this number has a WelliRecord, a code was sent to it.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmWalkInConsent = async (req, res, next) => {
  try {
    const data = await confirmWalkInRequest({
      authUser: req.user,
      requestId: req.params.requestId,
      code: req.body?.code,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
