# Phase 10: Final Polish & Deployment

## Overview

This phase focuses on transforming the weight training workout tracker from a functional application into a production-ready, polished product. The work encompasses UI refinement, production Docker configuration, comprehensive documentation, and final testing to ensure deployment readiness.

---

## 1. UI Polish

### 1.1 Color Palette & Theme System

**Selected Palette: "Gym Mint"**
A clean, energetic light theme that's easy on the eyes during workouts:

```typescript
// client/src/theme/colors.ts
export const colors = {
  // Primary - Teal/Mint (energetic but not harsh)
  primary: {
    50: '#E6FFFA',
    100: '#B2F5EA',
    200: '#81E6D9',
    300: '#4FD1C5',
    400: '#38B2AC',
    500: '#319795', // Main primary
    600: '#2C7A7B',
    700: '#285E61',
    800: '#234E52',
    900: '#1D4044',
  },

  // Accent - Coral/Orange (for CTAs and highlights)
  accent: {
    50: '#FFF5F5',
    100: '#FED7D7',
    200: '#FEB2B2',
    300: '#FC8181',
    400: '#F56565',
    500: '#E53E3E', // Main accent
    600: '#C53030',
    700: '#9B2C2C',
    800: '#822727',
    900: '#63171B',
  },

  // Neutrals
  gray: {
    50: '#F7FAFC',
    100: '#EDF2F7',
    200: '#E2E8F0',
    300: '#CBD5E0',
    400: '#A0AEC0',
    500: '#718096',
    600: '#4A5568',
    700: '#2D3748',
    800: '#1A202C',
    900: '#171923',
  },

  // Semantic
  success: '#38A169',
  warning: '#D69E2E',
  error: '#E53E3E',
  info: '#3182CE',

  // Background
  background: '#FFFFFF',
  surface: '#F7FAFC',
  surfaceElevated: '#FFFFFF',
};
```

**Implementation Tasks:**

- [ ] Create `/client/src/theme/colors.ts` with the color palette
- [ ] Create `/client/src/theme/index.ts` to export theme configuration
- [ ] Update Radix UI theme provider to use custom colors
- [ ] Apply primary color to interactive elements (buttons, links, selected states)
- [ ] Apply accent color to CTAs and important actions
- [ ] Ensure sufficient contrast ratios (WCAG AA minimum)

### 1.2 Bottom Tab Navigation

**Component Structure:**

```typescript
// client/src/components/navigation/BottomNav.tsx
interface NavTab {
  id: 'today' | 'meso' | 'library';
  label: string;
  icon: React.ComponentType;
  path: string;
}

const tabs: NavTab[] = [
  { id: 'today', label: 'Today', icon: CalendarIcon, path: '/' },
  { id: 'meso', label: 'Meso', icon: LayersIcon, path: '/mesocycle' },
  { id: 'library', label: 'Library', icon: BookIcon, path: '/exercises' },
];
```

**Implementation Tasks:**

- [ ] Create `BottomNav` component with fixed positioning at viewport bottom
- [ ] Implement active state highlighting using route matching
- [ ] Add touch-friendly tap targets (minimum 44x44px)
- [ ] Add subtle haptic feedback consideration (CSS active states)
- [ ] Create corresponding page routes:
  - `/` - Today's workout view
  - `/mesocycle` - Current mesocycle overview
  - `/exercises` - Exercise library management
- [ ] Hide bottom nav during active workout (full-screen workout mode)
- [ ] Add safe area insets for notched devices

**Styling:**

```css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  padding-bottom: env(safe-area-inset-bottom);
  background: white;
  border-top: 1px solid var(--gray-200);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
}
```

### 1.3 Typography System

**Font Stack:**

```typescript
// client/src/theme/typography.ts
export const typography = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },

  fontSize: {
    xs: '0.75rem', // 12px - captions
    sm: '0.875rem', // 14px - secondary text
    base: '1rem', // 16px - body text
    lg: '1.125rem', // 18px - emphasized body
    xl: '1.25rem', // 20px - section headers
    '2xl': '1.5rem', // 24px - page titles
    '3xl': '1.875rem', // 30px - large titles
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};
```

