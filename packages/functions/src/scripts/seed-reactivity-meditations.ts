/**
 * Seed script for reactivity meditation series.
 *
 * Parses meditations.md and creates Firestore documents for all 14
 * guided meditation scripts in the "reactivity" category.
 *
 * Usage: npx tsx packages/functions/src/scripts/seed-reactivity-meditations.ts
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CreateGuidedMeditationScriptDTO, GuidedMeditationInterjection } from '../shared.js';

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

// ---------------------------------------------------------------------------
// Interjection content
//
// Four windows spread across the 4:00–8:30 silence period, alternating
// between generic mindfulness guidance and lesson-themed reminders.
//
//   Window 1 (~4:25)  – Settling: ease from teachings into silence
//   Window 2 (~5:40)  – Lesson-themed mindfulness (enhanced [6:00] text)
//   Window 3 (~6:45)  – Pure mindfulness technique
//   Window 4 (~7:45)  – Gentle return with lesson echo (enhanced [7:30] text)
//
// Each window carries multiple textOptions so the app randomly picks one
// per session, giving variety across listens.
// ---------------------------------------------------------------------------

/** Window 1 – Transition from teachings into silence. Shared across all meditations. */
const SETTLING_INTERJECTIONS: string[] = [
  'Take a slow breath. Let what you\'ve heard settle into the background. There\'s nothing to think about right now. Nothing to analyze or remember. Just the feeling of air moving in and out.',
  'Gently let go of the teaching. It\'ll be there when you need it. For now, bring your awareness to your body sitting here. The weight of your hands. The rhythm of your breath. Let that be enough.',
  'Release any effort to understand or process. Right now the only practice is presence. Feel the air moving through your nose or mouth. Feel your chest rise and settle. This is meditation. Just this simple attention.',
];

/** Window 3 – Pure mindfulness technique. Shared across all meditations. */
const TECHNIQUE_INTERJECTIONS: string[] = [
  'Check in with your body for a moment. Your jaw — soften it. Your shoulders — let them drop. Your hands — unclench them. Wherever you find tension, breathe into that space. Then settle back into the rhythm of breathing.',
  'If your mind has been busy, that\'s fine. That\'s what minds do. You haven\'t done anything wrong. The practice is this moment — the moment you notice you\'ve wandered and gently come back. You\'re doing that right now. Stay with the breath.',
  'Notice whatever\'s passing through your awareness right now. Thoughts, feelings, sensations — let them move through like weather. You don\'t need to grab any of it or push any of it away. Just sit in the middle and breathe.',
  'Bring your attention to the physical feeling of one breath. Feel the air enter. Feel it leave. If it helps, count silently — one on the inhale, two on the exhale. When you lose count, start again at one. No frustration needed.',
];

/**
 * Per-meditation enhanced interjections for Windows 2 and 4.
 *
 * Each entry reworks the original [6:00] and [7:30] single-sentence text
 * into 2–3 sentences that ease in with a breath cue, deliver the lesson
 * reminder blended with mindfulness technique, and ease back out.
 */
