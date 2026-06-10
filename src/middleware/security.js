const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const express = require('express');

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de uploads atingido. Tente novamente em 1 hora.' }
});

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : [];

const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Allow same-origin requests (no origin header = same origin or non-browser clients)
    if (!origin) {
      return callback(null, true);
    }
    // If CORS_ORIGINS is not configured, allow all origins (same as before)
    if (ALLOWED_ORIGINS.length === 0) {
      return callback(null, true);
    }
    // If configured, only allow listed origins
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '10mb' });

const securityMiddleware = [
  helmetMiddleware,
  corsMiddleware,
  jsonParser,
  urlencodedParser
];

module.exports = { securityMiddleware, apiLimiter, loginLimiter, uploadLimiter };
