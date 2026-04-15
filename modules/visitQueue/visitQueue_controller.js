import {
  createWalkInQueueService,
  getQueueService,
  getQueueByIdService,
  updateQueueStatusService,
  saveTriageService,
  startEncounterFromQueueService,
  completeQueueVisitService,
} from "./visitQueue_service.js";

export const createWalkInQueueController = async (req, res, next) => {
  try {
    const queueItem = await createWalkInQueueService({
      ...req.body,
      authUser: req.user,
      checkedInBy: req.user?.sub || null,
    });

    return res.status(201).json({
      success: true,
      message: "Walk-in added to queue successfully",
      data: queueItem,
    });
  } catch (error) {
    next(error);
  }
};

export const getQueueController = async (req, res, next) => {
  try {
    const result = await getQueueService(req.query);

    return res.status(200).json({
      success: true,
      message: "Queue fetched successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getQueueByIdController = async (req, res, next) => {
  try {
    const queueItem = await getQueueByIdService(req.params.queueId);

    return res.status(200).json({
      success: true,
      message: "Queue item fetched successfully",
      data: queueItem,
    });
  } catch (error) {
    next(error);
  }
};

export const updateQueueStatusController = async (req, res, next) => {
  try {
    const queueItem = await updateQueueStatusService({
      queueId: req.params.queueId,
      workflowStatus: req.body.workflowStatus,
      actorId: req.user?.sub || null,
    });

    return res.status(200).json({
      success: true,
      message: "Queue status updated successfully",
      data: queueItem,
    });
  } catch (error) {
    next(error);
  }
};

export const saveTriageController = async (req, res, next) => {
  console.log("🚀 ~ saveTriageController ~ req:", req.body)
  try {
    const queueItem = await saveTriageService({
      queueId: req.params.queueId,
      ...req.body,
      triagedBy: req.user?.sub || null,
    });

    return res.status(200).json({
      success: true,
      message: "Triage saved successfully",
      data: queueItem,
    });
  } catch (error) {
    next(error);
  }
};

export const startEncounterFromQueueController = async (req, res, next) => {
  try {
    const result = await startEncounterFromQueueService({
      queueId: req.params.queueId,
      authUser: req.user,
      startedBy: req.user?.sub || null,
    });

    return res.status(200).json({
      success: true,
      message: "Encounter started successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completeQueueVisitController = async (req, res, next) => {
  try {
    const result = await completeQueueVisitService({
      queueId: req.params.queueId,
      completedBy: req.user?.sub || null,
    });

    return res.status(200).json({
      success: true,
      message: "Visit completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};