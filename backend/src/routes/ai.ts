import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../config.js';
import { validateApiKey } from '../ai/analyzer.js';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  const config = loadConfig();
  const configured = !!config.anthropicApiKey;
  res.json({ configured, connected: configured });
});

router.post('/setup', async (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey?.trim()) {
    res.status(400).json({ error: 'API key is required' });
    return;
  }

  try {
    await validateApiKey(apiKey.trim());
    const config = loadConfig();
    config.anthropicApiKey = apiKey.trim();
    saveConfig(config);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid API key';
    res.status(400).json({ error: msg });
  }
});

export default router;
