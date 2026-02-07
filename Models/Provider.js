import mongoose from "mongoose";
import bcrypt from "bcryptjs"; 

const Schema = mongoose.Schema;

const providerSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    middleName: {
      type: String,
      default: "",
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      default: "Dr.",
      enum: ["Dr.", "Nurse", "PA", "Therapist", "Other"],
    },

    // Computed full name (virtual)
    // We'll define it below

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    licenseNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    credentials: {
      type: String,
      trim: true,
    },

    primarySpecialty: {
      type: String,
      required: true,
      enum: [
        "General Care",
        "Heart Health",
        "Mental Health",
        "Pediatrics",
        "Dermatology",
      ],
    },
    specialties: {
      type: [String],
      default: [],
    },

    experienceYears: {
      type: Number,
      min: 0,
      required: true,
    },

    averageRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    featuredReview: {
      quote: {
        type: String,
        trim: true,
      },
      authorInitials: String, // optional e.g. "J.D."
      date: Date,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },
    nextAvailable: {
      type: Date,
    },
    nextAvailableLabel: {
      type: String,
    },

    pricePerSession: {
      type: Number,
      min: 0,
      required: true,
    },

    acceptedInsurances: {
      type: [String],
      default: [],
    },

    // Profile assets
    profileImage: {
      type: String,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    adminNotes: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false, 
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: fullName
providerSchema.virtual("fullName").get(function () {
  const parts = [this.firstName, this.middleName, this.lastName].filter(Boolean);
  return `${this.title || ""} ${parts.join(" ")}`.trim();
});

// Virtual: formatted experience
providerSchema.virtual("experienceLabel").get(function () {
  return `${this.experienceYears} ${this.experienceYears === 1 ? "Year" : "Years"} Exp.`;
});

// Virtual: formatted price
providerSchema.virtual("priceLabel").get(function () {
  return `$${this.pricePerSession}/session`;
});

providerSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method: verify password (if using provider login)
providerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Indexes for fast queries
providerSchema.index({ primarySpecialty: 1 });
providerSchema.index({ averageRating: -1 }); // for top-rated sorting
providerSchema.index({ slug: 1 });
providerSchema.index({ "acceptedInsurances": 1 }); // search by insurance

export const Provider = mongoose.model("Provider", providerSchema);

// Utility/query helpers (similar to your user model)
export const getProviders = (filter = {}, options = {}) =>
  Provider.find(filter, null, options);

export const getProviderById = (id) => Provider.findById(id);

export const getProviderBySlug = (slug) => Provider.findOne({ slug });

export const getTopRatedProviders = (limit = 10) =>
  Provider.find({ isActive: true, isVerified: true })
    .sort({ averageRating: -1, reviewCount: -1 })
    .limit(limit);

export const createProvider = async (data) => {
  const provider = new Provider(data);
  await provider.save();
  return provider.toObject();
};

export const updateProvider = (id, updates, options = { new: true }) =>
  Provider.findByIdAndUpdate(id, updates, options);

export const deleteProvider = (id) => Provider.findByIdAndDelete(id);