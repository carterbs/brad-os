export interface StravaTaskConfig {
  projectId: string;
  queue: string;
  location: string;
  cloudRunServiceUrl: string;
  oidcAudience: string;
  oidcServiceAccount: string;
}

export interface EnqueueStravaTaskResult {
  eventId: string;
  taskName: string;
  duplicate: boolean;
}

export interface VerifiedStravaTaskIdentity {
  issuer: 'https://accounts.google.com';
  audience: string;
  email: string;
  subject: string;
}

export type StravaTaskClaimResult =
  | { status: 'claimed'; claimToken: string }
  | { status: 'completed' }
  | { status: 'in_progress' };
