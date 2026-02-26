import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  GuidedMeditationScript,
  GuidedMeditationCategory,
  CreateGuidedMeditationScriptDTO,
  GuidedMeditationSegment,
  GuidedMeditationInterjection,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readEnum,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class GuidedMeditationRepository extends BaseRepository<
  GuidedMeditationScript,
  CreateGuidedMeditationScriptDTO,
  Partial<CreateGuidedMeditationScriptDTO> & Record<string, unknown>
> {
  constructor(db?: Firestore) {
    super('guided_meditation_scripts', db);
  }

  async create(data: CreateGuidedMeditationScriptDTO): Promise<GuidedMeditationScript> {
    const timestamps = this.createTimestamps();
    const segments: GuidedMeditationSegment[] = data.segments.map((seg) => ({
      ...seg,
      id: randomUUID(),
    }));

    const scriptData = {
      category: data.category,
      title: data.title,
      subtitle: data.subtitle,
      orderIndex: data.orderIndex,
      durationSeconds: data.durationSeconds,
      segments,
      interjections: data.interjections,
      ...timestamps,
    };

    const docRef = await this.collection.add(scriptData);
    return {
      id: docRef.id,
      ...scriptData,
    };
  }

  async findAll(): Promise<GuidedMeditationScript[]> {
    const snapshot = await this.collection.orderBy('orderIndex').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((script): script is GuidedMeditationScript => script !== null);
  }

  async findAllByCategory(category: string): Promise<Omit<GuidedMeditationScript, 'segments' | 'interjections'>[]> {
    const snapshot = await this.collection
      .where('category', '==', category)
      .orderBy('orderIndex')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      if (!isRecord(data)) {
        return null;
      }
      const script = this.parseEntity(doc.id, data);
      if (script === null) {
        return null;
      }

      return {
        id: script.id,
        category: script.category,
        title: script.title,
        subtitle: script.subtitle,
        orderIndex: script.orderIndex,
        durationSeconds: script.durationSeconds,
        created_at: script.created_at,
        updated_at: script.updated_at,
      };
    }).filter(
      (script): script is Omit<GuidedMeditationScript, 'segments' | 'interjections'> =>
        script !== null
    );
  }

  async getCategories(): Promise<GuidedMeditationCategory[]> {
    const snapshot = await this.collection.get();
    const categoryMap = new Map<string, number>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!isRecord(data)) {
        continue;
      }
      const category = readString(data, 'category');
      if (category === null) {
        continue;
      }
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);
    }

    const categories: GuidedMeditationCategory[] = [];
    for (const [name, scriptCount] of categoryMap) {
      categories.push({
        id: name,
        name,
        scriptCount,
      });
    }

    return categories;
  }

  protected override buildUpdatePayload(
    data: Partial<CreateGuidedMeditationScriptDTO>
  ): Record<string, unknown> {
    const updates: Record<string, unknown> = {};

    if (data.category !== undefined) updates['category'] = data.category;
    if (data.title !== undefined) updates['title'] = data.title;
    if (data.subtitle !== undefined) updates['subtitle'] = data.subtitle;
    if (data.orderIndex !== undefined) updates['orderIndex'] = data.orderIndex;
    if (data.durationSeconds !== undefined) updates['durationSeconds'] = data.durationSeconds;
    if (data.segments !== undefined) {
      updates['segments'] = data.segments.map((seg) => ({
        ...seg,
        id: randomUUID(),
      }));
    }
    if (data.interjections !== undefined) updates['interjections'] = data.interjections;

    return updates;
  }

  async seed(scripts: CreateGuidedMeditationScriptDTO[]): Promise<GuidedMeditationScript[]> {
    const batch = this.db.batch();
    const results: GuidedMeditationScript[] = [];
    const timestamps = this.createTimestamps();

    for (const data of scripts) {
      const segments: GuidedMeditationSegment[] = data.segments.map((seg) => ({
        ...seg,
        id: randomUUID(),
      }));

      const scriptData = {
        category: data.category,
        title: data.title,
        subtitle: data.subtitle,
        orderIndex: data.orderIndex,
        durationSeconds: data.durationSeconds,
        segments,
        interjections: data.interjections,
        ...timestamps,
      };

      const docRef = this.collection.doc();
      batch.set(docRef, scriptData);
      results.push({
        id: docRef.id,
        ...scriptData,
      });
    }

    await batch.commit();
    return results;
  }

  protected parseInterjection(data: unknown): GuidedMeditationInterjection | null {
    if (!isRecord(data)) {
      return null;
    }

    const windowStartSeconds = readNumber(data, 'windowStartSeconds');
    const windowEndSeconds = readNumber(data, 'windowEndSeconds');
    const textOptionsRaw = data['textOptions'];

    if (
      windowStartSeconds === null ||
      windowEndSeconds === null ||
      !Array.isArray(textOptionsRaw)
    ) {
      return null;
    }

    const textOptions: string[] = [];
    for (const textOption of textOptionsRaw) {
      if (typeof textOption !== 'string') {
        return null;
      }
      textOptions.push(textOption);
    }

    return {
      windowStartSeconds,
      windowEndSeconds,
      textOptions,
    };
  }

  protected parseSegment(data: unknown): GuidedMeditationSegment | null {
    if (!isRecord(data)) {
      return null;
    }

    const id = readString(data, 'id');
    const startSeconds = readNumber(data, 'startSeconds');
    const text = readString(data, 'text');
    const phase = readEnum(data, 'phase', ['opening', 'teachings', 'closing']);

    if (id === null || startSeconds === null || text === null || phase === null) {
      return null;
    }

    return {
      id,
      startSeconds,
      text,
      phase,
    };
  }

  protected parseEntity(id: string, data: Record<string, unknown>): GuidedMeditationScript | null {
    const category = readString(data, 'category');
    const title = readString(data, 'title');
    const subtitle = readString(data, 'subtitle');
    const orderIndex = readNumber(data, 'orderIndex');
    const durationSeconds = readNumber(data, 'durationSeconds');
    const segmentsRaw = data['segments'];
    const interjectionsRaw = data['interjections'];
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      category === null ||
      title === null ||
      subtitle === null ||
      orderIndex === null ||
      durationSeconds === null ||
      !Array.isArray(segmentsRaw) ||
      !Array.isArray(interjectionsRaw) ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    const segments: GuidedMeditationSegment[] = [];
    for (const segment of segmentsRaw) {
      const parsedSegment = this.parseSegment(segment);
      if (parsedSegment === null) {
        return null;
      }
      segments.push(parsedSegment);
    }

    const interjections: GuidedMeditationInterjection[] = [];
    for (const interjection of interjectionsRaw) {
      const parsedInterjection = this.parseInterjection(interjection);
      if (parsedInterjection === null) {
        return null;
      }
      interjections.push(parsedInterjection);
    }

    return {
      id,
      category,
      title,
      subtitle,
      orderIndex,
      durationSeconds,
      segments,
      interjections,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
}
