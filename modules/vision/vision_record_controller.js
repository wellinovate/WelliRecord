import {
  createVisionVisitService,
  getVisionRecordService,
  getAllPatientVisionService,
} from "./vision_record_service.js";

export const createVisionVisitController = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { clinicName, acuity, colorVision, lensPrescription, diagnosis, treatment } = req.body;

    // acuity and lensPrescription arrive as JSON strings in multipart
    // form data — same pattern as other multipart + structured-field
    // routes in this backend.
    const record = await createVisionVisitService({
      patientId,
      // BUGFIX: was req.user.id, which the JWT payload never sets —
      // same root cause as the identity_controller.js and
      // clinical_scope_middleware.js fixes. Account.findById below
      // needs the account id, which is `sub` on this token.
      actingAccountId: req.user.sub,
      wrOrgId: req.user.wrOrgId,
      clinicName,
      acuity: typeof acuity === "string" ? JSON.parse(acuity) : acuity,
      colorVision,
      lensPrescription:
        typeof lensPrescription === "string" ? JSON.parse(lensPrescription) : lensPrescription,
      diagnosis,
      treatment,
      photoFiles: req.files ?? [],
    });

    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const getAllPatientVisionController = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const result = await getAllPatientVisionService({
      page,
      limit,
      wrOrgId: req.user.wrOrgId,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const getVisionRecordController = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const record = await getVisionRecordService({ patientId });
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
