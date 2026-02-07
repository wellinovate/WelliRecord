import express from "express";

// import asyncHandler from '../utils/asyncHandler';
import multer from 'multer';
import {
  createUser,
  createUserProfile,
  editUserImage,
  loginUser,
  logoutUser,
  updateUserProfile
} from "../controllers/userController.js";


const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/users", createUser); // Register new user
router.post("/login", loginUser); // Login user
router.post("/logout", logoutUser); // Logout user
router.put('/:userId/image', upload.single('file'), editUserImage);
router.put("/profile", upload.single("img"), updateUserProfile);




export default router;
