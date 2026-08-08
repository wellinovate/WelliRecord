import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createDependantController,
  getDependantController,
  listDependantsController,
  updateDependantController,
} from "./dependants_controller.js";
import {
  createDependantSchema,
  updateDependantSchema,
} from "./dependants_validation.js";

const router = express.Router();

router.post(
  "/",
  protect,
  validate(createDependantSchema),
  createDependantController,
);

router.get("/", protect, listDependantsController);

router.get("/:dependantId", protect, getDependantController);

router.patch(
  "/:dependantId",
  protect,
  validate(updateDependantSchema),
  updateDependantController,
);

export default router;
