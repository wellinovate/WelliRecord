import express from "express";
import { getPatientsController } from "./controllers/getPatients.controller.js";
import { protect } from "../../auth/aut_middleware.js";

const router = express.Router();

router.get("/", protect, getPatientsController);

export default router;