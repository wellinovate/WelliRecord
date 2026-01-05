
import mongoose from "mongoose";

const Schema = mongoose.Schema;

const otpSchema = new Schema(
  {

    email: {
      type: String,
      required: true,
      unique: true,
    },
    otp: {
      type: Number,
      required: true,
    },

  },
  { timestamps: true }
);


export const OTPModel = mongoose.model("OTP", otpSchema);