const ENHANCED_INTERJECTIONS: Record<number, { lessonReminder: string; gentleReturn: string }> = {
  1: {
    lessonReminder:
      'Take a breath. And notice where your mind has gone. If it\'s building a case against someone — your child, your partner, yourself — see if you can gently label that. Second arrow. You don\'t need to stop the thought. Just name it and let it dissolve. Return to the breath.',
    gentleReturn:
      'Gently, come back to the breath. Just the breath. Nothing to figure out right now. Nothing to fix. Just the simple feeling of air moving in and out. Let that be enough.',
  },
  2: {
    lessonReminder:
      'Notice where your attention is. If you\'ve drifted into replaying a past conflict — what you should have said, what you wish you\'d done — see if you can notice that and let it go. Come back to the body. Feel what\'s here right now, not what was there then.',
    gentleReturn:
      'Return to the breath. Feel its natural rhythm without trying to control it. The breath doesn\'t need your help. Just feel it come and go, like a wave arriving at the shore and pulling back.',
  },
  3: {
    lessonReminder:
      'Take a breath. And if your mind has wandered to blaming or justifying, just notice that. No judgment about the judging. No story about the story. Just notice, and come back to the breath. That\'s the whole practice.',
    gentleReturn:
      'Gently return to the breath. Let it be your anchor but not your task. You\'re not trying to breathe perfectly. Just resting your attention on the breath the way you might rest your hand on something steady.',
  },
  4: {
    lessonReminder:
      'Notice your mind for a moment. If it\'s been planning how to get your kids to behave differently — running strategies, rehearsing speeches — notice that. That\'s the mind reaching for control. You can let it go right now. There\'s nothing to solve here. Return to the breath.',
    gentleReturn:
      'Come back to the breath. The one thing happening right now exactly as it should. You don\'t have to manage it. You don\'t have to improve it. Just let it be, and be here with it.',
  },
  5: {
    lessonReminder:
      'Drop out of thinking for a moment and into the body. If the mind has pulled you into a story, that\'s okay. Let it go and come back to sensation. What are you feeling physically right now? Your chest, your belly, your hands. Stay with what the body is telling you.',
    gentleReturn:
      'Return to the breath. Feel it move in your chest and belly. Not as a concept — as a sensation. The physical feeling of expansion and release. Just this. Just sensation.',
  },
  6: {
    lessonReminder:
      'Take a breath. And notice if your mind has been rehearsing conversations — planning what to say to someone, replaying an exchange. That\'s reactivity in slow motion, happening right here on the cushion. Notice it without judgment and let it go. Come back to the space right here.',
    gentleReturn:
      'One breath. Come back to just this one breath. This is the space — the space between stimulus and response. You\'re sitting in it right now. Stay a moment longer.',
  },
  7: {
    lessonReminder:
      'Notice where your mind is. If it\'s building a greatest-hits reel of offenses — all the times they\'ve done this, all the frustration piling up — just label it. Accumulation. You don\'t have to unpack it. Just name it and return to now. This breath. This moment.',
    gentleReturn:
      'This breath is new. It has never happened before. It carries no history and no baggage. Whatever your mind was accumulating, this breath is clean. Stay with the newness of it.',
  },
  8: {
    lessonReminder:
      'Notice your mind. If it\'s running a to-do list, or cataloging everything you haven\'t done, or measuring how much is left — let it rest. You\'re not solving anything in the next few minutes. You don\'t have to be productive right now. Just breathe.',
    gentleReturn:
      'Gently return to breathing. Even depleted, tired breathing counts. There\'s no minimum energy required for awareness. You don\'t have to do this well. You just have to do it.',
  },
  9: {
    lessonReminder:
      'Take a breath. If your mind is replaying a moment you\'re not proud of, let it play. But see if you can watch it like a movie — from out here — instead of climbing back inside it. You\'re the audience now, not the actor. When the scene fades, come back to the breath.',
    gentleReturn:
      'Return to the breath. Each breath is a small act of starting over. You don\'t need a grand gesture or a perfect apology. Just this breath. Just starting from here.',
  },
  10: {
    lessonReminder:
      'Notice your mind. If it\'s catastrophizing — inflating a small thing into something large and urgent — notice the volume. See if you can dial it back one notch. Not all the way down. Just one notch. And breathe.',
    gentleReturn:
      'Return to the breath. Let it be quiet. Let it be small. Let it match the actual size of this moment, which is just a person sitting and breathing. Not everything needs to be loud.',
  },
  11: {
    lessonReminder:
      'Step back for a moment. Whatever you\'ve been thinking — step back from it and just observe the thinking itself. You\'re the audience, not the actor. Watch the thoughts move across the screen of your mind without joining the scene. And breathe.',
    gentleReturn:
      'Return to the breath. The witness watches the breath without trying to change it. Not a deep breath. Not a slow breath. Just whatever breath is happening. Watch it the way you\'d watch clouds.',
  },
  12: {
    lessonReminder:
      'Notice your mind. If it\'s already listing tasks and problems for the day ahead, just notice that. Planning mode. It\'s useful, but not now. You\'ll get to all of it. Not yet. Come back to this still, quiet moment before it begins.',
    gentleReturn:
      'Return to the stillness. Soak in the quiet for a few more breaths. This isn\'t wasted time — it\'s fuel for what\'s coming. Let the silence fill you up. You\'ll spend it later.',
  },
  13: {
    lessonReminder:
      'Take a breath. If your mind has drifted to judgment — of your child or of yourself — notice it gently and set it aside for now. See if you can come back to simply seeing your child clearly. Without the story. Without the verdict. Just them. And breathe.',
    gentleReturn:
      'Come back to the breath. Breathe as if you\'re breathing for both of you. Slowly and gently. The way you\'d breathe if a child were sleeping on your chest.',
  },
  14: {
    lessonReminder:
      'Take a breath. And if it\'s available to you, hold the image of the parent you\'re working to become. Not perfect — you\'ll never be perfect, and that\'s fine. Just aligned with what matters most to you. Let that image be quiet and simple. And breathe with it.',
    gentleReturn:
      'Return to the breath. Let it be steady. This steadiness — this ability to sit still and breathe with intention — is available to you any time you choose it. In the hard moments. In the quiet ones. It\'s always here.',
  },
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
 * Build the four interjection windows for a single meditation.
 *
 * Window 1 (~4:25) – Settling into silence. Generic mindfulness pool.
 * Window 2 (~5:40) – Lesson-themed reminder wrapped with breath cues.
 * Window 3 (~6:45) – Pure mindfulness technique. Generic pool.
 * Window 4 (~7:45) – Gentle return with lesson echo.
 */
function buildInterjections(meditationNumber: number): GuidedMeditationInterjection[] {
  const enhanced = ENHANCED_INTERJECTIONS[meditationNumber];
  if (!enhanced) {
    throw new Error(`No enhanced interjections for meditation ${meditationNumber}`);
  }

  return [
    // Window 1: Settling — ease from teachings into silence
    {
      windowStartSeconds: 265,
      windowEndSeconds: 280,
      textOptions: [...SETTLING_INTERJECTIONS],
    },
    // Window 2: Lesson-themed mindfulness (enhanced [6:00] content)
    {
      windowStartSeconds: 340,
      windowEndSeconds: 355,
      textOptions: [enhanced.lessonReminder],
    },
    // Window 3: Pure mindfulness technique
    {
      windowStartSeconds: 405,
      windowEndSeconds: 420,
      textOptions: [...TECHNIQUE_INTERJECTIONS],
    },
    // Window 4: Gentle return with lesson echo (enhanced [7:30] content)
    {
      windowStartSeconds: 465,
      windowEndSeconds: 480,
      textOptions: [enhanced.gentleReturn],
    },
  ];
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
      interjections: buildInterjections(med.number),
    };
  });
}

