import type { Database } from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { MesocycleService } from './mesocycle.service.js';

export { MesocycleService } from './mesocycle.service.js';

// Singleton instances for use with the default database
let mesocycleService: MesocycleService | null = null;

// Reset all service singletons (for testing)
export function resetServices(): void {
  mesocycleService = null;
}

export function getMesocycleService(): MesocycleService {
  if (!mesocycleService) {
    mesocycleService = new MesocycleService(getDatabase());
  }
  return mesocycleService;
}

// Helper to create services with a custom database (useful for testing)
export function createServices(db: Database): {
  mesocycle: MesocycleService;
} {
  return {
    mesocycle: new MesocycleService(db),
  };
}
