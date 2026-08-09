import { z } from "zod";

export const createApiKeySchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  scopes: z.array(z.string()).default([]),
});
