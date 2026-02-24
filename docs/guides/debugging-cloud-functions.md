# Debugging Cloud Functions (CRITICAL)

## Ordered Checklist

**When an endpoint returns errors, check these in order:**

1. **`firebase.json` rewrite path vs `stripPathPrefix()` argument** — must match exactly. e.g., if rewrite is `/api/dev/health-sync/**`, use `stripPathPrefix('health-sync')` NOT `stripPathPrefix('health')`. Mismatch causes routes to silently 404 with no useful logs.
2. **Cloud Function actually deployed?** Check `firebase functions:log --only <functionName>` for deployment audit entries.
3. **App Check debug token registered?** This is the LEAST likely cause — simulators are properly registered. If other API calls work (e.g., HRV history loads), App Check is fine.

### App Check Debug Token Registration

Debug tokens change when the simulator is erased or recreated. To extract the current token:

1. Launch the app with console output: `xcrun simctl launch --console <bundle-id>`
2. Look for `[AppCheckCore] App Check debug token: '<UUID>'` in the output
3. Register the token in [Firebase Console](https://console.firebase.google.com/) > App Check > Apps > Manage debug tokens

**Key facts:**
- Each simulator instance gets a unique debug token
- Erasing simulator content and settings generates a new token
- If other API calls work (e.g., HRV history loads), App Check is fine — don't debug tokens first

## General Debugging Approach

- Check logs and deployed state FIRST before reading source code
- Verify deployed code matches local code
- Confirm the environment (dev vs prod)
- `curl` the endpoint directly to isolate server vs client issues. A raw `APP_CHECK_MISSING` response means routing is OK (token is the issue). A 404 HTML page means hosting rewrite failed.
- Cloud Function request logs are sparse — only deployment audits and instance lifecycle show up in `firebase functions:log`. To debug routing, test with curl or add temporary `console.log` to the handler.
- iOS simulator `print()` doesn't appear in `log stream` — use `xcrun simctl launch --console` (captures stderr/NSLog only, not stdout/print).

## Environment

The iOS simulator hits DEV Firebase functions, not production. When testing or debugging cloud functions, always verify which environment the simulator is targeting. Use `firebase deploy` to ensure dev functions are up to date before testing.
