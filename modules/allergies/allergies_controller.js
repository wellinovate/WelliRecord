import {
  createAllergyService,
  getPatientAllergiesService,
} from "./allergies_services.js";
import { getPatientAllergiesQuerySchema } from "./allergies_validation.js";

export const createAllergyController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createAllergyService({
      payload,
      authUser,
    });

    return res.status(201).json({
      success: true,
      message: "Allergy record created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientAllergiesController = async (req, res, next) => {
  try {
    const { patientId } = req.validated;
    const { page = 1, limit = 10 } = getPatientAllergiesQuerySchema.parse(req.query);

    const result = await getPatientAllergiesService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient allergies fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};


export const getMyAllergiesController = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = getPatientAllergiesQuerySchema.parse(req.query);
    const authUser = req.user;
    const patientId = authUser.sub

    const result = await getPatientAllergiesService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient allergies fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};