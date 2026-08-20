import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { requirePermission } from "../team/require_permission_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createRosterController,
  getAllRostersController,
  getRosterController,
  publishRosterController,
  addDutyAssignmentController,
  updateDutyAssignmentController,
  cancelDutyAssignmentController,
  checkInDutyAssignmentController,
  checkOutDutyAssignmentController,
} from "./roster_controller.js";
import {
  createRosterSchema,
  createDutyAssignmentSchema,
  updateDutyAssignmentSchema,
  cancelDutyAssignmentSchema,
  checkInSchema,
  checkOutSchema,
} from "./roster_validation.js";

// Read access (view_roster) is granted to every clinical/operational
// role by default — seeing the schedule you're on isn't sensitive the
// way editing it is. Write access (manage_roster) defaults to
// frontdesk only, matching its existing ownership of
// manage_appointments/manage_queue. Adjust ROLE_DEFAULTS in
// permission_registry.js if that split doesn't match how staffing is
// actually managed at a given organization — these are defaults, not
// a hardcoded rule, and any role can be granted manage_roster via a
// per-member override without a code change.

const router = express.Router();

router.post("/", protect, requirePermission("manage_roster"), validate(createRosterSchema), createRosterController);
router.get("/", protect, requirePermission("view_roster"), getAllRostersController);
router.get("/:id", protect, requirePermission("view_roster"), getRosterController);
router.post(
  "/:id/publish",
  protect,
  requirePermission("manage_roster"),
  publishRosterController,
);

router.post(
  "/:id/assignments",
  protect,
  requirePermission("manage_roster"),
  validate(createDutyAssignmentSchema),
  addDutyAssignmentController,
);

router.patch(
  "/assignments/:assignmentId",
  protect,
  requirePermission("manage_roster"),
  validate(updateDutyAssignmentSchema),
  updateDutyAssignmentController,
);

router.patch(
  "/assignments/:assignmentId/cancel",
  protect,
  requirePermission("manage_roster"),
  validate(cancelDutyAssignmentSchema),
  cancelDutyAssignmentController,
);

// Check-in/check-out are deliberately NOT gated on manage_roster — see
// the self-service ownership check inside checkInDutyAssignmentService
// / checkOutDutyAssignmentService. Any staff member needs to be able
// to check themselves in for their own assigned duty regardless of
// whether they can edit the roster itself.
router.post(
  "/assignments/:assignmentId/check-in",
  protect,
  validate(checkInSchema),
  checkInDutyAssignmentController,
);

router.post(
  "/assignments/:assignmentId/check-out",
  protect,
  validate(checkOutSchema),
  checkOutDutyAssignmentController,
);

export default router;
