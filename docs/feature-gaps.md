# Feature Gap Analysis

Comparison of the Lifting Tracker against popular weightlifting apps (Strong, Hevy, JEFIT, FitBod, StrengthLog, etc.). Focused on features realistic and valuable for a single-user, self-hosted app.

---

## High-Value Missing Features

### 1. Workout History & Analytics

The biggest gap. All this data is tracked but there's no way to review it.

- **Workout history page** — browse past workouts by date/week, see what you actually did
- **Personal records** — track and display PRs per exercise (1RM, 5RM, 10RM, etc.)
- **Volume charts** — total tonnage (sets x reps x weight) over time
- **Estimated 1RM tracking** — calculate and graph e1RM progression using Brzycki/Epley
- **Calendar view** — see which days you trained, streaks, consistency
- **Weekly/monthly summaries** — total volume, workouts completed, sets logged

### 2. Body Weight / Measurements Tracking

- **Bodyweight log** — track daily/weekly weight with graph
- **Body measurements** — arms, chest, waist, legs, etc.
- **Progress photos** — timestamped front/side/back photos with comparison view
- **Trend lines** — smoothed averages to filter out daily weight fluctuation noise

### 3. RPE / RIR Tracking

Most serious lifters track this. The progression system would benefit from it.

- **RPE field per set** — rate effort 1-10 after each set
- **RIR field per set** — log reps in reserve (0-5)
- **Auto-regulation** — if RPE consistently high (9-10), slow progression; if low (6-7), accelerate
- **Fatigue indicators** — warn when RPE trends upward across a mesocycle

### 4. Exercise Set Types

Currently all sets are treated equally. Apps like Hevy/Strong differentiate:

- **Warm-up sets** — logged but excluded from volume/PR calculations
- **Working sets** — standard tracked sets (what exists now)
- **Drop sets** — reduced weight continuation sets
- **Failure sets** — mark that you hit true failure
- **AMRAP sets** — "as many reps as possible" with a target minimum

### 5. Supersets / Exercise Grouping

- **Superset pairing** — group 2+ exercises to perform back-to-back
- **Circuit support** — group 3+ exercises in a round
- **Rest timer awareness** — rest only after completing the superset, not between exercises

### 6. Data Export

- **CSV export** — full workout history in a portable format
- **JSON export** — complete database dump for backup/migration
- **Per-exercise export** — export history for a single exercise

### 7. Plate Calculator

- **Visual plate loading** — given a target weight, show which plates to load on each side
- **Configurable plate inventory** — set what plates you actually own
- **Bar weight selection** — 45lb, 35lb, specialty bars

### 8. Warm-Up Set Generator

- **Auto-calculate warm-up sets** — given a working weight, generate progressive warm-up sets (e.g., bar x 10, 50% x 5, 70% x 3, 85% x 1)
- **Configurable scheme** — adjust percentages and reps

### 9. 1RM Calculator

- **Estimate 1RM** — from any weight x reps using Brzycki/Epley/Lombardi formulas
- **Show on exercise history** — graph estimated 1RM over time
- **Percentage chart** — show what weight to use for a given % of 1RM

---

## Medium-Value Features

### 10. Exercise Notes

- **Per-set notes** — "felt easy", "grip slipped", "left shoulder pain"
- **Per-exercise notes** — "use narrow grip", "pause at bottom"
- **Per-workout notes** — "slept poorly", "ate late"

### 11. Workout Rating / Readiness

- **Post-workout rating** — rate the session 1-5 after completion
- **Pre-workout readiness** — log how you feel before starting (sleep, stress, energy)
- **Correlation view** — see if readiness predicts performance

### 12. Customizable Deload Parameters

Currently hardcoded to 85% weight / 50% sets. Power users want control:

- **Deload intensity %** — configurable (70-90% range)
- **Deload volume %** — configurable (40-60% range)
- **Deload frequency** — every 4, 5, 6, or 7 weeks
- **Skip deload option** — if feeling good, option to skip or extend

### 13. Workout Templates (Quick Start)

- **Start empty workout** — log exercises ad-hoc without a plan
- **Copy previous workout** — repeat last session's exercises
- **Quick workout from template** — pre-defined exercise lists without mesocycle structure

### 14. Exercise Library Enhancements

- **Muscle group tags** — primary/secondary muscles per exercise
- **Equipment type** — barbell, dumbbell, cable, machine, bodyweight
- **Exercise search/filter** — filter by muscle group or equipment
- **Exercise instructions** — basic text description of form cues
- **Alternative exercises** — suggest substitutions

### 15. Streak / Consistency Tracking

- **Current streak** — consecutive weeks with X+ workouts
- **Best streak** — all-time record
- **Weekly target** — set a goal (e.g., 4 workouts/week) and track adherence
- **Visual indicators** — GitHub-style contribution heatmap

---

## Lower-Priority / Nice-to-Have

### 16. Dark Mode / Theme

- Dark/light toggle with system preference detection

### 17. Unit Preferences

- **kg vs lbs toggle** — with conversion of all displayed values
- **Fractional plates** — support 0.5kg / 1.25lb increments

### 18. Workout Duration Display

`started_at` and `completed_at` are stored but not surfaced:

- Session duration prominently displayed
- Average workout duration trends
- Time per exercise

### 19. Rest Timer Improvements

- **Quick presets** — 60s, 90s, 120s, 180s buttons
- **Auto-start after logging** — timer begins immediately when you log a set
- **Timer sound options** — different alert tones

### 20. Undo/Redo for Set Logging

- **Undo last log** — accidentally entered wrong weight? One-tap undo
- **Edit logged set** — change weight/reps after logging without unlog then relog

### 21. Weight Input Improvements

- **Increment/decrement buttons** — +5 / -5 buttons for quick adjustment
- **Last-used weight prefill** — auto-populate with previous set's actual weight
- **Keyboard shortcuts** — quick entry without dismissing keyboard

### 22. Multiple Mesocycle History

- **Compare mesocycles** — side-by-side comparison of the same plan across cycles
- **Carry over** — when starting a new mesocycle, use final weights from previous as new baseline

---

## Recommended Priority

| Priority | Feature | Rationale |
|----------|---------|-----------|
| 1 | Workout history + volume charts | Collecting data that can't be reviewed (exercise charts done) |
| 2 | Personal records tracking | Core motivation driver for lifters |
| 3 | Body weight logging | Tracks the outcome of all this training |
| 4 | RPE/RIR per set | Enables smarter auto-regulation |
| 5 | Data export (CSV) | Safety net, prevents lock-in anxiety |
| 6 | Warm-up/drop set types | More accurate volume tracking |
| 7 | Superset support | Common training pattern that can't be expressed |
| 8 | Plate calculator | Small utility, high frequency of use |
| 9 | Exercise notes | Context needed when reviewing history |
| 10 | Customizable deload | Power user control |
