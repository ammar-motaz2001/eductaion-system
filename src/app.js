'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('./config/env');
const logger = require('./config/logger');
const { mountSwagger } = require('./config/swagger');
const ApiError = require('./core/ApiError');
const requestContext = require('./middlewares/requestContext.middleware');
const { apiLimiter } = require('./middlewares/rateLimit.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const routes = require('./routes');

/**
 * Express application assembly.
 *
 * Middleware order matters: security headers → parsing → sanitisation →
 * observability → rate limiting → routes → 404 → error handler.
 */
const app = express();

// Behind a load balancer, trust the proxy so `req.ip` and rate limiting see the
// real client address rather than the balancer's.
app.set('trust proxy', env.isProduction ? 1 : false);
app.disable('x-powered-by');

// ── Security ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    // Swagger UI needs inline styles/scripts and CDN assets; the API serves no other HTML.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, server-to-server) which send no Origin.
      if (!origin || env.corsOrigins.includes('*')) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(ApiError.forbidden(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-Request-Id', 'X-Report-Id', 'Content-Disposition'],
  })
);

// ── Parsing ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(compression());

// Strip `$`/`.` operators from user input so a crafted body cannot become a query
// operator. Applied after parsing and before anything reads the body.
app.use(
  mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ key }) => logger.warn('Sanitised prohibited key in request', { key }),
  })
);

// Collapse duplicated query parameters, except the ones where repetition is meaningful.
app.use(hpp({ whitelist: ['sort', 'fields', 'collections', 'students'] }));

// ── Observability ───────────────────────────────────────────────────────────
app.use(requestContext);
app.use(
  morgan(env.isProduction ? 'combined' : 'dev', {
    stream: logger.stream,
    skip: (req) => req.path === '/health' || req.path.startsWith('/docs'),
  })
);

// ── Static uploads (local storage driver only) ──────────────────────────────
app.use(
  `/${env.LOCAL_UPLOAD_DIR}`,
  express.static(env.localUploadRoot, {
    maxAge: env.isProduction ? '7d' : 0,
    fallthrough: true,
    index: false,
  })
);

// ── Documentation ───────────────────────────────────────────────────────────
mountSwagger(app);

// ── API ─────────────────────────────────────────────────────────────────────
app.use(env.API_PREFIX, apiLimiter, routes);

// Convenience redirect so the bare root lands somewhere useful.
app.get('/', (_req, res) => res.redirect(`${env.API_PREFIX}/`));

// ── Fallbacks ───────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
