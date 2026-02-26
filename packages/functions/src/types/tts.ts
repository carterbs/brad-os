export interface GoogleTtsResponse {
  audioContent: string;
}

interface AppCredentialLike {
  getAccessToken: () => Promise<{ access_token: string }>;
}

export interface FirebaseAppLike {
  options: {
    credential?: AppCredentialLike;
  };
}

interface RemoteConfigTemplateLike {
  evaluate: () => {
    getString: (key: string) => string;
  };
}

export interface RemoteConfigLike {
  getServerTemplate: (options: { defaultConfig: { TTS_VOICE: string } }) => Promise<RemoteConfigTemplateLike>;
}

export interface TtsServiceDeps {
  getApp: () => FirebaseAppLike;
  getRemoteConfig: () => RemoteConfigLike;
  fetchFn: typeof fetch;
  warn: (...args: unknown[]) => void;
}
