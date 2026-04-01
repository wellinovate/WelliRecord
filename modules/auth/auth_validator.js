import { z } from "zod";

const personalRegisterSchema = z.object({
  accountType: z.literal("user"),
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().optional(),
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
  phone: z.string().trim().min(7, "Phone number must be at least 7 digits"),
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
  authProvider: z.literal("local").optional(),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export const validateRegisterRequest = (req, res, next) => {
  const { accountType } = req.body;
  console.log("🚀 ~ validateRegisterRequest ~ req.body:", req.body);

  let schema;

  if (accountType === "user") {
    schema = personalRegisterSchema;
  } else if (accountType === "organization") {
    schema = organizationRegisterSchema;
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid profile type",
    });
  }

  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: result.error.errors?.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      })),
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
