import {
  createReferralService,
  listSentReferralsService,
  listReceivedReferralsService,
  getReferralByIdService,
  updateReferralStatusService,
} from "./referral_service.js";

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

export const createReferralController = handle(async (req, res) => {
  const { patientId, receivingOrganizationId, specialty, urgency, reason, clinicalSummary } = req.body;
  const referral = await createReferralService({
    authUser: req.user,
    patientId,
    receivingOrganizationId,
    specialty,
    urgency,
    reason,
    clinicalSummary,
  });
  res.status(201).json({ success: true, data: referral });
});

export const listSentReferralsController = handle(async (req, res) => {
  const referrals = await listSentReferralsService({ authUser: req.user, status: req.query.status });
  res.status(200).json({ success: true, data: referrals });
});

export const listReceivedReferralsController = handle(async (req, res) => {
  const referrals = await listReceivedReferralsService({ authUser: req.user, status: req.query.status });
  res.status(200).json({ success: true, data: referrals });
});

export const getReferralByIdController = handle(async (req, res) => {
  const referral = await getReferralByIdService({ authUser: req.user, referralId: req.params.id });
  res.status(200).json({ success: true, data: referral });
});

export const updateReferralStatusController = handle(async (req, res) => {
  const { status, responseNote } = req.body;
  const referral = await updateReferralStatusService({
    authUser: req.user,
    referralId: req.params.id,
    status,
    responseNote,
  });
  res.status(200).json({ success: true, data: referral });
});
