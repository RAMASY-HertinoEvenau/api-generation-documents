import { z } from "zod";

export const createBatchSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(1000)
});
