# API Patterns

## RESTful Endpoints

Standard CRUD structure:

```
GET    /api/exercises          # List all
GET    /api/exercises/:id      # Get one
POST   /api/exercises          # Create
PUT    /api/exercises/:id      # Update
DELETE /api/exercises/:id      # Delete
```

## Action Endpoints

Action endpoints use verb suffixes:

```
PUT    /api/workouts/:id/start
PUT    /api/workouts/:id/complete
PUT    /api/workout-sets/:id/log
PUT    /api/workout-sets/:id/skip
```

## Base Repository Contract

- Base repositories follow `BaseRepository<T extends { id: string }, CreateDTO, UpdateDTO>` in `packages/functions/src/repositories/base.repository.ts`.
- Router-facing contracts use `IBaseRepository<T, CreateDTO, UpdateDTO>` in `packages/functions/src/types/repository.ts`.
- Override `protected buildUpdatePayload(data: UpdateDTO): Record<string, unknown>` when a domain needs specialized Firestore payload shaping.
- Ingredient and recipe repositories intentionally reject write operations through override points when read-only by design.

## Router Factory Pattern

Cloud Functions handlers should use shared router construction helpers in `packages/functions/src/middleware/create-resource-router.ts`:

- `createResourceRouter<T, CreateDTO, UpdateDTO, TRepo extends IBaseRepository<T, CreateDTO, UpdateDTO>>(config)`
- `createBaseApp(resourceName: string): express.Application`

Use this config shape with `createResourceRouter`:

```ts
{
  resourceName: 'exercises',
  displayName: 'Exercise',
  RepoClass: ExerciseRepository,
  createSchema: createExerciseSchema,
  updateSchema: updateExerciseSchema,
}
```

Decision rule:
- **Use `createResourceRouter`** when the handler only needs default CRUD.
- **Use `createBaseApp`** when the handler adds custom action routes or resource-specific behavior and then layers additional routes on top.

### Straight CRUD example (`createResourceRouter`)

```ts
export const barcodesApp = createResourceRouter({
  resourceName: 'barcodes',
  displayName: 'Barcode',
  RepoClass: BarcodeRepository,
  createSchema: createBarcodeSchema,
  updateSchema: updateBarcodeSchema,
  enableSearch: true,
});
```

### Custom behavior example (`createBaseApp`)

```ts
export const exercisesApp = createBaseApp('exercises');
exercisesApp.get('/default', async (_req, res) => { ... });
exercisesApp.get('/:id/history', async (_req, res) => { ... });
```

## Shared APIClient (iOS)

This project uses a shared APIClient with App Check for all HTTP requests. Never create separate HTTP layers or bypass the shared APIClient. When wiring new features, always use the existing APIClient pattern.
