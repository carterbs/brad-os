#!/usr/bin/env tsx
/**
 * Replay a Strava webhook event against the dev or prod endpoint.
 *
 * Usage:
 *   # From CLI arg (paste the JSON payload from Cloud Logging)
 *   npx tsx scripts/replay-strava-webhook.ts '{"aspect_type":"create","event_time":1739000000,"object_id":17396402639,"object_type":"activity","owner_id":137413773,"subscription_id":12345}'
 *
 *   # From stdin (pipe from a file or clipboard)
 *   pbpaste | npx tsx scripts/replay-strava-webhook.ts
 *
 *   # Target prod instead of dev
 *   npx tsx scripts/replay-strava-webhook.ts --prod '{"aspect_type":"create",...}'
 */

const ENDPOINTS = {
  dev: 'https://brad-os.web.app/api/dev/strava/webhook',
  prod: 'https://brad-os.web.app/api/prod/strava/webhook',
} as const;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useProd = args.includes('--prod');
  const jsonArgs = args.filter((a) => a !== '--prod');

  let payload: string;
  if (jsonArgs.length > 0) {
    payload = jsonArgs.join(' ');
  } else if (!process.stdin.isTTY) {
    payload = await readStdin();
  } else {
    console.error('Usage: npx tsx scripts/replay-strava-webhook.ts [--prod] \'<json-payload>\'');
    console.error('   or: echo \'<json>\' | npx tsx scripts/replay-strava-webhook.ts [--prod]');
    process.exit(1);
  }

  // Validate JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    console.error('Invalid JSON payload:', payload.slice(0, 200));
    process.exit(1);
  }

  const env = useProd ? 'prod' : 'dev';
  const url = ENDPOINTS[env];

  console.log(`Replaying to ${env.toUpperCase()}: ${url}`);
  console.log('Payload:', JSON.stringify(parsed, null, 2));
  console.log('');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });

  const body = await response.text();
  console.log(`Response: ${response.status} ${response.statusText}`);
  console.log('Body:', body);

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
