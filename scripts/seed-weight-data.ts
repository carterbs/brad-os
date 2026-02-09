#!/usr/bin/env npx tsx
/**
 * Seed Weight History Data
 *
 * Populates Firestore dev_users/default-user/weightHistory with 3 years
 * of semi-weekly weight entries for manual QA testing.
 *
 * Uses the Firebase CLI's refresh token to get an access token, then writes
 * via the Firestore REST API.
 *
 * Run with: npx tsx scripts/seed-weight-data.ts
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'brad-os';
const DOCUMENT_PATH = 'dev_users/default-user/weightHistory';
const YEARS_BACK = 3;
const START_WEIGHT_LBS = 192;
const END_WEIGHT_LBS = 174;

// Firebase CLI OAuth client credentials (public, used by all firebase CLI installs)
const FIREBASE_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Simple seeded PRNG (mulberry32) for reproducible data
function mulberry32(seed: number): () => number {
  return (): number => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface WeightEntry {
  id: string;
  date: string;
  weightLbs: number;
  source: 'healthkit' | 'manual';
  syncedAt: string;
}

function generateEntries(): WeightEntry[] {
  const entries: WeightEntry[] = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setFullYear(startDate.getFullYear() - YEARS_BACK);

  const totalDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const weightPerDay = (END_WEIGHT_LBS - START_WEIGHT_LBS) / totalDays;

  const current = new Date(startDate);
  while (current <= now) {
    const dayOffset = Math.floor((current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const trendWeight = START_WEIGHT_LBS + weightPerDay * dayOffset;

    // Realistic daily fluctuation (+-2 lbs)
    const fluctuation = (rand() - 0.5) * 4;

    // Seasonal variation (+-1.5 lbs, heavier in winter)
    const monthFraction = current.getMonth() / 12;
    const seasonal = Math.cos(monthFraction * 2 * Math.PI) * 1.5;

    const weight = Math.round((trendWeight + fluctuation + seasonal) * 10) / 10;

    const dateStr = formatDate(current);
    const syncedAt = new Date(current);
    syncedAt.setHours(6 + Math.floor(rand() * 4), Math.floor(rand() * 60));

    entries.push({
      id: randomUUID(),
      date: dateStr,
      weightLbs: weight,
      source: rand() > 0.05 ? 'healthkit' : 'manual',
      syncedAt: syncedAt.toISOString(),
    });

    // Advance 3-4 days (semi-weekly)
    const gap = rand() > 0.5 ? 3 : 4;
    current.setDate(current.getDate() + gap);
  }

  return entries;
}

async function getAccessToken(): Promise<string> {
  const configPath = join(homedir(), '.config/configstore/firebase-tools.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
    tokens?: { refresh_token?: string };
  };
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('No Firebase CLI refresh token found. Run: npx firebase login');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status} ${await resp.text()}`);
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

// Convert a WeightEntry into Firestore REST API document format
function toFirestoreDoc(entry: WeightEntry): Record<string, unknown> {
  return {
    fields: {
      id: { stringValue: entry.id },
      date: { stringValue: entry.date },
      weightLbs: { doubleValue: entry.weightLbs },
      source: { stringValue: entry.source },
      syncedAt: { stringValue: entry.syncedAt },
    },
  };
}

async function batchWrite(
  accessToken: string,
  entries: WeightEntry[],
): Promise<void> {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  // Firestore REST batch write supports up to 500 ops per request
  const BATCH_SIZE = 200;
  let written = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);

    const writes = chunk.map((entry) => ({
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/${DOCUMENT_PATH}/${entry.id}`,
        ...toFirestoreDoc(entry),
      },
    }));

    const resp = await fetch(`${baseUrl}:batchWrite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Batch write failed: ${resp.status} ${body}`);
    }

    written += chunk.length;
    console.log(`  Written ${written}/${entries.length} entries`);
  }
}

async function main(): Promise<void> {
  console.log('Getting access token from Firebase CLI credentials...');
  const accessToken = await getAccessToken();
  console.log('Authenticated successfully.');

  const entries = generateEntries();
  console.log(`Generated ${entries.length} weight entries spanning ${YEARS_BACK} years`);
  console.log(`  Date range: ${entries[0]!.date} -> ${entries[entries.length - 1]!.date}`);
  console.log(`  Weight range: ${Math.min(...entries.map((e) => e.weightLbs))} -> ${Math.max(...entries.map((e) => e.weightLbs))} lbs`);

  console.log('Writing to Firestore...');
  await batchWrite(accessToken, entries);
  console.log('Done! Weight history seeded successfully.');
}

main().catch((err: unknown) => {
  console.error('Failed to seed weight data:', err);
  process.exit(1);
});