/**
 * Delete all documents in a Firestore collection.
 */
async function clearCollection(db: ReturnType<typeof getFirestore>, collectionName: string): Promise<number> {
  const docs = await db.collection(collectionName).listDocuments();
  if (docs.length === 0) return 0;

  const batch = db.batch();
  for (const doc of docs) {
    batch.delete(doc);
  }
  await batch.commit();
  return docs.length;
}

/**
 * Seed a single Firestore collection with meditation scripts.
 */
async function seedCollection(
  db: ReturnType<typeof getFirestore>,
  collectionName: string,
  dtos: CreateGuidedMeditationScriptDTO[]
): Promise<void> {
  const batch = db.batch();
  const now = new Date().toISOString();

  for (const dto of dtos) {
    const segments = dto.segments.map((seg) => ({ ...seg, id: randomUUID() }));
    const scriptData = {
      category: dto.category,
      title: dto.title,
      subtitle: dto.subtitle,
      orderIndex: dto.orderIndex,
      durationSeconds: dto.durationSeconds,
      segments,
      interjections: dto.interjections,
      created_at: now,
      updated_at: now,
    };
    const docRef = db.collection(collectionName).doc();
    batch.set(docRef, scriptData);
  }

  await batch.commit();
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
    initializeApp({ projectId: 'brad-os' });
  }
  const db = getFirestore();

  // Clear and re-seed both prod and dev collections
  const collections = ['guided_meditation_scripts', 'dev_guided_meditation_scripts'];

  for (const collectionName of collections) {
    const deleted = await clearCollection(db, collectionName);
    if (deleted > 0) {
      console.log(`Cleared ${deleted} docs from ${collectionName}`);
    }

    await seedCollection(db, collectionName, dtos);
    console.log(`Seeded ${dtos.length} scripts to ${collectionName}`);
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
