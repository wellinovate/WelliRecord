import express from "express";

// import asyncHandler from '../utils/asyncHandler';
import {
  validateLoginRequest,
  validateRegisterRequest,
} from "./auth_validator.js";
import { forgotPasswordController, googleLoginController, login, loginController, register, resendLoginOtpController, resendVerificationEmailController, resetPasswordController, verifyEmailController } from "./auth_controller.js";
import { authRegisterLimiter, forgotPasswordLimiter, loginLimiter, resendVerificationLimiter, resetPasswordLimiter, verifyEmailLimiter } from "../../shared/utils/authRegisterLimiter.js";

// The `upload` instance that used to live here had no size/type
// limits and nothing in this router actually uses it (the one call
// site below is commented out) — removed rather than fixed in place.
// If a route here needs file upload later, pull createUpload from
// shared/middlewares/upload.js the way users_routes.js and
// organizations_routes.js do.
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
