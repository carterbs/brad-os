#!/usr/bin/env npx tsx
/**
 * Copy Production Health Metrics to Dev
 *
 * Reads health metric subcollections from users/default-user (prod)
 * and writes them to dev_users/default-user (dev) in Firestore.
 *
 * Subcollections copied:
 *   - recoverySnapshots
 *   - weightHistory
 *   - hrvHistory
 *   - rhrHistory
 *   - sleepHistory
 *
 * Run with: npx tsx scripts/copy-prod-health-to-dev.ts
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'brad-os';
const PROD_USER_PATH = 'users/default-user';
const DEV_USER_PATH = 'dev_users/default-user';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const SUBCOLLECTIONS = [
  'recoverySnapshots',
  'weightHistory',
  'hrvHistory',
  'rhrHistory',
  'sleepHistory',
];

// Firebase CLI OAuth client credentials (public, used by all firebase CLI installs)
const FIREBASE_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

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

interface FirestoreDocument {
  name: string;
  fields: Record<string, unknown>;
  createTime?: string;
  updateTime?: string;
}

interface FirestoreListResponse {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
}

async function listAllDocuments(
  accessToken: string,
  collectionPath: string,
): Promise<FirestoreDocument[]> {
  const allDocs: FirestoreDocument[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BASE_URL}/${collectionPath}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`List ${collectionPath} failed: ${resp.status} ${body}`);
    }

    const data = (await resp.json()) as FirestoreListResponse;
    if (data.documents) {
      allDocs.push(...data.documents);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allDocs;
}

function getDocId(doc: FirestoreDocument): string {
  // name format: projects/brad-os/databases/(default)/documents/users/default-user/weightHistory/2024-01-01
  const parts = doc.name.split('/');
  return parts[parts.length - 1]!;
}

async function batchWrite(
  accessToken: string,
  writes: Array<{ update: { name: string; fields: Record<string, unknown> } }>,
): Promise<void> {
  const BATCH_SIZE = 200;

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const chunk = writes.slice(i, i + BATCH_SIZE);

    const resp = await fetch(`${BASE_URL}:batchWrite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: chunk }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Batch write failed: ${resp.status} ${body}`);
    }

    console.log(`    Written ${Math.min(i + BATCH_SIZE, writes.length)}/${writes.length} docs`);
  }
}

async function copySubcollection(
  accessToken: string,
  subcollection: string,
): Promise<number> {
  const prodPath = `${PROD_USER_PATH}/${subcollection}`;
  const devPath = `${DEV_USER_PATH}/${subcollection}`;

  console.log(`\n  Reading prod: ${prodPath}`);
  const docs = await listAllDocuments(accessToken, prodPath);
  console.log(`    Found ${docs.length} documents`);

  if (docs.length === 0) return 0;

  const writes = docs.map((doc) => {
    const docId = getDocId(doc);
    return {
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/${devPath}/${docId}`,
        fields: doc.fields,
      },
    };
  });

  console.log(`  Writing to dev: ${devPath}`);
  await batchWrite(accessToken, writes);

  return docs.length;
}

async function main(): Promise<void> {
  console.log('Getting access token from Firebase CLI credentials...');
  const accessToken = await getAccessToken();
  console.log('Authenticated successfully.\n');

  console.log(`Copying health metrics from ${PROD_USER_PATH} → ${DEV_USER_PATH}`);

  let totalCopied = 0;

  for (const subcollection of SUBCOLLECTIONS) {
    const count = await copySubcollection(accessToken, subcollection);
    totalCopied += count;
  }

  console.log(`\nDone! Copied ${totalCopied} total documents across ${SUBCOLLECTIONS.length} subcollections.`);
}

main().catch((err: unknown) => {
  console.error('Failed to copy health metrics:', err);
  process.exit(1);
});
