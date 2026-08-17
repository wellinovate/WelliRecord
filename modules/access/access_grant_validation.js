import { z } from "zod";
import mongoose from "mongoose";

const objectIdSchema = z
  .string()
  .trim()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: "Invalid ObjectId",
  });

// Patients never see a raw ObjectId anywhere in the product — the only
// identifier shown to them is the WR-XXXX-XXXX format (wrId / wrOrgId).
// This form asks for "the provider or organization's ID," so it has to
// accept the format that's actually printed on their card, not just the
// internal database key. The service layer resolves whichever one was
// sent — see resolveGranteeId in access_grant_service.js.
const granteeIdSchema = z
  .string()
  .trim()
  .refine(
    (value) => mongoose.Types.ObjectId.isValid(value) || /^WR-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(value),
    { message: "Invalid ID — enter a WelliRecord ID (e.g. WR-1234-ABCD)" },
  );

const nullableObjectIdSchema = z
  .union([objectIdSchema, z.null()])
  .optional();

const nullableGranteeIdSchema = z
  .union([granteeIdSchema, z.null()])
  .optional();

const nullableStringSchema = z
  .union([z.string().trim().min(1), z.null()])
  .optional();

const dateSchema = z
  .union([
    z.string().datetime(),
    z.date(),
    z.null(),
  ])
  .optional();

export const createAccessGrantSchema = z
  .object({
    granteeType: z
      .enum(["provider", "organization", "caregiver", "payer", "other"])
      .default("provider"),

    granteeUserId: nullableGranteeIdSchema,

    granteeOrganizationId: nullableGranteeIdSchema,

    accessScope: z.enum([
      "single-record",
      "category",
      "encounter",
      "full-record",
      "custom",
    ]),

    category: z
      .enum([
        "vitals",
        "medications",
        "allergies",
        "diagnoses",
        "lab-results",
        "radiology",
        "procedures",
        "immunizations",
        "vision",
      ])
      .nullable()
      .optional(),

    recordId: nullableObjectIdSchema,

    encounterId: nullableObjectIdSchema,

    recordFrom: dateSchema,

    recordTo: dateSchema,

    durationDays: z
  .coerce
  .number()
  .int()
  .positive()
  .max(365)
  .default(7)
  .optional(),

    expiresAt: dateSchema,

    permissions: z
      .object({
        view: z.boolean().default(true).optional(),
        download: z.boolean().default(false).optional(),
        reshare: z.boolean().default(false).optional(),
        write: z.boolean().default(false).optional(),
      })
      .optional(),

    purpose: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .optional(),

    notes: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    /**
     * Grantee validation
     */
    if (data.granteeType === "provider" && !data.granteeUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["granteeUserId"],
        message: "granteeUserId is required when granteeType is provider",
      });
    }

    if (data.granteeType === "organization" && !data.granteeOrganizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["granteeOrganizationId"],
        message:
          "granteeOrganizationId is required when granteeType is organization",
      });
    }

    /**
     * Scope validation
     */
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

    if (data.accessScope === "single-record" && !data.recordId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recordId"],
        message: "recordId is required when accessScope is single-record",
      });
    }

    if (data.accessScope !== "single-record" && data.recordId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recordId"],
        message: "recordId should only be used with single-record access",
      });
    }

    if (data.accessScope === "encounter" && !data.encounterId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["encounterId"],
        message: "encounterId is required when accessScope is encounter",
      });
    }

    if (data.accessScope !== "encounter" && data.encounterId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["encounterId"],
        message: "encounterId should only be used with encounter access",
      });
    }

    /**
     * Date validation
     */
    if (data.recordFrom && data.recordTo) {
      const recordFrom = new Date(data.recordFrom);
      const recordTo = new Date(data.recordTo);

      if (recordTo <= recordFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recordTo"],
          message: "recordTo must be later than recordFrom",
        });
      }
    }

    if (data.expiresAt) {
      const expiresAt = new Date(data.expiresAt);
      const now = new Date();

      if (expiresAt <= now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expiresAt"],
          message: "expiresAt must be in the future",
        });
      }
    }
  });

  export const validateCreateAccessGrant = (payload) => {
  const result = createAccessGrantSchema.safeParse(payload);

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