// src/routes/provider.routes.js
import { Router } from "express";
import {
  createProviderController,
  getAllProvidersController,
  getOneProviderController,
} from "../controllers/providerController.js";

const router = Router();

router.post("/", createProviderController);
router.get("/", getAllProvidersController);
router.get("/:id", getOneProviderController);

export default router;
