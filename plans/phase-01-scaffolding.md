# Phase 1: Project Scaffolding & Infrastructure

## Overview

This phase establishes the complete development infrastructure for the Lifting workout tracker app. Upon completion, we will have a fully functional monorepo with strict TypeScript, linting, Docker support, and test infrastructure ready for feature development.

---

## Directory Structure

```
lifting/
├── .github/                          # GitHub configuration (optional, for CI later)
├── docker/
│   ├── Dockerfile.dev                # Development container
│   └── Dockerfile.prod               # Production container
├── docker-compose.yml                # Multi-service orchestration
├── e2e/
│   ├── tests/
│   │   └── smoke.test.ts             # Basic smoke test
│   ├── tsconfig.json
│   └── package.json
├── packages/
│   ├── client/
│   │   ├── public/
│   │   │   └── index.html
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   └── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── vite-env.d.ts
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   ├── server/
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   └── index.ts          # Database initialization
│   │   │   ├── routes/
│   │   │   │   └── health.ts         # Health check endpoint
│   │   │   └── index.ts              # Express entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/
│       ├── src/
│       │   └── index.ts              # Shared types/utilities
│       ├── package.json
│       └── tsconfig.json
├── plans/                            # Implementation plans (this file)
├── requirements.md                   # Project requirements
├── .eslintrc.cjs                     # ESLint configuration
├── .prettierrc                       # Prettier configuration
├── .gitignore
├── package.json                      # Root package.json with workspaces
├── tsconfig.base.json                # Shared TypeScript config
└── vitest.workspace.ts               # Vitest workspace config
```

---

## Implementation Steps

### Step 1: Initialize Root Package and Workspaces

Create the root `package.json` with npm workspaces configuration.

**File: `/Users/bradcarter/Documents/Dev/lifting/package.json`**

```json
{
  "name": "lifting",
  "version": "0.0.1",
  "private": true,
  "workspaces": ["packages/*", "e2e"],
  "scripts": {
    "dev": "concurrently -n client,server -c blue,green \"npm run dev -w @brad-os/client\" \"npm run dev -w @brad-os/server\"",
    "build": "npm run build -w @brad-os/shared && npm run build -w @brad-os/server && npm run build -w @brad-os/client",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "npm run test -w e2e",
    "docker:dev": "docker-compose up --build",
    "docker:dev:detached": "docker-compose up --build -d",
    "docker:down": "docker-compose down",
    "docker:prod": "docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "concurrently": "^8.2.2",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.34.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.0",
    "vitest": "^1.3.0"
  }
}
```

---

### Step 2: Create Base TypeScript Configuration

Create a strict base TypeScript configuration that all packages will extend.

**File: `/Users/bradcarter/Documents/Dev/lifting/tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

### Step 3: Create Root TypeScript Project References Config

**File: `/Users/bradcarter/Documents/Dev/lifting/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/server" },
    { "path": "packages/client" },
    { "path": "e2e" }
  ]
}
```

---

### Step 4: Configure ESLint

Create strict ESLint configuration with no-explicit-any enforcement.

**File: `/Users/bradcarter/Documents/Dev/lifting/.eslintrc.cjs`**

```javascript
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/strict',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: [
      './tsconfig.json',
      './packages/*/tsconfig.json',
      './e2e/tsconfig.json',
    ],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    'react/prop-types': 'off',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.config.js',
    '*.config.ts',
    '.eslintrc.cjs',
  ],
};
```

---

### Step 5: Configure Prettier

**File: `/Users/bradcarter/Documents/Dev/lifting/.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

### Step 6: Create .gitignore

**File: `/Users/bradcarter/Documents/Dev/lifting/.gitignore`**

```
# Dependencies
node_modules/

# Build outputs
dist/
build/
*.tsbuildinfo

# Database
*.db
*.sqlite
*.sqlite3
data/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Logs
logs/
*.log
npm-debug.log*

# Test coverage
coverage/

# Docker
.docker/

# Temp files
tmp/
temp/
```

---

### Step 7: Create Shared Package

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/shared/package.json`**

```json
{
  "name": "@brad-os/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.3.0"
  }
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/shared/src/index.ts`**

```typescript
/**
 * Shared types and utilities for the Lifting app.
 * This package contains code shared between client and server.
 */

