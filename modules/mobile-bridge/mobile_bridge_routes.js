import express from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../auth/auth_middleware.js";
import { requireBridge } from "../../shared/utils/bridgeSignature.js";
import { createLinkCodeService, linkStatusService, unlinkService } from "./mobile_link_service.js";
import * as b from "./bridge_controller.js";

const limiter = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false });

// Website side: the signed-in patient makes a code, checks status, unlinks.
export const mobileLinkRouter = express.Router();
const next = (fn) => async (req, res, nx) => {
  try {
    res.json({ success: true, data: await fn({ authUser: req.user }) });
  } catch (e) {
    nx(e);
  }
};
mobileLinkRouter.post("/code", protect, limiter(10), next(createLinkCodeService));
mobileLinkRouter.get("/", protect, next(linkStatusService));
mobileLinkRouter.delete("/", protect, limiter(20), next(unlinkService));

// Mobile backend side: every route is signed. The mobile account id comes in the path.
export const bridgeRouter = express.Router();
bridgeRouter.use(requireBridge);
bridgeRouter.post("/link/claim", b.claim);
bridgeRouter.post("/link/revoke", b.revoke);
bridgeRouter.get("/patients/:mobileAccountId/appointments", b.appointments);
bridgeRouter.post("/patients/:mobileAccountId/appointments/:appointmentId/token", b.token);
bridgeRouter.get("/patients/:mobileAccountId/record-links", b.rlMine);
bridgeRouter.get("/patients/:mobileAccountId/record-links/claim/:token", b.rlInfo);
bridgeRouter.post("/patients/:mobileAccountId/record-links/claim/:token/otp", b.rlOtp);
bridgeRouter.post("/patients/:mobileAccountId/record-links/claim/:token/verify", b.rlVerify);
bridgeRouter.post("/patients/:mobileAccountId/record-links/claim/:token/consent", b.rlConsent);
bridgeRouter.post("/patients/:mobileAccountId/record-links/:id/withdraw", b.rlWithdraw);
