# Cloud Functions Guidelines

## Logging (CRITICAL)

**NEVER use `console.log`, `console.warn`, or `console.error` in Cloud Functions code.**

These do NOT appear in Firebase Cloud Functions logs. Always use the Firebase logger:

```typescript
import { info, warn, error as logError } from 'firebase-functions/logger';

// Instead of console.log → use info()
info('[Tag] Something happened', { key: 'value' });

// Instead of console.warn → use warn()
warn('[Tag] Something concerning', { detail: 'value' });

// Instead of console.error → use logError()
logError('[Tag] Something broke', { err: error });
```

The structured data object (second arg) shows up as searchable fields in Cloud Logging.
