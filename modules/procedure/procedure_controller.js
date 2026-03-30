import {
  createProcedureService,
  getPatientProceduresService,
} from "./procedure_service.js";
import { getPatientProceduresQuerySchema } from "./procedure_validation.js";

export const createProcedureController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createProcedureService({
      payload,
      authUser,
    });

    return res.status(201).json({
      success: true,
      message: "Procedure record created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientProceduresController = async (req, res, next) => {
  try {
    const { patientId } = req.validated;
    const { page = 1, limit = 10 } = getPatientProceduresQuerySchema.parse(req.query);

    const result = await getPatientProceduresService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient procedures fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};