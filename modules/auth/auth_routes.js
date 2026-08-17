import express from "express";

// import asyncHandler from '../utils/asyncHandler';
import multer from "multer";
import {
  validateLoginRequest,
  validateRegisterRequest,
} from "./auth_validator.js";
import { forgotPasswordController, googleLoginController, login, loginController, register, resendLoginOtpController, resendVerificationEmailController, resetPasswordController, verifyEmailController } from "./auth_controller.js";
import { authRegisterLimiter, forgotPasswordLimiter, loginLimiter, resendVerificationLimiter, resetPasswordLimiter, verifyEmailLimiter } from "../../shared/utils/authRegisterLimiter.js";

const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/register", validateRegisterRequest,  register);
router.post("/login", loginLimiter, validateLoginRequest,  loginController);
router.post("/login/verify-code", login);
router.post("/resend-verify-code", resendLoginOtpController);
router.post("/google/login", googleLoginController);
router.post("/forgot-password", forgotPasswordLimiter, forgotPasswordController);
router.post("/reset-password", resetPasswordLimiter, resetPasswordController);
router.post("/verify-email", verifyEmailLimiter, verifyEmailController);
router.post(
  "/resend-verification-email",
  resendVerificationLimiter,
  resendVerificationEmailController
);
// router.post("/logout", logoutUser); // Logout user
// router.put('/:userId/image', upload.single('file'), editUserImage);
// router.get("/profile/:Id",  getUserProfile);

export default router;
