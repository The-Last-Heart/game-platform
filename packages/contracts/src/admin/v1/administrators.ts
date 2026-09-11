import { z } from 'zod';
import { adminPaginatedSchema, adminPaginationQuerySchema } from './pagination';
import { adminRoleSchema, adminUserStatusSchema } from './roles';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export const adminAdministratorSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1).max(120),
    role: adminRoleSchema,
    status: adminUserStatusSchema,
    lastLoginAt: z.string().datetime().nullable(),
    passwordChangedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().uuid().nullable(),
  })
  .strict();
export type AdminAdministrator = z.infer<typeof adminAdministratorSchema>;

export const adminAdministratorListQuerySchema = adminPaginationQuerySchema
  .extend({
    role: adminRoleSchema.optional(),
    status: adminUserStatusSchema.optional(),
    q: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type AdminAdministratorListQuery = z.infer<
  typeof adminAdministratorListQuerySchema
>;

export const adminAdministratorListResponseSchema = adminPaginatedSchema(
  adminAdministratorSchema,
);
export type AdminAdministratorListResponse = z.infer<
  typeof adminAdministratorListResponseSchema
>;

export const adminAdministratorCreateRequestSchema = z
  .object({
    email: emailSchema,
    displayName: z.string().trim().min(1).max(120),
    role: adminRoleSchema,
    password: z.string().min(12).max(1024),
  })
  .strict();
export type AdminAdministratorCreateRequest = z.infer<
  typeof adminAdministratorCreateRequestSchema
>;

export const adminAdministratorCreateResponseSchema = z
  .object({
    administrator: adminAdministratorSchema,
  })
  .strict();
export type AdminAdministratorCreateResponse = z.infer<
  typeof adminAdministratorCreateResponseSchema
>;

export const adminAdministratorGetResponseSchema = z
  .object({
    administrator: adminAdministratorSchema,
  })
  .strict();
export type AdminAdministratorGetResponse = z.infer<
  typeof adminAdministratorGetResponseSchema
>;

export const adminAdministratorPatchRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    role: adminRoleSchema.optional(),
    status: adminUserStatusSchema.optional(),
    password: z.string().min(12).max(1024).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.role !== undefined ||
      value.status !== undefined ||
      value.password !== undefined,
    { message: 'At least one field must be provided' },
  );
export type AdminAdministratorPatchRequest = z.infer<
  typeof adminAdministratorPatchRequestSchema
>;

export const adminAdministratorPatchResponseSchema = z
  .object({
    administrator: adminAdministratorSchema,
  })
  .strict();
export type AdminAdministratorPatchResponse = z.infer<
  typeof adminAdministratorPatchResponseSchema
>;