// API response wrapper type
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Health check response
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
}

// App version constant
export const APP_VERSION = '0.0.1';

// Utility function to create a typed API response
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createErrorResponse(error: string): ApiResponse<never> {
  return {
    success: false,
    error,
  };
}
```

---

### Step 8: Create Server Package

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/package.json`**

```json
{
  "name": "@brad-os/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@brad-os/shared": "*",
    "better-sqlite3": "^9.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.9",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "tsx": "^4.7.1",
    "typescript": "^5.4.0",
    "vitest": "^1.3.0"
  }
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../shared" }]
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/src/index.ts`**

```typescript
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { APP_VERSION, createSuccessResponse } from '@brad-os/shared';
import { initializeDatabase } from './db/index.js';
import { healthRouter } from './routes/health.js';

const app: Express = express();
const PORT = process.env['PORT'] ?? 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initializeDatabase();

// Routes
app.use('/api/health', healthRouter);

// Root endpoint
app.get('/', (_req: Request, res: Response): void => {
  res.json(
    createSuccessResponse({
      message: 'Lifting API',
      version: APP_VERSION,
    })
  );
});

// Start server
app.listen(PORT, (): void => {
  console.log(`Server running on http://localhost:${String(PORT)}`);
});

export { app };
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/src/db/index.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env['DB_PATH'] ?? path.join(__dirname, '../../data/brad-os.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db === null) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.'
    );
  }
  return db;
}

export function initializeDatabase(): Database.Database {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  const fs = await import('fs');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  console.log(`Database initialized at ${DB_PATH}`);

  return db;
}

export function closeDatabase(): void {
  if (db !== null) {
    db.close();
    db = null;
  }
}
```

**CORRECTION - The db/index.ts file above has an issue with top-level await. Here is the corrected version:**

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/src/db/index.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH =
  process.env['DB_PATH'] ?? path.join(__dirname, '../../data/brad-os.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db === null) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.'
    );
  }
  return db;
}

export function initializeDatabase(): Database.Database {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  console.log(`Database initialized at ${DB_PATH}`);

  return db;
}

export function closeDatabase(): void {
  if (db !== null) {
    db.close();
    db = null;
  }
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/src/routes/health.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import {
  APP_VERSION,
  createSuccessResponse,
  type HealthCheckResponse,
} from '@brad-os/shared';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response): void => {
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
  res.json(createSuccessResponse(response));
});
```

---

### Step 9: Create Client Package

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/package.json`**

```json
{
  "name": "@brad-os/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@brad-os/shared": "*",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/themes": "^3.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.64",
    "@types/react-dom": "^18.2.21",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.4.0",
    "vite": "^5.1.6",
    "vitest": "^1.3.0"
  }
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../shared" }]
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lifting - Workout Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { App } from './components/App';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Theme accentColor="teal" grayColor="slate" radius="medium">
      <App />
    </Theme>
  </StrictMode>
);
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/src/components/App.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { Box, Container, Heading, Text, Flex } from '@radix-ui/themes';
import { APP_VERSION, type HealthCheckResponse } from '@brad-os/shared';

interface HealthStatus {
  loading: boolean;
  data: HealthCheckResponse | null;
  error: string | null;
}

