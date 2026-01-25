import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseFilename, getDefaultDatabasePath } from '../index.js';

describe('getDatabaseFilename', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    // Restore original NODE_ENV
    if (originalEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalEnv;
    }
  });

  it('should return brad-os.test.db for test environment', () => {
    process.env['NODE_ENV'] = 'test';
    expect(getDatabaseFilename()).toBe('brad-os.test.db');
  });

  it('should return brad-os.prod.db for production environment', () => {
    process.env['NODE_ENV'] = 'production';
    expect(getDatabaseFilename()).toBe('brad-os.prod.db');
  });

  it('should return brad-os.db for development environment', () => {
    process.env['NODE_ENV'] = 'development';
    expect(getDatabaseFilename()).toBe('brad-os.db');
  });

  it('should return brad-os.db when NODE_ENV is not set', () => {
    delete process.env['NODE_ENV'];
    expect(getDatabaseFilename()).toBe('brad-os.db');
  });
});

describe('getDefaultDatabasePath', () => {
  const originalEnv = process.env['NODE_ENV'];
  const originalDbPath = process.env['DB_PATH'];

  beforeEach(() => {
    // Clear DB_PATH to test default behavior
    delete process.env['DB_PATH'];
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalEnv;
    }

    if (originalDbPath === undefined) {
      delete process.env['DB_PATH'];
    } else {
      process.env['DB_PATH'] = originalDbPath;
    }
  });

  it('should use DB_PATH environment variable when set', () => {
    process.env['DB_PATH'] = '/custom/path/mydb.db';
    expect(getDefaultDatabasePath()).toBe('/custom/path/mydb.db');
  });

  it('should include brad-os.test.db in path for test environment', () => {
    process.env['NODE_ENV'] = 'test';
    const path = getDefaultDatabasePath();
    expect(path).toContain('brad-os.test.db');
    expect(path).toContain('data');
  });

  it('should include brad-os.prod.db in path for production environment', () => {
    process.env['NODE_ENV'] = 'production';
    const path = getDefaultDatabasePath();
    expect(path).toContain('brad-os.prod.db');
    expect(path).toContain('data');
  });

  it('should include brad-os.db in path for development environment', () => {
    process.env['NODE_ENV'] = 'development';
    const path = getDefaultDatabasePath();
    expect(path).toContain('brad-os.db');
    expect(path).not.toContain('brad-os.test.db');
    expect(path).not.toContain('brad-os.prod.db');
    expect(path).toContain('data');
  });

  it('should prioritize DB_PATH over NODE_ENV', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DB_PATH'] = '/override/path.db';
    expect(getDefaultDatabasePath()).toBe('/override/path.db');
  });
});
