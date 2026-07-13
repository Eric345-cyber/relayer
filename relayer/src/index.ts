import express from 'express';
import { z } from 'zod';
import dotenv from 'dotenv';
import { RelayerService } from './relayer.js';
import { setupMiddleware } from './middleware.js';
import type { RelayerConfig, DelegationRequest } from './types.js';

dotenv.config();

const config: RelayerConfig = {
  relayerKey: process.env.RELAYER_PRIVATE_KEY || '',
  rpcUrl: process.env.RPC_URL || '',
  fallbackRpcUrl: process.env.FALLBACK_RPC_URL,
  port: parseInt(process.env.PORT || '3000'),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10'),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID
};

if (!config.relayerKey || !config.rpcUrl) {
  console.error('Missing RELAYER_PRIVATE_KEY or RPC_URL');
  process.exit(1);
}

const app = express();
const relayer = new RelayerService(config.relayerKey, config.rpcUrl, config.fallbackRpcUrl);

// ─── RAW LOGGING (before CORS/middleware) ───
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} | origin: ${req.headers.origin || 'none'} | ip: ${req.ip}`);
  next();
});

// ─── HEALTH CHECK (before CORS — Railway needs this) ───
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    relayer: relayer.address,
    timestamp: new Date().toISOString()
  });
});

app.get('/ping', (req, res) => {
  res.json({ status: 'pong', time: Date.now() });
});

// ─── APPLY CORS/SECURITY ONLY TO API ROUTES ───
setupMiddleware(app, config);

async function sendLog(msg: string) {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegramChatId, text: msg })
    });
  } catch {}
}

const delegateSchema = z.object({
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chainId: z.number().int().positive(),
  router: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.number().int().nonnegative(),
  yParity: z.number().int().min(0).max(1),
  r: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  s: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  callData: z.string().regex(/^0x[a-fA-F0-9]*$/).optional(),
  deadline: z.number().int().optional()
});

app.get('/balance', async (req, res) => {
  try {
    const balance = await relayer.getBalance();
    res.json({ address: relayer.address, balance: `${balance} ETH` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/delegate', async (req, res) => {
  try {
    const parsed = delegateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: ' + parsed.error.issues.map(i => i.message).join(', ')
      });
    }
    
    const request: DelegationRequest = parsed.data;
    const result = await relayer.delegate(request);
    
    if (result.success) {
      await sendLog(`✅ Delegated: ${result.txHash?.slice(0, 20)}...`);
      res.json(result);
    } else {
      await sendLog(`❌ Failed: ${result.error}`);
      res.status(400).json(result);
    }
  } catch (e: any) {
    await sendLog(`💥 Error: ${e.message}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── KEEP ALIVE ───
const server = app.listen(config.port, () => {
  console.log(`🚀 Relayer running on port ${config.port}`);
  console.log(`🔑 Relayer address: ${relayer.address}`);
  console.log(`🌐 CORS origins: ${config.corsOrigins.join(', ') || 'all'}`);
  sendLog(`🚀 Relayer started: ${relayer.address}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
                       
