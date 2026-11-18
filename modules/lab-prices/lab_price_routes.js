import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { LabPrice } from "./lab_price_model.js";
import { cleanPrice, priceKey } from "./lab_price_rules.js";

const router = express.Router();

const orgOnly = async (req, res, next) => {
  try {
    const actor = await resolveActorContext(req.user);
    if (!actor.isOrganizationActor || !actor.organizationId) return res.status(403).json({ success: false, message: "Lab access requires an organisation account" });
    req.labOrg = { id: actor.organizationId, isOwner: Boolean(actor.isOrgOwner), name: actor.organizationName || "Owner" };
    next();
  } catch (e) { next(e); }
};
const ownerOnly = (req, res, next) =>
  req.labOrg?.isOwner ? next() : res.status(403).json({ success: false, message: "Only the organisation owner can change prices." });

const read = [protect, restrictClinicalScope("lab-orders"), requirePermission("view_lab_orders"), orgOnly];
const write = [protect, restrictClinicalScope("lab-orders"), requirePermission("write_lab_results"), orgOnly, ownerOnly];

router.get("/", ...read, async (req, res, next) => {
  try {
    const rows = await LabPrice.find({ organizationId: req.labOrg.id }).sort({ testName: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.put("/", ...write, async (req, res, next) => {
  try {
    const { value, errors } = cleanPrice(req.body || {});
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(" ") });
    const row = await LabPrice.findOneAndUpdate(
      { organizationId: req.labOrg.id, key: value.key },
      { $set: { ...value, updatedByName: req.labOrg.name } },
      { upsert: true, new: true },
    ).lean();
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
});

router.delete("/:id", ...write, async (req, res, next) => {
  try {
    await LabPrice.deleteOne({ _id: req.params.id, organizationId: req.labOrg.id });
    res.json({ success: true, data: { removed: true } });
  } catch (e) { next(e); }
});

export default router;
export { priceKey };
