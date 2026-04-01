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
  organizationMainType: z
    .string()
    .trim()
    .min(2, "Organization name is required"),
  organizationType: z.enum([
    "organization(healthcare_provider)", // hospital + clinic + lab + pharmacy
    "organization(diagnostic)", // standalone lab centers
    "organization(pharmacy)", // standalone pharmacy chains
    "organization(insurance)", // insurers / HMOs
    "organization(telehealth)", // virtual care platforms
    "organization(government)", // ministries, public health bodies
    "organization(ngo)", // non-profits
    "organization(healthtech)", // tech companies (like WelliRecord)
    "organization(vendor)", // devices, wearables, suppliers
    "organization(other)",
  ]),
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
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
  console.log("🚀 ~ validateRegisterRequest ~ req.body:", req.body)

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
