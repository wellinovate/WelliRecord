import { Encounter } from "../encounter/encounter_model.js";
import { labOrderModel } from "../lab-orders/lab_order_model.js";
import { medicationModel } from "../medications/medications_model.js";
import { Appointment } from "../appointments/appointment_model.js";
import { getMyOrganizationService } from "../organizations/verification_services.js";
import { AppError } from "../../shared/errors/AppError.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_RANGES = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Resolves the requesting account's organization the same way
 * requireOrgVerified does — org owners by accountId, staff by
 * profileId via their OrganizationMembership — so this works
 * consistently for both, not just the org owner.
 */
export const resolveReportingOrgId = async ({ accountId, profileId }) => {
  const profile = await getMyOrganizationService({ accountId, profileId });
  return profile._id;
};

/**
 * Turns a `range` query param ("7d"|"30d"|"90d") or explicit
 * `from`/`to` ISO dates into a concrete { from, to } window. Falls
 * back to 30 days if neither is given or `range` isn't recognised.
 */
export const resolveDateWindow = ({ range, from, to }) => {
  const now = new Date();

  if (from || to) {
    const resolvedTo = to ? new Date(to) : now;
    const resolvedFrom = from ? new Date(from) : new Date(resolvedTo.getTime() - 30 * DAY_MS);

    if (Number.isNaN(resolvedFrom.getTime()) || Number.isNaN(resolvedTo.getTime())) {
      throw new AppError("Invalid from/to date", 400, "INVALID_DATE_RANGE");
    }
    if (resolvedFrom > resolvedTo) {
      throw new AppError("from must be before to", 400, "INVALID_DATE_RANGE");
    }
    return { from: resolvedFrom, to: resolvedTo };
  }

  const days = VALID_RANGES[range] || 30;
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
};

const byDayPipeline = (match, dateField) => [
  { $match: match },
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, date: "$_id", count: 1 } },
];

export const getConsultationVolume = async ({ organizationId, from, to }) => {
  const match = { organizationId, startedAt: { $gte: from, $lte: to } };

  const [total, byDay, byType] = await Promise.all([
    Encounter.countDocuments(match),
    Encounter.aggregate(byDayPipeline(match, "startedAt")),
    Encounter.aggregate([
      { $match: match },
      { $group: { _id: "$encounterType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, encounterType: "$_id", count: 1 } },
    ]),
  ]);

  return { total, byDay, byType };
};

export const getLabOrderTrends = async ({ organizationId, from, to }) => {
  const match = { organizationId, createdAt: { $gte: from, $lte: to } };

  const [total, byDay, byCategory, byStatus] = await Promise.all([
    labOrderModel.countDocuments(match),
    labOrderModel.aggregate(byDayPipeline(match, "createdAt")),
    labOrderModel.aggregate([
      { $match: match },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, category: "$_id", count: 1 } },
    ]),
    labOrderModel.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]),
  ]);

  return { total, byDay, byCategory, byStatus };
};

// "Prescriptions" = medication entries a provider actually prescribed
// (source: provider/pharmacy), not a patient's own self-reported
// medication history (source: patient) — the two live in the same
// collection, so this filter is what separates them.
const PRESCRIPTION_SOURCES = ["provider", "pharmacy"];

export const getPrescriptionTrends = async ({ organizationId, from, to }) => {
  const match = {
    organizationId,
    source: { $in: PRESCRIPTION_SOURCES },
    createdAt: { $gte: from, $lte: to },
  };

  const [total, byDay, topMedications] = await Promise.all([
    medicationModel.countDocuments(match),
    medicationModel.aggregate(byDayPipeline(match, "createdAt")),
    medicationModel.aggregate([
      { $match: match },
      { $group: { _id: "$medicationName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, medicationName: "$_id", count: 1 } },
    ]),
  ]);

  return { total, byDay, topMedications };
};

export const getNoShowTracking = async ({ organizationId, from, to }) => {
  const match = { organizationId, scheduledFor: { $gte: from, $lte: to } };

  const [total, byStatus, byDayRaw] = await Promise.all([
    Appointment.countDocuments(match),
    Appointment.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]),
    Appointment.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$scheduledFor" } },
          total: { $sum: 1 },
          noShow: { $sum: { $cond: [{ $eq: ["$status", "no-show"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", total: 1, noShow: 1 } },
    ]),
  ]);

  const noShowCount = byStatus.find((s) => s.status === "no-show")?.count || 0;
  const noShowRate = total > 0 ? Number(((noShowCount / total) * 100).toFixed(1)) : 0;

  return { total, noShowCount, noShowRate, byStatus, byDay: byDayRaw };
};

export const getReportsOverviewService = async ({ accountId, profileId, range, from, to }) => {
  const organizationId = await resolveReportingOrgId({ accountId, profileId });
  const window = resolveDateWindow({ range, from, to });

  const [consultations, labOrders, prescriptions, noShows] = await Promise.all([
    getConsultationVolume({ organizationId, ...window }),
    getLabOrderTrends({ organizationId, ...window }),
    getPrescriptionTrends({ organizationId, ...window }),
    getNoShowTracking({ organizationId, ...window }),
  ]);

  return {
    range: { from: window.from.toISOString(), to: window.to.toISOString() },
    consultations,
    labOrders,
    prescriptions,
    noShows,
  };
};
