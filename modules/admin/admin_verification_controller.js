import {
  listVerificationsService,
  getVerificationByIdService,
  approveVerificationService,
  rejectVerificationService,
  requestMoreInfoService,
} from "./admin_verification_services.js";

export const listVerificationsController = async (req, res, next) => {
  try {
    const { status } = req.query;
    const data = await listVerificationsService({ status });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getVerificationByIdController = async (req, res, next) => {
  try {
    const data = await getVerificationByIdService(req.params.id);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const approveVerificationController = async (req, res, next) => {
  try {
    const data = await approveVerificationService({
      id: req.params.id,
      reviewerId: req.user?.sub,
      note: req.body?.note,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const rejectVerificationController = async (req, res, next) => {
  try {
    const data = await rejectVerificationService({
      id: req.params.id,
      reviewerId: req.user?.sub,
      note: req.body?.note,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const requestMoreInfoController = async (req, res, next) => {
  try {
    const data = await requestMoreInfoService({
      id: req.params.id,
      reviewerId: req.user?.sub,
      note: req.body?.note,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
