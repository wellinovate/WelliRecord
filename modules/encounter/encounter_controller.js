import {
  createEncounterService,
  getPatientEncountersService,
} from "./encounter_services.js";
import { getPatientEncountersQuerySchema } from "./encounter_validation.js";

export const createEncounterController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createEncounterService({
      payload,
      authUser,
    });

    return res.status(201).json({
      success: true,
      message: "Encounter created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientEncountersController = async (req, res, next) => {
  try {
    const { patientId } = req.validated;
    const { page = 1, limit = 10 } = getPatientEncountersQuerySchema.parse(req.query);

    const result = await getPatientEncountersService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient encounters fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};