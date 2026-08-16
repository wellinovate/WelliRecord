import {
  listTicketsAdminService,
  getTicketByIdService,
  updateTicketStatusService,
  updateTicketPriorityService,
  assignTicketService,
  addInternalNoteService,
  addTicketMessageService,
  getConsentActivityForTicketService,
} from "./support_ticket_service.js";

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

export const listTicketsAdminController = handle(async (req, res) => {
  const { status, userType } = req.query;
  const tickets = await listTicketsAdminService({ status, userType });
  res.status(200).json({ success: true, data: tickets });
});

export const getTicketAdminController = handle(async (req, res) => {
  const ticket = await getTicketByIdService({ authUser: req.user, ticketId: req.params.id });
  res.status(200).json({ success: true, data: ticket });
});

export const updateStatusController = handle(async (req, res) => {
  const ticket = await updateTicketStatusService({ ticketId: req.params.id, status: req.body.status });
  res.status(200).json({ success: true, data: ticket });
});

export const updatePriorityController = handle(async (req, res) => {
  const ticket = await updateTicketPriorityService({ ticketId: req.params.id, priority: req.body.priority });
  res.status(200).json({ success: true, data: ticket });
});

export const assignTicketController = handle(async (req, res) => {
  const ticket = await assignTicketService({
    ticketId: req.params.id,
    assigneeAccountId: req.user.sub,
    assigneeName: req.user.fullName,
  });
  res.status(200).json({ success: true, data: ticket });
});

export const unassignTicketController = handle(async (req, res) => {
  const ticket = await assignTicketService({
    ticketId: req.params.id,
    assigneeAccountId: null,
    assigneeName: null,
  });
  res.status(200).json({ success: true, data: ticket });
});

export const addInternalNoteController = handle(async (req, res) => {
  const ticket = await addInternalNoteService({
    authUser: req.user,
    ticketId: req.params.id,
    body: req.body.body,
  });
  res.status(200).json({ success: true, data: ticket });
});

export const adminReplyController = handle(async (req, res) => {
  const ticket = await addTicketMessageService({
    authUser: req.user,
    ticketId: req.params.id,
    body: req.body.body,
  });
  res.status(200).json({ success: true, data: ticket });
});

export const getConsentActivityController = handle(async (req, res) => {
  const events = await getConsentActivityForTicketService({ ticketId: req.params.id });
  res.status(200).json({ success: true, data: events });
});
