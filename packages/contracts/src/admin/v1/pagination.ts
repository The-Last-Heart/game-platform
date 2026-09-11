import { z } from 'zod';

export const ADMIN_MAX_PAGE_SIZE = 100;
export const ADMIN_DEFAULT_PAGE_SIZE = 20;

export const adminPaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(ADMIN_MAX_PAGE_SIZE)
      .default(ADMIN_DEFAULT_PAGE_SIZE),
  })
  .strict();
export type AdminPaginationQuery = z.infer<typeof adminPaginationQuerySchema>;

export const adminPaginationMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(ADMIN_MAX_PAGE_SIZE),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type AdminPaginationMeta = z.infer<typeof adminPaginationMetaSchema>;

export function adminPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      items: z.array(itemSchema),
      pagination: adminPaginationMetaSchema,
    })
    .strict();
}
