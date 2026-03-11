import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getInstanceDir } from './config.js';
import type { AnalysisResult, FileDetailedAnalysis, NarrativeAnalysis } from './ai/analyzer.js';

interface CachedEntry<T> {
  hash: string;
  timestamp: number;
  result: T;
}

interface NarrativeCachedEntry {
  stateFingerprint: string;
  contentHash: string;
  timestamp: number;
  result: NarrativeAnalysis;
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

export function loadNarrativeAnalysis(worktreeId: string, hash: string): NarrativeAnalysis | null {
  return readCached<NarrativeAnalysis>(join(analysisDir(worktreeId), 'narrative.json'), hash);
}

export function saveNarrativeAnalysis(worktreeId: string, hash: string, result: NarrativeAnalysis): void {
  writeCached(join(analysisDir(worktreeId), 'narrative.json'), hash, result);
}

// Fingerprint-based narrative cache: fast lookup by repo state without reading diffs
export function loadNarrativeByFingerprint(worktreeId: string, fingerprint: string): NarrativeAnalysis | null {
  try {
    const path = join(analysisDir(worktreeId), 'narrative.json');
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as NarrativeCachedEntry;
    if (raw.stateFingerprint === fingerprint) return raw.result;
    return null;
  } catch {
    return null;
  }
}

export function saveNarrativeWithFingerprint(
  worktreeId: string,
  fingerprint: string,
  contentHash: string,
  result: NarrativeAnalysis,
): void {
  try {
    const path = join(analysisDir(worktreeId), 'narrative.json');
    ensureDir(join(path, '..'));
    const entry: NarrativeCachedEntry = {
      stateFingerprint: fingerprint,
      contentHash,
      timestamp: Date.now(),
      result,
    };
    writeFileSync(path, JSON.stringify(entry, null, 2));
  } catch (err) {
    console.error('Failed to write narrative cache:', err);
  }
}
