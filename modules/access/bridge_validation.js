import { z } from "zod";

export const createShareLinkSchema = z
  .object({
    accessScope: z
      .enum(["category", "full-record"])
      .default("category"),

    category: z
      .enum([
        "vitals",
        "medications",
        "allergies",
        "diagnoses",
        "lab-results",
        "procedures",
        "immunizations",
      ])
      .nullable()
      .optional(),

    durationHours: z
      .coerce
      .number()
      .int()
      .positive()
      .max(24 * 30) // 30 days, matches the longest duration option in the doc
      .default(24)
      .optional(),

    oneTimeUse: z.boolean().default(false).optional(),

    purpose: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accessScope === "category" && !data.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "category is required when accessScope is category",
      });
    }

    if (data.accessScope !== "category" && data.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "category should only be used with category access",
      });
    }
  });

export const validateCreateShareLink = (payload) => {
  const result = createShareLinkSchema.safeParse(payload);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten(),
    };
  }

  return {
    success: true,
    data: result.data,
  };
};
