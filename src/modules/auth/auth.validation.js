'use strict';

const {
  z,
  email,
  password,
  personName,
  phone,
  objectId,
  shortText,
  optionalField,
} = require('../../utils/validators');
const { EDUCATION_LEVELS } = require('../../core/constants');

const addressSchemaBase = z.object({
  line: shortText(200).optional(),
  city: shortText(80).optional(),
  governorate: shortText(80).optional(),
  country: shortText(80).optional(),
});

const addressSchema = optionalField(
  z.preprocess((value) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }, addressSchemaBase)
);

/**
 * POST /auth/register — student self-registration.
 *
 * `activationCode` is optional. When an instructor pre-issued one (bound to a
 * collection and/or a specific email), supplying it redeems that code and
 * inherits its bindings. When omitted, the service generates and immediately
 * consumes a fresh code of its own so the registration still leaves an
 * auditable entry in the activation-codes list — in that case `educationLevel`
 * must be supplied directly, since there is no code to inherit it from.
 */
const register = {
  body: z
    .object({
      activationCode: optionalField(
        z
          .string()
          .trim()
          .toUpperCase()
          .min(6, 'Activation code is too short')
          .max(32, 'Activation code is too long')
      ),
      fullName: personName,
      email,
      password,
      phone,
      parentPhone: phone,
      age: optionalField(z.coerce.number().int().min(3).max(100)),
      educationLevel: optionalField(z.enum(EDUCATION_LEVELS)),
      school: optionalField(shortText(150)),
      address: addressSchema,
    })
    .refine((value) => Boolean(value.activationCode) || Boolean(value.educationLevel), {
      message: 'educationLevel is required when registering without an activation code',
      path: ['educationLevel'],
    }),
};

const login = {
  body: z.object({
    email,
    // Deliberately not the full password policy: legacy passwords must still
    // be able to authenticate, and the failure message stays generic anyway.
    password: z.string().min(1, 'Password is required').max(128),
  }),
};

const refresh = {
  body: z.object({
    refreshToken: z.string().min(20, 'A refresh token is required'),
  }),
};

const logout = {
  body: z
    .object({
      refreshToken: z.string().min(20).optional(),
      allDevices: z.coerce.boolean().optional().default(false),
    })
    .default({}),
};

const changePassword = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  }),
};

const forgotPassword = {
  body: z.object({ email }),
};

const resetPassword = {
  body: z.object({
    token: z.string().trim().min(20, 'Reset token is required'),
    newPassword: password,
  }),
};

const revokeSession = {
  params: z.object({ sessionId: z.string().trim().min(8) }),
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  revokeSession,
  objectId,
};
