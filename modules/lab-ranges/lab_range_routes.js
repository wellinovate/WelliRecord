import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { listOverridesService, setOverrideService, removeOverrideService } from "./lab_range_service.js";

const router = express.Router();

// Only the organisation owner changes reference ranges. Staff with lab access can read them.
const orgOnly = async (req, res, next) => {
  try {
    const actor = await resolveActorContext(req.user);
    if (!actor.isOrganizationActor || !actor.organizationId) return res.status(403).json({ success: false, message: "Lab access requires an organisation account" });
    req.labOrg = { id: actor.organizationId, isOwner: Boolean(actor.isOrgOwner), name: actor.organizationName || "Owner" };
    next();
  } catch (e) {
    next(e);
  }
};
const ownerOnly = (req, res, next) =>
  req.labOrg?.isOwner ? next() : res.status(403).json({ success: false, message: "Only the organisation owner can change reference ranges." });

router.get("/", protect, restrictClinicalScope("lab-orders"), requirePermission("view_lab_orders"), orgOnly, async (req, res, next) => {
  try {
    res.json({ success: true, data: await listOverridesService(req.labOrg.id) });
  } catch (e) { next(e); }
});

router.put("/:testKey/:code", protect, restrictClinicalScope("lab-orders"), requirePermission("write_lab_results"), orgOnly, ownerOnly, async (req, res, next) => {
  try {
    const { ranges, reason } = req.body || {};
    const data = await setOverrideService({ organizationId: req.labOrg.id, testKey: req.params.testKey, code: req.params.code, ranges, reason, userName: req.labOrg.name });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.delete("/:testKey/:code", protect, restrictClinicalScope("lab-orders"), requirePermission("write_lab_results"), orgOnly, ownerOnly, async (req, res, next) => {
  try {
    res.json({ success: true, data: await removeOverrideService({ organizationId: req.labOrg.id, testKey: req.params.testKey, code: req.params.code }) });
  } catch (e) { next(e); }
});

export default router;