**Implementation Tasks:**

- [ ] Create typography configuration file
- [ ] Define heading styles (h1-h6) with consistent hierarchy
- [ ] Define body text styles
- [ ] Create utility classes or styled components for text
- [ ] Ensure minimum 16px base font size for mobile readability

### 1.4 Spacing System

**Spacing Scale:**

```typescript
// client/src/theme/spacing.ts
export const spacing = {
  0: '0',
  1: '0.25rem', // 4px
  2: '0.5rem', // 8px
  3: '0.75rem', // 12px
  4: '1rem', // 16px
  5: '1.25rem', // 20px
  6: '1.5rem', // 24px
  8: '2rem', // 32px
  10: '2.5rem', // 40px
  12: '3rem', // 48px
  16: '4rem', // 64px
};

// Component-specific
export const componentSpacing = {
  cardPadding: spacing[4],
  sectionGap: spacing[6],
  listItemGap: spacing[3],
  inputPadding: `${spacing[2]} ${spacing[3]}`,
  buttonPadding: `${spacing[2]} ${spacing[4]}`,
  pageMargin: spacing[4],
  bottomNavHeight: '64px',
  bottomNavSafeArea: '84px', // Including safe area
};
```

**Implementation Tasks:**

- [ ] Create spacing configuration file
- [ ] Audit all components for consistent spacing usage
- [ ] Add page-level padding that accounts for bottom nav
- [ ] Ensure touch targets have adequate spacing (no accidental taps)

### 1.5 Loading States

**Loading Component Variants:**

```typescript
// client/src/components/ui/Loading.tsx

// Full page loading
export const PageLoader: React.FC = () => (
  <div className="page-loader">
    <Spinner size="lg" />
    <span className="sr-only">Loading...</span>
  </div>
);

// Inline loading (for buttons)
export const ButtonLoader: React.FC = () => (
  <Spinner size="sm" className="button-spinner" />
);

// Skeleton loaders for content
export const WorkoutCardSkeleton: React.FC = () => (
  <div className="skeleton-card" aria-busy="true">
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line skeleton-subtitle" />
    <div className="skeleton-line skeleton-body" />
  </div>
);

// List skeleton
export const ExerciseListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div className="skeleton-list">
    {Array.from({ length: count }).map((_, i) => (
      <ExerciseItemSkeleton key={i} />
    ))}
  </div>
);
```

**Implementation Tasks:**

- [ ] Create `Spinner` component with size variants
- [ ] Create skeleton components for:
  - Workout card
  - Exercise list item
  - Mesocycle overview
  - Today's workout summary
- [ ] Add loading states to all data-fetching hooks
- [ ] Add loading prop to Button component with spinner
- [ ] Implement Suspense boundaries where appropriate

### 1.6 Error States

**Error Component:**

```typescript
// client/src/components/ui/ErrorState.tsx
interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}) => (
  <div className="error-state" role="alert">
    <AlertCircleIcon className="error-icon" />
    <h3 className="error-title">{title}</h3>
    <p className="error-message">{message}</p>
    {onRetry && (
      <Button onClick={onRetry} variant="outline">
        <RefreshIcon />
        {retryLabel}
      </Button>
    )}
  </div>
);
```

**Implementation Tasks:**

- [ ] Create `ErrorState` component with retry functionality
- [ ] Create `ErrorBoundary` component for React error catching
- [ ] Add error states to all API hooks
- [ ] Implement toast/notification system for transient errors
- [ ] Add specific error messages for common failures:
  - Network errors
  - Server errors (500)
  - Not found (404)
  - Validation errors

### 1.7 Empty States

**Empty State Components:**

