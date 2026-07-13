import express from 'express';
import { z } from 'zod';
import dotenv from 'dotenv';
import { RelayerService } from './relayer.js';
import { setupMiddleware } from './middleware.js';
import type { RelayerConfig, DelegationRequest } from './types.js';

dotenv.config();

// ─── KEEP ALIVE ─── Railway needs active event loop
setInterval(() => {
    console.log('Heartbeat:', new Date().toISOString());
}, 10000);

setInterval(() => {}, 1000); // prevents event loop exit

process.on('SIGTERM', () => {
    console.log('SIGTERM received, keeping alive');
    setTimeout(() => process.exit(0), 30000);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, keeping alive');
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled:', err);
});

// ─── CONFIG ───
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

// ─── HEALTH CHECK (NO CORS, NO MIDDLEWARE) ───
// Railway hits this immediately after start — must respond fast
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    relayer: relayer.address,
    timestamp: new Date().toISOString()
  });
});

app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'pong', time: Date.now() });
});

// ─── APPLY MIDDLEWARE AFTER HEALTH CHECKS ───
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

// ─── START SERVER ───
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Relayer running on port ${config.port}`);
  console.log(`🔑 Relayer address: ${relayer.address}`);
  console.log(`🌐 CORS origins: ${config.corsOrigins.join(', ') || 'all'}`);
  sendLog(`🚀 Relayer started: ${relayer.address}`);
});
           
