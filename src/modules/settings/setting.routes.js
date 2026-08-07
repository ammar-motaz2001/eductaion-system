'use strict';

const { Router } = require('express');

const ApiError = require('../../core/ApiError');
const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const validate = require('../../middlewares/validate.middleware');
const { authenticate, instructorOnly } = require('../../middlewares/auth.middleware');
const { imageUploader, handleUploadErrors } = require('../../middlewares/upload.middleware');
const {
  z,
  email,
  personName,
  phone,
  password,
  shortText,
  nonEmptyObject,
} = require('../../utils/validators');
const service = require('./setting.service');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Instructor profile, institution details and preferences
 */

const updateProfileSchema = {
  body: nonEmptyObject(
    z.object({
      fullName: personName.optional(),
      email: email.optional(),
      phone: phone.optional(),
    })
  ),
};

const updateSettingsSchema = {
  body: nonEmptyObject(
    z.object({
      institution: z
        .object({
          name: shortText(150).optional(),
          addressLine: shortText(200).optional(),
          contactPhone: phone.optional(),
          contactEmail: email.optional(),
        })
        .optional(),
      preferences: z
        .object({
          locale: shortText(10).optional(),
          timezone: shortText(60).optional(),
          currency: z.string().trim().length(3).toUpperCase().optional(),
          attendanceWarningThreshold: z.coerce.number().min(0).max(100).optional(),
          paymentGracePeriodDays: z.coerce.number().int().min(0).max(90).optional(),
        })
        .optional(),
      notificationPreferences: z
        .object({
          email: z.coerce.boolean().optional(),
          inApp: z.coerce.boolean().optional(),
          attendanceWarnings: z.coerce.boolean().optional(),
          latePayments: z.coerce.boolean().optional(),
          pendingApprovals: z.coerce.boolean().optional(),
        })
        .optional(),
    })
  ),
};

const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
  }),
};

router.use(authenticate, instructorOnly);

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Get the instructor profile and preferences
 *     description: Returns identity fields and the preference blocks in one payload.
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Settings returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 profile: { id: "665f...", fullName: "Head Instructor", email: "instructor@edu-system.local", phone: "+201000000000" }
 *                 settings:
 *                   institution: { name: "Absegy Academy", contactPhone: "+201000000000" }
 *                   preferences: { locale: "en", timezone: "Africa/Cairo", currency: "EGP", attendanceWarningThreshold: 50 }
 *                   notificationPreferences: { email: true, inApp: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *
 *   patch:
 *     summary: Update institution details and preferences
 *     description: Nested objects are merged field by field, so a partial block leaves its siblings untouched.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               institution:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   addressLine: { type: string }
 *                   contactPhone: { type: string }
 *                   contactEmail: { type: string, format: email }
 *               preferences:
 *                 type: object
 *                 properties:
 *                   locale: { type: string, example: "en" }
 *                   timezone: { type: string, example: "Africa/Cairo" }
 *                   currency: { type: string, example: "EGP" }
 *                   attendanceWarningThreshold: { type: number, minimum: 0, maximum: 100, example: 50 }
 *                   paymentGracePeriodDays: { type: integer, minimum: 0, maximum: 90 }
 *               notificationPreferences:
 *                 type: object
 *                 properties:
 *                   email: { type: boolean }
 *                   inApp: { type: boolean }
 *                   attendanceWarnings: { type: boolean }
 *                   latePayments: { type: boolean }
 *                   pendingApprovals: { type: boolean }
 *     responses:
 *       200: { description: Settings updated }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router
  .route('/')
  .get(
    asyncHandler(async (req, res) =>
      ApiResponse.ok(res, await service.getProfile(req.user), 'Settings retrieved successfully')
    )
  )
  .patch(
    validate(updateSettingsSchema),
    asyncHandler(async (req, res) =>
      ApiResponse.ok(
        res,
        await service.updateSettings(req.user._id, req.body),
        'Settings updated successfully'
      )
    )
  );

/**
 * @swagger
 * /settings/profile:
 *   patch:
 *     summary: Update the instructor's name, email or phone
 *     description: The email must not already belong to another account.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *     responses:
 *       200: { description: Profile updated }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.patch(
  '/profile',
  validate(updateProfileSchema),
  asyncHandler(async (req, res) =>
    ApiResponse.ok(
      res,
      await service.updateProfile(req.user._id, req.body),
      'Profile updated successfully'
    )
  )
);

/**
 * @swagger
 * /settings/profile-image:
 *   patch:
 *     summary: Upload or replace the instructor's profile image
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: Image updated }
 *       413: { description: File exceeds the 5 MB limit }
 *       415: { $ref: '#/components/responses/UnsupportedMediaType' }
 *   delete:
 *     summary: Remove the instructor's profile image
 *     tags: [Settings]
 *     responses:
 *       200: { description: Image removed }
 */
router
  .route('/profile-image')
  .patch(
    imageUploader.single('image'),
    handleUploadErrors,
    asyncHandler(async (req, res) => {
      if (!req.file) throw ApiError.badRequest('A file is required in the "image" field');
      const result = await service.uploadProfileImage(req.user._id, req.file);
      return ApiResponse.ok(res, result, 'Profile image updated successfully');
    })
  )
  .delete(
    asyncHandler(async (req, res) =>
      ApiResponse.ok(
        res,
        await service.removeProfileImage(req.user._id),
        'Profile image removed successfully'
      )
    )
  );

/**
 * @swagger
 * /settings/change-password:
 *   patch:
 *     summary: Change the instructor's password
 *     description: >
 *       Equivalent to `/auth/change-password`, exposed here so the settings
 *       screen has a single base path. Revokes every refresh session.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Password changed }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.patch(
  '/change-password',
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await service.changePassword(req.user._id, req.body);
    return ApiResponse.ok(res, null, result.message);
  })
);

module.exports = router;