```typescript
// client/src/components/ui/EmptyState.tsx
interface EmptyStateProps {
  icon: React.ComponentType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Specific empty states
export const NoPlansEmpty: React.FC = () => (
  <EmptyState
    icon={ClipboardIcon}
    title="No workout plans yet"
    description="Create your first plan to start tracking your progress"
    action={{
      label: 'Create Plan',
      onClick: () => navigate('/plans/new'),
    }}
  />
);

export const NoExercisesEmpty: React.FC = () => (
  <EmptyState
    icon={DumbbellIcon}
    title="No exercises in library"
    description="Add exercises to build your workout plans"
    action={{
      label: 'Add Exercise',
      onClick: () => openExerciseModal(),
    }}
  />
);

export const NoActiveMesoEmpty: React.FC = () => (
  <EmptyState
    icon={CalendarIcon}
    title="No active mesocycle"
    description="Start a mesocycle from one of your plans to begin training"
    action={{
      label: 'View Plans',
      onClick: () => navigate('/plans'),
    }}
  />
);

export const NoWorkoutTodayEmpty: React.FC = () => (
  <EmptyState
    icon={CoffeeIcon}
    title="Rest day"
    description="No workout scheduled for today. Enjoy your recovery!"
  />
);
```

**Implementation Tasks:**

- [ ] Create base `EmptyState` component
- [ ] Create specific empty states for:
  - No plans created
  - No exercises in library
  - No active mesocycle
  - No workout scheduled today
  - No sets logged in workout
  - Search with no results
- [ ] Add appropriate icons for each empty state
- [ ] Include actionable CTAs where applicable

### 1.8 Mobile-Responsive Design

**Breakpoints:**

```typescript
// client/src/theme/breakpoints.ts
export const breakpoints = {
  sm: '640px', // Small phones
  md: '768px', // Large phones / small tablets
  lg: '1024px', // Tablets
  xl: '1280px', // Desktop
};

// Mobile-first media queries
export const media = {
  sm: `@media (min-width: ${breakpoints.sm})`,
  md: `@media (min-width: ${breakpoints.md})`,
  lg: `@media (min-width: ${breakpoints.lg})`,
  xl: `@media (min-width: ${breakpoints.xl})`,
};
```

**Mobile-First Principles:**

- [ ] All touch targets minimum 44x44px
- [ ] Forms use appropriate input types (`inputmode="numeric"` for weights/reps)
- [ ] Large, easy-to-tap buttons during workout
- [ ] Swipe gestures for common actions (optional enhancement)
- [ ] Prevent accidental navigation during workout
- [ ] Viewport meta tag with `user-scalable=no` during workout (optional)

**Implementation Tasks:**

- [ ] Audit all components for mobile usability
- [ ] Test on various viewport sizes (320px - 428px width)
- [ ] Ensure workout logging UI is thumb-friendly
- [ ] Add viewport meta tag configuration
- [ ] Test landscape orientation handling
- [ ] Implement pull-to-refresh where appropriate (optional)

---

## 2. Production Docker Configuration

### 2.1 Multi-stage Dockerfile

**File: `/Dockerfile.prod`**

```dockerfile
# ================================================
# Stage 1: Build client
# ================================================
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy package files for caching
COPY client/package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY client/ ./
RUN npm run build

# ================================================
# Stage 2: Build server
# ================================================
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# Copy package files for caching
COPY server/package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY server/ ./
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ================================================
# Stage 3: Production runtime
# ================================================
FROM node:20-alpine AS production

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built server
COPY --from=server-builder --chown=nodejs:nodejs /app/server/dist ./dist
COPY --from=server-builder --chown=nodejs:nodejs /app/server/node_modules ./node_modules
COPY --from=server-builder --chown=nodejs:nodejs /app/server/package.json ./

# Copy built client to serve as static files
COPY --from=client-builder --chown=nodejs:nodejs /app/client/dist ./public

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/brad-os.db

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Switch to non-root user
USER nodejs

# Start server
CMD ["node", "dist/index.js"]
```

**Implementation Tasks:**

- [ ] Create `/Dockerfile.prod` with multi-stage build
- [ ] Optimize layer caching (package.json before source)
- [ ] Configure non-root user for security
- [ ] Set up static file serving from server
- [ ] Configure health check

