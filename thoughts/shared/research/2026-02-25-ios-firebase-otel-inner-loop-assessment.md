---
date: 2026-02-25
researcher: codex
git_commit: 2628fc3
branch: main
topic: iOS simulator + Firebase emulator + OTel inner-loop assessment for multi-agent isolation
tags: [ios, firebase, emulator, otel, qa, dev-loop]
status: complete
---

# Research Question

How well does the current iOS simulator + Firebase emulator + OTel collector inner dev loop work for an autonomous agent, and what gaps prevent multiple agents from running in isolated environments without sharing simulator, database, or telemetry?

# Summary

The current loop works for a single clean environment, but it is not isolation-safe for multiple concurrent agents. Core runtime endpoints and ports are fixed across Firebase (`5001/5002/8080/4000`) and OTel (`4318`), and most scripts assume one global booted simulator and one global emulator suite.

In live QA, a stale Firestore emulator bound to `127.0.0.1:8080` prevented `npm run emulators:fresh` from starting (`Error: Could not start Firestore Emulator, port taken.`). This demonstrates the main practical failure mode for multi-agent use: one leftover process blocks all new loops.

Telemetry technically distinguishes simulators via `simulator.udid`, but traces/logs are appended to shared `.otel/*.jsonl` files and the collector endpoint is hardcoded. That gives query-level separation, not environment isolation.

# Detailed Findings

## 1. Firebase emulator loop is single-instance by default

- Default ports are hardcoded in [firebase.json](../../../firebase.json):12-26 (`functions:5001`, `firestore:8080`, `hosting:5002`, `ui:4000`).
- Primary scripts call `firebase emulators:start` without per-agent port/config overrides:
  - [package.json](../../../package.json):26-28
  - [scripts/start-emulators.sh](../../../scripts/start-emulators.sh):29-44
  - [scripts/run-integration-tests.sh](../../../scripts/run-integration-tests.sh):47-53
- Integration readiness and tests also assume fixed `5001`:
  - [scripts/wait-for-emulator.sh](../../../scripts/wait-for-emulator.sh):16
  - [health.integration.test.ts](../../../packages/functions/src/__tests__/integration/health.integration.test.ts):10

Live QA evidence:
- `npm run emulators:fresh` failed immediately with `Could not start Firestore Emulator, port taken.`
- `curl http://127.0.0.1:5001/.../devHealth` failed, while `curl http://127.0.0.1:8080` returned `Ok`, confirming partial stale state.

## 2. Simulator workflow is shared, not per-agent

- Setup script checks “any booted simulator” and reuses it instead of selecting/creating a per-agent device:
  - [scripts/setup-ios-testing.sh](../../../scripts/setup-ios-testing.sh):76-85
- Install/launch commands use `booted` generic target:
  - [scripts/setup-ios-testing.sh](../../../scripts/setup-ios-testing.sh):109-110
  - [docs/guides/local-dev-quickstart.md](../../../docs/guides/local-dev-quickstart.md):104-105

Live QA evidence:
- First `./scripts/setup-ios-testing.sh --skip-build` booted `iPhone 17 Pro`.
- Second run reported `Simulator already booted`, confirming shared state behavior.

## 3. OTel is observable per simulator but not isolated per agent

- Collector uses fixed port and fixed output paths under current working directory:
  - [scripts/otel-collector/index.ts](../../../scripts/otel-collector/index.ts):5-8
- iOS exporters use hardcoded `http://localhost:4318/...` endpoints:
  - [DebugSpanExporter.swift](../../../ios/BradOS/BradOS/Debug/DebugSpanExporter.swift):9
  - [DebugLogExporter.swift](../../../ios/BradOS/BradOS/Debug/DebugLogExporter.swift):8
- Telemetry includes simulator UDID resource attributes (good for filtering):
  - [DebugTelemetry.swift](../../../ios/BradOS/BradOS/Debug/DebugTelemetry.swift):27-35
- Documentation explicitly states all simulators append to shared JSONL files:
  - [docs/guides/debug-telemetry.md](../../../docs/guides/debug-telemetry.md):145-147

Live QA evidence:
- Posted synthetic traces/logs for `SIM-A` and `SIM-B`; both were appended to the same `.otel/traces.jsonl` file.
- This is label-based isolation, not storage/process isolation.

