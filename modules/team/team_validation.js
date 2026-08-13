import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  fullName: z.string().trim().min(1, "Full name is required"),
  membershipRole: z.enum([
    "provider_admin",
    "doctor",
    "clinician",
    "nurse",
    "lab_tech",
    "pharmacist",
    "frontdesk",
    "insurer_agent",
    "support_staff",
  ]),
});

export const acceptInviteSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Provider login always requires a phone number — password login is
  // followed by an SMS OTP challenge (see loginAccount in
  // auth_services.js), and an account with no phone on file is
  // rejected outright with "No phone number is attached to this
  // account." An invited doctor/nurse/etc. never had anywhere to
  // supply one before now, so accepting an invite was a dead end:
  // the account got created successfully but could never actually
  // log in.
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/[\s-]/g, ""))
    .refine(
      (val) => /^(0[789][01]\d{8}|\+?234[789][01]\d{8})$/.test(val),
      "Enter a valid Nigerian phone number (e.g. 08012345678)",
    ),
});

export const updatePermissionsSchema = z.object({
  granted: z.array(z.string()).default([]),
  revoked: z.array(z.string()).default([]),
});
