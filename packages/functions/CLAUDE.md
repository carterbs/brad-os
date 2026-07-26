# BradOS API Runtime Guidelines

## Logging (CRITICAL)

**NEVER use `console.log`, `console.warn`, or `console.error` in API runtime code.**

Use one of the package's structured loggers:

```typescript
// Standalone Cloud Run runtime code:
import { logger } from '../runtime/logger.js';
logger.info('[Tag] Something happened', { key: 'value' });

// Existing handlers that still use the Firebase logger:
import { info, warn, error as logError } from 'firebase-functions/logger';
info('[Tag] Something happened', { key: 'value' });
warn('[Tag] Something concerning', { detail: 'value' });
logError('[Tag] Something broke', { err: error });
```

Prefer `runtime/logger.ts` for new code. Existing handlers may continue using the
Firebase logger because it emits structured output in the standalone runtime, but
there is no Functions adapter or Functions emulator.

Both forms produce searchable structured fields in Cloud Logging. Never log App Check
tokens, OAuth tokens, health payloads, prompts, or secret values.
