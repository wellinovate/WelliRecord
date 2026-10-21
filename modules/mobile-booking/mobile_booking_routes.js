import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../auth/auth_middleware.js";
import { getServiceService, listVisitsService, saveServiceService, visitActionService } from "./mobile_booking_service.js";

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const h = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e) {
    if (e?.opensAt) return res.status(e.statusCode || 409).json({ success: false, message: e.message, code: e.code, opensAt: e.opensAt });
    next(e);
  }
};

router.use(protect, limiter);
router.get("/service", h((req) => getServiceService({ authUser: req.user })));
router.put("/service", h((req) => saveServiceService({ authUser: req.user, body: req.body })));
router.get("/visits", h((req) => listVisitsService({ authUser: req.user })));
for (const action of ["confirm", "cancel", "hmo", "video-token"]) {
  router.post(`/visits/:id/${action}`, h((req) => visitActionService({ authUser: req.user, id: req.params.id, action, body: req.body })));
}

export default router;
