import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

const accountSchema = new Schema(
  {
    accountType: {
      type: String,
      enum: ["user", "organization"],
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: [
        "patient",
        "provider",
        "doctor",
        "nurse",
        "caregiver",
        "staff",
        "admin",
        "clinic",
        "hospital",
        "lab",
        "pharmacy",
        "insurer",
      ],
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    img: {
      type: String,
      default: null,
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "pending", "disabled"],
      default: "pending",
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

accountSchema.set("toJSON", { virtuals: true });
accountSchema.set("toObject", { virtuals: true });

accountSchema.virtual("profile", {
  refPath: "profileModel",
  localField: "_id",
  foreignField: "accountId",
  justOne: true,
});

accountSchema.virtual("profileModel").get(function () {
  return this.accountType === "organization"
    ? "OrganizationProfile"
    : "UserProfile";
});

accountSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
});

accountSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

accountSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

accountSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select("+password");
};

export const Account = mongoose.model("Account", accountSchema);