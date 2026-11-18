import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { restrictClinicalScope } from "../auth/clinical_scope_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import * as svc from "./lab_equipment_service.js";

const router = express.Router();
const read = [protect, restrictClinicalScope("lab-orders"), requirePermission("view_lab_orders")];
const write = [protect, restrictClinicalScope("lab-orders"), requirePermission("write_lab_results")];

const h = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e) {
    next(e);
  }
};
const u = (req) => req.user;

router.get("/summary", ...read, h((r) => svc.equipmentSummaryService(u(r))));

router.get("/analyzers", ...read, h((r) => svc.listAnalyzersService(u(r))));
router.post("/analyzers", ...write, h((r) => svc.createAnalyzerService({ payload: r.body, authUser: u(r) })));
router.patch("/analyzers/:id", ...write, h((r) => svc.updateAnalyzerService({ id: r.params.id, payload: r.body, authUser: u(r) })));
router.delete("/analyzers/:id", ...write, h((r) => svc.retireAnalyzerService({ id: r.params.id, authUser: u(r) })));
router.get("/analyzers/:id/events", ...read, h((r) => svc.listAnalyzerEventsService({ id: r.params.id, authUser: u(r) })));
router.post("/analyzers/:id/events", ...write, h((r) => svc.addAnalyzerEventService({ id: r.params.id, payload: r.body, authUser: u(r) })));

router.get("/analyzers/:id/qc", ...read, h((r) => svc.listQcRunsService({ id: r.params.id, query: r.query, authUser: u(r) })));
router.post("/analyzers/:id/qc", ...write, h((r) => svc.addQcRunService({ id: r.params.id, payload: r.body, authUser: u(r) })));

router.post("/analyzers/:id/ingest-key", ...write, h((r) => svc.createIngestKeyService({ id: r.params.id, authUser: u(r) })));
router.delete("/analyzers/:id/ingest-key", ...write, h((r) => svc.revokeIngestKeyService({ id: r.params.id, authUser: u(r) })));

router.get("/usage", ...read, h((r) => svc.listUsageService(u(r))));
router.put("/usage", ...write, h((r) => svc.setUsageService({ payload: r.body, authUser: u(r) })));
router.delete("/usage/:id", ...write, h((r) => svc.removeUsageService({ id: r.params.id, authUser: u(r) })));

router.get("/reagents", ...read, h((r) => svc.listReagentsService(u(r))));
router.post("/reagents", ...write, h((r) => svc.createReagentService({ payload: r.body, authUser: u(r) })));
router.patch("/reagents/:id", ...write, h((r) => svc.updateReagentService({ id: r.params.id, payload: r.body, authUser: u(r) })));
router.delete("/reagents/:id", ...write, h((r) => svc.retireReagentService({ id: r.params.id, authUser: u(r) })));
router.get("/reagents/:id/movements", ...read, h((r) => svc.listMovementsService({ id: r.params.id, authUser: u(r) })));
router.post("/reagents/:id/movements", ...write, h((r) => svc.addMovementService({ id: r.params.id, payload: r.body, authUser: u(r) })));

export default router;
