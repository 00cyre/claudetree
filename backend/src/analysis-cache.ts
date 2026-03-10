import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getInstanceDir } from './config.js';
import type { AnalysisResult, FileDetailedAnalysis } from './ai/analyzer.js';

interface CachedEntry<T> {
  hash: string;
  timestamp: number;
  result: T;
}

function analysisDir(worktreeId: string): string {
  return join(getInstanceDir(), 'analysis', worktreeId);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readCached<T>(path: string, expectedHash: string): T | null {
  try {
    if (!existsSync(path)) return null;
    const entry = JSON.parse(readFileSync(path, 'utf-8')) as CachedEntry<T>;
    if (entry.hash !== expectedHash) return null;
    return entry.result;
  } catch {
    return null;
  }
}

function writeCached<T>(path: string, hash: string, result: T): void {
  try {
    ensureDir(join(path, '..'));
    const entry: CachedEntry<T> = { hash, timestamp: Date.now(), result };
    writeFileSync(path, JSON.stringify(entry, null, 2));
  } catch (err) {
    console.error('Failed to write analysis cache:', err);
  }
}

export function loadAggregateAnalysis(worktreeId: string, hash: string): AnalysisResult | null {
  return readCached<AnalysisResult>(join(analysisDir(worktreeId), 'aggregate.json'), hash);
}

export function saveAggregateAnalysis(worktreeId: string, hash: string, result: AnalysisResult): void {
  writeCached(join(analysisDir(worktreeId), 'aggregate.json'), hash, result);
}

export function loadFileAnalysis(worktreeId: string, file: string, hash: string): FileDetailedAnalysis | null {
  const encoded = encodeURIComponent(file) + '.json';
  return readCached<FileDetailedAnalysis>(join(analysisDir(worktreeId), 'files', encoded), hash);
}

export function saveFileAnalysis(worktreeId: string, file: string, hash: string, result: FileDetailedAnalysis): void {
  const encoded = encodeURIComponent(file) + '.json';
  writeCached(join(analysisDir(worktreeId), 'files', encoded), hash, result);
}
