/**
 * Seed script for reactivity meditation series.
 *
 * Parses meditations.md and creates Firestore documents for all 14
 * guided meditation scripts in the "reactivity" category.
 *
 * Usage: npx tsx packages/functions/src/scripts/seed-reactivity-meditations.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CreateGuidedMeditationScriptDTO, GuidedMeditationInterjection } from '../shared.js';
import { GuidedMeditationRepository } from '../repositories/guided-meditation.repository.js';

// Table of contents mapping: meditation number -> title
const MEDITATION_TITLES: Record<number, string> = {
  1: 'The Second Arrow',
  2: 'The 90-Second Wave',
  3: 'The Mirror',
  4: 'What You Control',
  5: 'The Body Knows First',
  6: 'The Space Between',
  7: 'The Hundredth Time',
  8: 'Already Depleted',
  9: 'After the Explosion',
  10: 'The Volume Knob',
  11: 'The Witness',
  12: 'Before the Day Begins',
  13: 'Their Experience',
  14: 'Who You Want to Be',
};

interface ParsedMeditation {
  number: number;
  subtitle: string;
  opening: string;
  teachings: string;
  interjection6min: string;
  interjection7min30: string;
  closing: string;
}

/**
 * Parse the raw text of a single meditation into its component parts.
 */
function parseMeditation(rawText: string, meditationNumber: number): ParsedMeditation {
  const lines = rawText.split('\n');

  // Find subtitle (first line after "Meditation N")
  const subtitle = lines[1]?.trim() ?? '';

  // Find section boundaries
  const openingStart = lines.findIndex((l) => l.startsWith('OPENING'));
  const teachingsStart = lines.findIndex((l) => l.startsWith('TEACHINGS'));
  const silenceStart = lines.findIndex((l) => l.startsWith('EXTENDED SILENCE'));
  const closingStart = lines.findIndex((l) => l.startsWith('CLOSING'));

  if (openingStart === -1 || teachingsStart === -1 || silenceStart === -1 || closingStart === -1) {
    throw new Error(`Failed to parse sections for meditation ${meditationNumber}`);
  }

  // Extract opening text (lines between OPENING header and TEACHINGS header)
  const openingLines = lines.slice(openingStart + 1, teachingsStart).filter((l) => l.trim() !== '');
  const opening = openingLines.join('\n').trim();

  // Extract teachings text (lines between TEACHINGS header and EXTENDED SILENCE header)
  const teachingsLines = lines.slice(teachingsStart + 1, silenceStart).filter((l) => l.trim() !== '');
  const teachings = teachingsLines.join('\n').trim();

  // Extract closing text (lines from CLOSING header to end)
  const closingLines = lines.slice(closingStart + 1).filter((l) => l.trim() !== '');
  const closing = closingLines.join('\n').trim();

  // Extract interjections from the silence section
  const silenceLines = lines.slice(silenceStart + 1, closingStart);

  // Find the [6:00] marker and its text
  const sixMinIndex = silenceLines.findIndex((l) => l.trim() === '[6:00]');
  let interjection6min = '';
  if (sixMinIndex !== -1) {
    // The interjection text is the non-empty line(s) after [6:00] until the next [Silence] or [7:30]
    const afterSixMin: string[] = [];
    for (let i = sixMinIndex + 1; i < silenceLines.length; i++) {
      const line = silenceLines[i]?.trim() ?? '';
      if (line === '[Silence]' || line === '[7:30]' || line === '') {
        if (afterSixMin.length > 0) break;
        continue;
      }
      afterSixMin.push(line);
    }
    interjection6min = afterSixMin.join(' ').trim();
  }

  // Find the [7:30] marker and its text
  const sevenThirtyIndex = silenceLines.findIndex((l) => l.trim() === '[7:30]');
  let interjection7min30 = '';
  if (sevenThirtyIndex !== -1) {
    const afterSevenThirty: string[] = [];
    for (let i = sevenThirtyIndex + 1; i < silenceLines.length; i++) {
      const line = silenceLines[i]?.trim() ?? '';
      if (line === '[Silence]' || line === '') {
        if (afterSevenThirty.length > 0) break;
        continue;
      }
      afterSevenThirty.push(line);
    }
    interjection7min30 = afterSevenThirty.join(' ').trim();
  }

  return {
    number: meditationNumber,
    subtitle,
    opening,
    teachings,
    interjection6min,
    interjection7min30,
    closing,
  };
}

