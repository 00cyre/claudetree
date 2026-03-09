import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig } from '../config.js';
import { linearClient } from '../linear/client.js';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  const config = loadConfig();
  const clientState = linearClient.getStatus();
  res.json({
    configured: !!config.linearApiKey,
    connected: clientState.status === 'connected',
    status: clientState.status,
    error: clientState.error,
  });
});

router.post('/setup', async (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey?.trim()) {
    res.status(400).json({ error: 'API key is required' });
    return;
  }

  const config = loadConfig();
  config.linearApiKey = apiKey.trim();
  saveConfig(config);

  try {
    await linearClient.connect(apiKey.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to connect: ${String(err)}` });
  }
});

router.get('/tools', async (_req: Request, res: Response) => {
  const state = linearClient.getStatus();
  if (state.status !== 'connected') {
    res.status(503).json({
      error: 'Linear MCP is not connected',
      status: state.status,
    });
    return;
  }
  try {
    const tools = await linearClient.listTools();
    res.json(tools);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/issues/:issueId', async (req: Request, res: Response) => {
  const { issueId } = req.params;
  const state = linearClient.getStatus();

  if (state.status !== 'connected') {
    res.status(503).json({
      error: 'Linear MCP is not connected',
      status: state.status,
    });
    return;
  }

  try {
    const issue = await linearClient.getIssue(issueId);
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '');
  if (!query.trim()) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  const state = linearClient.getStatus();
  if (state.status !== 'connected') {
    res.status(503).json({
      error: 'Linear MCP is not connected',
      status: state.status,
    });
    return;
  }

  try {
    const issues = await linearClient.searchIssues(query.trim());
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
