import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_PORT = 4318;
const PORT = Number.parseInt(
  process.env['OTEL_COLLECTOR_PORT'] ?? `${DEFAULT_PORT}`,
  10
);
const HOST = process.env['OTEL_COLLECTOR_HOST'] ?? '127.0.0.1';
const OTEL_DIR = resolve(process.env['OTEL_OUTPUT_DIR'] ?? join(process.cwd(), '.otel'));
const TRACES_FILE = join(OTEL_DIR, 'traces.jsonl');
const LOGS_FILE = join(OTEL_DIR, 'logs.jsonl');

if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid OTEL_COLLECTOR_PORT: ${process.env['OTEL_COLLECTOR_PORT'] ?? ''}`);
}

mkdirSync(OTEL_DIR, { recursive: true });

interface OTelAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

interface OTelSpan {
  name: string;
  traceId: string;
  spanId: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  kind?: number;
  status?: { code?: number };
  attributes?: OTelAttribute[];
}

interface OTelLogRecord {
  timeUnixNano: string;
  severityText?: string;
  body?: { stringValue?: string };
  attributes?: OTelAttribute[];
  traceId?: string;
  spanId?: string;
}

function flattenAttributes(
  attrs?: OTelAttribute[]
): Record<string, string | boolean> {
  if (!attrs) return {};
  const result: Record<string, string | boolean> = {};
  for (const attr of attrs) {
    if (attr.value.stringValue !== undefined) {
      result[attr.key] = attr.value.stringValue;
    } else if (attr.value.intValue !== undefined) {
      result[attr.key] = attr.value.intValue;
    } else if (attr.value.boolValue !== undefined) {
      result[attr.key] = attr.value.boolValue;
    }
  }
  return result;
}

function nanoToISO(nanoString: string): string {
  // Handle both integer strings ("1771902620625418000") and
  // scientific notation ("1.771902620625418e+18") from iOS Swift's String(Double)
  const nanoNum = Number(nanoString);
  const ms = Math.floor(nanoNum / 1_000_000);
  return new Date(ms).toISOString();
}

function spanKindToString(kind?: number): string {
  const kinds: Record<number, string> = {
    1: 'internal',
    2: 'server',
    3: 'client',
    4: 'producer',
    5: 'consumer',
  };
  return kinds[kind ?? 0] ?? 'unspecified';
}

function statusCodeToString(code?: number): string {
  const codes: Record<number, string> = {
    0: 'unset',
    1: 'ok',
    2: 'error',
  };
  return codes[code ?? 0] ?? 'unset';
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function handleTraces(body: string): number {
  const data = JSON.parse(body);
  let count = 0;

  for (const resourceSpan of data.resourceSpans ?? []) {
    const resource = flattenAttributes(resourceSpan.resource?.attributes);
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of (scopeSpan.spans ?? []) as OTelSpan[]) {
        const startMs = Math.floor(
          Number(span.startTimeUnixNano) / 1_000_000
        );
        const endMs = Math.floor(
          Number(span.endTimeUnixNano) / 1_000_000
        );
        const line = JSON.stringify({
          name: span.name,
          traceId: span.traceId,
          spanId: span.spanId,
          startTime: nanoToISO(span.startTimeUnixNano),
          endTime: nanoToISO(span.endTimeUnixNano),
          durationMs: endMs - startMs,
          status: statusCodeToString(span.status?.code),
          kind: spanKindToString(span.kind),
          attributes: flattenAttributes(span.attributes),
          resource,
        });
        appendFileSync(TRACES_FILE, line + '\n');
        count++;
      }
    }
  }

  return count;
}

function handleLogs(body: string): number {
  const data = JSON.parse(body);
  let count = 0;

  for (const resourceLog of data.resourceLogs ?? []) {
    const resource = flattenAttributes(resourceLog.resource?.attributes);
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of (scopeLog.logRecords ??
        []) as OTelLogRecord[]) {
        const line = JSON.stringify({
          timestamp: nanoToISO(record.timeUnixNano),
          severity: record.severityText ?? 'UNSPECIFIED',
          body: record.body?.stringValue ?? '',
          attributes: flattenAttributes(record.attributes),
          traceId: record.traceId ?? '',
          spanId: record.spanId ?? '',
          resource,
        });
        appendFileSync(LOGS_FILE, line + '\n');
        count++;
      }
    }
  }

  return count;
}

function handleClean(): void {
  writeFileSync(TRACES_FILE, '');
  writeFileSync(LOGS_FILE, '');
}

function respond(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  // CORS for iOS simulator
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'POST' && req.url === '/v1/traces') {
      const body = await readBody(req);
      const count = handleTraces(body);
      respond(res, 200, { accepted: count });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/logs') {
      const body = await readBody(req);
      const count = handleLogs(body);
      respond(res, 200, { accepted: count });
      return;
    }

    if (req.method === 'DELETE' && req.url === '/v1/all') {
      handleClean();
      respond(res, 200, { cleared: true });
      return;
    }

    respond(res, 404, { error: 'Not found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[otel-collector] Error handling ${req.url}: ${message}`);
    respond(res, 400, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[otel-collector] Listening on http://${HOST}:${PORT}`);
  console.log(`[otel-collector] Traces → ${TRACES_FILE}`);
  console.log(`[otel-collector] Logs   → ${LOGS_FILE}`);
});
