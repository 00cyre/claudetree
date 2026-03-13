import { Router, Request, Response } from 'express';
import { getAllSessionStatuses } from '../terminal/pty.js';
import { getAllPipelineStatuses } from '../pipeline/watcher.js';
import { getAllPRWatcherStatuses } from '../pipeline/pr-watcher.js';

const router = Router();

router.get('/stream', (_req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial status immediately
  const initial = {
    sessions: getAllSessionStatuses(),
    pipelines: getAllPipelineStatuses(),
    prWatchers: getAllPRWatcherStatuses(),
  };
  res.write(`data: ${JSON.stringify(initial)}\n\n`);

  const interval = setInterval(() => {
    const payload = {
      sessions: getAllSessionStatuses(),
      pipelines: getAllPipelineStatuses(),
      prWatchers: getAllPRWatcherStatuses(),
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }, 1000);

  res.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
