import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import { Readable } from "stream";
import { getUserByEmail, userModel } from "../Models/userModel.js";

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
    { expiresIn: "1d" },
  );
};

export const createUserProfile = async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
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
    const {
      name,
      email,
      phone,
      password,
  
    } = req.body;
    console.log(
      "🚀 ~ createUser ~ name, email, password, phone,",
      name,
      email,
      phone,
      password,
    );

    // Basic validation (expand with Joi or similar if needed)
    if (!name || !email || !password)
      return sendError(res, 400, "Missing required fields");

    // Check if user already exists by email or username
    const existingUser = await userModel.findOne({
      $or: [{ email }, { phone }],
    });
    console.log("🚀 ~ createUser ~ existingUser:", existingUser);
    if (existingUser) {
      return sendError(
        res,
        409,
        "User with this email or phone already exists",
      );
    }

    // Create user (pre-save hooks will hash password and generate referralCode if applicable)
    const newUser = new userModel({
      // firstName,
      // middleName: middleName || "",
      // lastName,
      name,
      username: email.split("@")[0], // Simple username generation from email prefix
      email,
      password, // Plain text; will be hashed
      // gender,
      phone,
      // homeAddress,
      img: "",
      // admin: true,
    });

    await newUser.save();

    // Exclude sensitive fields like password from response
    const userObj = newUser.toObject();
    const { password: _, ...userWithoutPassword } = userObj;

    // return sendSuccess(res, 201, userWithoutPassword, 'User created successfully');
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Create User Error:", error);
    return sendError(res, 500, "Server error while creating user");
  }
};

// Login user (with JWT token generation)
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🚀 ~ loginUser ~ email:", email);

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
    res.status(400).json({ error: error.message });
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

export const getUserProfile = async (req, res) => {
  try {
    // Option 1: from auth middleware (recommended)
    // const userId = req.user?.id;
    const {Id} = req.params; 
    const userId = Id; // from URL param (e.g. /profile/:Id)

    // Option 2 fallback (if no auth middleware yet)
    // const { userId } = req.params;

    if (!userId) {
      return sendError(res, 401, "Unauthorized");
    }

    const user = await userModel
      .findById(userId)
      .select("-password -__v");

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        img: user.img,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Get User Profile Error:", error);
    return sendError(res, 500, "Server error while fetching profile");
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const currentUser = req.user; // from auth middleware (e.g. JWT verify)
    if (!currentUser) {
      return sendError(res, 401, "Authentication required");
    }

    const userId = req.params.id || currentUser._id; // allow :id param for admin updates

    // Only allow users to update themselves unless admin
    const isAdmin = currentUser.admin === true;
    if (userId.toString() !== currentUser._id.toString() && !isAdmin) {
      return sendError(res, 403, "You can only update your own profile");
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const {
      firstName,
      middleName,
      lastName,
      username,
      email,
      password, // optional – only if changing password
      gender,
      phone,
      homeAddress,
      // img,               // we'll handle via file upload instead
    } = req.body;

    // ────────────────────────────────────────────────
    // 1. Handle uniqueness checks for email & username
    // ────────────────────────────────────────────────
    if (email && email !== user.email) {
      const emailExists = await userModel.findOne({ email });
      if (emailExists) {
        return sendError(res, 409, "Email already in use");
      }
      user.email = email;
    }

    if (username && username !== user.username) {
      const usernameExists = await userModel.findOne({ username });
      if (usernameExists) {
        return sendError(res, 409, "Username already taken");
      }
      user.username = username;
    }

    // ────────────────────────────────────────────────
    // 2. Update simple fields if provided
    // ────────────────────────────────────────────────
    if (firstName) user.firstName = firstName;
    if (middleName !== undefined) user.middleName = middleName;
    if (lastName) user.lastName = lastName;
    if (gender) user.gender = gender;
    if (phone) user.phone = phone;
    if (homeAddress) user.homeAddress = homeAddress;

    // Optional admin field (only admins can change this)
    if (isAdmin && req.body.admin !== undefined) {
      user.admin = !!req.body.admin;
    }

    // ────────────────────────────────────────────────
    // 3. Handle password change (re-hash)
    // ────────────────────────────────────────────────
    if (password) {
      // You can add extra validation (length, complexity) here if desired
      user.password = password; // pre-save hook will hash it
    }

    // ────────────────────────────────────────────────
    // 4. Optional: Handle profile image upload
    // ────────────────────────────────────────────────
    if (req.file) {
      // assuming multer single file upload with fieldname "img"
      // Delete old image if exists
      if (user.imagePublicId) {
        await cloudinary.uploader.destroy(user.imagePublicId).catch(() => {}); // ignore errors
      }

      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "user-profiles" },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );
        bufferToStream(req.file.buffer).pipe(uploadStream);
      });

      user.img = uploadResult.secure_url;
      user.imagePublicId = uploadResult.public_id; // save public_id for future deletion
    }

    // Save updated document (triggers pre-save hook for password)
    await user.save();

    // Prepare safe response (exclude password)
    const { password: _, ...updatedUser } = user.toObject();

    return sendSuccess(res, 200, updatedUser, "Profile updated successfully");
  } catch (error) {
    console.error("Update profile error:", error);
    return sendError(res, 500, "Failed to update profile");
  }
};

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
    const user = await userModel.findById(userId);
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
        },
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
