> **ARCHIVED** — This guide predates the Cloud Functions migration (2026-01-27). Firebase setup is now handled by `firebase.json` and Cloud Functions v2. See `docs/guides/debugging-cloud-functions.md` for current guidance.

---

# Firebase Setup Guide

This guide walks you through setting up Firebase for the Brad OS application. The app uses **Firebase Firestore** for data storage with environment-based collection prefixes to separate development and production data.

## Prerequisites

- A Google account
- Node.js 18+ installed
- The Brad OS repository cloned

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project**
3. Enter a project name (e.g., `brad-os` or `brad-os-dev`)
4. Disable Google Analytics (optional, not needed for this app)
5. Click **Create project**

> **Note:** You can use a single Firebase project for both dev and production (the app uses collection prefixes to separate data), or create separate projects for better isolation.

## Step 2: Enable Firestore

1. In your Firebase project, go to **Build > Firestore Database**
2. Click **Create database**
3. Choose a location closest to your users (e.g., `us-central1`)
4. Select **Start in production mode** (we'll set up rules later)
5. Click **Enable**

## Step 3: Generate Service Account Credentials

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Go to the **Service accounts** tab
3. Click **Generate new private key**
4. Save the downloaded JSON file securely (do NOT commit it to git)

The JSON file contains:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com",
  ...
}
```

## Step 4: Configure Environment Variables

Create a `.env` file in `packages/server/`:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Server Configuration
PORT=3001
NODE_ENV=development
```

**Important:**
- The `FIREBASE_PRIVATE_KEY` must include the newline characters (`\n`) and be wrapped in quotes
- Add `.env` to your `.gitignore` if not already present

### Environment-Based Collection Prefixes

The app automatically prefixes Firestore collections based on `NODE_ENV`:

| NODE_ENV | Collection Prefix | Example Collection |
|----------|-------------------|-------------------|
| `development` (default) | `dev_` | `dev_exercises` |
| `test` | `test_` | `test_exercises` |
| `production` | (none) | `exercises` |

This allows you to use a single Firebase project while keeping data isolated.

## Step 5: Set Up Firestore Indexes

Some queries require composite indexes. You can create these in the Firebase Console or via the Firebase CLI.

### Required Indexes

Create these composite indexes in **Firestore > Indexes**:

1. **exercises** collection:
   - `is_custom` (Ascending) + `name` (Ascending)

2. **plan_days** collection:
   - `plan_id` (Ascending) + `sort_order` (Ascending)

3. **plan_day_exercises** collection:
   - `plan_day_id` (Ascending) + `sort_order` (Ascending)

4. **mesocycles** collection:
   - `status` (Ascending) + `start_date` (Descending)
   - `plan_id` (Ascending) + `start_date` (Descending)

5. **workouts** collection:
   - `mesocycle_id` (Ascending) + `scheduled_date` (Ascending)
   - `status` (Ascending) + `scheduled_date` (Ascending)
   - `status` (Ascending) + `completed_at` (Ascending)
   - `mesocycle_id` (Ascending) + `plan_day_id` (Ascending) + `week_number` (Ascending)

6. **workout_sets** collection:
   - `workout_id` (Ascending) + `exercise_id` (Ascending) + `set_number` (Ascending)
   - `exercise_id` (Ascending) + `status` (Ascending)

7. **stretch_sessions** collection:
   - `completedAt` (Descending)

8. **meditation_sessions** collection:
   - `completedAt` (Descending)

> **Tip:** If you see an error about missing indexes when running the app, Firebase will provide a direct link to create the required index.

## Step 6: Configure Firestore Security Rules

Go to **Firestore > Rules** and set up security rules. For a personal app with server-side access only:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny all client-side access (server uses Admin SDK which bypasses rules)
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

If you need client-side access later, you'll need to implement proper authentication rules.

## Step 7: Run the Server

```bash
cd packages/server
npm run dev
```

You should see:
```
Firestore database initialized for development (prefix: dev_)
Server running on http://localhost:3001
```

## Production Setup

For production deployment:

1. Set `NODE_ENV=production` - this removes the collection prefix
2. Use environment variables from your hosting provider (Vercel, Railway, etc.)
3. Consider using a separate Firebase project for production

### Example Production Environment Variables (Railway/Vercel)

```
NODE_ENV=production
FIREBASE_PROJECT_ID=brad-os-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@brad-os-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

## Troubleshooting

### "Missing Firebase configuration" Error

Ensure all three environment variables are set:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### "The query requires an index" Error

Firestore will provide a link in the error message. Click it to create the required index automatically.

### Private Key Format Issues

The private key must:
- Include `\n` characters (not actual newlines in the env var)
- Be wrapped in quotes when set in `.env`
- Match exactly what's in the JSON file from Firebase

Example of correct format in `.env`:
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBg...\n-----END PRIVATE KEY-----\n"
```

### Testing with Firebase Emulator (Optional)

For local testing without hitting real Firebase:

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Initialize emulators: `firebase init emulators`
3. Start emulators: `firebase emulators:start`
4. Set `FIRESTORE_EMULATOR_HOST=localhost:8080` in your environment

## Data Migration from SQLite

If you have existing SQLite data to migrate, you'll need to write a migration script. The key changes:

1. IDs changed from `number` to `string` (Firestore document IDs)
2. All foreign key references updated to string IDs
3. Boolean fields stored as actual booleans (not 0/1)

## Firestore Data Model

### Collections

| Collection | Description |
|------------|-------------|
| `exercises` | Exercise definitions |
| `plans` | Workout plan templates |
| `plan_days` | Days within a plan |
| `plan_day_exercises` | Exercises assigned to plan days |
| `mesocycles` | 6-week + deload instances of plans |
| `workouts` | Individual workout sessions |
| `workout_sets` | Sets within workouts |
| `stretch_sessions` | Stretching session records |
| `meditation_sessions` | Meditation session records |

### Document Structure Examples

**Exercise:**
```json
{
  "name": "Dumbbell Press (Flat)",
  "weight_increment": 5,
  "is_custom": false,
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

**Workout:**
```json
{
  "mesocycle_id": "abc123",
  "plan_day_id": "def456",
  "week_number": 1,
  "scheduled_date": "2024-01-15",
  "status": "pending",
  "started_at": null,
  "completed_at": null
}
```

## Cost Considerations

Firestore pricing is based on:
- Document reads/writes
- Storage
- Network bandwidth

For a personal fitness tracking app with moderate usage, you'll likely stay within the free tier:
- 50,000 reads/day
- 20,000 writes/day
- 1 GiB storage

Monitor usage in Firebase Console > Usage and billing.
