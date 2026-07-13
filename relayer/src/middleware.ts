import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import type { RelayerConfig } from './types.js';

export function setupMiddleware(app: express.Express, config: RelayerConfig) {
  app.use(helmet());
  
  app.use(cors({
    origin: (origin, callback) => {
      const allowed = [...config.corsOrigins];
      console.log('[CORS] Request from origin:', origin, '| Allowed:', allowed);
      
      if (!origin || allowed.includes(origin) || allowed.includes('*')) {
        callback(null, true);
      } else {
        console.log('[CORS] BLOCKED:', origin);
        callback(null, true); // TEMP: allow all for debugging
      }
    },
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
  }));
  
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const userAddress = req.body?.userAddress || 'unknown';
      return `${req.ip}-${userAddress.toLowerCase()}`;
    }
  });
  app.use('/api/', limiter);
  
  app.use(express.json({ limit: '10kb' }));
    }
