import { describe, it, expect } from 'vitest';
import {
  isRecord,
  readString,
  readNumber,
  readBoolean,
  readNullableString,
  readNumberArray,
  readEnum,
} from './firestore-type-guards.js';

describe('firestore-type-guards', () => {
  describe('isRecord', () => {
    it('should accept plain objects', () => {
      expect(isRecord({ value: 1 })).toBe(true);
    });

    it('should reject arrays, null, and primitives', () => {
      expect(isRecord([1, 2, 3])).toBe(false);
      expect(isRecord(null)).toBe(false);
      expect(isRecord('value')).toBe(false);
      expect(isRecord(42)).toBe(false);
    });
  });

  describe('readString', () => {
    it('should read strings from record values', () => {
      expect(readString({ answer: '42' }, 'answer')).toBe('42');
    });

    it('should return null when value is not a string', () => {
      expect(readString({ answer: 42 }, 'answer')).toBeNull();
      expect(readString({}, 'missing')).toBeNull();
    });
  });

  describe('readNumber', () => {
    it('should read numbers from record values', () => {
      expect(readNumber({ count: 7 }, 'count')).toBe(7);
    });

    it('should return null when value is not a number', () => {
      expect(readNumber({ count: '7' }, 'count')).toBeNull();
      expect(readNumber({}, 'missing')).toBeNull();
    });
  });

  describe('readBoolean', () => {
    it('should read booleans from record values', () => {
      expect(readBoolean({ active: false }, 'active')).toBe(false);
    });

    it('should return null when value is not a boolean', () => {
      expect(readBoolean({ active: 1 }, 'active')).toBeNull();
      expect(readBoolean({}, 'missing')).toBeNull();
    });
  });

  describe('readNullableString', () => {
    it('should read nullable string values', () => {
      expect(readNullableString({ title: 'Focus' }, 'title')).toBe('Focus');
      expect(readNullableString({ title: null }, 'title')).toBeNull();
      expect(readNullableString({}, 'title')).toBeUndefined();
    });

    it('should return undefined for non-string non-null values', () => {
      expect(readNullableString({ title: 42 }, 'title')).toBeUndefined();
    });
  });

  describe('readNumberArray', () => {
    it('should read number arrays and return undefined when missing', () => {
      expect(readNumberArray({ values: [1, 2, 3] }, 'values')).toEqual([1, 2, 3]);
      expect(readNumberArray({}, 'values')).toBeUndefined();
    });

    it('should return null for invalid arrays or mixed elements', () => {
      expect(readNumberArray({ values: ['1', 2] }, 'values')).toBeNull();
      expect(readNumberArray({ values: 'not-an-array' }, 'values')).toBeNull();
      expect(readNumberArray({ values: null }, 'values')).toBeNull();
    });
  });

  describe('readEnum', () => {
    it('should read values included in allowed enum list', () => {
      expect(
        readEnum({ category: 'focus' }, 'category', ['focus', 'focus2'] as const)
      ).toBe('focus');
    });

    it('should return null when value is not part of allowed enum', () => {
      expect(
        readEnum({ category: 'sleep' }, 'category', ['focus', 'focus2'] as const)
      ).toBeNull();
      expect(
        readEnum({ category: 1 }, 'category', ['focus', 'focus2'] as const)
      ).toBeNull();
    });
  });
});
