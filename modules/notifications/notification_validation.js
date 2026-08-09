import { z } from "zod";

export const criticalAlertSmsSchema = z.object({
  phoneNumber: z.string().trim().min(8, "A valid phone number is required"),
  message: z.string().trim().min(1, "Message is required").max(480),
});
