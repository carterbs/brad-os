# Meal Planner Reference

## Database

- **Type**: PostgreSQL 14
- **Credentials**: `mealuser` / `mealpass` / `mealplanner`

## Services (docker-compose)

| Service | Port | Notes |
|---------|------|-------|
| db (postgres) | 5432 | |
| pgadmin | 5050 | admin@admin.com / admin |
| meal-service | (gRPC 50051) | Go + Air |
| logging-service | (gRPC 50052) | Go + Air |
| agent-service | (gRPC 50053) | Node/TS |
| mcp-service | 3001 | Node/TS |
| api-gateway | 8090 | Go + Air |
| ui | 3000 | React |

## Local copies

- `/Users/bradcarter/Documents/Dev/brad-os/mealplanner.sql` - fresh DB dump (30 MB, taken 2026-01-31)
- `/Users/bradcarter/Documents/Dev/brad-os/mealplanner-logs/`
  - `docker-compose.log` (128 MB) - all container logs
  - `backend.log` (434 B)
  - `gateway.log` (258 B)
