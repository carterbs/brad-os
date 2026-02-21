import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  GuidedMeditationScript,
  GuidedMeditationCategory,
  CreateGuidedMeditationScriptDTO,
  GuidedMeditationSegment,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';

export class GuidedMeditationRepository extends BaseRepository<
  GuidedMeditationScript,
  CreateGuidedMeditationScriptDTO,
  Partial<CreateGuidedMeditationScriptDTO>
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as GuidedMeditationScript);
  }

  async findAllByCategory(category: string): Promise<Omit<GuidedMeditationScript, 'segments' | 'interjections'>[]> {
    const snapshot = await this.collection
      .where('category', '==', category)
      .orderBy('orderIndex')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        category: data['category'] as string,
        title: data['title'] as string,
        subtitle: data['subtitle'] as string,
        orderIndex: data['orderIndex'] as number,
        durationSeconds: data['durationSeconds'] as number,
        created_at: data['created_at'] as string,
        updated_at: data['updated_at'] as string,
      };
    });
  }

  async getCategories(): Promise<GuidedMeditationCategory[]> {
    const snapshot = await this.collection.get();
    const categoryMap = new Map<string, number>();

    for (const doc of snapshot.docs) {
      const category = doc.data()['category'] as string;
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

  override async update(
    id: string,
    data: Partial<CreateGuidedMeditationScriptDTO>
  ): Promise<GuidedMeditationScript | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

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

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    updates['updated_at'] = this.updateTimestamp();
    await this.collection.doc(id).update(updates);
    return this.findById(id);
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
}
