import {
  createMedicationService,
  getPatientMedicationsService,
} from "./medication_service.js";
import { getPatientMedicationsQuerySchema } from "./medications_validator.js";

export const createMedicationController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createMedicationService({
      payload,
      authUser,
    });

    return res.status(201).json({
      success: true,
      message: "Medication record created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientMedicationsController = async (req, res, next) => {
  try {
    const { patientId } = req.validated;
    const { page = 1, limit = 10 } = getPatientMedicationsQuerySchema.parse(req.query);

    const result = await getPatientMedicationsService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient medications fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};