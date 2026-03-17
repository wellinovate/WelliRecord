import mongoose from "mongoose";

export const validateObjectIdParam = (params) => {
  const errors = [];

  if (params.id && !mongoose.Types.ObjectId.isValid(params.id)) {
    errors.push("Invalid id");
  }

  if (params.patientId && !mongoose.Types.ObjectId.isValid(params.patientId)) {
    errors.push("Invalid patientId");
  }

  return errors;
};