/**
 * Parse all 14 meditations from the raw markdown file content.
 */
function parseAllMeditations(fileContent: string): ParsedMeditation[] {
  const meditations: ParsedMeditation[] = [];

  // Split by "Meditation N" headers
  for (let i = 1; i <= 14; i++) {
    const currentHeader = `Meditation ${i}`;
    const nextHeader = i < 14 ? `Meditation ${i + 1}` : null;

    const startIndex = fileContent.indexOf(currentHeader);
    if (startIndex === -1) {
      throw new Error(`Could not find "${currentHeader}" in file`);
    }

    let endIndex: number;
    if (nextHeader) {
      endIndex = fileContent.indexOf(nextHeader, startIndex + currentHeader.length);
      if (endIndex === -1) {
        throw new Error(`Could not find "${nextHeader}" in file`);
      }
    } else {
      endIndex = fileContent.length;
    }

    const rawText = fileContent.slice(startIndex, endIndex).trim();
    meditations.push(parseMeditation(rawText, i));
  }

  return meditations;
}

/**
 * Convert parsed meditations to DTOs ready for Firestore.
 */
function toScriptDTOs(meditations: ParsedMeditation[]): CreateGuidedMeditationScriptDTO[] {
  return meditations.map((med): CreateGuidedMeditationScriptDTO => {
    const title = MEDITATION_TITLES[med.number];
    if (!title) {
      throw new Error(`No title found for meditation ${med.number}`);
    }

    const interjections: GuidedMeditationInterjection[] = [
      {
        windowStartSeconds: 350,
        windowEndSeconds: 370,
        textOptions: [med.interjection6min],
      },
      {
        windowStartSeconds: 440,
        windowEndSeconds: 460,
        textOptions: [med.interjection7min30],
      },
    ];

    return {
      category: 'reactivity',
      title,
      subtitle: med.subtitle,
      orderIndex: med.number - 1,
      durationSeconds: 600,
      segments: [
        {
          startSeconds: 0,
          text: med.opening,
          phase: 'opening',
        },
        {
          startSeconds: 120,
          text: med.teachings,
          phase: 'teachings',
        },
        {
          startSeconds: 510,
          text: med.closing,
          phase: 'closing',
        },
      ],
      interjections,
    };
  });
}

async function main(): Promise<void> {
  // Read and parse the meditations file
  const filePath = resolve(process.cwd(), 'meditations.md');
  console.log(`Reading meditations from: ${filePath}`);

  const fileContent = readFileSync(filePath, 'utf-8');
  const parsed = parseAllMeditations(fileContent);
  console.log(`Parsed ${parsed.length} meditations`);

  // Validate parsing
  for (const med of parsed) {
    if (!med.opening) throw new Error(`Empty opening for meditation ${med.number}`);
    if (!med.teachings) throw new Error(`Empty teachings for meditation ${med.number}`);
    if (!med.closing) throw new Error(`Empty closing for meditation ${med.number}`);
    if (!med.interjection6min) throw new Error(`Empty 6:00 interjection for meditation ${med.number}`);
    if (!med.interjection7min30) throw new Error(`Empty 7:30 interjection for meditation ${med.number}`);
  }

  const dtos = toScriptDTOs(parsed);
  console.log(`Created ${dtos.length} script DTOs`);

  // Initialize Firebase
  if (getApps().length === 0) {
    initializeApp();
  }
  const db = getFirestore();
  const repo = new GuidedMeditationRepository(db);

  // Seed the data
  console.log('Seeding scripts to Firestore...');
  const results = await repo.seed(dtos);
  console.log(`Successfully seeded ${results.length} guided meditation scripts`);

  for (const script of results) {
    console.log(`  [${script.orderIndex}] ${script.title} - ${script.subtitle} (${script.id})`);
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
