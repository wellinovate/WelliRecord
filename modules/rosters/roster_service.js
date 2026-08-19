import { rosterModel } from "./roster_model.js";
import { dutyAssignmentModel, LATE_GRACE_MINUTES } from "./duty_assignment_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { getIO } from "../../shared/realtime/socket.js";

// Org-scoped broadcast, matching the org:<id> room pattern already
// verified end-to-end for lab_order_change / pharmacy_order_change
// (commit 8a238af, scripts/test-socket.cjs).
const broadcast = (organizationId, eventName, payload) => {
  const io = getIO();
  if (!io) return;
  io.to(`org:${organizationId}`).emit(eventName, payload);
};

const serializeRoster = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  title: item.title,
  periodStart: item.periodStart,
  periodEnd: item.periodEnd,
  status: item.status,
  createdBy: item.createdBy,
  reviewedBy: item.reviewedBy,
  publishedBy: item.publishedBy,
  publishedAt: item.publishedAt,
  notes: item.notes,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeAssignment = (item) => ({
  id: item._id,
  organizationId: item.organizationId,
  rosterId: item.rosterId,
  staffId: item.staffId,
  staffRole: item.staffRole,
  duty: item.duty,
  location: item.location,
  date: item.date,
  startTime: item.startTime,
  endTime: item.endTime,
  status: item.status,
  backupStaffId: item.backupStaffId,
  cancelReason: item.cancelReason,
  notes: item.notes,
  checkedInAt: item.checkedInAt,
  checkInMethod: item.checkInMethod,
  checkInLocation: item.checkInLocation,
  checkInQrCode: item.checkInQrCode,
  checkedOutAt: item.checkedOutAt,
  lateByMinutes: item.lateByMinutes,
  overtimeMinutes: item.overtimeMinutes,
  missedCheckOut: item.missedCheckOut,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

// Same resolution used in getAllLabOrdersService — wrOrgId on the
// authenticated user maps to the OrganizationProfile record.
const resolveOrganization = async (authUser) => {
  const wrOrgId = authUser?.wrOrgId || null;
  const organization = await OrganizationProfile.findOne({ wrOrgId });
  if (!organization) {
    const err = new Error("Organization not found for this account");
    err.statusCode = 404;
    throw err;
  }
  return organization;
};

const getOwnedRosterOrThrow = async (id, organizationId) => {
  const roster = await rosterModel.findOne({ _id: id, organizationId });
  if (!roster) {
    const err = new Error("Roster not found");
    err.statusCode = 404;
    throw err;
  }
  return roster;
};

export const createRosterService = async ({ payload, authUser }) => {
  const organization = await resolveOrganization(authUser);

  const roster = await rosterModel.create({
    organizationId: organization._id,
    title: payload.title,
    department: payload.department || "General / All Departments",
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    notes: payload.notes || undefined,
    createdBy: authUser?.sub,
  });

  return serializeRoster(roster);
};

export const getAllRostersService = async ({ page = 1, limit = 20, authUser }) => {
  const organization = await resolveOrganization(authUser);

  const skip = (page - 1) * limit;
  const filter = { organizationId: organization._id };

  const [items, total] = await Promise.all([
    rosterModel.find(filter).sort({ periodStart: -1 }).skip(skip).limit(limit).lean(),
    rosterModel.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeRoster),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getRosterService = async ({ id, authUser }) => {
  const organization = await resolveOrganization(authUser);
  const roster = await getOwnedRosterOrThrow(id, organization._id);

  const assignments = await dutyAssignmentModel
    .find({ rosterId: roster._id })
    .populate("staffId", "firstName fullName lastName")
    .populate("backupStaffId", "firstName fullName lastName")
    .sort({ date: 1, startTime: 1 })
    .lean();

  return {
    ...serializeRoster(roster),
    assignments: assignments.map(serializeAssignment),
  };
};

// Assignments can only be added or edited while the roster is in draft
// or review. Once published, changes go through the exception/swap flow
// (phase 4) so there's always an audit trail instead of a silent edit.
const assertEditable = (roster) => {
  if (!["draft", "review"].includes(roster.status)) {
    const err = new Error(
      `Cannot modify assignments on a roster with status "${roster.status}". Use the exception flow instead.`,
    );
    err.statusCode = 409;
    throw err;
  }
};

export const addDutyAssignmentService = async ({ rosterId, payload, authUser }) => {
  const organization = await resolveOrganization(authUser);
  const roster = await getOwnedRosterOrThrow(rosterId, organization._id);
  assertEditable(roster);

  const assignment = await dutyAssignmentModel.create({
    organizationId: organization._id,
    rosterId: roster._id,
    staffId: payload.staffId,
    staffRole: payload.staffRole,
    duty: payload.duty,
    location: payload.location,
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    backupStaffId: payload.backupStaffId || undefined,
    notes: payload.notes || undefined,
  });

  return serializeAssignment(assignment);
};

export const updateDutyAssignmentService = async ({ id, payload, authUser }) => {
  const organization = await resolveOrganization(authUser);

  const assignment = await dutyAssignmentModel.findOne({ _id: id, organizationId: organization._id });
  if (!assignment) {
    const err = new Error("Duty assignment not found");
    err.statusCode = 404;
    throw err;
  }

  const roster = await getOwnedRosterOrThrow(assignment.rosterId, organization._id);
  assertEditable(roster);

  Object.assign(assignment, payload);
  await assignment.save();

  return serializeAssignment(assignment);
};

// Cancellation is allowed on published/active rosters — it's the
// documented exception path, distinct from editing a draft cell.
export const cancelDutyAssignmentService = async ({ id, payload, authUser }) => {
  const organization = await resolveOrganization(authUser);

  const assignment = await dutyAssignmentModel.findOne({ _id: id, organizationId: organization._id });
  if (!assignment) {
    const err = new Error("Duty assignment not found");
    err.statusCode = 404;
    throw err;
  }

  assignment.status = "cancelled";
  assignment.cancelReason = payload.reason;
  await assignment.save();

  const serialized = serializeAssignment(assignment);
  broadcast(organization._id, "duty_assignment_change", {
    operationType: "cancel",
    assignmentId: assignment._id,
    assignment: serialized,
  });

  return serialized;
};

export const publishRosterService = async ({ id, authUser }) => {
  const organization = await resolveOrganization(authUser);
  const roster = await getOwnedRosterOrThrow(id, organization._id);

  if (!["draft", "review"].includes(roster.status)) {
    const err = new Error(`Roster with status "${roster.status}" cannot be published`);
    err.statusCode = 409;
    throw err;
  }

  roster.status = "published";
  roster.publishedBy = authUser?.sub;
  roster.publishedAt = new Date();
  await roster.save();

  const serialized = serializeRoster(roster);
  broadcast(organization._id, "roster_published", { roster: serialized });

  return serialized;
};

// Combines an assignment's date + startTime/endTime into real Date
// objects. Duty windows that cross midnight (e.g. night call, 20:00 to
// 08:00) are handled by rolling endTime to the next day when it's
// numerically earlier than startTime.
const resolveShiftWindow = (assignment) => {
  const [startH, startM] = assignment.startTime.split(":").map(Number);
  const [endH, endM] = assignment.endTime.split(":").map(Number);

  const start = new Date(assignment.date);
  start.setHours(startH, startM, 0, 0);

  const end = new Date(assignment.date);
  end.setHours(endH, endM, 0, 0);
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
};

export const checkInDutyAssignmentService = async ({ id, payload, authUser }) => {
  const organization = await resolveOrganization(authUser);

  const assignment = await dutyAssignmentModel.findOne({ _id: id, organizationId: organization._id });
  if (!assignment) {
    const err = new Error("Duty assignment not found");
    err.statusCode = 404;
    throw err;
  }

  // Self-service check-in only, for now: the staff member checking in
  // must be the staff member assigned. A supervisor override endpoint
  // (check someone else in, with a reason logged) is a separate
  // concern, not folded into this one — don't silently allow it here.
  if (String(assignment.staffId) !== String(authUser?.sub)) {
    const err = new Error("You can only check yourself in for your own duty assignment");
    err.statusCode = 403;
    throw err;
  }

  if (assignment.checkedInAt) {
    const err = new Error("Already checked in for this assignment");
    err.statusCode = 409;
    throw err;
  }

  if (assignment.status === "cancelled") {
    const err = new Error("Cannot check in to a cancelled assignment");
    err.statusCode = 409;
    throw err;
  }

  const now = new Date();
  const { start } = resolveShiftWindow(assignment);
  const minutesLate = Math.max(0, Math.round((now - start) / 60000) - LATE_GRACE_MINUTES);

  assignment.checkedInAt = now;
  assignment.checkInMethod = payload.method;
  assignment.checkInQrCode = payload.qrCode || null;
  if (payload.method === "geofence") {
    assignment.checkInLocation = { latitude: payload.latitude, longitude: payload.longitude };
  }
  assignment.lateByMinutes = minutesLate;
  assignment.status = minutesLate > 0 ? "late" : "checked-in";

  await assignment.save();

  const serialized = serializeAssignment(assignment);
  broadcast(organization._id, "duty_assignment_change", {
    operationType: "check-in",
    assignmentId: assignment._id,
    assignment: serialized,
  });

  return serialized;
};

export const checkOutDutyAssignmentService = async ({ id, payload, authUser }) => {
  const organization = await resolveOrganization(authUser);

  const assignment = await dutyAssignmentModel.findOne({ _id: id, organizationId: organization._id });
  if (!assignment) {
    const err = new Error("Duty assignment not found");
    err.statusCode = 404;
    throw err;
  }

  if (String(assignment.staffId) !== String(authUser?.sub)) {
    const err = new Error("You can only check yourself out for your own duty assignment");
    err.statusCode = 403;
    throw err;
  }

  if (!assignment.checkedInAt) {
    const err = new Error("Cannot check out before checking in");
    err.statusCode = 409;
    throw err;
  }

  if (assignment.checkedOutAt) {
    const err = new Error("Already checked out for this assignment");
    err.statusCode = 409;
    throw err;
  }

  const now = new Date();
  const { end } = resolveShiftWindow(assignment);
  const overtimeMinutes = Math.max(0, Math.round((now - end) / 60000));

  assignment.checkedOutAt = now;
  assignment.overtimeMinutes = overtimeMinutes;
  assignment.missedCheckOut = false;
  assignment.status = "completed";
  if (payload.notes) {
    assignment.notes = payload.notes;
  }

  await assignment.save();

  const serialized = serializeAssignment(assignment);
  broadcast(organization._id, "duty_assignment_change", {
    operationType: "check-out",
    assignmentId: assignment._id,
    assignment: serialized,
  });

  return serialized;
};
