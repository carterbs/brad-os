# Debug Telemetry

## Overview

Debug-only OpenTelemetry instrumentation for structured iOS app observability. The system emits traces for network calls and structured logs for app events, writing JSONL files that Claude can query with Grep.

All telemetry is **no-op in release builds** — guarded by `#if DEBUG` in the SDK layer.

```
iOS App (OTel SDK) --> HTTP POST --> Local Collector --> session otel/*.jsonl --> Claude reads via Grep
```

## Quick Start (Recommended)

```bash
# Start full isolated loop (includes OTel)
npm run qa:start -- --id telemetry

# Query traces
grep 'error' /tmp/brad-os-qa/sessions/telemetry/otel/traces.jsonl
grep 'APIClient' /tmp/brad-os-qa/sessions/telemetry/otel/logs.jsonl

# Stop full loop
npm run qa:stop -- --id telemetry
```

## Advanced Collector-Only Flow (Troubleshooting)

Use only when debugging telemetry plumbing without the full `qa:start` loop.

```bash
npm run advanced:otel:start
OTEL_COLLECTOR_PORT=15444 OTEL_OUTPUT_DIR=.qa/alice/otel npm run advanced:otel:start
npm run advanced:otel:stop
npm run advanced:otel:clean
```

## Querying Telemetry (for Claude)

Use the Grep tool to search JSONL files. Each line is a self-contained JSON object.
Default `qa:start -- --id <id>` files are under `/tmp/brad-os-qa/sessions/<id>/otel/`.

**Find all API errors:**
```
Grep pattern="\"status\":\"error\"" path="/tmp/brad-os-qa/sessions/telemetry/otel/traces.jsonl"
```

**Find error-level logs:**
```
Grep pattern="ERROR" path="/tmp/brad-os-qa/sessions/telemetry/otel/logs.jsonl"
```

**Filter by simulator UDID:**
```
Grep pattern="simulator.udid.*AAAA" path="/tmp/brad-os-qa/sessions/telemetry/otel/traces.jsonl"
```

**Find slow requests (1000ms+):**
```
Grep pattern="durationMs\":[0-9]{4,}" path="/tmp/brad-os-qa/sessions/telemetry/otel/traces.jsonl"
```

**Find by source service:**
```
Grep pattern="\"source\":\"HealthKitSyncService\"" path="/tmp/brad-os-qa/sessions/telemetry/otel/logs.jsonl"
```

## Adding Instrumentation

### Structured Logging

`DebugLogger` is no-op in release builds. No `#if DEBUG` needed at call sites.

```swift
// Info-level log
DebugLogger.info("Sync completed", attributes: ["source": "HealthKitSync"])

// Warning
DebugLogger.warn("Token expired", attributes: ["source": "APIClient"])

// Error with attached error object
DebugLogger.error("Failed to decode", error: decodingError, attributes: ["source": "APIClient"])
```

### Network Spans

Wrap network calls in spans to capture timing and status.

```swift
let span = DebugTracing.startSpan("GET /api/exercises", kind: .client)
defer { span.end() }

span.setAttribute(key: "http.method", value: "GET")
// ... perform request ...
span.setAttribute(key: "http.status_code", value: "\(statusCode)")
```

## JSONL Output Format

### traces.jsonl

One JSON object per line. Each object represents a completed span.

```json
{
  "name": "GET /api/dev/exercises",
  "traceId": "abc123",
  "spanId": "def456",
  "startTime": "2026-02-23T20:30:00.000Z",
  "endTime": "2026-02-23T20:30:00.234Z",
  "durationMs": 234,
  "status": "ok",
  "kind": "client",
  "attributes": {
    "http.method": "GET",
    "http.status_code": "200"
  },
  "resource": {
    "service.name": "brad-os-ios",
    "simulator.udid": "AAAA-BBBB",
    "simulator.name": "iPhone 17 Pro"
  }
}
```

### logs.jsonl

One JSON object per line. Each log may reference a trace/span for correlation.

```json
{
  "timestamp": "2026-02-23T20:30:00.000Z",
  "severity": "ERROR",
  "body": "Failed to decode exercises response",
  "attributes": {
    "source": "APIClient",
    "error": "..."
  },
  "traceId": "abc123",
  "spanId": "def456",
  "resource": {
    "service.name": "brad-os-ios",
    "simulator.udid": "AAAA-BBBB"
  }
}
```

## Multi-Simulator Support

- Each simulator's UDID is included in `resource` attributes on every trace and log entry.
- Filter by UDID to isolate one simulator's data when running multiple simulators.
- The collector appends to shared JSONL files — all simulators write to the same `traces.jsonl` and `logs.jsonl`.
- Set `BRAD_OS_OTEL_BASE_URL` in simulator env to send a simulator to a different collector (for full file/process isolation).

## npm Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run advanced:otel:start` | Start collector on port 4318 |
| `npm run advanced:otel:stop` | Kill collector process |
| `npm run advanced:otel:clean` | Delete `.otel/` directory |
| `npm run qa:start` | Start isolated simulator + Firebase + OTel + build + launch |
| `npm run qa:stop` | Stop isolated loop and unset simulator env |

## Troubleshooting

- **Collector not receiving data:** Check port 4318 is free (`lsof -i :4318`). Verify the iOS app is built in DEBUG configuration and the simulator has network access to localhost.
- **Empty JSONL files:** The app must be running in DEBUG configuration. Release builds use no-op stubs.
- **Collector crashes:** Check Node.js version and ensure `tsx` is available (`npx tsx --version`).
- **Stale data:** Run `npm run advanced:otel:clean` to wipe old JSONL files before a fresh debugging session.
