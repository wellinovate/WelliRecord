import mongoose from "mongoose";

export const validateCreateLabResult = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (!body.testName || typeof body.testName !== "string") {
    errors.push("testName is required");
  }

  return errors;
};

export const validateUpdateLabResult = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  return errors;
};