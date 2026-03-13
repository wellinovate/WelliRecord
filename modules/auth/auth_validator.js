import { z } from "zod";

const personalRegisterSchema = z.object({
  profileType: z.literal("personal"),
  fullName: z.string().trim().min(2, "Full name is required"),
  email: z
    .string()
    .trim()
    .email("Valid email is required")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const organizationRegisterSchema = z.object({
  profileType: z.literal("organization"),
  organizationName: z.string().trim().min(2, "Organization name is required"),
  organizationType: z.enum([
    "clinic",
    "hospital",
    "laboratory",
    "pharmacy",
    "insurer",
    "ngo",
    "healthtech",
    "other",
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
  const { profileType } = req.body;
  
  let schema;
  
  if (profileType === "personal") {
    schema = personalRegisterSchema;
  } else if (profileType === "organization") {
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