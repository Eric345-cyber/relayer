import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import type { RelayerConfig } from './types.js';

export function setupMiddleware(app: express.Express, config: RelayerConfig) {
  // Security headers
  app.use(helmet());
  
  // CORS
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
  }));
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { success: false, error: 'Too many requests, slow down' },
    standardHeaders: true,
    legacyHeaders: false,
    // Key by IP + userAddress to prevent single user from exhausting limits
    keyGenerator: (req) => {
      const userAddress = req.body?.userAddress || 'unknown';
      return `${req.ip}-${userAddress.toLowerCase()}`;
    }
  });
  app.use('/api/', limiter);
  
  // Body parsing
  app.use(express.json({ limit: '10kb' }));
    }
    
