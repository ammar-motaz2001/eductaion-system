'use strict';

const { Router } = require('express');

const ApiResponse = require('../../core/ApiResponse');
const asyncHandler = require('../../core/asyncHandler');
const validate = require('../../middlewares/validate.middleware');
const {
  authenticate,
  instructorOnly,
  requireActiveStudent,
} = require('../../middlewares/auth.middleware');
const { z, objectId, isoDate, paginationQuery, idParams } = require('../../utils/validators');
const service = require('./report.service');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: >
 *     Per-student reports combining profile, attendance, grades, homework,
 *     payments, performance and instructor notes. Available as JSON or PDF.
 */

const generateSchema = {
  params: z.object({ studentId: objectId }),
  query: z.object({
    collectionId: objectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  }),
};

const exportSchema = {
  params: z.object({ studentId: objectId }),
  query: z.object({
    collectionId: objectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    /** Store a copy in the configured storage provider and record it. */
    archive: z.enum(['true', 'false']).optional().default('false'),
  }),
};

router.use(authenticate, requireActiveStudent);

/**
 * @swagger
 * /reports/student/{studentId}:
 *   get:
 *     summary: Generate a student report as JSON
 *     description: >
 *       Computed live from the source modules. Instructors may request any
 *       student; a student requesting another student's id receives 403.
 *     tags: [Reports]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
 *       - in: query
 *         name: collectionId
 *         schema: { type: string }
 *         description: Restrict the report to one collection
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Report returned
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Report generated successfully"
 *               data:
 *                 student: { fullName: "Omar Khaled", educationLevel: "secondary-2", performance: "good" }
 *                 attendance:
 *                   summary: { totalPresent: 18, totalAbsent: 6, totalSessions: 24, attendancePercentage: 75, threshold: 50, hasWarning: false }
 *                 grades:
 *                   summary: { examCount: 8, averagePercentage: 82.5 }
 *                 homework:
 *                   summary: { total: 12, graded: 9, overdue: 1, averagePercentage: 78.4 }
 *                 payments:
 *                   summary: { outstanding: 500, totalBilled: 2500, status: "pending" }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/student/:studentId',
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const report = await service.generate(req.user, req.params.studentId, {
      collectionId: req.query.collectionId,
      from: req.query.from,
      to: req.query.to,
    });
    return ApiResponse.ok(res, report, 'Report generated successfully');
  })
);

/**
 * @swagger
 * /reports/student/{studentId}/pdf:
 *   get:
 *     summary: Export a student report as PDF
 *     description: >
 *       Streams an A4 PDF. Pass `archive=true` to also store a copy with the
 *       configured storage provider and record the generation; the archived
 *       report's id is returned in the `X-Report-Id` response header.
 *     tags: [Reports]
 *     produces: [application/pdf]
 *     parameters:
 *       - $ref: '#/components/parameters/StudentIdParam'
 *       - in: query
 *         name: collectionId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: archive
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: PDF document
 *         headers:
 *           X-Report-Id:
 *             schema: { type: string }
 *             description: Present when `archive=true`
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/student/:studentId/pdf',
  validate(exportSchema),
  asyncHandler(async (req, res) => {
    await service.exportPdf(
      req.user,
      req.params.studentId,
      {
        collectionId: req.query.collectionId,
        from: req.query.from,
        to: req.query.to,
        archive: req.query.archive === 'true',
      },
      res
    );
  })
);

/**
 * @swagger
 * /reports/me:
 *   get:
 *     summary: Generate your own report (students)
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: collectionId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Report returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/me',
  validate({ query: generateSchema.query }),
  asyncHandler(async (req, res) => {
    const report = await service.generate(req.user, null, {
      collectionId: req.query.collectionId,
      from: req.query.from,
      to: req.query.to,
    });
    return ApiResponse.ok(res, report, 'Report generated successfully');
  })
);

/**
 * @swagger
 * /reports/me/pdf:
 *   get:
 *     summary: Export your own report as PDF (students)
 *     tags: [Reports]
 *     produces: [application/pdf]
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get(
  '/me/pdf',
  validate({ query: generateSchema.query }),
  asyncHandler(async (req, res) => {
    await service.exportPdf(
      req.user,
      null,
      {
        collectionId: req.query.collectionId,
        from: req.query.from,
        to: req.query.to,
        archive: false,
      },
      res
    );
  })
);

router.use(instructorOnly);

/**
 * @swagger
 * /reports:
 *   get:
 *     summary: List archived report generations
 *     tags: [Reports]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: student
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: '#/components/responses/PaginatedList' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/',
  validate({ query: paginationQuery.extend({ student: objectId.optional() }) }),
  asyncHandler(async (req, res) =>
    ApiResponse.paginated(res, await service.list(req.query), 'Reports retrieved successfully')
  )
);

/**
 * @swagger
 * /reports/{id}:
 *   get:
 *     summary: Get an archived report record
 *     tags: [Reports]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Report record returned }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete an archived report and its stored PDF
 *     tags: [Reports]
 *     parameters: [{ $ref: '#/components/parameters/IdParam' }]
 *     responses:
 *       200: { description: Report deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(
    validate({ params: idParams }),
    asyncHandler(async (req, res) =>
      ApiResponse.ok(res, await service.getById(req.params.id), 'Report retrieved successfully')
    )
  )
  .delete(
    validate({ params: idParams }),
    asyncHandler(async (req, res) =>
      ApiResponse.ok(
        res,
        await service.removeReport(req.params.id, req.user._id),
        'Report deleted successfully'
      )
    )
  );

module.exports = router;
