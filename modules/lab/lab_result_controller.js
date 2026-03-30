import {
  createLabResultService,
  getPatientLabResultsService,
} from "./lab_result_service.js";
import { getPatientLabResultsQuerySchema } from "./lab_result_validation.js";

export const createLabResultController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;

    const result = await createLabResultService({
      payload,
      authUser,
    });

    return res.status(201).json({
      success: true,
      message: "Lab result created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientLabResultsController = async (req, res, next) => {
  try {
    const { patientId } = req.validated;
    const { page = 1, limit = 10 } = getPatientLabResultsQuerySchema.parse(req.query);

    const result = await getPatientLabResultsService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient lab results fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyLabResultsController = async (req, res, next) => {
  try {
    const patientId  = req.user.sub;
    const { page = 1, limit = 10 } = getPatientLabResultsQuerySchema.parse(req.query);

    const result = await getPatientLabResultsService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Patient lab results fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};