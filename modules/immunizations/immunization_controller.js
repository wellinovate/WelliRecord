import {
  createImmunizationService,
  getPatientImmunizationsService,
} from "./immunization_service.js";
import { getPatientImmunizationsQuerySchema } from "./immunization_validation.js";

export const createImmunizationController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createImmunizationService({
      payload,
      authUser,
    });

    return res.status(201).json({
      success: true,
      message: "Immunization record created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientImmunizationsController = async (req, res, next) => {
  try {
    const { patientId } = req.validated;
    const { page = 1, limit = 10 } = getPatientImmunizationsQuerySchema.parse(req.query);

    const result = await getPatientImmunizationsService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient immunizations fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};