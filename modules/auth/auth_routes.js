import express from "express";

// import asyncHandler from '../utils/asyncHandler';
import multer from "multer";
import {
  validateLoginRequest,
  validateRegisterRequest,
} from "./auth_validator.js";
import { googleLoginController, login, register, resendVerificationEmailController, verifyEmailController } from "./auth_controller.js";
import { authRegisterLimiter, resendVerificationLimiter, verifyEmailLimiter } from "../../shared/utils/authRegisterLimiter.js";

const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/register", validateRegisterRequest, authRegisterLimiter, register);
router.post("/login", validateLoginRequest, login);
router.post("/google/login", googleLoginController);
router.get("/verify-email", verifyEmailLimiter, verifyEmailController);
router.post(
  "/resend-verification-email",
  resendVerificationLimiter,
  resendVerificationEmailController
);
// router.post("/logout", logoutUser); // Logout user
// router.put('/:userId/image', upload.single('file'), editUserImage);
// router.get("/profile/:Id",  getUserProfile);

export default router;