export function App(): JSX.Element {
  const [health, setHealth] = useState<HealthStatus>({
    loading: true,
    data: null,
    error: null,
  });

  useEffect(() => {
    const fetchHealth = async (): Promise<void> => {
      try {
        const response = await fetch('/api/health');
        const result = (await response.json()) as {
          success: boolean;
          data?: HealthCheckResponse;
          error?: string;
        };

        if (result.success && result.data !== undefined) {
          setHealth({ loading: false, data: result.data, error: null });
        } else {
          setHealth({
            loading: false,
            data: null,
            error: result.error ?? 'Unknown error',
          });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch health status';
        setHealth({ loading: false, data: null, error: errorMessage });
      }
    };

    void fetchHealth();
  }, []);

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="8" align="center">
          Lifting
        </Heading>
        <Text align="center" color="gray">
          Workout Tracker v{APP_VERSION}
        </Text>

        <Box
          p="4"
          style={{
            backgroundColor: 'var(--gray-2)',
            borderRadius: 'var(--radius-3)',
          }}
        >
          <Heading size="4" mb="2">
            Server Status
          </Heading>
          {health.loading && <Text>Checking server connection...</Text>}
          {health.error !== null && (
            <Text color="red">Error: {health.error}</Text>
          )}
          {health.data !== null && (
            <Flex direction="column" gap="1">
              <Text>
                Status:{' '}
                <Text color="green" weight="bold">
                  {health.data.status}
                </Text>
              </Text>
              <Text>Version: {health.data.version}</Text>
              <Text>Last checked: {health.data.timestamp}</Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Container>
  );
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />
```

---

### Step 10: Create E2E Test Package

**File: `/Users/bradcarter/Documents/Dev/lifting/e2e/package.json`**

```json
{
  "name": "e2e",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "puppeteer": "^22.4.0",
    "typescript": "^5.4.0",
    "vitest": "^1.3.0"
  }
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/e2e/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "composite": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true
  },
  "include": ["tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/e2e/tests/smoke.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { type Browser, type Page } from 'puppeteer';

describe('Smoke Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should load the home page', async () => {
    const baseUrl = process.env['BASE_URL'] ?? 'http://localhost:3000';
    await page.goto(baseUrl);

    const title = await page.title();
    expect(title).toContain('Lifting');
  });

  it('should display the app heading', async () => {
    const baseUrl = process.env['BASE_URL'] ?? 'http://localhost:3000';
    await page.goto(baseUrl);

    const heading = await page.$eval('h1', (el) => el.textContent);
    expect(heading).toBe('Lifting');
  });
});
```

---

### Step 11: Create Vitest Workspace Configuration

**File: `/Users/bradcarter/Documents/Dev/lifting/vitest.workspace.ts`**

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'shared',
      root: './packages/shared',
      environment: 'node',
    },
  },
  {
    test: {
      name: 'server',
      root: './packages/server',
      environment: 'node',
    },
  },
  {
    test: {
      name: 'client',
      root: './packages/client',
      environment: 'jsdom',
    },
  },
]);
```

---

### Step 12: Create Docker Configuration

**File: `/Users/bradcarter/Documents/Dev/lifting/docker/Dockerfile.dev`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies for better-sqlite3 compilation
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build shared package
RUN npm run build -w @brad-os/shared

# Expose ports
EXPOSE 3000 3001

# Start development servers
CMD ["npm", "run", "dev"]
```

**File: `/Users/bradcarter/Documents/Dev/lifting/docker/Dockerfile.prod`**

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for better-sqlite3 compilation
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build all packages
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy built artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package*.json ./packages/server/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Install production dependencies only
RUN npm ci --omit=dev

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/brad-os.db

EXPOSE 3001

# Start server
CMD ["node", "packages/server/dist/index.js"]
```

**File: `/Users/bradcarter/Documents/Dev/lifting/docker-compose.yml`**

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
    ports:
      - '3000:3000'
      - '3001:3001'
    volumes:
      - .:/app
      - /app/node_modules
      - /app/packages/shared/node_modules
      - /app/packages/server/node_modules
      - /app/packages/client/node_modules
      - lifting-data:/app/packages/server/data
    environment:
      - NODE_ENV=development
      - PORT=3001
      - DB_PATH=/app/packages/server/data/brad-os.db

volumes:
  lifting-data:
```

**File: `/Users/bradcarter/Documents/Dev/lifting/docker-compose.prod.yml`**

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile.prod
    ports:
      - '3001:3001'
    volumes:
      - lifting-data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  lifting-data:
```

---

### Step 13: Create Sample Unit Tests

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/shared/src/index.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  APP_VERSION,
  createSuccessResponse,
  createErrorResponse,
} from './index.js';

describe('shared utilities', () => {
  describe('APP_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('createSuccessResponse', () => {
    it('should create a success response with data', () => {
      const data = { foo: 'bar' };
      const response = createSuccessResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.error).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response with message', () => {
      const errorMessage = 'Something went wrong';
      const response = createErrorResponse(errorMessage);

      expect(response.success).toBe(false);
      expect(response.error).toBe(errorMessage);
      expect(response.data).toBeUndefined();
    });
  });
});
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/server/src/routes/health.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { type Request, type Response } from 'express';
import { healthRouter } from './health.js';

