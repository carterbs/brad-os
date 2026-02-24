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

## Shared APIClient (iOS)

This project uses a shared APIClient with App Check for all HTTP requests. Never create separate HTTP layers or bypass the shared APIClient. When wiring new features, always use the existing APIClient pattern.