## 4. `npm run otel:start` is fragile for agent-style command execution

- Script command is backgrounded with `&`:
  - [package.json](../../../package.json):39

Live QA evidence:
- In a single shell, `npm run otel:start` showed collector startup and immediate availability.
- In a subsequent shell a few seconds later, no listener remained on `4318`.
- This makes collector lifecycle unreliable for agents that execute commands in separate shell sessions.

## 5. iOS local-emulator routing is not defaulted in simulator flow

- Simulator default route is remote dev URL unless env overrides are injected:
  - [APIConfiguration.swift](../../../ios/BradOS/BradOS/Services/APIConfiguration.swift):17-21, 35-53, 72-77
- Docs claim local-emulator end state, but default run instructions do not include env injection:
  - [docs/guides/local-dev-quickstart.md](../../../docs/guides/local-dev-quickstart.md):115-118

This gap increases drift between documented outcome and actual behavior unless each agent configures env variables manually in its run context.

## 6. Practical blocker in current iOS loop health

Live QA evidence:
- `xcodebuild ... build` failed with SwiftLint plugin error in current tree:
  - `WeightGoalViewModel.swift:75:18: Redundant Type Annotation Violation`
- This prevents the documented install/launch steps from completing in current state.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `firebase.json` | 10-26 | Fixed emulator ports and shared persistent import/export paths |
| `package.json` | 26-28 | Emulator startup scripts with default shared ports |
| `package.json` | 39-41 | OTel start/stop/clean scripts; `otel:start` uses shell backgrounding |
| `scripts/setup-ios-testing.sh` | 76-85 | Reuses any booted simulator (shared state) |
| `scripts/setup-ios-testing.sh` | 109-110 | Install/launch targets generic `booted` simulator |
| `scripts/run-integration-tests.sh` | 47-53 | Starts emulator suite without per-agent override |
| `scripts/wait-for-emulator.sh` | 16 | Default health URL hardcoded to `5001` |
| `packages/functions/src/__tests__/integration/health.integration.test.ts` | 9-10 | Integration tests hardcode emulator base URL |
| `ios/BradOS/BradOS/Services/APIConfiguration.swift` | 17-21, 35-53, 72-77 | Remote dev default + emulator/custom env override behavior |
| `ios/BradOS/BradOS/Debug/DebugSpanExporter.swift` | 9 | Hardcoded OTel traces endpoint |
| `ios/BradOS/BradOS/Debug/DebugLogExporter.swift` | 8 | Hardcoded OTel logs endpoint |
| `ios/BradOS/BradOS/Debug/DebugTelemetry.swift` | 27-35 | Simulator UDID/name attached to telemetry resource |
| `scripts/otel-collector/index.ts` | 5-8, 117, 144 | Fixed collector port and shared JSONL append targets |
| `docs/guides/local-dev-quickstart.md` | 104-105, 115-118 | Generic `booted` launch; claims app talks to local emulators |
| `docs/guides/debug-telemetry.md` | 10, 145-147, 153 | Shared-file telemetry model and single collector port |

# Architecture Insights

- The current design favors a single shared local dev environment with lightweight filtering, not true process/storage isolation.
- Emulator and telemetry concerns are coupled to fixed well-known ports and paths, which simplifies solo setup but prevents concurrent agent loops unless one side manually remaps every dependency.
- Relative-path behavior in Firebase config makes ad-hoc per-agent config files error-prone when generated outside the repo/worktree context.

# Historical Context

- Existing long-lived emulator processes (including a Firestore emulator started before this session) indicate stale process cleanup is already a recurring operational issue.
- The project’s docs and scripts appear optimized for one developer loop at a time; multi-agent isolation has not yet been codified into first-class scripts.

# Open Questions

- Should isolation be achieved by per-agent port namespaces on one host, or by containerized/devcontainer instances where defaults can remain fixed?
- Do you want hard isolation at data storage level (separate Firestore export dirs and independent emulator process groups) or just collision-free runtime ports?
- For iOS app env injection, should per-agent API/OTel endpoints be set via scheme generation (XcodeGen), launch wrappers (`simctl spawn ... launchctl setenv`), or compile-time flags?