### 2.2 Docker Compose Production

**File: `/docker-compose.prod.yml`**

```yaml
version: '3.8'

services:
  lifting:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: lifting-app
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - lifting-data:/app/data
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/brad-os.db
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:3000/api/health',
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'

volumes:
  lifting-data:
    driver: local
```

**Implementation Tasks:**

- [ ] Create `/docker-compose.prod.yml`
- [ ] Configure named volume for database persistence
- [ ] Set restart policy to `unless-stopped`
- [ ] Configure logging with rotation
- [ ] Add health check configuration

### 2.3 Health Check Endpoint

**Server Implementation:**

```typescript
// server/src/routes/health.ts
import { Router } from 'express';
import { db } from '../database';

const router = Router();

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
  version: string;
}

router.get('/health', async (req, res) => {
  const startTime = Date.now();

  let dbStatus: 'connected' | 'disconnected' = 'disconnected';

  try {
    // Simple query to verify database connection
    await db.get('SELECT 1');
    dbStatus = 'connected';
  } catch (error) {
    console.error('Health check database error:', error);
  }

  const health: HealthResponse = {
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    version: process.env.npm_package_version || '1.0.0',
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json(health);
});

export default router;
```

**Implementation Tasks:**

- [ ] Create `/server/src/routes/health.ts`
- [ ] Register health route in Express app
- [ ] Include database connectivity check
- [ ] Return appropriate status codes (200 for healthy, 503 for unhealthy)

### 2.4 Production Server Configuration

**Updates to server/src/index.ts:**

```typescript
// server/src/index.ts
import express from 'express';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        mediaSrc: ["'self'"],
      },
    },
  })
);

// Compression
app.use(compression());

// API routes
app.use('/api', apiRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, '../public');
  app.use(express.static(staticPath));

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Implementation Tasks:**

- [ ] Add `helmet` for security headers
- [ ] Add `compression` middleware
- [ ] Configure static file serving for production
- [ ] Implement SPA fallback routing
- [ ] Add graceful shutdown handling

---

## 3. Documentation

### 3.1 README.md

**File: `/README.md`**

````markdown
# Lifting - Weight Training Workout Tracker

A personal weight training workout tracker designed for progressive overload training with mesocycle planning.

## Features

- **Plan Creator**: Design custom workout plans with configurable exercises, sets, reps, and weights
- **Mesocycle Tracking**: 6-week progressive overload cycles with automatic progression
- **Workout Logging**: Track sets, reps, and weights during your workout
- **Rest Timer**: Configurable rest periods with audio notification
- **Deload Weeks**: Automatic deload recommendations after each mesocycle
- **Exercise Library**: Manage your exercise database with custom additions

## Tech Stack

- **Frontend**: React 18, TypeScript, Radix UI
- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite
- **Testing**: Vitest (unit), Puppeteer (E2E)
- **Deployment**: Docker

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lifting
   ```
````

2. **Install dependencies**

   ```bash
   # Install all dependencies (root, client, server)
   npm install
   ```

3. **Start development servers**

   ```bash
   # Start both client and server in development mode
   npm run dev
   ```

   - Client: http://localhost:5173
   - Server: http://localhost:3001

4. **Run tests**

   ```bash
   # Unit tests
   npm run test

   # E2E tests
   npm run test:e2e

   # All tests with coverage
   npm run test:coverage
   ```

### Docker Development

```bash
# Build and run with Docker Compose
docker-compose up --build

# Access at http://localhost:3000
```

## Deployment

### Production Docker Build

1. **Build the production image**

   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

2. **Run in production**

   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **View logs**

   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

4. **Stop**
   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

### Data Persistence

The SQLite database is stored in a Docker volume (`lifting-data`). To backup:

```bash
# Create backup
docker cp lifting-app:/app/data/brad-os.db ./backup-$(date +%Y%m%d).db

# Restore from backup
docker cp ./backup.db lifting-app:/app/data/brad-os.db
```

