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

export interface AppConfig {
  projects: Project[];
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
