import express from "express";
import { onboardUser, getVC } from "../controllers/welliidController.js";

const router = express.Router();

// router.post("/onboard", onboardUser);
router.post("/onboard", onboardUser);
router.get("/vc/:did", getVC);

export default router;