### Environment Variables

| Variable        | Description               | Default             |
| --------------- | ------------------------- | ------------------- |
| `NODE_ENV`      | Environment mode          | `development`       |
| `PORT`          | Server port               | `3000`              |
| `DATABASE_PATH` | SQLite database file path | `./data/brad-os.db` |

## Project Structure

```
lifting/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── pages/          # Page components
│   │   ├── services/       # API client
│   │   ├── theme/          # Design tokens
│   │   └── types/          # TypeScript types
│   └── tests/              # Frontend tests
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── database/       # SQLite setup
│   │   └── types/          # TypeScript types
│   └── tests/              # Backend tests
├── e2e/                    # Puppeteer E2E tests
├── docker-compose.yml      # Development Docker config
├── docker-compose.prod.yml # Production Docker config
├── Dockerfile.prod         # Production Dockerfile
└── README.md
```

## Usage Guide

### Creating a Plan

1. Navigate to the "Library" tab to add exercises
2. Go to "Meso" tab and create a new plan
3. Select workout days and assign exercises
4. Configure starting weights, sets, and reps

### Starting a Mesocycle

1. From the "Meso" tab, select a plan
2. Click "Start Mesocycle"
3. Follow the progressive overload schedule

### Logging a Workout

1. The "Today" tab shows your current workout
2. Tap an exercise to expand
3. Log each set with actual weight and reps
4. Rest timer starts automatically
5. Complete workout when done

## License

MIT

````

**Implementation Tasks:**
- [ ] Create comprehensive README.md
- [ ] Include all setup instructions
- [ ] Document environment variables
- [ ] Add project structure diagram
- [ ] Include usage guide

---

## 4. Final Testing

### 4.1 E2E Test Suite Verification

**Test Scenarios to Verify:**
- [ ] Plan creation flow (create plan, add exercises, configure days)
- [ ] Mesocycle start flow (start meso from plan)
- [ ] Workout logging flow (log sets, modify weight/reps, complete workout)
- [ ] Set removal during workout
- [ ] Progression verification (complete week 1, verify week 2 has progression)
- [ ] Rest timer functionality
- [ ] Navigation between all tabs
- [ ] Exercise library management

**E2E Test Commands:**
```bash
# Run full E2E suite
npm run test:e2e

# Run specific test file
npm run test:e2e -- --testPathPattern="workout-logging"

# Run with headed browser for debugging
npm run test:e2e -- --headed
````

### 4.2 Manual Testing Checklist

**Today Tab:**

- [ ] Shows "Rest day" when no workout scheduled
- [ ] Shows workout summary when workout exists
- [ ] Can start workout
- [ ] Can view/expand exercises
- [ ] Can log sets with correct data
- [ ] Rest timer counts up and plays sound
- [ ] Can modify weight and reps during workout
- [ ] Can remove a set
- [ ] Can complete workout
- [ ] Progress persists after completion

**Meso Tab:**

- [ ] Shows empty state when no active meso
- [ ] Can view available plans
- [ ] Can start a mesocycle
- [ ] Shows mesocycle progress (current week, completed workouts)
- [ ] Can view week breakdown
- [ ] Can cancel mesocycle
- [ ] Deload week appears after 6 weeks

**Library Tab:**

- [ ] Shows all exercises
- [ ] Can add new exercise
- [ ] Can edit exercise
- [ ] Can delete exercise (with confirmation)
- [ ] Search/filter exercises
- [ ] Exercise shows in plan creation

**Cross-cutting:**

- [ ] Loading states appear during data fetches
- [ ] Error states appear with retry option on failures
- [ ] Empty states are informative and actionable
- [ ] Bottom navigation works correctly
- [ ] Back navigation doesn't break state
- [ ] Data persists after page refresh

### 4.3 Docker Production Build Verification

**Build and Test Commands:**

```bash
# Build production image
docker-compose -f docker-compose.prod.yml build

# Run production container
docker-compose -f docker-compose.prod.yml up -d

