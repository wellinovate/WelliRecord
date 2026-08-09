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
});
