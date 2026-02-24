# Debugging Cloud Functions (CRITICAL)

## Ordered Checklist

**When an endpoint returns errors, check these in order:**

1. **`firebase.json` rewrite path vs `stripPathPrefix()` argument** — must match exactly. e.g., if rewrite is `/api/dev/health-sync/**`, use `stripPathPrefix('health-sync')` NOT `stripPathPrefix('health')`. Mismatch causes routes to silently 404 with no useful logs.
2. **Cloud Function actually deployed?** Check `firebase functions:log --only <functionName>` for deployment audit entries.
3. **App Check debug token registered?** This is the LEAST likely cause — simulators are properly registered. If other API calls work (e.g., HRV history loads), App Check is fine.

## General Debugging Approach

- Check logs and deployed state FIRST before reading source code
- Verify deployed code matches local code
- Confirm the environment (dev vs prod)
- `curl` the endpoint directly to isolate server vs client issues. A raw `APP_CHECK_MISSING` response means routing is OK (token is the issue). A 404 HTML page means hosting rewrite failed.
- Cloud Function request logs are sparse — only deployment audits and instance lifecycle show up in `firebase functions:log`. To debug routing, test with curl or add temporary `console.log` to the handler.
- iOS simulator `print()` doesn't appear in `log stream` — use `xcrun simctl launch --console` (captures stderr/NSLog only, not stdout/print).

## Environment

The iOS simulator hits DEV Firebase functions, not production. When testing or debugging cloud functions, always verify which environment the simulator is targeting. Use `firebase deploy` to ensure dev functions are up to date before testing.
