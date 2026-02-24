# Debug Telemetry

## Overview

Debug-only OpenTelemetry instrumentation for structured iOS app observability. The system emits traces for network calls and structured logs for app events, writing JSONL files that Claude can query with Grep.

All telemetry is **no-op in release builds** — guarded by `#if DEBUG` in the SDK layer.

```
iOS App (OTel SDK) --> HTTP POST --> Local Collector (port 4318) --> .otel/*.jsonl --> Claude reads via Grep
```

## Quick Start

```bash
# Start the collector
npm run otel:start

# Build and run the iOS app in simulator
cd ios/BradOS && xcodegen generate
xcodebuild -project BradOS.xcodeproj -scheme BradOS -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

# Query traces
grep 'error' .otel/traces.jsonl
grep 'APIClient' .otel/logs.jsonl

# Stop collector
npm run otel:stop

# Clean data
npm run otel:clean
```

## Querying Telemetry (for Claude)

Use the Grep tool to search JSONL files. Each line is a self-contained JSON object.

**Find all API errors:**
```
Grep pattern="\"status\":\"error\"" path=".otel/traces.jsonl"
```

**Find error-level logs:**
```
Grep pattern="ERROR" path=".otel/logs.jsonl"
```

**Filter by simulator UDID:**
```
Grep pattern="simulator.udid.*AAAA" path=".otel/traces.jsonl"
```

**Find slow requests (1000ms+):**
```
Grep pattern="durationMs\":[0-9]{4,}" path=".otel/traces.jsonl"
```

**Find by source service:**
```
Grep pattern="\"source\":\"HealthKitSyncService\"" path=".otel/logs.jsonl"
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

## npm Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run otel:start` | Start collector on port 4318 |
| `npm run otel:stop` | Kill collector process |
| `npm run otel:clean` | Delete `.otel/` directory |

## Troubleshooting

- **Collector not receiving data:** Check port 4318 is free (`lsof -i :4318`). Verify the iOS app is built in DEBUG configuration and the simulator has network access to localhost.
- **Empty JSONL files:** The app must be running in DEBUG configuration. Release builds use no-op stubs.
- **Collector crashes:** Check Node.js version and ensure `tsx` is available (`npx tsx --version`).
- **Stale data:** Run `npm run otel:clean` to wipe old JSONL files before a fresh debugging session.
