import { createVisionVisitService, getVisionRecordService } from "./vision_record_service.js";

export const createVisionVisitController = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { clinicName, acuity, colorVision, lensPrescription, diagnosis, treatment } = req.body;

    // acuity and lensPrescription arrive as JSON strings in multipart
    // form data — same pattern as other multipart + structured-field
    // routes in this backend.
    const record = await createVisionVisitService({
      patientId,
      actingAccountId: req.user.id, // set by `protect` middleware
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
