import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { stripPathPrefix } from './strip-path-prefix.js';

function strip(url: string): { url: string; next: ReturnType<typeof vi.fn> } {
  const req = { url } as Request;
  const next = vi.fn();

  stripPathPrefix('exercises')(req, {} as Response, next as NextFunction);

  return { url: req.url, next };
}

describe('stripPathPrefix', () => {
  it.each([
    ['/api/dev/exercises', '/'],
    ['/api/prod/exercises', '/'],
    ['/api/dev/exercises/abc', '/abc'],
    ['/api/prod/exercises?custom=true', '/?custom=true'],
  ])('strips an exact legacy adapter prefix from %s', (input, expected) => {
    const result = strip(input);

    expect(result.url).toBe(expected);
    expect(result.next).toHaveBeenCalledOnce();
  });

  it.each([
    '/api/dev/exercises-extra',
    '/api/prod/exercisesExtra/abc',
    '/api/staging/exercises',
    '/exercises',
  ])('does not strip a lookalike path %s', (input) => {
    expect(strip(input).url).toBe(input);
  });
});
