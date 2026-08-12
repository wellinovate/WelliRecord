import {
  verifyPatientIdentityService,
  extractReportDataService,
  inviteUnregisteredPatientService,
  releaseLabDeliveryService,
} from "./lab_delivery_service.js";

export const verifyPatientController = async (req, res, next) => {
  try {
    const { wrId, phone, email } = req.body;
    const data = await verifyPatientIdentityService({ wrId, phone, email });
    return res.status(200).json({
      success: true,
      message: "Patient identity verified",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const extractReportController = async (req, res, next) => {
  try {
    const { fileName } = req.body;
    const data = await extractReportDataService({ fileName });
    return res.status(200).json({
      success: true,
      message: data.message,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const inviteUnregisteredPatientController = async (req, res, next) => {
  try {
    const { fullName, phone, email } = req.body;
    const data = await inviteUnregisteredPatientService({
      fullName,
      phone,
      email,
      authUser: req.user,
    });
    return res.status(200).json({
      success: true,
      message: "Invitation created",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const releaseLabDeliveryController = async (req, res, next) => {
  try {
    const data = await releaseLabDeliveryService({
      payload: req.body,
      authUser: req.user,
    });
    return res.status(200).json({
      success: true,
      message: data.message,
      data,
    });
  } catch (error) {
    next(error);
  }
};
