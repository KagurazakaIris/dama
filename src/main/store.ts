import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AppSettings } from '../shared/types';

const defaults: AppSettings = {
  monitorEnabled: true,
  autoProcess: false,
  mosaicBlockSize: 10,
  sensitivePatterns: {
    idCard: true,
    bankCard: true,
    phone: true,
    email: true,
    ipAddress: true,
    passport: true,
    licensePlate: true,
  },
};

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'dama-settings.json');
}

export function getSettings(): AppSettings {
  try {
    const data = fs.readFileSync(getStorePath(), 'utf-8');
    return { ...defaults, ...JSON.parse(data) };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings();
  const merged = { ...current, ...settings };
  fs.writeFileSync(getStorePath(), JSON.stringify(merged, null, 2));
}
