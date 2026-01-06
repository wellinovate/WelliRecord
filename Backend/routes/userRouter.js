import express from "express";

// import asyncHandler from '../utils/asyncHandler';
import multer from 'multer';
import {
  createUser,
  createUserProfile,
  editUserImage,
  fetchUserByEmail,
  generateOTP,
  loginUser,
  logoutUser,
  verifyOTP
} from "../controllers/userController.js";
import { getUserByEmail } from "../Models/userModel.js";


const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/users", createUser); // Register new user
router.post("/login", loginUser); // Login user
router.post("/logout", logoutUser); // Logout user
router.post('/initiate', generateOTP)
router.post('/verify-otp', verifyOTP)
router.put('/:userId/image', upload.single('file'), editUserImage);
router.get("/profile", fetchUserByEmail)




export default router;
