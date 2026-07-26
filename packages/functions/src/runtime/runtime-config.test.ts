import { describe, expect, it } from 'vitest';
import { readRuntimeConfig } from './runtime-config.js';

describe('runtime config', () => {
  it('uses the Cloud Run network surface by default', () => {
    const config = readRuntimeConfig({});

    expect(config.localDevelopmentOnly).toBe(false);
    expect(config.bindAddress).toBe('0.0.0.0');
  });

  it('binds loopback when local development-only mode is explicit', () => {
    const config = readRuntimeConfig({
      BRAD_LOCAL_DEV_ONLY: 'true',
      GOOGLE_CLOUD_PROJECT: 'brad-os',
    });

    expect(config.localDevelopmentOnly).toBe(true);
    expect(config.bindAddress).toBe('127.0.0.1');
    expect(config.projectId).toBe('brad-os');
  });

  it('rejects ambiguous local development-only values', () => {
    expect(() => readRuntimeConfig({ BRAD_LOCAL_DEV_ONLY: 'yes' })).toThrow();
  });
});
