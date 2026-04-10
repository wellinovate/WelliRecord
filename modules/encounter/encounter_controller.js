import {
  createEncounterService,
  getPatientEncountersDetailService,
  getPatientEncountersService,
} from "./encounter_services.js";
import { getPatientEncountersQuerySchema } from "./encounter_validation.js";

export const createEncounterController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const authUser = req.user;
    // console.log("🚀 ~ createEncounterController ~ authUser:", authUser)

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

    const { page = 1, limit = 10 } = getPatientEncountersQuerySchema.parse(
      req.query,
    );

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

export const getMyEncountersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = getPatientEncountersQuerySchema.parse(
      req.query,
    );
    const authUser = req.user;
    const patientId = authUser.sub;

    const result = await getPatientEncountersService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });
    // console.log("🚀 ~ getMyEncountersController ~ result:", result)

    return res.status(200).json({
      success: true,
      message: "Patient encounters fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getuserEncountersControllerByOrganiazation = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = getPatientEncountersQuerySchema.parse(
      req.query,
    );
    const authUser = req.user;
    const {patientId} = req.params;

    const result = await getPatientEncountersService({
      patientId,
      page,
      limit,
      authUser: req.user,
    });
    // console.log("🚀 ~ getMyEncountersController ~ result:", result)

    return res.status(200).json({
      success: true,
      message: "Patient encounters fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyEncounterDetailController = async (req, res, next) => {
  try {
    const { id } = req.params;
    console.log("🚀 ~ getMyEncounterDetailController ~ id:", id);
    const authUser = req.user;
    const patientId = authUser.sub;

    const result = await getPatientEncountersDetailService({
      id,
      patientId,
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

export const getUserEncounterDetailControllerByOrganization = async (req, res, next) => {
  try {
    const { id, patientId } = req.params;
    console.log("🚀 ~ getMyEncounterDetailController ~ id:", id);
    // const authUser = req.user;
    

    const result = await getPatientEncountersDetailService({
      id,
      patientId,
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
