# BradOS API Runtime Guidelines

## Logging (CRITICAL)

**NEVER use `console.log`, `console.warn`, or `console.error` in API runtime code.**

Use one of the package's structured loggers:

```typescript
// Standalone Cloud Run runtime code:
import { logger } from '../runtime/logger.js';
logger.info('[Tag] Something happened', { key: 'value' });

// Shared API handlers that also run in the local Functions emulator:
import { info, warn, error as logError } from 'firebase-functions/logger';
info('[Tag] Something happened', { key: 'value' });
warn('[Tag] Something concerning', { detail: 'value' });
logError('[Tag] Something broke', { err: error });
```

Prefer `runtime/logger.ts` for new Cloud Run-only code. The Firebase logger remains
supported in shared handlers while the local Functions emulator adapter is retained.

Both forms produce searchable structured fields in Cloud Logging. Never log App Check
tokens, OAuth tokens, health payloads, prompts, or secret values.
