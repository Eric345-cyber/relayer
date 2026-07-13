import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import type { RelayerConfig } from './types.js';

export function setupMiddleware(app: express.Express, config: RelayerConfig) {
  app.set('trust proxy', 1);
  
  app.use(helmet());
  
  app.use(cors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : '*',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  }));
  
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || 'unknown'
  });
  app.use('/api/', limiter);
  
  app.use(express.json({ limit: '10kb' }));
}
