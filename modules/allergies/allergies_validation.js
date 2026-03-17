import mongoose from "mongoose";

export const validateCreateAllergy = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (!body.allergen || typeof body.allergen !== "string") {
    errors.push("allergen is required");
  }

  if (
    !body.allergyType ||
    !["drug", "food", "environment", "insect", "other"].includes(
      body.allergyType,
    )
  ) {
    errors.push("Valid allergyType is required");
  }

  return errors;
};

export const validateUpdateAllergy = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  if (
    body.allergyType &&
    !["drug", "food", "environment", "insect", "other"].includes(
      body.allergyType,
    )
  ) {
    errors.push("Invalid allergyType");
  }

  return errors;
};
