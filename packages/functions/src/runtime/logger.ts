type LogMetadata = Record<string, unknown>;

interface StructuredLogger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
}

function writeLog(
  severity: 'ERROR' | 'INFO' | 'WARNING',
  message: string,
  metadata: LogMetadata = {}
): void {
  const record = JSON.stringify({
    ...metadata,
    severity,
    message,
  });

  if (severity === 'ERROR') {
    console.error(record);
    return;
  }
  if (severity === 'WARNING') {
    console.warn(record);
    return;
  }
  console.info(record);
}

export function logInfo(message: string, metadata?: LogMetadata): void {
  writeLog('INFO', message, metadata);
}

export function logWarning(message: string, metadata?: LogMetadata): void {
  writeLog('WARNING', message, metadata);
}

export function logError(message: string, metadata?: LogMetadata): void {
  writeLog('ERROR', message, metadata);
}

export const logger: StructuredLogger = {
  info: logInfo,
  warn: logWarning,
  error: logError,
};
