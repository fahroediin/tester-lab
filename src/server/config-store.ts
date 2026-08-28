import fs from 'fs';
import path from 'path';

export interface AppConfig {
  sampleTestSuite: string;
  sampleTargetUrl: string;
  sampleSteps: Array<{
    action: string;
    targetLabel: string;
    value: string;
    description: string;
  }>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  sampleTestSuite: '',
  sampleTargetUrl: '',
  sampleSteps: []
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  try {
    ensureDataDir();
    if (!fs.existsSync(CONFIG_FILE)) {
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load config, returning default:', err);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(newConfig: AppConfig): void {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config:', err);
    throw new Error('Could not save configuration');
  }
}
