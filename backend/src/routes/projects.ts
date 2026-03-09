import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { basename } from 'path';
import { loadConfig, saveConfig } from '../config.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json(config.projects);
});

router.post('/', (req: Request, res: Response) => {
  const { path } = req.body as { path: string };
  if (!path || !existsSync(path)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const config = loadConfig();
  const project = {
    id: randomUUID(),
    name: basename(path),
    path,
    worktreeBase: `${path}/.worktrees`,
  };
  config.projects.push(project);
  saveConfig(config);
  res.status(201).json(project);
});

export default router;
