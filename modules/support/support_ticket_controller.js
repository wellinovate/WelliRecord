import {
  createTicketService,
  getMyTicketsService,
  getTicketByIdService,
  addTicketMessageService,
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

export const createTicketController = handle(async (req, res) => {
  const { category, subject, description } = req.body;
  const ticket = await createTicketService({ authUser: req.user, category, subject, description });
  res.status(201).json({ success: true, data: ticket });
});

export const getMyTicketsController = handle(async (req, res) => {
  const tickets = await getMyTicketsService({ authUser: req.user, status: req.query.status });
  res.status(200).json({ success: true, data: tickets });
});

export const getTicketByIdController = handle(async (req, res) => {
  const ticket = await getTicketByIdService({ authUser: req.user, ticketId: req.params.id });
  res.status(200).json({ success: true, data: ticket });
});

export const replyToTicketController = handle(async (req, res) => {
  const ticket = await addTicketMessageService({
    authUser: req.user,
    ticketId: req.params.id,
    body: req.body.body,
  });
  res.status(200).json({ success: true, data: ticket });
});
