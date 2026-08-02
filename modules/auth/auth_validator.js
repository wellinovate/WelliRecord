import { z } from "zod";

const optionalString = z.preprocess(
  (val) => (val === null ? undefined : val),
  z.string().trim().optional()
);

const personalRegisterSchema = z.object({
  accountType: z.literal("user"),
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/[\s-]/g, ""))
    .refine(
      (val) => /^(0[789][01]\d{8}|\+?234[789][01]\d{8})$/.test(val),
      "Enter a valid Nigerian phone number (e.g. 08012345678)",
    ),
  gender: z.string().trim().min(2, "Gender is required"),
  address: optionalString,
  role: z.string().optional(),
  authProvider: z.literal("local").optional(),
});


const organizationRegisterSchema = z.object({
  accountType: z.literal("organization"),
  organizationName: z.string().trim().min(2, "Organization name is required"),
  organizationType: z.enum([
    "healthcare_provider",
    "diagnostic",
    "pharmacy",
    "insurance",
    "telehealth",
    "government",
    "ngo",
    "individaul_provider",
    "healthtech",
    "vendor",
    "other",
  ]),
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/[\s-]/g, ""))
    .refine(
      (val) => /^(0[789][01]\d{8}|\+?234[789][01]\d{8})$/.test(val),
      "Enter a valid Nigerian phone number (e.g. 08012345678)",
    ),
  country: z.string().trim().min(2, "Country is required"),
  state: z.string().trim().min(2, "State is required"),
  city: z.string().trim().min(2, "City is required"),
  contactPersonName: z
    .string()
    .trim()
    .min(2, "Contact person name is required"),
  contactPersonRole: z
    .string()
    .trim()
    .min(2, "Contact person role is required"),
  // Only meaningful when organizationType is "healthcare_provider" —
  // see OrganizationProfile.clinicalScope. Optional here because every
  // other organizationType has no use for it; createOrganizationProfile
  // defaults it to "general" if omitted.
  clinicalScope: z.enum(["general", "eye_care"]).optional(),
  authProvider: z.literal("local").optional(),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(6, "Password is required"),
});

export const validateRegisterRequest = (req, res, next) => {
  console.log("Incoming register body:", req.body);

  const { accountType } = req.body;

  let schema;

  if (accountType === "user") {
    schema = personalRegisterSchema;
  } else if (accountType === "organization") {
    schema = organizationRegisterSchema;
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid account type. Use either 'user' or 'organization'.",
      receivedAccountType: accountType,
    });
  }

  const result = schema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.issues.map((err) => {
      const field = err.path.length ? err.path.join(".") : "root";

      return {
        field,
        message: err.message,
        fullMessage: `${field}: ${err.message}`,
      };
    });

    console.log("Validation errors:", errors);

    return res.status(400).json({
      success: false,
      message: errors[0]?.fullMessage || "Validation failed",
      errors,
    });
  }

  req.validatedBody = result.data;
  next();
};

export const validateLoginRequest = (req, res, next) => {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: result.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
  }

  req.validatedBody = result.data;
  next();
};