describe('health router', () => {
  it('should return health check response', () => {
    const mockReq = {} as Request;
    const mockRes = {
      json: vi.fn(),
    } as unknown as Response;

    // Get the handler from the router
    const handler = healthRouter.stack[0]?.route?.stack[0]?.handle as (
      req: Request,
      res: Response
    ) => void;

    handler(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: 'ok',
          version: expect.any(String),
          timestamp: expect.any(String),
        }),
      })
    );
  });
});
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/src/components/App.test.tsx`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { App } from './App';

// Mock fetch
global.fetch = vi.fn();

function renderWithTheme(component: React.ReactNode): ReturnType<typeof render> {
  return render(<Theme>{component}</Theme>);
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the heading', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: { status: 'ok', version: '0.0.1', timestamp: new Date().toISOString() },
      }),
    } as Response);

    renderWithTheme(<App />);

    expect(screen.getByRole('heading', { name: 'Lifting' })).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithTheme(<App />);

    expect(screen.getByText('Checking server connection...')).toBeInTheDocument();
  });
});
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

**Update: `/Users/bradcarter/Documents/Dev/lifting/packages/client/package.json`** - Add testing dependencies:

```json
{
  "name": "@brad-os/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@brad-os/shared": "*",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/themes": "^3.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^14.2.1",
    "@types/react": "^18.2.64",
    "@types/react-dom": "^18.2.21",
    "@vitejs/plugin-react": "^4.2.1",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.1.6",
    "vitest": "^1.3.0"
  }
}
```

**File: `/Users/bradcarter/Documents/Dev/lifting/packages/client/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
});
```

---

## Dependencies Summary

### Root Package (devDependencies)

```
@typescript-eslint/eslint-plugin: ^7.0.0
@typescript-eslint/parser: ^7.0.0
concurrently: ^8.2.2
eslint: ^8.57.0
eslint-config-prettier: ^9.1.0
eslint-plugin-react: ^7.34.0
eslint-plugin-react-hooks: ^4.6.0
prettier: ^3.2.5
typescript: ^5.4.0
vitest: ^1.3.0
```

### @brad-os/shared (devDependencies)

```
typescript: ^5.4.0
vitest: ^1.3.0
```

### @brad-os/server

**dependencies:**

```
@brad-os/shared: *
better-sqlite3: ^9.4.3
cors: ^2.8.5
express: ^4.18.3
```

**devDependencies:**

```
@types/better-sqlite3: ^7.6.9
@types/cors: ^2.8.17
@types/express: ^4.17.21
@types/node: ^20.11.0
tsx: ^4.7.1
typescript: ^5.4.0
vitest: ^1.3.0
```

### @brad-os/client

**dependencies:**

```
@brad-os/shared: *
@radix-ui/react-slot: ^1.0.2
@radix-ui/themes: ^3.0.0
react: ^18.2.0
react-dom: ^18.2.0
```

**devDependencies:**

```
@testing-library/jest-dom: ^6.4.2
@testing-library/react: ^14.2.1
@types/react: ^18.2.64
@types/react-dom: ^18.2.21
@vitejs/plugin-react: ^4.2.1
jsdom: ^24.0.0
typescript: ^5.4.0
vite: ^5.1.6
vitest: ^1.3.0
```

### e2e (devDependencies)

```
@types/node: ^20.11.0
puppeteer: ^22.4.0
typescript: ^5.4.0
vitest: ^1.3.0
```

---

## Implementation Order

Execute these steps in order:

1. Create directory structure:

   ```bash
   mkdir -p packages/shared/src
   mkdir -p packages/server/src/db
   mkdir -p packages/server/src/routes
   mkdir -p packages/client/src/components
   mkdir -p e2e/tests
   mkdir -p docker
   ```

2. Create all configuration files in this order:
   - `.gitignore`
   - `.prettierrc`
   - `tsconfig.base.json`
   - `tsconfig.json` (root)
   - `.eslintrc.cjs`
   - `vitest.workspace.ts`
   - `package.json` (root)

3. Create shared package files:
   - `packages/shared/package.json`
   - `packages/shared/tsconfig.json`
   - `packages/shared/src/index.ts`
   - `packages/shared/src/index.test.ts`

4. Create server package files:
   - `packages/server/package.json`
   - `packages/server/tsconfig.json`
   - `packages/server/src/db/index.ts`
   - `packages/server/src/routes/health.ts`
   - `packages/server/src/routes/health.test.ts`
   - `packages/server/src/index.ts`

5. Create client package files:
   - `packages/client/package.json`
   - `packages/client/tsconfig.json`
   - `packages/client/vite.config.ts`
   - `packages/client/vitest.config.ts`
   - `packages/client/index.html`
   - `packages/client/src/vite-env.d.ts`
   - `packages/client/src/test-setup.ts`
   - `packages/client/src/main.tsx`
   - `packages/client/src/components/App.tsx`
   - `packages/client/src/components/App.test.tsx`

6. Create e2e package files:
   - `e2e/package.json`
   - `e2e/tsconfig.json`
   - `e2e/tests/smoke.test.ts`

7. Create Docker files:
   - `docker/Dockerfile.dev`
   - `docker/Dockerfile.prod`
   - `docker-compose.yml`
   - `docker-compose.prod.yml`

8. Install dependencies:

   ```bash
   npm install
   ```

9. Build shared package:

   ```bash
   npm run build -w @brad-os/shared
   ```

10. Initialize git repository:
    ```bash
    git init
    git add .
    git commit -m "Initial commit: project scaffolding"
    ```

---

## Success Criteria

### Automated Verification (run all these commands - they must pass)

```bash
# 1. TypeScript compilation succeeds with no errors
npm run typecheck

