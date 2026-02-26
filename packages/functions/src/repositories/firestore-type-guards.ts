export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function readString(
  data: Record<string, unknown>,
  key: string
): string | null {
  const value = data[key];
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

export function readNumber(
  data: Record<string, unknown>,
  key: string
): number | null {
  const value = data[key];
  if (typeof value === 'number') {
    return value;
  }
  return null;
}

export function readBoolean(
  data: Record<string, unknown>,
  key: string
): boolean | null {
  const value = data[key];
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

export function readNullableString(
  data: Record<string, unknown>,
  key: string
): string | null | undefined {
  const value = data[key];
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

export function readNumberArray(
  data: Record<string, unknown>,
  key: string
): number[] | null | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((entry): entry is number => typeof entry === 'number')) {
    return null;
  }
  return value;
}

export function readEnum<T extends string>(
  data: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T | null {
  const value = data[key];
  if (typeof value !== 'string') {
    return null;
  }
  return allowed.includes(value as T) ? (value as T) : null;
}
