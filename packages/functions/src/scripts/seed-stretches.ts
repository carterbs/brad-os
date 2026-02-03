/**
 * Seed script for stretch definitions.
 *
 * Reads the existing stretches.json manifest and creates Firestore documents
 * for all stretch regions with their embedded stretch definitions.
 * Drops image and audioFiles fields (no longer needed — description text is the TTS source).
 *
 * Usage:
 *   npx tsx packages/functions/src/scripts/seed-stretches.ts          # dev
 *   npx tsx packages/functions/src/scripts/seed-stretches.ts --prod    # prod
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { BodyRegion, CreateStretchRegionDTO, StretchDefinition } from '../shared.js';

interface ManifestStretch {
  id: string;
  name: string;
  description: string;
  bilateral: boolean;
  image: string;
  audioFiles: { begin: string };
}

interface ManifestRegion {
  stretches: ManifestStretch[];
}

interface StretchManifest {
  regions: Record<string, ManifestRegion>;
  shared: Record<string, string>;
}

// SF Symbol icon names for each body region (matches iOS BodyRegion.iconName)
const REGION_ICONS: Record<string, string> = {
  neck: 'person.crop.circle',
  shoulders: 'figure.arms.open',
  back: 'figure.stand',
  hip_flexors: 'figure.walk',
  glutes: 'figure.cooldown',
  hamstrings: 'figure.flexibility',
  quads: 'figure.run',
  calves: 'shoe',
};

const REGION_DISPLAY_NAMES: Record<string, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  back: 'Back',
  hip_flexors: 'Hip Flexors',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  quads: 'Quads',
  calves: 'Calves',
};

function parseManifest(filePath: string): CreateStretchRegionDTO[] {
  const raw = readFileSync(filePath, 'utf-8');
  const manifest: StretchManifest = JSON.parse(raw) as StretchManifest;
  const regions: CreateStretchRegionDTO[] = [];

  for (const [regionKey, regionData] of Object.entries(manifest.regions)) {
    const displayName = REGION_DISPLAY_NAMES[regionKey];
    const iconName = REGION_ICONS[regionKey];

    if (!displayName || !iconName) {
      throw new Error(`Unknown region: ${regionKey}`);
    }

    const stretches: StretchDefinition[] = regionData.stretches.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      bilateral: s.bilateral,
    }));

    regions.push({
      region: regionKey as BodyRegion,
      displayName,
      iconName,
      stretches,
    });
  }

  return regions;
}

async function main(): Promise<void> {
  const isProd = process.argv.includes('--prod');
  const collectionName = isProd ? 'stretches' : 'dev_stretches';

  console.log(`Seeding stretches to ${isProd ? 'PRODUCTION' : 'DEV'} (collection: ${collectionName})`);

  // Read and parse the manifest
  const manifestPath = resolve(process.cwd(), 'ios/BradOS/BradOS/Resources/stretches.json');
  console.log(`Reading manifest from: ${manifestPath}`);

  const regions = parseManifest(manifestPath);
  console.log(`Parsed ${regions.length} regions with ${regions.reduce((sum, r) => sum + r.stretches.length, 0)} total stretches`);

  // Validate
  for (const region of regions) {
    if (region.stretches.length === 0) {
      throw new Error(`Region ${region.region} has no stretches`);
    }
    for (const stretch of region.stretches) {
      if (!stretch.description) {
        throw new Error(`Stretch ${stretch.id} in ${region.region} has no description`);
      }
    }
  }

  // Initialize Firebase
  if (getApps().length === 0) {
    initializeApp();
  }
  const db = getFirestore();
  const now = new Date().toISOString();

  // Batch write — use region key as document ID (idempotent)
  const batch = db.batch();
  for (const region of regions) {
    const docRef = db.collection(collectionName).doc(region.region);
    batch.set(docRef, {
      ...region,
      created_at: now,
      updated_at: now,
    });
  }

  await batch.commit();
  console.log(`Successfully seeded ${regions.length} stretch regions`);

  for (const region of regions) {
    console.log(`  ${region.displayName} (${region.region}): ${region.stretches.length} stretches`);
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
