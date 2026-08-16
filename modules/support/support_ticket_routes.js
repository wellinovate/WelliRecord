import express from "express";
import { protect } from "../auth/auth_middleware.js";
import {
  createTicketController,
  getMyTicketsController,
  getTicketByIdController,
  replyToTicketController,
} from "./support_ticket_controller.js";

const router = express.Router();

router.use(protect);

router.post("/tickets", createTicketController);
router.get("/tickets/mine", getMyTicketsController);
router.get("/tickets/:id", getTicketByIdController);
router.post("/tickets/:id/messages", replyToTicketController);

export default router;
