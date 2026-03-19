import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';

const CONFIG_DIR = join(homedir(), '.claudetree');
const SHARED_FILE = join(CONFIG_DIR, 'shared.json');
const LEGACY_CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const INSTANCE_NAME = basename(process.env.CLAUDETREE_PROJECT_ROOT || process.cwd());
const INSTANCE_DIR = join(CONFIG_DIR, 'instances', INSTANCE_NAME);
const INSTANCE_FILE = join(INSTANCE_DIR, 'config.json');

const API_KEYS = ['linearApiKey', 'anthropicApiKey', 'anthropicModel'] as const;

export function getInstanceName(): string {
  return INSTANCE_NAME;
}

export function getInstanceDir(): string {
  return INSTANCE_DIR;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  worktreeBase: string;
}

export interface WorktreeLink {
  linearIssueId?: string;
  description?: string;
  linearIssueTitle?: string;
  flags?: string[];
  folderId?: string;
}

export interface Flag {
  name: string;
  color: string;
}

export interface Folder {
  id: string;
  name: string;
}

export interface AppConfig {
  projects: Project[];
  linearApiKey?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  worktreeLinks?: Record<string, WorktreeLink>;
  flags?: Flag[];
  worktreeOrder?: Record<string, string[]>;
  folders?: Record<string, Folder[]>;
  folderOrder?: Record<string, string[]>;
}

interface SharedConfig {
  linearApiKey?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
}

interface InstanceConfig {
  projects: Project[];
  linearApiKey?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  worktreeLinks?: Record<string, WorktreeLink>;
  flags?: Flag[];
  worktreeOrder?: Record<string, string[]>;
  folders?: Record<string, Folder[]>;
  folderOrder?: Record<string, string[]>;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  ensureDir(join(path, '..'));
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function migrateIfNeeded(): void {
  if (existsSync(INSTANCE_FILE)) return;
  const legacy = readJson<AppConfig>(LEGACY_CONFIG_FILE);
  if (!legacy) return;

  // Split legacy config: API keys → shared, rest → instance
  const shared: SharedConfig = {};
  const instance: InstanceConfig = { projects: legacy.projects || [] };

  for (const key of API_KEYS) {
    if (legacy[key]) {
      shared[key] = legacy[key];
    }
  }

  if (legacy.worktreeLinks) {
    instance.worktreeLinks = legacy.worktreeLinks;
  }

  // Write shared only if it doesn't exist yet (another instance may have migrated first)
  if (!existsSync(SHARED_FILE)) {
    writeJson(SHARED_FILE, shared);
  }

  writeJson(INSTANCE_FILE, instance);
}

function defaultConfig(): AppConfig {
  return { projects: [] };
}

export function loadConfig(): AppConfig {
  ensureDir(CONFIG_DIR);
  migrateIfNeeded();

  const shared = readJson<SharedConfig>(SHARED_FILE) || {};
  const instance = readJson<InstanceConfig>(INSTANCE_FILE) || { projects: [] };

  // Merge: instance keys override shared if both exist
  return {
    projects: instance.projects || [],
    linearApiKey: instance.linearApiKey || shared.linearApiKey,
    anthropicApiKey: instance.anthropicApiKey || shared.anthropicApiKey,
    anthropicModel: instance.anthropicModel || shared.anthropicModel,
    worktreeLinks: instance.worktreeLinks,
    flags: instance.flags,
    worktreeOrder: instance.worktreeOrder,
    folders: instance.folders,
    folderOrder: instance.folderOrder,
  };
}

export function saveConfig(config: AppConfig): void {
  ensureDir(CONFIG_DIR);

  // API keys go to shared
  const shared = readJson<SharedConfig>(SHARED_FILE) || {};
  for (const key of API_KEYS) {
    if (config[key] !== undefined) {
      shared[key] = config[key];
    }
  }
  writeJson(SHARED_FILE, shared);

  // Everything else goes to instance
  const instance: InstanceConfig = {
    projects: config.projects,
    worktreeLinks: config.worktreeLinks,
    flags: config.flags,
    worktreeOrder: config.worktreeOrder,
    folders: config.folders,
    folderOrder: config.folderOrder,
  };
  // Preserve instance-level API key overrides if set
  const prev = readJson<InstanceConfig>(INSTANCE_FILE);
  for (const key of API_KEYS) {
    if (prev?.[key]) {
      instance[key] = config[key];
    }
  }
  writeJson(INSTANCE_FILE, instance);
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

export function getFlags(): Flag[] {
  return loadConfig().flags ?? [];
}

export function addFlag(flag: Flag): void {
  const config = loadConfig();
  if (!config.flags) config.flags = [];
  if (!config.flags.some((f) => f.name === flag.name)) {
    config.flags.push(flag);
    saveConfig(config);
  }
}

export function removeFlag(name: string): void {
  const config = loadConfig();
  if (config.flags) {
    config.flags = config.flags.filter((f) => f.name !== name);
    saveConfig(config);
  }
}

export function ensureDefaultFlags(): void {
  const defaults: Flag[] = [
    { name: 'PR OPEN', color: '#3b82f6' },
    { name: 'Blocked', color: '#ef4444' },
    { name: 'Ready for Review', color: '#22c55e' },
  ];
  const existing = getFlags();
  if (existing.length > 0) return;
  for (const flag of defaults) {
    addFlag(flag);
  }
}

export function getWorktreeOrder(projectId: string): string[] {
  return loadConfig().worktreeOrder?.[projectId] ?? [];
}

export function setWorktreeOrder(projectId: string, order: string[]): void {
  const config = loadConfig();
  if (!config.worktreeOrder) config.worktreeOrder = {};
  config.worktreeOrder[projectId] = order;
  saveConfig(config);
}

// --- Folder helpers ---

export function getFolders(projectId: string): Folder[] {
  return loadConfig().folders?.[projectId] ?? [];
}

export function addFolder(projectId: string, folder: Folder): void {
  const config = loadConfig();
  if (!config.folders) config.folders = {};
  if (!config.folders[projectId]) config.folders[projectId] = [];
  config.folders[projectId].push(folder);
  saveConfig(config);
}

export function updateFolder(projectId: string, folderId: string, name: string): void {
  const config = loadConfig();
  const folders = config.folders?.[projectId];
  if (!folders) return;
  const folder = folders.find((f) => f.id === folderId);
  if (folder) {
    folder.name = name;
    saveConfig(config);
  }
}

export function removeFolder(projectId: string, folderId: string): void {
  const config = loadConfig();
  if (config.folders?.[projectId]) {
    config.folders[projectId] = config.folders[projectId].filter((f) => f.id !== folderId);
  }
  // Clear folderId from all worktreeLinks
  if (config.worktreeLinks) {
    for (const link of Object.values(config.worktreeLinks)) {
      if (link.folderId === folderId) {
        delete link.folderId;
      }
    }
  }
  // Remove from folderOrder
  if (config.folderOrder?.[projectId]) {
    config.folderOrder[projectId] = config.folderOrder[projectId].filter((id) => id !== folderId);
  }
  saveConfig(config);
}

export function getFolderOrder(projectId: string): string[] {
  return loadConfig().folderOrder?.[projectId] ?? [];
}

export function setFolderOrder(projectId: string, order: string[]): void {
  const config = loadConfig();
  if (!config.folderOrder) config.folderOrder = {};
  config.folderOrder[projectId] = order;
  saveConfig(config);
}
