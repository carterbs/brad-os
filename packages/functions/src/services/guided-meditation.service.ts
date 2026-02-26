import type { GuidedMeditationRepository } from '../repositories/guided-meditation.repository.js';
import type {
  GuidedMeditationCategory,
  GuidedMeditationScript,
} from '../types/guided-meditation.js';

type GuidedMeditationListItem = Omit<GuidedMeditationScript, 'segments' | 'interjections'>;

export class GuidedMeditationService {
  constructor(private readonly repository: GuidedMeditationRepository) {}

  async listCategories(): Promise<GuidedMeditationCategory[]> {
    return this.repository.getCategories();
  }

  async listScriptsByCategory(category: string): Promise<GuidedMeditationListItem[]> {
    return this.repository.findAllByCategory(category);
  }

  async getScriptById(id: string): Promise<GuidedMeditationScript | null> {
    return this.repository.findById(id);
  }
}
