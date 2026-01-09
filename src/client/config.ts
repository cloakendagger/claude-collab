/**
 * Configuration manager for persistent client settings
 * Stores config in ~/.claude-collab/config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClientSettings {
  serverUrl?: string;
  username?: string;
  sessionId?: string;
  apiKey?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.claude-collab');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { mode: 0o700 });
  }
}

/**
 * Load settings from config file
 */
export function loadConfig(): ClientSettings {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    // Ignore errors, return empty config
  }
  return {};
}

/**
 * Save settings to config file
 */
export function saveConfig(settings: ClientSettings): void {
  ensureConfigDir();

  // Load existing config to preserve other fields
  const existing = loadConfig();
  const merged = { ...existing, ...settings };

  // Write with restricted permissions (owner read/write only)
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

/**
 * Clear a specific setting
 */
export function clearSetting(key: keyof ClientSettings): void {
  const config = loadConfig();
  delete config[key];
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Clear all settings
 */
export function clearAllSettings(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

/**
 * Get config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
