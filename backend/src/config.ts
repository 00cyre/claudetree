import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.claudetree');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Project {
  id: string;
  name: string;
  path: string;
  worktreeBase: string;
}

export interface WorktreeLink {
  linearIssueId: string;
}

export interface AppConfig {
  projects: Project[];
  linearApiKey?: string;
  anthropicApiKey?: string;
  worktreeLinks?: Record<string, WorktreeLink>;
}

function defaultConfig(): AppConfig {
  return { projects: [] };
}

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    const cfg = defaultConfig();
    saveConfig(cfg);
    return cfg;
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as AppConfig;
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: AppConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getWorktreeLink(worktreePath: string): WorktreeLink | undefined {
  const config = loadConfig();
  return config.worktreeLinks?.[worktreePath];
}

export function setWorktreeLink(worktreePath: string, link: WorktreeLink): void {
  const config = loadConfig();
  if (!config.worktreeLinks) config.worktreeLinks = {};
  config.worktreeLinks[worktreePath] = link;
  saveConfig(config);
}

export function removeWorktreeLink(worktreePath: string): void {
  const config = loadConfig();
  if (config.worktreeLinks) {
    delete config.worktreeLinks[worktreePath];
    saveConfig(config);
  }
}
