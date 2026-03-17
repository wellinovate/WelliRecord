import mongoose from "mongoose";

export const validateCreateProcedure = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (!body.procedureName || typeof body.procedureName !== "string") {
    errors.push("procedureName is required");
  }

  return errors;
};

export const validateUpdateProcedure = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  return errors;
};