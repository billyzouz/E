import { z } from "zod";

export const FinderBody = z.object({
  keyword: z.string().trim().max(100).optional(),
  shipFrom: z.enum(["CN", "FR", "DE", "ES", "IT", "PL", "GB", "US"]).optional(),
  minCostEur: z.coerce.number().min(0).optional(),
  maxCostEur: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
});

export const AutoImportBody = FinderBody.extend({
  count: z.coerce.number().int().min(1).max(20).default(10),
});
