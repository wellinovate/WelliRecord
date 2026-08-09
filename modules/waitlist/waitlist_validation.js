import { z } from "zod";

export const joinWaitlistSchema = z.object({
  feature: z.enum(["reports", "public-health"]),
  email: z.string().trim().email("A valid email is required"),
});
