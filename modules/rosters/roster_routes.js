import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createRosterController,
  getAllRostersController,
  getRosterController,
  addDutyAssignmentController,
  updateDutyAssignmentController,
  cancelDutyAssignmentController,
  publishRosterController,
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

// NOTE: lab_order_routes.js and pharmacy_order_routes.js gate every route
// with restrictClinicalScope("lab-orders" / "pharmacy-orders"). Roster
// data isn't clinical in the same sense (it's staffing, not patient
// data), so it may need its own scope key — e.g. restrictClinicalScope
// isn't necessarily the right guard here. Using `protect` alone below;
// swap in whatever the equivalent non-clinical permission check is
// before this goes past internal testing.

const router = express.Router();

router.post("/", protect, validate(createRosterSchema), createRosterController);
router.get("/", protect, getAllRostersController);
router.get("/:id", protect, getRosterController);
router.post(
  "/:id/publish",
  protect,
  publishRosterController,
);

router.post(
  "/:id/assignments",
  protect,
  validate(createDutyAssignmentSchema),
  addDutyAssignmentController,
);

router.patch(
  "/assignments/:assignmentId",
  protect,
  validate(updateDutyAssignmentSchema),
  updateDutyAssignmentController,
);

router.patch(
  "/assignments/:assignmentId/cancel",
  protect,
  validate(cancelDutyAssignmentSchema),
  cancelDutyAssignmentController,
);

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