# Verify health check
curl http://localhost:3000/api/health

# Verify static files served
curl http://localhost:3000

# Verify API works
curl http://localhost:3000/api/exercises

# Check logs
docker-compose -f docker-compose.prod.yml logs

# Stop and verify data persistence
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
# Verify data still exists

# Cleanup
docker-compose -f docker-compose.prod.yml down -v
```

**Verification Checklist:**

- [ ] Production build completes without errors
- [ ] Container starts successfully
- [ ] Health check endpoint returns healthy
- [ ] Static files are served correctly
- [ ] API endpoints work
- [ ] Database persists across container restarts
- [ ] Logs are properly formatted
- [ ] Container runs as non-root user

---

## 5. Nice-to-Haves (If Time Permits)

### 5.1 Favicon

**Implementation:**

```bash
# Create favicon files in client/public/
# - favicon.ico (16x16, 32x32, 48x48)
# - apple-touch-icon.png (180x180)
# - favicon-32x32.png
# - favicon-16x16.png
```

**client/index.html updates:**

```html
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
```

**Design:** Simple dumbbell or weight plate icon in primary teal color

- [ ] Design favicon (dumbbell icon)
- [ ] Generate all required sizes
- [ ] Add to client/public
- [ ] Update index.html with links

### 5.2 App Title

**client/index.html:**

```html
<title>Lifting - Workout Tracker</title>
<meta
  name="description"
  content="Personal weight training workout tracker with progressive overload planning"
