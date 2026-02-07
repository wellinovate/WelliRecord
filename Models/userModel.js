import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import crypto from "crypto";
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    middleName: {
      type: String,
      default: "",
    },
    lastName: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
      required: false,
      default: "Male",
      enum: ["Male", "Female", "Other"], // Adjust enum as needed
    },
    phone: {
      type: String,
      required: false,
    },
    homeAddress: {
      type: String,
      required: false,
    },
    // Retained existing fields (img, telegramId, etc.) as they were not specified for removal
    img: {
      type: String,
      required: false,
    },
    admin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Optional: Virtual for full name (computed from first, middle, last)
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.middleName} ${this.lastName}`.replace(/\s+/g, " ").trim();
});

// Ensure virtuals are included in toObject/toJSON
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });


// Hash password before saving the user document
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // Skip if password hasn't been modified

  try {
    const salt = await bcrypt.genSalt(10); // Generate salt
    this.password = await bcrypt.hash(this.password, salt); // Hash the password
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password for login
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password); // Compare hashed password
};

export const userModel = mongoose.model("User", userSchema);

// Utility functions
export const getUsers = () => userModel.find();
export const getUserByEmail = (email) => userModel.findOne({ email });
export const getUserByUsername = (username) => userModel.findOne({ username }); // Added for username lookup
export const createUser = async (values) => {
  const user = new userModel(values);
  await user.save();
  return user.toObject();
};
export const deleteUserByEmail = (email) =>
  userModel.findOneAndDelete({ email });
export const deleteUserByUsername = (username) =>
  userModel.findOneAndDelete({ username }); // Added for username deletion

export const updateUserByEmail = (email, values, newOption = true) =>
  userModel.findOneAndUpdate({ email }, values, { new: newOption });
export const updateUserByUsername = (username, values, newOption = true) =>
  userModel.findOneAndUpdate({ username }, values, { new: newOption }); // Added for username updates