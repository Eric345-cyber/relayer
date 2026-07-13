import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import type { RelayerConfig } from './types.js';

export function setupMiddleware(app: express.Express, config: RelayerConfig) {
  app.use(helmet());
  
  // Debug: log all incoming requests before CORS
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.path} | origin: ${req.headers.origin || 'none'} | host: ${req.headers.host}`);
    next();
  });
  
  // CORS — allow exact origins, handle preflight
  app.use(cors({
    origin: (origin, callback) => {
      console.log('[CORS] Checking origin:', origin);
      
      // Allow no origin (curl, health checks)
      if (!origin) return callback(null, true);
      
      // Check against configured origins (strip trailing slashes for comparison)
      const cleanAllowed = config.corsOrigins.map(o => o.replace(/\/$/, ''));
      const cleanOrigin = origin.replace(/\/$/, '');
      
      if (cleanAllowed.includes(cleanOrigin) || cleanAllowed.includes('*')) {
        console.log('[CORS] ALLOWED:', origin);
        callback(null, true);
      } else {
        console.log('[CORS] BLOCKED:', origin, '| Allowed:', cleanAllowed);
        // TEMP: allow all for debugging
        callback(null, true);
      }
    },
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }));
  
  // Handle OPTIONS explicitly
  app.options('*', cors());
  
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/', limiter);
  
  app.use(express.json({ limit: '10kb' }));
                                                  }
  