/>
```

**Dynamic titles per page:**

```typescript
// client/src/hooks/usePageTitle.ts
export function usePageTitle(title: string) {
  useEffect(() => {
    const baseTitle = 'Lifting';
    document.title = title ? `${title} | ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [title]);
}

// Usage
usePageTitle('Today'); // "Today | Lifting"
usePageTitle('Leg Day'); // "Leg Day | Lifting"
```

- [ ] Set base title in index.html
- [ ] Create usePageTitle hook
- [ ] Apply to all pages

### 5.3 Keyboard Shortcuts

**Shortcuts to implement:**
| Shortcut | Action | Context |
|----------|--------|---------|
| `Space` | Log set / Start rest timer | During workout |
| `Enter` | Confirm dialog | Any modal |
| `Escape` | Close modal / Cancel | Any modal |
| `1/2/3` | Switch tabs | Global |
| `n` | New (exercise/plan) | Library/Plans |

**Implementation:**

```typescript
// client/src/hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case '1':
          navigate('/');
          break;
        case '2':
          navigate('/mesocycle');
          break;
        case '3':
          navigate('/exercises');
          break;
        // ... more shortcuts
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

- [ ] Create keyboard shortcuts hook
- [ ] Implement navigation shortcuts
- [ ] Implement workout action shortcuts
- [ ] Add visual hint for shortcuts (tooltip on hover)

---

## 6. Implementation Order

### Phase 10A: UI Foundation (Day 1-2)

1. Set up theme system (colors, typography, spacing)
2. Create BottomNav component
3. Set up page routes and navigation
4. Create Loading components (Spinner, skeletons)
5. Create ErrorState component
6. Create EmptyState components

### Phase 10B: UI Integration (Day 2-3)

7. Apply theme to all existing components
8. Add loading states to all data hooks
9. Add error states with retry
10. Add empty states to all views
11. Mobile responsiveness audit and fixes
12. Accessibility review (ARIA labels, focus states)

### Phase 10C: Production Docker (Day 3-4)

13. Create Dockerfile.prod
14. Create docker-compose.prod.yml
15. Implement health check endpoint
16. Add security middleware (helmet)
17. Configure static file serving
18. Test production build

### Phase 10D: Documentation & Testing (Day 4-5)

19. Write comprehensive README.md
20. Run full E2E test suite
21. Manual testing of all flows
22. Fix any discovered issues
23. Nice-to-haves (favicon, title, shortcuts)

---

## 7. Success Criteria

### UI Polish

- [ ] Consistent color palette applied throughout app
- [ ] Bottom tab navigation functional on all pages
- [ ] Typography hierarchy is clear and readable
- [ ] Spacing is consistent across all components
- [ ] All async operations show loading state
- [ ] All error scenarios show error state with retry
- [ ] All empty data scenarios show helpful empty state
- [ ] App is fully usable on mobile viewport (375px width)
- [ ] Touch targets are minimum 44x44px
- [ ] No horizontal scroll on mobile

### Production Docker

- [ ] `docker-compose -f docker-compose.prod.yml build` succeeds
- [ ] `docker-compose -f docker-compose.prod.yml up` starts healthy container
- [ ] `/api/health` returns 200 with healthy status
- [ ] Frontend loads correctly from static files
- [ ] Database persists across container restarts
- [ ] Container runs as non-root user
- [ ] Logs are captured and rotated

### Documentation

- [ ] README has clear setup instructions
- [ ] README has deployment instructions
- [ ] README documents all environment variables
- [ ] README explains project structure

### Testing

- [ ] All E2E tests pass
- [ ] Manual testing checklist completed with no critical issues
- [ ] Production Docker build verified working

### Nice-to-Haves (Optional)

- [ ] Favicon displays in browser tab
- [ ] Page title updates per route
- [ ] Basic keyboard shortcuts work

---

## 8. Commit Message

```
feat: add final polish and production deployment

UI Polish:
- Add cohesive color palette (teal primary, coral accent)
- Implement bottom tab navigation (Today, Meso, Library)
- Create consistent typography and spacing system
- Add loading states with spinners and skeletons
- Add error states with retry functionality
- Add empty states for all data-less scenarios
- Ensure mobile-responsive design throughout

Production Docker:
- Create multi-stage Dockerfile.prod for optimized builds
- Add docker-compose.prod.yml with restart policies
- Implement /api/health endpoint for container health checks
- Configure static file serving from Express
- Add security headers with helmet middleware
- Set up SQLite persistence via Docker volumes

Documentation:
- Write comprehensive README.md
- Document local development setup
- Document Docker deployment process
- Include project structure and tech stack

Testing:
- Verify all E2E tests pass
- Complete manual testing of all user flows
- Verify production Docker build works correctly

Nice-to-haves:
- Add favicon with dumbbell icon
- Implement dynamic page titles
- Add keyboard shortcuts for common actions

Closes #10
```

---

## 9. Dependencies to Add

```json
// server/package.json
{
  "dependencies": {
    "helmet": "^7.1.0",
    "compression": "^1.7.4"
  },
  "devDependencies": {
    "@types/compression": "^1.7.5"
  }
}
```

No additional client dependencies required (Radix UI already provides icons and components).

---

## 10. Files to Create/Modify

### New Files

- `/client/src/theme/colors.ts`
- `/client/src/theme/typography.ts`
- `/client/src/theme/spacing.ts`
- `/client/src/theme/index.ts`
- `/client/src/components/navigation/BottomNav.tsx`
- `/client/src/components/ui/Loading.tsx`
- `/client/src/components/ui/Spinner.tsx`
- `/client/src/components/ui/Skeleton.tsx`
- `/client/src/components/ui/ErrorState.tsx`
- `/client/src/components/ui/EmptyState.tsx`
- `/client/src/hooks/usePageTitle.ts`
- `/client/src/hooks/useKeyboardShortcuts.ts` (optional)
- `/server/src/routes/health.ts`
- `/Dockerfile.prod`
- `/docker-compose.prod.yml`
- `/README.md`
- `/client/public/favicon.ico` (optional)

### Modified Files

- `/client/src/App.tsx` - Add theme provider, routing
- `/client/src/index.html` - Add favicon links, meta tags
- `/client/src/index.css` - Add CSS variables from theme
- `/server/src/index.ts` - Add helmet, compression, static serving
- `/server/src/routes/index.ts` - Register health route
- All page components - Add loading, error, empty states
- All data hooks - Add loading and error handling
