import { z } from "zod";

const WAREHOUSES = ["CN", "US", "GB", "DE", "FR", "ES", "IT", "PL", "CZ", "NL", "AU", "CA"] as const;

export const FinderBody = z.object({
  keyword: z.string().trim().max(100).optional(),
  warehouse: z.enum(WAREHOUSES).or(z.literal("")).optional(),
  minCostUsd: z.coerce.number().min(0).optional(),
  maxCostUsd: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
});

export const AutoImportBody = FinderBody.extend({
  count: z.coerce.number().int().min(1).max(20).default(10),
});
