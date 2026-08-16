import { SupportTicket, SLA_HOURS } from "./support_ticket_model.js";
import { getMyOrganizationService } from "../organizations/verification_services.js";
import { accessGrantModel } from "../access/access_grant_model.js";
import { AppError } from "../../shared/errors/AppError.js";

const generateTicketRef = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  const startOfDay = new Date(year, today.getMonth(), today.getDate());
  const endOfDay = new Date(year, today.getMonth(), today.getDate() + 1);

  const count = await SupportTicket.countDocuments({
    createdAt: { $gte: startOfDay, $lt: endOfDay },
  });

  const sequence = String(count + 1).padStart(3, "0");
  return `WR-T-${dateStr}-${sequence}`;
};

const ALLOWED_CATEGORIES = [
  "records_issue",
  "access_issue",
  "billing",
  "sync_issue",
  "integration",
  "other",
];

export const createTicketService = async ({ authUser, category, subject, description }) => {
  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw new AppError("Invalid category", 400, "INVALID_CATEGORY");
  }
  if (!subject?.trim() || !description?.trim()) {
    throw new AppError("Subject and description are required", 400, "MISSING_FIELDS");
  }

  const userType = authUser.role === "patient" ? "patient" : "provider";
  const submittedByName = authUser.fullName || "Unknown";

  let facility = null;
  if (userType === "provider") {
    try {
      const org = await getMyOrganizationService({
        accountId: authUser.sub,
        profileId: authUser.profileId,
      });
      facility = org.organizationName;
    } catch {
      // No resolvable organization (shouldn't normally happen for a
      // provider-side account) — leave facility unset rather than
      // fail ticket creation over it.
      facility = null;
    }
  }

  const ref = await generateTicketRef();

  const ticket = await SupportTicket.create({
    ref,
    category,
    subject: subject.trim(),
    description: description.trim(),
    userType,
    submittedByAccountId: authUser.sub,
    submittedByProfileId: userType === "patient" ? authUser.profileId || null : null,
    submittedByName,
    facility,
    messages: [
      {
        sender: "user",
        senderAccountId: authUser.sub,
        senderName: submittedByName,
        body: description.trim(),
      },
    ],
  });

  return ticket;
};

export const getMyTicketsService = async ({ authUser, status }) => {
  const query = { submittedByAccountId: authUser.sub };
  if (status) query.status = status;
  return SupportTicket.find(query).sort({ updatedAt: -1 }).lean();
};

const assertCanView = (ticket, authUser) => {
  const isOwner = String(ticket.submittedByAccountId) === String(authUser.sub);
  const isAdmin = authUser.role === "admin" || authUser.role === "super_admin";
  if (!isOwner && !isAdmin) {
    throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");
  }
};

export const getTicketByIdService = async ({ authUser, ticketId }) => {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");
  assertCanView(ticket, authUser);
  return ticket;
};

// Used by both the submitter (replying on their own ticket) and
// support staff (replying via the admin desk) — `sender` is derived
// from the caller's role, not taken from the request body.
export const addTicketMessageService = async ({ authUser, ticketId, body }) => {
  if (!body?.trim()) {
    throw new AppError("Message body is required", 400, "MISSING_BODY");
  }

  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");

  const isAdmin = authUser.role === "admin" || authUser.role === "super_admin";
  assertCanView(ticket, authUser);

  ticket.messages.push({
    sender: isAdmin ? "support" : "user",
    senderAccountId: authUser.sub,
    senderName: authUser.fullName || (isAdmin ? "Support" : "User"),
    body: body.trim(),
  });

  // A reply from support on an open ticket moves it into progress —
  // matches the status the admin desk mock treated as the "someone is
  // actively working this" state. A user's own reply doesn't change
  // status; only support action does.
  if (isAdmin && ticket.status === "open") {
    ticket.status = "in_progress";
  }

  await ticket.save();
  return ticket;
};

// --- Admin / support desk operations ---

export const listTicketsAdminService = async ({ status, userType }) => {
  const query = {};
  if (status) query.status = status;
  if (userType) query.userType = userType;
  return SupportTicket.find(query).sort({ createdAt: -1 }).lean();
};

export const updateTicketStatusService = async ({ ticketId, status }) => {
  const VALID = ["open", "in_progress", "resolved", "closed", "escalated"];
  if (!VALID.includes(status)) {
    throw new AppError("Invalid status", 400, "INVALID_STATUS");
  }
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    { status },
    { new: true },
  );
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");
  return ticket;
};

export const updateTicketPriorityService = async ({ ticketId, priority }) => {
  if (!SLA_HOURS[priority]) {
    throw new AppError("Invalid priority", 400, "INVALID_PRIORITY");
  }
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");

  ticket.priority = priority;
  // SLA is measured from when the ticket was originally filed, not
  // from the moment it's triaged — re-prioritizing a ticket that's
  // already been sitting for a while shouldn't hand it a fresh clock.
  const deadline = new Date(ticket.createdAt);
  deadline.setHours(deadline.getHours() + SLA_HOURS[priority]);
  ticket.slaDeadline = deadline;

  await ticket.save();
  return ticket;
};

export const assignTicketService = async ({ ticketId, assigneeAccountId, assigneeName }) => {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    { assigneeAccountId: assigneeAccountId || null, assigneeName: assigneeName || null },
    { new: true },
  );
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");
  return ticket;
};

export const addInternalNoteService = async ({ authUser, ticketId, body }) => {
  if (!body?.trim()) {
    throw new AppError("Note body is required", 400, "MISSING_BODY");
  }
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");

  ticket.internalNotes.push({
    authorAccountId: authUser.sub,
    authorName: authUser.fullName || "Support",
    body: body.trim(),
  });

  await ticket.save();
  return ticket;
};

// Real (not fabricated) diagnostic context for a patient-filed ticket:
// their actual consent grant/revoke history. There's no equivalent
// "sync status" or "device history" concept anywhere in the platform
// today — no session/device tracking table, no multi-source sync
// pipeline — so those panels from the original mock aren't rebuilt
// here rather than backing them with data that doesn't exist.
export const getConsentActivityForTicketService = async ({ ticketId }) => {
  const ticket = await SupportTicket.findById(ticketId).select("userType submittedByProfileId").lean();
  if (!ticket) throw new AppError("Ticket not found", 404, "TICKET_NOT_FOUND");

  if (ticket.userType !== "patient" || !ticket.submittedByProfileId) {
    return [];
  }

  const grants = await accessGrantModel
    .find({ patientId: ticket.submittedByProfileId })
    .populate("granteeOrganizationId", "organizationName")
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();

  const events = [];
  for (const g of grants) {
    const providerName = g.granteeOrganizationId?.organizationName || "Unknown provider";
    if (g.reviewedAt) {
      events.push({ event: "Consent granted", at: g.reviewedAt, provider: providerName });
    }
    if (g.revokedAt) {
      events.push({ event: "Consent revoked", at: g.revokedAt, provider: providerName });
    }
  }

  return events.sort((a, b) => new Date(b.at) - new Date(a.at));
};
