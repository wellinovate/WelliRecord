import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import { Readable } from "stream";
import {
  deleteUserByEmail,
  getUserByEmail,
  getUsers,
  updateUserByEmail,
  userModel,
} from "../Models/userModel.js";
import { sendSMSNG } from "./notification.js";
import { OTPModel } from "../Models/otpModel.js";

// Helper function to generate JWT token
const generateToken = (user) => {

  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      manager: user.manager,
      admin: user.admin,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "1d" }
  );
};


export const createUserProfile = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      phone,
    } = req.body;
    console.log("🚀 ~ createUserProfile ~ referralEmail:", referralEmail);

    if (!email || !password || !phone || !name) {
      res.status(400).json({
        error:
          "Email, password, phone, name, image and telegramId are required",
      });
      return;
    }

    const existingUser = await getUserByEmail(email);

    console.log("🚀 ~ createUserProfile ~ existingUser:", existingUser);

    if (existingUser) {
      res.status(400).json({ error: "User with this Email already exists." });
      return;
    }

    const newUser = new userModel({
      email,
      password,
      name,
      phone,
      img: image,
    });

    await newUser.save();

    const { password: _, ...userData } = newUser.toObject();

    // Respond with the newly created user profile
    res.status(201).json(userData);
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log("🚀 ~ createUserProfile ~ error.message:", error.message);
  }
};


// Helper function for standard error response
const sendError = (res, status, message) => {
  return res.status(status).json({ success: false, message });
};

// Helper function for standard success response
const sendSuccess = (res, status, data, message = null) => {
  const response = { success: true, data };
  if (message) response.message = message;
  return res.status(status).json(response);
};

// CREATE: Register a new user (POST /api/users)
export const createUser = async (req, res) => {
  try {
    const { firstName, middleName, lastName, username, email, password, gender, phone, homeAddress, img, admin } = req.body;
    console.log("🚀 ~ createUser ~ firstName, middleName, lastName, username, email, password, gender, phone, homeAddress, img, admin:", firstName, middleName, lastName, username, email, password, gender, phone, homeAddress, img, admin)

    // Basic validation (expand with Joi or similar if needed)
    if (!firstName || !lastName || !username || !email || !password || !gender || !phone || !homeAddress) {
      return sendError(res, 400, 'Missing required fields');
    }

    // Check if user already exists by email or username
    const existingUser = await userModel.findOne({ $or: [{ email }, { username }] });
    console.log("🚀 ~ createUser ~ existingUser:", existingUser)
    if (existingUser) {
      return sendError(res, 409, 'User with this email or username already exists');
    }

    // Create user (pre-save hooks will hash password and generate referralCode if applicable)
    const newUser = new userModel({
      firstName,
      middleName: middleName || '',
      lastName,
      username,
      email,
      password, // Plain text; will be hashed
      gender,
      phone,
      homeAddress,
      img: img || '',
      admin: admin || false,
    });

    await newUser.save();

    // Exclude sensitive fields like password from response
    const { password: _, ...userWithoutPassword } = newUser;

    // return sendSuccess(res, 201, userWithoutPassword, 'User created successfully');
    res.status(201).json({message: 'User created successfully'});
  } catch (error) {
    console.error('Create User Error:', error);
    return sendError(res, 500, 'Server error while creating user');
  }
};

// Login user (with JWT token generation)
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🚀 ~ loginUser ~ email:", email)

    if (!email || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    // Find the user by username
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // if (!user.isVerified) {
    //   return res.status(404).json({ message: "User not Verified" });
    // }

    // Check if password is correct
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Send the token via a secure, HttpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production", // Only set cookies over HTTPS in production
      secure: true,
      sameSite: "none", // This helps mitigate CSRF attacks
      maxAge: 24 * 60 * 60 * 1000,
    });

    const { password: _, ...userData } = user.toObject(); // Destructure and remove the password field

    // Send the user data along with the JWT token
    res.status(200).json({
      message: "Login successful",
      user: userData, // Send user data without the password field
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Logout user
export const logoutUser = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Secure cookie in production
    sameSite: "Strict", // SameSite to avoid CSRF
  });

  res.status(200).json({ message: "Logged out successfully" });
};


export const generateOTP = async(req, res)=>{
  console.log('req body', req.body)
  const {email} = req.body
  console.log("🚀 ~ loginUser ~ email:", email)

    if(!email){
    res.status(401).json({
      error:'email is required'
    })
  }

  const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

      // generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    //save otp into the database
     const newOTP = new OTPModel({ email, otp })
      await newOTP.save();

      await sendSMSNG(user.phone, otp)
      res.status(200).json({
        success: true,
        mesage: `otp sent successfully`
      })
}

export const verifyOTP = async (req, res) => {
  try {
    const {email, otp} = req.body
    const otpData = await OTPModel.findOne({email});
    if(!otpData){
      console.error('user with this otp not found')
      res.status(401).json({message: 'user with this otp not found'})
    }

    if(otpData.otp===otp){
      console.error('successful')
      res.status(200).json({message: 'successful'})
    }else{
      console.error('Wrong otp')
      res.status(402).json({error: 'Wrong otp'})
    }
  } catch (error) {
    console.error('OTP verification error: ', error)
  }
}

cloudinary.config({
  cloud_name: "",
  api_key: "",
  api_secret: "",
});

const bufferToStream = (buffer) => {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

export const editUserImage = async (req, res) => {
  const userId = req.params.userId;

  try {
    const user = await userModel.findById({_id:userId});
    if (!user) return res.status(404).json({ message: "User not found" });

    // 1. Delete old image from Cloudinary (if exists)
    if (user.imagePublicId) {
      await cloudinary.uploader.destroy(user.imagePublicId);
    }

    // 2. Upload new image
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "tether-ids" },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      bufferToStream(req.file.buffer).pipe(stream);
    });

    // 3. Update user with new image info
    user.tetherIdImage = uploadResult.secure_url;
    user.imagePublicId = uploadResult.public_id;
    await user.save();

    res.status(200).json({
      message: "Image updated successfully",
      imageUrl: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("Edit image error:", error);
    res.status(500).json({ message: "Failed to update image" });
  }
};


export const fetchUserByEmail = async(req, res) => {
  try {
      const userProfile = await getUserByEmail(req.query.email)
      if(userProfile){
          res.status(200).json({profile:userProfile})
      }else{
        res.status(400).json({error:'User Not Found'})
      }

  } catch (error) {
    res.status(500).json({msg:'fail to fetch profile'})
  }

}