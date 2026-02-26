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

## Router Factory Pattern

Cloud Functions handlers should use shared router construction helpers in `packages/functions/src/middleware/create-resource-router.ts`:

- `createResourceRouter<T, CreateDTO, UpdateDTO, TRepo extends IBaseRepository<T, CreateDTO, UpdateDTO>>(config)`
- `createBaseApp(resourceName: string): express.Application`
- `registerCustomRoutes` and `beforeDelete` callback hooks for handlers that need extra routes/guards while retaining shared CRUD behavior.

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
});
```

### Custom behavior example (`createResourceRouter` with custom hooks)

```ts
export const exercisesApp = createResourceRouter({
  resourceName: 'exercises',
  displayName: 'Exercise',
  RepoClass: ExerciseRepository,
  createSchema: createExerciseSchema,
  updateSchema: updateExerciseSchema,
  registerCustomRoutes: ({ app, getRepo }) => {
    app.get('/default', async (_req, res) => {
      const exercises = await getRepo().findDefaultExercises();
      res.json({ success: true, data: exercises });
    });
  },
  beforeDelete: async ({ id, repo }) => {
    const isInUse = await repo.isInUse(id);
    if (isInUse) {
      throw new ConflictError('Cannot delete exercise in use');
    }
  },
});
```

## Shared APIClient (iOS)

This project uses a shared APIClient with App Check for all HTTP requests. Never create separate HTTP layers or bypass the shared APIClient. When wiring new features, always use the existing APIClient pattern.