# 2. ESLint passes with no errors or warnings
npm run lint

# 3. Prettier formatting check passes
npm run format:check

# 4. Unit tests pass
npm run test

# 5. Build succeeds
npm run build

# 6. Docker build succeeds
docker-compose build
```

### Manual Verification

1. **Development servers start correctly:**

   ```bash
   npm run dev
   ```

   - Client accessible at http://localhost:3000
   - Server accessible at http://localhost:3001
   - Client displays "Lifting" heading and shows server status as "ok"

2. **Health check endpoint works:**

   ```bash
   curl http://localhost:3001/api/health
   ```

   Expected response:

   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "timestamp": "...",
       "version": "0.0.1"
     }
   }
   ```

3. **Docker development environment works:**

   ```bash
   npm run docker:dev
   ```

   - App accessible at http://localhost:3000
   - API accessible at http://localhost:3001

4. **No `any` types in codebase:**

   ```bash
   grep -r "any" packages/*/src --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".test."
   ```

   Should return no results (except in type definitions from dependencies)

5. **Database file created:**
   - After running server, check that `packages/server/data/brad-os.db` exists

### E2E Test Verification (requires running servers)

```bash
# Start servers in one terminal
npm run dev

# Run E2E tests in another terminal
npm run test:e2e
```

---

## Commit Message

```
feat: initialize monorepo with project scaffolding

Set up complete development infrastructure for the Lifting workout tracker app:

- Monorepo structure with npm workspaces (client, server, shared, e2e)
- Strict TypeScript configuration (all strict flags enabled, no any allowed)
- ESLint with @typescript-eslint/no-explicit-any: error
- Prettier for consistent code formatting
- Docker setup (Dockerfile.dev, Dockerfile.prod, docker-compose.yml)
- Vitest for unit testing with workspace configuration
- Puppeteer for E2E testing
- React + Vite + Radix UI for client
- Express + TypeScript + better-sqlite3 for server
- Health check endpoint and basic UI with server status display

Development scripts: dev, build, lint, typecheck, test, docker:dev
```

---

## Notes for Implementing Agent

1. **File creation order matters** - Create parent directories before files, and create dependency packages (shared) before dependent packages (server, client).

2. **The shared package must be built before other packages** - Run `npm run build -w @brad-os/shared` after installing dependencies.

3. **ESLint requires all tsconfig.json files to exist** - Create all TypeScript configs before running lint.

4. **better-sqlite3 requires native compilation** - On some systems, you may need Python and build tools installed. The Docker setup handles this.

5. **The client proxy configuration** - Vite is configured to proxy `/api` requests to the server at port 3001.

6. **Database initialization** - The server creates the data directory and database file automatically on first run.

7. **Test files use `.test.ts` or `.test.tsx` extension** - Vitest is configured to find these automatically.
