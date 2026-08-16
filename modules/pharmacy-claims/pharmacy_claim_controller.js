import {
  createClaimService,
  listClaimsService,
  getClaimSummaryService,
  getClaimByIdService,
  updateClaimStatusService,
} from "./pharmacy_claim_service.js";

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }
    next(error);
  }
};

export const createClaimController = handle(async (req, res) => {
  const { patientId, orderIds, hmoName, hmoMemberId, claimAmount, notes } = req.body;
  const claim = await createClaimService({
    authUser: req.user,
    patientId,
    orderIds,
    hmoName,
    hmoMemberId,
    claimAmount,
    notes,
  });
  res.status(201).json({ success: true, data: claim });
});

export const listClaimsController = handle(async (req, res) => {
  const claims = await listClaimsService({ authUser: req.user, status: req.query.status });
  res.status(200).json({ success: true, data: claims });
});

export const getClaimSummaryController = handle(async (req, res) => {
  const summary = await getClaimSummaryService({ authUser: req.user });
  res.status(200).json({ success: true, data: summary });
});

export const getClaimByIdController = handle(async (req, res) => {
  const claim = await getClaimByIdService({ authUser: req.user, claimId: req.params.id });
  res.status(200).json({ success: true, data: claim });
});

export const updateClaimStatusController = handle(async (req, res) => {
  const { status, claimReference, rejectionReason, notes } = req.body;
  const claim = await updateClaimStatusService({
    authUser: req.user,
    claimId: req.params.id,
    status,
    claimReference,
    rejectionReason,
    notes,
  });
  res.status(200).json({ success: true, data: claim });
});
