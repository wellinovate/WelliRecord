import {
  createDependantService,
  getDependantService,
  listDependantsService,
  updateDependantService,
} from "./dependants_services.js";

export const createDependantController = async (req, res, next) => {
  try {
    const result = await createDependantService({
      payload: req.validated,
      authUser: req.user,
    });

    return res.status(201).json({
      success: true,
      message: "Dependant profile created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const listDependantsController = async (req, res, next) => {
  try {
    const result = await listDependantsService({ authUser: req.user });

    return res.status(200).json({
      success: true,
      message: "Dependants retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getDependantController = async (req, res, next) => {
  try {
    const { dependantId } = req.params;
    const result = await getDependantService({
      dependantId,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Dependant retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDependantController = async (req, res, next) => {
  try {
    const { dependantId } = req.params;
    const result = await updateDependantService({
      dependantId,
      payload: req.validated,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      message: "Dependant updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
