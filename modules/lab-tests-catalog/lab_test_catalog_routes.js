import express from "express";
import { protect } from "../auth/auth_middleware.js";
import { listCatalogController, searchCatalogController } from "./lab_test_catalog_controller.js";

const router = express.Router();

router.get("/", protect, listCatalogController);
router.get("/search", protect, searchCatalogController);

export default router;
