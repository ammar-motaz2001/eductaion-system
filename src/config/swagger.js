'use strict';

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const env = require('./env');
const {
  EDUCATION_LEVELS,
  PERFORMANCE_LEVELS,
  EXAM_TYPES,
  PAYMENT_METHODS,
  WEEK_DAYS,
} = require('../core/constants');

/**
 * OpenAPI 3 definition.
 *
 * Endpoint documentation lives beside each route as `@swagger` JSDoc; this file
 * supplies the document shell plus the shared components (security scheme,
 * reusable parameters, standard error responses and enum schemas) that those
 * annotations reference.
 */

/** Standard error body, reused by every error response. */
const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'NOT_FOUND' },
        statusCode: { type: 'integer', example: 404 },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

/** Build a reusable `responses` entry for one status code. */
const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: errorSchema,
      example: {
        success: false,
        message: example.message,
        error: { code: example.code, statusCode: example.statusCode },
        timestamp: '2026-07-31T10:15:00.000Z',
      },
    },
  },
});

const definition = {
  openapi: '3.0.3',
  info: {
    title: `${env.APP_NAME} API`,
    version: '1.0.0',
    description: [
      'RESTful backend for an Education Management System.',
      '',
      '### Authentication',
      'All endpoints except registration, login, token refresh, password recovery,',
      'activation-code verification and the health check require a bearer access token:',
      '',
      '```',
      'Authorization: Bearer <accessToken>',
      '```',
      '',
      'Access tokens are short-lived. Use `POST /auth/refresh` with your refresh token to',
      'rotate the pair; the presented refresh token is invalidated on use, and replaying',
      'a rotated token revokes every session for that account.',
      '',
      '### Roles',
      '- **instructor** — full administrative access.',
      '- **student** — read access to their own record and to the collections they are enrolled in.',
      '',
      'Students register with an instructor-issued activation code and start with `pending`',
      'status; an instructor must approve them before they gain access to course content.',
      '',
      '### Response format',
      'Every response uses the same envelope:',
      '',
      '```json',
      '{ "success": true, "message": "...", "data": {}, "meta": {}, "timestamp": "..." }',
      '```',
      '',
      'List endpoints return `data` as an array and pagination details under `meta.pagination`.',
      '',
      '### Querying lists',
      'All list endpoints support:',
      '- `?page=` and `?limit=` (max 100) for pagination',
      '- `?sort=-createdAt,fullName` for multi-field sorting (`-` = descending)',
      "- `?search=` for case-insensitive search across that resource's text fields",
      '- Field filters, e.g. `?status=active&educationLevel=secondary-2`',
      '- Range operators on numeric and date fields, e.g. `?score[gte]=50&examDate[lt]=2026-09-01`',
      '- Set membership, e.g. `?examType[in]=quiz,midterm`',
      '- `?fields=` to project a subset of fields',
    ].join('\n'),
    contact: { name: 'API Support' },
    license: { name: 'MIT' },
  },
  servers: [
    { url: `http://localhost:${env.PORT}${env.API_PREFIX}`, description: 'Local development' },
    ...(process.env.VERCEL_URL
      ? [
          {
            url: `https://${process.env.VERCEL_URL}${env.API_PREFIX}`,
            description: 'Vercel deployment',
          },
        ]
      : []),
    { url: `${env.CLIENT_URL}${env.API_PREFIX}`, description: 'Configured deployment' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `accessToken` returned by `POST /auth/login`.',
      },
    },
    parameters: {
      IdParam: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        description: 'Resource identifier (24-character ObjectId)',
        example: '665f1c2e9b1e8a0012ab34cd',
      },
      CollectionIdParam: {
        in: 'path',
        name: 'collectionId',
        required: true,
        schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        description: 'Collection identifier',
      },
      StudentIdParam: {
        in: 'path',
        name: 'studentId',
        required: true,
        schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
        description: 'Student identifier',
      },
      PageParam: {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: '1-based page number',
      },
      LimitParam: {
        in: 'query',
        name: 'limit',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        description: 'Items per page (capped at 100)',
      },
      SortParam: {
        in: 'query',
        name: 'sort',
        schema: { type: 'string' },
        description: 'Comma-separated fields; prefix with `-` for descending',
        example: '-createdAt,fullName',
      },
      SearchParam: {
        in: 'query',
        name: 'search',
        schema: { type: 'string' },
        description: "Case-insensitive search across this resource's text fields",
      },
    },
    schemas: {
      EducationLevel: { type: 'string', enum: EDUCATION_LEVELS, example: 'secondary-2' },
      PerformanceLevel: {
        type: 'string',
        enum: Object.values(PERFORMANCE_LEVELS),
        example: 'good',
      },
      ExamType: { type: 'string', enum: Object.values(EXAM_TYPES), example: 'quiz' },
      PaymentMethod: { type: 'string', enum: Object.values(PAYMENT_METHODS), example: 'cash' },
      Address: {
        type: 'object',
        properties: {
          line: { type: 'string', example: '12 Nile Street' },
          city: { type: 'string', example: 'Giza' },
          governorate: { type: 'string', example: 'Giza' },
          country: { type: 'string', example: 'Egypt' },
        },
      },
      ScheduleSlot: {
        type: 'object',
        required: ['day', 'startTime', 'endTime'],
        properties: {
          day: { type: 'string', enum: WEEK_DAYS, example: 'saturday' },
          startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '16:00' },
          endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '18:00' },
          room: { type: 'string', example: 'A1' },
        },
      },
      StoredFile: {
        type: 'object',
        properties: {
          url: { type: 'string', example: '/uploads/lessons/665f.../newton-1722384000-ab12.pdf' },
          key: { type: 'string' },
          provider: { type: 'string', enum: ['local', 'cloudinary'] },
          originalName: { type: 'string', example: 'newton-laws.pdf' },
          mimeType: { type: 'string', example: 'application/pdf' },
          size: { type: 'integer', example: 248392 },
          kind: {
            type: 'string',
            enum: ['pdf', 'image', 'document', 'presentation', 'spreadsheet', 'video', 'other'],
          },
        },
      },
      TransactionInput: {
        type: 'object',
        required: ['title', 'amount', 'category'],
        properties: {
          title: { type: 'string', example: 'Studio rent — August' },
          amount: { type: 'number', minimum: 0, example: 6000 },
          currency: { type: 'string', example: 'EGP' },
          category: { type: 'string' },
          date: { type: 'string', format: 'date-time' },
          notes: { type: 'string' },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          pagination: {
            type: 'object',
            properties: {
              total: { type: 'integer', example: 132 },
              count: { type: 'integer', example: 20 },
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 20 },
              totalPages: { type: 'integer', example: 7 },
              hasPreviousPage: { type: 'boolean', example: false },
              hasNextPage: { type: 'boolean', example: true },
            },
          },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Success' },
          data: {},
          meta: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: errorSchema,
    },
    responses: {
      PaginatedList: {
        description: 'Paginated result set',
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/SuccessResponse' },
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    meta: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              ],
            },
          },
        },
      },
      BadRequest: errorResponse('The request was malformed or violated a business rule', {
        message: 'Bad request',
        code: 'BAD_REQUEST',
        statusCode: 400,
      }),
      Unauthorized: errorResponse('Missing, malformed or expired access token', {
        message: 'Authorization header with a bearer token is required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      }),
      Forbidden: errorResponse('Authenticated, but not permitted to perform this action', {
        message: 'This action requires one of the following roles: instructor',
        code: 'INSUFFICIENT_ROLE',
        statusCode: 403,
      }),
      NotFound: errorResponse('The requested resource does not exist', {
        message: 'Resource not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      }),
      Conflict: errorResponse('The request conflicts with the current state', {
        message: 'A record with this email already exists',
        code: 'CONFLICT',
        statusCode: 409,
      }),
      UnsupportedMediaType: errorResponse('The uploaded file type is not allowed', {
        message: 'Unsupported file type "application/x-msdownload"',
        code: 'UNSUPPORTED_MEDIA_TYPE',
        statusCode: 415,
      }),
      ValidationError: {
        description: 'Request validation failed',
        content: {
          'application/json': {
            schema: errorSchema,
            example: {
              success: false,
              message: 'Request validation failed',
              error: {
                code: 'UNPROCESSABLE_ENTITY',
                statusCode: 422,
                details: [
                  { field: 'email', message: 'Must be a valid email address' },
                  { field: 'password', message: 'Password must contain an uppercase letter' },
                ],
              },
              timestamp: '2026-07-31T10:15:00.000Z',
            },
          },
        },
      },
      TooManyRequests: errorResponse('Rate limit exceeded', {
        message: 'Too many requests — please try again later',
        code: 'TOO_MANY_REQUESTS',
        statusCode: 429,
      }),
      InternalServerError: errorResponse('Unexpected server error', {
        message: 'Something went wrong. Please try again later.',
        code: 'INTERNAL_SERVER_ERROR',
        statusCode: 500,
      }),
    },
  },
  // Applied to every operation unless overridden with `security: []`.
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Authentication and credential management' },
    { name: 'Activation Codes', description: 'Student registration codes' },
    { name: 'Students', description: 'Student profiles and approval workflow' },
    { name: 'Collections', description: 'Teaching groups' },
    { name: 'Collection Students', description: 'Enrolment' },
    { name: 'Lessons', description: 'Lesson material' },
    { name: 'Homework', description: 'Assignments' },
    { name: 'Attachments', description: 'General collection files' },
    { name: 'Attendance', description: 'Attendance workflow and statistics' },
    { name: 'Grades', description: 'Exam results' },
    { name: 'Payments', description: 'Student payments' },
    { name: 'Revenues', description: 'Income ledger' },
    { name: 'Expenses', description: 'Expense ledger' },
    { name: 'Finance', description: 'Combined financial reporting' },
    { name: 'Reports', description: 'Student reports and PDF export' },
    { name: 'Notifications', description: 'In-app notifications' },
    { name: 'Settings', description: 'Instructor profile and preferences' },
    { name: 'Files', description: 'Serve uploaded files by storage key' },
    { name: 'Dashboard', description: 'Aggregated statistics' },
    { name: 'System', description: 'Health and metadata' },
  ],
};

const spec = swaggerJsdoc({
  definition,
  // Route files carry the per-endpoint annotations.
  apis: [path.join(__dirname, '../modules/**/*.routes.js'), path.join(__dirname, '../routes/*.js')],
});

/**
 * Mount Swagger UI and the raw JSON spec.
 * @param {import('express').Application} app
 */
function mountSwagger(app) {
  const swaggerCdn = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

  const uiOptions = {
    explorer: true,
    customSiteTitle: `${env.APP_NAME} API Reference`,
    customCssUrl: `${swaggerCdn}/swagger-ui.css`,
    customJs: [
      `${swaggerCdn}/swagger-ui-bundle.js`,
      `${swaggerCdn}/swagger-ui-standalone-preset.js`,
    ],
    swaggerOptions: {
      // Load the spec over HTTP — required on Vercel where bundled static assets
      // under /docs are not served reliably by swagger-ui-express.
      url: '/docs.json',
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      displayRequestDuration: true,
    },
  };

  app.get('/docs.json', (_req, res) => res.json(spec));

  if (env.isVercel) {
    app.use('/docs', swaggerUi.setup(spec, uiOptions));
    return;
  }

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, uiOptions));
}

module.exports = { spec, mountSwagger };
