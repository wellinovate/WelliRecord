import express from "express";
import rateLimit from "express-rate-limit";
import { ingestInstrumentMessage } from "./lab_equipment_automation.js";

const router = express.Router();

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many messages. Slow down." } });

// An instrument or its interface software posts here with the analyzer's key in x-instrument-key.
// Plain-text HL7 is accepted as well as JSON.
router.post("/ingest", limiter, express.text({ type: ["text/plain", "application/hl7-v2"], limit: "1mb" }), async (req, res, next) => {
  try {
    const body = typeof req.body === "string" ? { hl7: req.body } : req.body;
    const data = await ingestInstrumentMessage({ keyHeader: req.get("x-instrument-key"), body });
    res.json({ success: true, data });
  } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    next(e);
  }
});

export default router;
