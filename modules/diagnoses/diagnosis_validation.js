import mongoose from "mongoose";

export const validateCreateDiagnosis = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (!body.diagnosisName || typeof body.diagnosisName !== "string") {
    errors.push("diagnosisName is required");
  }

  if (
    body.diagnosisType &&
    !["provisional", "confirmed", "chronic", "resolved", "ruled-out"].includes(body.diagnosisType)
  ) {
    errors.push("Invalid diagnosisType");
  }

  return errors;
};

export const validateUpdateDiagnosis = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  return errors;
};