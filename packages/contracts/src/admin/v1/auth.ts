import { z } from 'zod';
import { adminPermissionSchema } from './permissions';
import { adminRoleSchema, adminUserStatusSchema } from './roles';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export const adminLoginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(1024),
  })
  .strict();
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminSessionInfoSchema = z
  .object({
    sessionId: z.string().uuid(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type AdminSessionInfo = z.infer<typeof adminSessionInfoSchema>;

export const adminAuthenticatedUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1).max(120),
    role: adminRoleSchema,
    status: adminUserStatusSchema,
    permissions: z.array(adminPermissionSchema),
    passwordChangedAt: z.string().datetime(),
    lastLoginAt: z.string().datetime().nullable(),
  })
  .strict();
export type AdminAuthenticatedUser = z.infer<typeof adminAuthenticatedUserSchema>;

export const adminLoginResponseSchema = z
  .object({
    user: adminAuthenticatedUserSchema,
    session: adminSessionInfoSchema,
    /** Opaque session token for BFF cookie / Authorization Bearer. */
    sessionToken: z.string().min(32).max(512),
    /** Double-submit CSRF token for subsequent mutating requests. */
    csrfToken: z.string().min(16).max(512),
  })
  .strict();
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;

export const adminMeResponseSchema = z
  .object({
    user: adminAuthenticatedUserSchema,
    session: adminSessionInfoSchema,
  })
  .strict();
export type AdminMeResponse = z.infer<typeof adminMeResponseSchema>;

export const adminChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(12).max(1024),
  })
  .strict();
export type AdminChangePasswordRequest = z.infer<
  typeof adminChangePasswordRequestSchema
>;

export const adminChangePasswordResponseSchema = z
  .object({
    passwordChangedAt: z.string().datetime(),
    /** New session after password change rotation. */
    session: adminSessionInfoSchema,
    sessionToken: z.string().min(32).max(512),
    csrfToken: z.string().min(16).max(512),
  })
  .strict();
export type AdminChangePasswordResponse = z.infer<
  typeof adminChangePasswordResponseSchema
>;

export const adminRevokeOtherSessionsResponseSchema = z
  .object({
    revokedCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminRevokeOtherSessionsResponse = z.infer<
  typeof adminRevokeOtherSessionsResponseSchema
>;

export const adminSessionListItemSchema = z
  .object({
    sessionId: z.string().uuid(),
    current: z.boolean(),
    createdAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    /** Sanitized user-agent summary; never a raw secret. */
    deviceDescription: z.string().min(1).max(120),
  })
  .strict();
export type AdminSessionListItem = z.infer<typeof adminSessionListItemSchema>;

export const adminSessionsResponseSchema = z
  .object({
    sessions: z.array(adminSessionListItemSchema),
  })
  .strict();
export type AdminSessionsResponse = z.infer<typeof adminSessionsResponseSchema>;

export const adminCsrfResponseSchema = z
  .object({
    csrfToken: z.string().min(16).max(512),
  })
  .strict();
export type AdminCsrfResponse = z.infer<typeof adminCsrfResponseSchema>;

export const adminLogoutResponseSchema = z
  .object({
    revoked: z.literal(true),
  })
  .strict();
export type AdminLogoutResponse = z.infer<typeof adminLogoutResponseSchema>;

export const adminUpdateProfileRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export type AdminUpdateProfileRequest = z.infer<
  typeof adminUpdateProfileRequestSchema
>;

export const adminUpdateProfileResponseSchema = z
  .object({
    user: adminAuthenticatedUserSchema,
  })
  .strict();
export type AdminUpdateProfileResponse = z.infer<
  typeof adminUpdateProfileResponseSchema
>;
