import mongoose from "mongoose";

export const validateCreateMedication = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (!body.medicationName || typeof body.medicationName !== "string") {
    errors.push("medicationName is required");
  }

  if (body.status && !["active", "completed", "stopped", "on-hold"].includes(body.status)) {
    errors.push("Invalid status");
  }

  if (
    body.source &&
    !["patient", "provider", "pharmacy", "imported"].includes(body.source)
  ) {
    errors.push("Invalid source");
  }

  return errors;
};

export const validateUpdateMedication = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  if (body.status && !["active", "completed", "stopped", "on-hold"].includes(body.status)) {
    errors.push("Invalid status");
  }

  return errors;
};