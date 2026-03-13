import mongoose from "mongoose";

const { Schema } = mongoose;

const emergencyContactSchema = new Schema(
  {
    name: { type: String, trim: true, required: true },
    relationship: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, required: true },
  },
  { _id: false },
);

const userProfileSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    username: {
      type: String,
      trim: true,
      unique: false,
      sparse: true,
      index: true,
    },

    firstName: {
      type: String,
      trim: true,
      default: "",
    },

    middleName: {
      type: String,
      trim: true,
      default: "",
    },

    lastName: {
      type: String,
      trim: true,
      default: "",
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      default: null,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    homeAddress: {
      type: String,
      trim: true,
      default: null,
    },

    emergencyContacts: {
      type: [emergencyContactSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userProfileSchema.index({ fullName: "text", username: "text" });

export const UserProfile = mongoose.model("UserProfile", userProfileSchema);