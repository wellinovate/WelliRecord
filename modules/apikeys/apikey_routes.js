import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { validate } from "../../shared/middlewares/validator.js";
import {
  createApiKeyController,
  listApiKeysController,
  revokeApiKeyController,
} from "./apikey_controller.js";
import { createApiKeySchema } from "./apikey_validation.js";

const router = express.Router();

router.post("/", protect, validate(createApiKeySchema), createApiKeyController);
router.get("/", protect, listApiKeysController);
router.delete("/:keyId", protect, revokeApiKeyController);

export default router;
