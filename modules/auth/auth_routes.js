import express from "express";

// import asyncHandler from '../utils/asyncHandler';
import multer from 'multer';
import { validateLoginRequest, validateRegisterRequest } from "./auth_validator.js";
import { login, register } from "./auth_controller.js";



const storage = multer.memoryStorage();
const upload = multer({ storage });
const router = express.Router();

router.post("/register", validateRegisterRequest, register);
router.post("/login", validateLoginRequest, login);
// router.post("/logout", logoutUser); // Logout user
// router.put('/:userId/image', upload.single('file'), editUserImage);
// router.get("/profile/:Id",  getUserProfile);




export default router;







