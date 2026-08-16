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
      data: queueItem,
    });
  } catch (error) {
    next(error);
  }
};

export const getQueueController = async (req, res, next) => {
  try {
    const result = await getQueueService({
      authUser: req.user,
      params: req.query,
    });

    return res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
      stats: result.stats,
    });
  } catch (error) {
    next(error);
  }
};

export const getQueueByIdController = async (req, res, next) => {
  try {
    const queueItem = await getQueueByIdService(req.params.queueId, req.user);

    return res.status(200).json({
      success: true,
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
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      data: queueItem,
    });
  } catch (error) {
    next(error);
  }
};

export const saveTriageController = async (req, res, next) => {
  try {
    const queueItem = await saveTriageService({
      queueId: req.params.queueId,
      ...req.body,
      triagedBy: req.user?.sub || null,
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
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
      authUser: req.user,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
