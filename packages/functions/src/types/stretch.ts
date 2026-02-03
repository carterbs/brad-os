/**
 * Stretch Definition Types
 *
 * Types for stretch definitions stored in Firestore.
 * Each body region is a document with embedded stretch definitions.
 */

import type { BodyRegion } from './stretching.js';

export interface StretchDefinition {
  id: string; // e.g., "back-childs-pose"
  name: string; // e.g., "Child's Pose"
  description: string; // Full instruction text (TTS source)
  bilateral: boolean; // true = stretch both sides
  image?: string; // e.g., "back/childs-pose.png" (bundled asset path)
}

export interface StretchRegion {
  id: string; // document ID = region key (e.g., "back")
  region: BodyRegion;
  displayName: string; // "Back"
  iconName: string; // SF Symbol name
  stretches: StretchDefinition[];
  created_at: string;
  updated_at: string;
}

export type CreateStretchRegionDTO = Omit<StretchRegion, 'id' | 'created_at' | 'updated_at'>;
