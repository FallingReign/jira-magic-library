/**
 * Configuration Manager
 * Handles credential storage and retrieval
 */

import * as fs from 'fs';
import * as path from 'path';

// Save config in the current working directory (where npm start was run)
const CONFIG_FILE = path.join(process.cwd(), '.demo-config.json');

/**
 * Save configuration to local file
 */
export function saveConfig(config) {
  const configData = {
    ...config,
    // Note: In production, you'd want to encrypt the token
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2), 'utf-8');
  console.log(`\n✓ Config saved to: ${CONFIG_FILE}\n`);
}

/**
 * Load configuration from local file
 */
export function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }

    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);

    // Return without the savedAt metadata
    const { savedAt, ...demoConfig } = config;
    return demoConfig;
  } catch (error) {
    return null;
  }
}

/**
 * Check if config exists
 */
export function hasConfig() {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * Delete saved configuration
 */
export function deleteConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}
