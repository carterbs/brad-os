# Progressive Overload Rules

## Business Logic Reference

```
Week 0: Base weight/reps from plan configuration
Week 1: +1 rep to each exercise
Week 2: +weight (default 5 lbs, configurable per exercise)
Week 3: +1 rep
Week 4: +weight
Week 5: +1 rep
Week 6: +weight
Week 7: DELOAD (50% volume - same exercises, half the sets)
```

## Key Concepts

- **Plan**: A workout template with configured days/exercises
- **Mesocycle**: A 6-week instance of running a plan (+ 1 deload week)
- **Progressive overload**: Odd weeks add 1 rep, even weeks add weight (default 5 lbs)
- **Deload week**: Week 7, reduced volume (50%) for recovery

## Data Architecture

User health/fitness data (weight, lifting plans, cycling data) is stored in Firebase/Firestore, NOT local SQLite. HealthKit is used for Apple Watch workout data and health metrics. The app reads from Firebase as the source of truth, not directly from HealthKit for display.
