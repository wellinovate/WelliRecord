import mongoose from "mongoose";

export const validateCreateImmunization = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (!body.vaccineName || typeof body.vaccineName !== "string") {
    errors.push("vaccineName is required");
  }

  return errors;
};

export const validateUpdateImmunization = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  return errors;
};