import mongoose from "mongoose";

export const validateCreateVital = (body) => {
  const errors = [];

  if (!body.patientId || !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Valid patientId is required");
  }

  if (
    body.recordedBy &&
    !mongoose.Types.ObjectId.isValid(body.recordedBy)
  ) {
    errors.push("Invalid recordedBy");
  }

  if (
    body.source &&
    !["patient", "provider", "device", "imported"].includes(body.source)
  ) {
    errors.push("Invalid source");
  }

  const hasAnyVital =
    body.bloodPressure ||
    body.heartRate !== undefined ||
    body.temperature ||
    body.respiratoryRate !== undefined ||
    body.oxygenSaturation !== undefined ||
    body.weight ||
    body.height ||
    body.bloodGlucose;

  if (!hasAnyVital) {
    errors.push("At least one vital measurement is required");
  }

  if (
    body.bloodPressure &&
    (
      (body.bloodPressure.systolic !== undefined &&
        typeof body.bloodPressure.systolic !== "number") ||
      (body.bloodPressure.diastolic !== undefined &&
        typeof body.bloodPressure.diastolic !== "number")
    )
  ) {
    errors.push("bloodPressure values must be numbers");
  }

  if (
    body.heartRate !== undefined &&
    (typeof body.heartRate !== "number" || body.heartRate < 0)
  ) {
    errors.push("heartRate must be a positive number");
  }

  if (
    body.respiratoryRate !== undefined &&
    (typeof body.respiratoryRate !== "number" || body.respiratoryRate < 0)
  ) {
    errors.push("respiratoryRate must be a positive number");
  }

  if (
    body.oxygenSaturation !== undefined &&
    (typeof body.oxygenSaturation !== "number" ||
      body.oxygenSaturation < 0 ||
      body.oxygenSaturation > 100)
  ) {
    errors.push("oxygenSaturation must be between 0 and 100");
  }

  if (
    body.temperature?.unit &&
    !["C", "F"].includes(body.temperature.unit)
  ) {
    errors.push("temperature.unit must be C or F");
  }

  if (
    body.weight?.unit &&
    !["kg", "lb"].includes(body.weight.unit)
  ) {
    errors.push("weight.unit must be kg or lb");
  }

  if (
    body.height?.unit &&
    !["cm", "m", "ft", "in"].includes(body.height.unit)
  ) {
    errors.push("height.unit must be cm, m, ft, or in");
  }

  if (
    body.bloodGlucose?.unit &&
    !["mg/dL", "mmol/L"].includes(body.bloodGlucose.unit)
  ) {
    errors.push("bloodGlucose.unit must be mg/dL or mmol/L");
  }

  return errors;
};

export const validateUpdateVital = (body) => {
  const errors = [];

  if (body.patientId && !mongoose.Types.ObjectId.isValid(body.patientId)) {
    errors.push("Invalid patientId");
  }

  if (
    body.recordedBy &&
    !mongoose.Types.ObjectId.isValid(body.recordedBy)
  ) {
    errors.push("Invalid recordedBy");
  }

  if (
    body.source &&
    !["patient", "provider", "device", "imported"].includes(body.source)
  ) {
    errors.push("Invalid source");
  }

  if (
    body.temperature?.unit &&
    !["C", "F"].includes(body.temperature.unit)
  ) {
    errors.push("temperature.unit must be C or F");
  }

  if (
    body.weight?.unit &&
    !["kg", "lb"].includes(body.weight.unit)
  ) {
    errors.push("weight.unit must be kg or lb");
  }

  if (
    body.height?.unit &&
    !["cm", "m", "ft", "in"].includes(body.height.unit)
  ) {
    errors.push("height.unit must be cm, m, ft, or in");
  }

  if (
    body.bloodGlucose?.unit &&
    !["mg/dL", "mmol/L"].includes(body.bloodGlucose.unit)
  ) {
    errors.push("bloodGlucose.unit must be mg/dL or mmol/L");
  }

  return errors;
};