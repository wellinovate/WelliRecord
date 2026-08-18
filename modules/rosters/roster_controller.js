import {
  createRosterService,
  getAllRostersService,
  getRosterService,
  addDutyAssignmentService,
  updateDutyAssignmentService,
  cancelDutyAssignmentService,
  publishRosterService,
} from "./roster_service.js";
import { getRostersQuerySchema } from "./roster_validation.js";

export const createRosterController = async (req, res, next) => {
  try {
    const payload = req.validated;
    const result = await createRosterService({ payload, authUser: req.user });
    return res.status(201).json({
      success: true,
      message: "Roster created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllRostersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = getRostersQuerySchema.parse(req.query);
    const result = await getAllRostersService({ page, limit, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Rosters fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getRosterController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getRosterService({ id, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Roster fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const addDutyAssignmentController = async (req, res, next) => {
  try {
    const { id } = req.params; // roster id
    const payload = req.validated;
    const result = await addDutyAssignmentService({ rosterId: id, payload, authUser: req.user });
    return res.status(201).json({
      success: true,
      message: "Duty assignment added",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDutyAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const payload = req.validated;
    const result = await updateDutyAssignmentService({ id: assignmentId, payload, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Duty assignment updated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelDutyAssignmentController = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const payload = req.validated;
    const result = await cancelDutyAssignmentService({ id: assignmentId, payload, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Duty assignment cancelled",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const publishRosterController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await publishRosterService({ id, authUser: req.user });
    return res.status(200).json({
      success: true,
      message: "Roster published",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
