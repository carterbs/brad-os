# iOS Exercise Library Implementation Plan

## Overview

Implement a full Exercise Library feature for the native iOS app with API integration, including CRUD operations, form validation, exercise history with Swift Charts visualization, and PR tracking. Connects to existing backend endpoints at `/api/exercises`.

## Current State Analysis

### What Exists

**ExercisesView.swift** (`ios/BradOS/BradOS/Views/Lifting/ExercisesView.swift`)
- Lines 6-9: Uses `@State` with mock data (`Exercise.mockExercises`)
- Lines 11-16: Client-side search filtering via computed property
- Lines 54-79: Add exercise section with name field only (no weight increment input)
- Lines 81-94: Add creates local ID (`exercises.count + 1`), hardcodes `weightIncrement: 5`
- Lines 103-108: Delete directly mutates local array
- Lines 114-167: `ExerciseRow` component with delete confirmation alert
- Lines 171-288: `ExerciseHistoryView` is placeholder with hardcoded stats

**Exercise.swift** (`ios/BradOS/BradOS/Models/Exercise.swift`)
- Lines 4-20: Codable struct with snake_case CodingKeys
- Lines 24-65: Mock data extension

**LiftingTabView.swift** (`ios/BradOS/BradOS/Views/Lifting/LiftingTabView.swift`)
- Lines 44-46: Navigation destination for `ExerciseHistoryDestination`
- Lines 74-77: `ExerciseHistoryDestination` struct with exerciseId and exerciseName

**Backend API** (already implemented in `packages/server/src/routes/exercise.routes.ts`)
- GET `/api/exercises` - List all exercises
- GET `/api/exercises/:id` - Get single exercise
- POST `/api/exercises` - Create (validates name 1-100 chars, weight_increment positive)
- PUT `/api/exercises/:id` - Update name/weight_increment
- DELETE `/api/exercises/:id` - Delete (returns 409 if in use)
- GET `/api/exercises/:id/history` - Returns ExerciseHistory with entries and PR

### What's Missing (Per Spec)

| Feature | Status | Notes |
|---------|--------|-------|
| API integration | Not implemented | All mock data |
| Loading states | Not implemented | No spinner during fetch |
| Error states | Not implemented | No error handling UI |
| Weight increment input | Not implemented | Form only has name field |
| Form validation | Not implemented | No client-side validation |
| "Adding..." button state | Not implemented | No loading indicator |
| Edit exercise dialog | Not implemented | No edit capability |
| Exercise history API | Not implemented | Hardcoded placeholder |
| Weight progression chart | Not implemented | Placeholder rectangle |
| PR badge | Not implemented | No personal record display |
| Set history table | Not implemented | Hardcoded fake data |

## Desired End State

A fully functional Exercise Library where users can:
1. Browse all exercises with loading and error states
2. Search/filter exercises client-side
3. Create exercises with name + weight increment, with validation
4. See "Adding..." state during creation
5. Delete exercises with confirmation (handle 409 conflict)
6. Navigate to exercise history page
7. View weight progression chart (Swift Charts)
8. See personal record badge (yellow "PR" badge)
9. View set history table in reverse chronological order
10. Edit exercise name and weight increment from history page

## Key Discoveries

1. **Backend types** (`packages/shared/src/types/database.ts`):
   - `ExerciseHistory` has `exercise_id`, `exercise_name`, `entries[]`, `personal_record`
   - `ExerciseHistoryEntry` has `workout_id`, `date`, `week_number`, `sets[]`, `best_weight`, `best_set_reps`
   - `PersonalRecord` has `weight`, `reps`, `date`

2. **Validation rules** (`packages/shared/src/schemas/exercise.schema.ts`):
   - Name: 1-100 characters, required
   - Weight increment: positive number, defaults to 5.0

3. **Delete conflict** (`exercise.routes.ts:163`):
   - Returns 409 with message "Cannot delete exercise that is used in a plan"

4. **Navigation pattern** in LiftingTabView uses typed `Hashable` destination structs

## What We're NOT Doing

- Muscle group categorization (not in spec)
- Exercise images/videos
- Offline caching of exercises
- Server-side search (keeping client-side filtering)
- Custom chart interactions beyond tooltips
- Exercise sorting/ordering

## Implementation Approach

Build in layers: models → service → view models → view updates → new components

---

## Phase 1: Models & DTOs

### Overview
Add data transfer objects for API requests and the ExerciseHistory model for history responses.

### Changes Required

**Update: `ios/BradOS/BradOS/Models/Exercise.swift`**

Add DTOs after the Exercise struct (after line 20):
```swift
// MARK: - DTOs

/// Request body for POST /api/exercises
struct CreateExerciseDTO: Encodable {
    let name: String
    let weightIncrement: Double
    let isCustom: Bool

    enum CodingKeys: String, CodingKey {
        case name
        case weightIncrement = "weight_increment"
        case isCustom = "is_custom"
    }

    init(name: String, weightIncrement: Double = 5.0) {
        self.name = name
        self.weightIncrement = weightIncrement
        self.isCustom = true
    }
}

/// Request body for PUT /api/exercises/:id
struct UpdateExerciseDTO: Encodable {
    let name: String?
    let weightIncrement: Double?

    enum CodingKeys: String, CodingKey {
        case name
        case weightIncrement = "weight_increment"
    }
}
```

**New File: `ios/BradOS/BradOS/Models/ExerciseHistory.swift`**
```swift
import Foundation

/// Response from GET /api/exercises/:id/history
struct ExerciseHistory: Codable {
    let exerciseId: Int
    let exerciseName: String
    let entries: [ExerciseHistoryEntry]
    let personalRecord: PersonalRecord?

    enum CodingKeys: String, CodingKey {
        case exerciseId = "exercise_id"
        case exerciseName = "exercise_name"
        case entries
        case personalRecord = "personal_record"
    }
}

/// A single workout session for an exercise
struct ExerciseHistoryEntry: Codable, Identifiable {
    let workoutId: Int
    let date: String
    let weekNumber: Int
    let mesocycleId: Int
    let sets: [HistorySet]
    let bestWeight: Double
    let bestSetReps: Int

    var id: Int { workoutId }

    enum CodingKeys: String, CodingKey {
        case workoutId = "workout_id"
        case date
        case weekNumber = "week_number"
        case mesocycleId = "mesocycle_id"
        case sets
        case bestWeight = "best_weight"
        case bestSetReps = "best_set_reps"
    }

    /// Parsed date for chart data
    var parsedDate: Date? {
        // Try ISO8601 with fractional seconds first
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: date) { return date }

        // Fallback to date-only
        let dateOnly = DateFormatter()
        dateOnly.dateFormat = "yyyy-MM-dd"
        return dateOnly.date(from: date)
    }
}

/// Individual set within a history entry
struct HistorySet: Codable {
    let setNumber: Int
    let weight: Double
    let reps: Int

    enum CodingKeys: String, CodingKey {
        case setNumber = "set_number"
        case weight
        case reps
    }
}

/// Personal record for an exercise
struct PersonalRecord: Codable {
    let weight: Double
    let reps: Int
    let date: String
}
```

### Success Criteria
- [ ] CreateExerciseDTO encodes to correct snake_case JSON
- [ ] UpdateExerciseDTO encodes optional fields correctly
- [ ] ExerciseHistory decodes from API response
- [ ] ExerciseHistoryEntry.parsedDate returns valid Date for chart use

### Confirmation Gate
Create a unit test or playground that encodes CreateExerciseDTO and decodes a sample ExerciseHistory JSON.

---

## Phase 2: Exercise Service

### Overview
Create ExerciseService to handle all exercise API calls, using the existing APIClient.

### Changes Required

**New File: `ios/BradOS/BradOS/Services/ExerciseService.swift`**
```swift
import Foundation

/// Service for exercise CRUD operations and history
actor ExerciseService {
    private let apiClient: APIClient

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    // MARK: - CRUD Operations

    /// GET /api/exercises
    func fetchAll() async throws -> [Exercise] {
        try await apiClient.get("/exercises")
    }

    /// GET /api/exercises/:id
    func fetch(id: Int) async throws -> Exercise {
        try await apiClient.get("/exercises/\(id)")
    }

    /// POST /api/exercises
    func create(_ dto: CreateExerciseDTO) async throws -> Exercise {
        try await apiClient.post("/exercises", body: dto)
    }

    /// PUT /api/exercises/:id
    func update(id: Int, dto: UpdateExerciseDTO) async throws -> Exercise {
        try await apiClient.put("/exercises/\(id)", body: dto)
    }

    /// DELETE /api/exercises/:id
    func delete(id: Int) async throws {
        try await apiClient.delete("/exercises/\(id)")
    }

    // MARK: - History

    /// GET /api/exercises/:id/history
    func fetchHistory(id: Int) async throws -> ExerciseHistory {
        try await apiClient.get("/exercises/\(id)/history")
    }
}
```

### Success Criteria
- [ ] ExerciseService compiles with existing APIClient
- [ ] All methods use correct HTTP verbs and paths
- [ ] Actor isolation prevents data races

### Confirmation Gate
Verify service compiles and paths match backend routes in `exercise.routes.ts`.

---

## Phase 3: ViewModels & State Management

### Overview
Create ViewModels for exercises list and history views with proper loading/error state handling.

### Changes Required

**New File: `ios/BradOS/BradOS/ViewModels/LoadState.swift`**
```swift
import Foundation

/// Generic loading state for async data
enum LoadState<T> {
    case idle
    case loading
    case loaded(T)
    case error(Error)

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var data: T? {
        if case .loaded(let data) = self { return data }
        return nil
    }

    var error: Error? {
        if case .error(let error) = self { return error }
        return nil
    }
}
```

**New File: `ios/BradOS/BradOS/ViewModels/ExercisesViewModel.swift`**
```swift
import Foundation
import SwiftUI

@MainActor
class ExercisesViewModel: ObservableObject {
    // MARK: - Published State

    @Published private(set) var exercisesState: LoadState<[Exercise]> = .idle
    @Published private(set) var isCreating = false
    @Published private(set) var deletingExerciseId: Int? = nil
    @Published var createError: String?
    @Published var deleteError: String?

    // MARK: - Form State

    @Published var newExerciseName = ""
    @Published var newWeightIncrement = "5"
    @Published var formValidationError: String?

    // MARK: - Dependencies

    private let service: ExerciseService

    init(service: ExerciseService = ExerciseService()) {
        self.service = service
    }

    // MARK: - Computed

    var exercises: [Exercise] { exercisesState.data ?? [] }
    var isLoading: Bool { exercisesState.isLoading }

    // MARK: - Actions

    func loadExercises() async {
        exercisesState = .loading
        do {
            let exercises = try await service.fetchAll()
            exercisesState = .loaded(exercises)
        } catch {
            exercisesState = .error(error)
        }
    }

    func createExercise() async -> Bool {
        guard validateForm() else { return false }

        isCreating = true
        createError = nil

        do {
            let increment = Double(newWeightIncrement) ?? 5.0
            let dto = CreateExerciseDTO(
                name: newExerciseName.trimmingCharacters(in: .whitespaces),
                weightIncrement: increment
            )
            let newExercise = try await service.create(dto)

            // Append to local state
            if var current = exercisesState.data {
                current.append(newExercise)
                exercisesState = .loaded(current)
            }

            clearForm()
            isCreating = false
            return true
        } catch {
            createError = parseError(error)
            isCreating = false
            return false
        }
    }

    func deleteExercise(_ exercise: Exercise) async -> Bool {
        deletingExerciseId = exercise.id
        deleteError = nil

        do {
            try await service.delete(id: exercise.id)

            // Remove from local state
            if var current = exercisesState.data {
                current.removeAll { $0.id == exercise.id }
                exercisesState = .loaded(current)
            }

            deletingExerciseId = nil
            return true
        } catch {
            deleteError = parseError(error)
            deletingExerciseId = nil
            return false
        }
    }

    // MARK: - Validation

    func validateForm() -> Bool {
        formValidationError = nil

        let trimmedName = newExerciseName.trimmingCharacters(in: .whitespaces)

        if trimmedName.isEmpty {
            formValidationError = "Exercise name is required"
            return false
        }

        if trimmedName.count > 100 {
            formValidationError = "Exercise name must be 100 characters or less"
            return false
        }

        guard let increment = Double(newWeightIncrement), increment > 0 else {
            formValidationError = "Weight increment must be a positive number"
            return false
        }

        return true
    }

    func clearForm() {
        newExerciseName = ""
        newWeightIncrement = "5"
        formValidationError = nil
        createError = nil
    }

    func clearDeleteError() {
        deleteError = nil
    }

    // MARK: - Helpers

    private func parseError(_ error: Error) -> String {
        // Check for APIError types from APIClient
        if let apiError = error as? APIError {
            return apiError.message
        }
        return error.localizedDescription
    }
}
```

**New File: `ios/BradOS/BradOS/ViewModels/ExerciseHistoryViewModel.swift`**
```swift
import Foundation
import SwiftUI

@MainActor
class ExerciseHistoryViewModel: ObservableObject {
    // MARK: - Published State

    @Published private(set) var historyState: LoadState<ExerciseHistory> = .idle
    @Published private(set) var exerciseState: LoadState<Exercise> = .idle
    @Published private(set) var isUpdating = false
    @Published var updateError: String?

    // MARK: - Edit Form State

    @Published var editName = ""
    @Published var editWeightIncrement = ""
    @Published var editValidationError: String?

    // MARK: - Dependencies

    private let service: ExerciseService
    let exerciseId: Int

    init(exerciseId: Int, service: ExerciseService = ExerciseService()) {
        self.exerciseId = exerciseId
        self.service = service
    }

    // MARK: - Computed

    var history: ExerciseHistory? { historyState.data }
    var exercise: Exercise? { exerciseState.data }
    var isLoading: Bool { historyState.isLoading }
    var hasHistory: Bool { !(history?.entries.isEmpty ?? true) }

    /// Chart data sorted chronologically
    var chartData: [(date: Date, weight: Double, reps: Int)] {
        guard let entries = history?.entries else { return [] }
        return entries.compactMap { entry in
            guard let date = entry.parsedDate else { return nil }
            return (date: date, weight: entry.bestWeight, reps: entry.bestSetReps)
        }.sorted { $0.date < $1.date }
    }

    // MARK: - Actions

    func loadHistory() async {
        historyState = .loading
        do {
            let history = try await service.fetchHistory(id: exerciseId)
            historyState = .loaded(history)
        } catch {
            historyState = .error(error)
        }
    }

    func loadExerciseForEdit() async {
        exerciseState = .loading
        do {
            let exercise = try await service.fetch(id: exerciseId)
            exerciseState = .loaded(exercise)
            editName = exercise.name
            editWeightIncrement = String(format: "%.1f", exercise.weightIncrement)
                .replacingOccurrences(of: ".0", with: "")
        } catch {
            exerciseState = .error(error)
            // Fallback to history name if available
            if let history = history {
                editName = history.exerciseName
            }
        }
    }

    func updateExercise() async -> Bool {
        guard validateEditForm() else { return false }

        isUpdating = true
        updateError = nil

        do {
            let dto = UpdateExerciseDTO(
                name: editName.trimmingCharacters(in: .whitespaces),
                weightIncrement: Double(editWeightIncrement)
            )
            _ = try await service.update(id: exerciseId, dto: dto)

            // Reload history to get updated name
            await loadHistory()

            isUpdating = false
            return true
        } catch {
            updateError = parseError(error)
            isUpdating = false
            return false
        }
    }

    // MARK: - Validation

    func validateEditForm() -> Bool {
        editValidationError = nil

        let trimmedName = editName.trimmingCharacters(in: .whitespaces)

        if trimmedName.isEmpty {
            editValidationError = "Exercise name is required"
            return false
        }

        if trimmedName.count > 100 {
            editValidationError = "Exercise name must be 100 characters or less"
            return false
        }

        if let increment = Double(editWeightIncrement), increment <= 0 {
            editValidationError = "Weight increment must be a positive number"
            return false
        }

        return true
    }

    func clearUpdateError() {
        updateError = nil
        editValidationError = nil
    }

    private func parseError(_ error: Error) -> String {
        if let apiError = error as? APIError {
            return apiError.message
        }
        return error.localizedDescription
    }
}
```

### Success Criteria
- [ ] LoadState enum handles all states cleanly
- [ ] ExercisesViewModel loads, creates, deletes exercises
- [ ] Form validation blocks invalid inputs with correct messages
- [ ] ExerciseHistoryViewModel loads history and prepares chart data
- [ ] Edit form pre-fills with current values

### Confirmation Gate
Write unit tests for validation logic, verify state transitions work correctly.

---

## Phase 4: ExercisesView API Integration

### Overview
Update ExercisesView to use the ViewModel, display loading/error states, add weight increment input, and handle all validation.

### Changes Required

**Update: `ios/BradOS/BradOS/Views/Lifting/ExercisesView.swift`**

Replace entire ExercisesView struct (lines 4-111):

```swift
import SwiftUI

struct ExercisesView: View {
    @StateObject private var viewModel = ExercisesViewModel()
    @State private var searchText = ""

    private var filteredExercises: [Exercise] {
        if searchText.isEmpty {
            return viewModel.exercises
        }
        return viewModel.exercises.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        Group {
            switch viewModel.exercisesState {
            case .idle, .loading:
                LoadingView(message: "Loading exercises...")

            case .error(let error):
                errorView(error)

            case .loaded:
                contentView
            }
        }
        .background(Theme.background)
        .navigationTitle("Exercises")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: "Search exercises")
        .task {
            await viewModel.loadExercises()
        }
    }

    // MARK: - Content View

    @ViewBuilder
    private var contentView: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.md) {
                addExerciseSection

                if filteredExercises.isEmpty {
                    emptyStateView
                } else {
                    exerciseListSection
                }
            }
            .padding(Theme.Spacing.md)
        }
    }

    // MARK: - Add Exercise Section

    @ViewBuilder
    private var addExerciseSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Add Exercise")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            // Name field
            TextField("Exercise name", text: $viewModel.newExerciseName)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.sm)
                .background(Theme.backgroundTertiary)
                .cornerRadius(Theme.CornerRadius.sm)

            HStack(spacing: Theme.Spacing.sm) {
                // Weight increment field
                HStack(spacing: 4) {
                    Text("+")
                        .foregroundColor(Theme.textSecondary)
                    TextField("5", text: $viewModel.newWeightIncrement)
                        .keyboardType(.decimalPad)
                        .frame(width: 50)
                        .multilineTextAlignment(.center)
                    Text("lbs/progression")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(Theme.Spacing.sm)
                .background(Theme.backgroundTertiary)
                .cornerRadius(Theme.CornerRadius.sm)

                Spacer()

                // Add button
                Button(action: {
                    Task { await viewModel.createExercise() }
                }) {
                    HStack(spacing: 4) {
                        if viewModel.isCreating {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        }
                        Text(viewModel.isCreating ? "Adding..." : "Add Exercise")
                    }
                    .font(.subheadline)
                    .fontWeight(.medium)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(viewModel.newExerciseName.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isCreating)
            }

            // Validation error
            if let error = viewModel.formValidationError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.error)
            }

            // API error
            if let error = viewModel.createError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.error)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyStateView: some View {
        if searchText.isEmpty {
            EmptyStateView(
                iconName: "dumbbell",
                title: "No Exercises",
                message: "No exercises found. Add your first exercise above!"
            )
        } else {
            EmptyStateView(
                iconName: "magnifyingglass",
                title: "No Results",
                message: "No exercises match '\(searchText)'"
            )
        }
    }

    // MARK: - Exercise List

    @ViewBuilder
    private var exerciseListSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "All Exercises")

            ForEach(filteredExercises) { exercise in
                ExerciseRow(
                    exercise: exercise,
                    isDeleting: viewModel.deletingExerciseId == exercise.id,
                    onDelete: {
                        Task { await viewModel.deleteExercise(exercise) }
                    }
                )
            }
        }
        .alert("Cannot Delete", isPresented: .init(
            get: { viewModel.deleteError != nil },
            set: { if !$0 { viewModel.clearDeleteError() } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.deleteError ?? "")
        }
    }

    // MARK: - Error View

    @ViewBuilder
    private func errorView(_ error: Error) -> some View {
        VStack(spacing: Theme.Spacing.md) {
            EmptyStateView(
                iconName: "exclamationmark.triangle",
                title: "Failed to Load",
                message: error.localizedDescription,
                buttonTitle: "Try Again"
            ) {
                Task { await viewModel.loadExercises() }
            }
        }
        .padding(Theme.Spacing.md)
    }
}
```

**Update ExerciseRow** (lines 114-167):

```swift
struct ExerciseRow: View {
    let exercise: Exercise
    let isDeleting: Bool
    let onDelete: () -> Void

    @State private var showingDeleteAlert = false

    var body: some View {
        NavigationLink(value: ExerciseHistoryDestination(
            exerciseId: exercise.id,
            exerciseName: exercise.name
        )) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name)
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)

                    HStack(spacing: Theme.Spacing.sm) {
                        Text("+\(exercise.weightIncrement.formatted()) lbs per progression")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)

                        if exercise.isCustom {
                            Text("•")
                                .foregroundColor(Theme.textSecondary)
                            Text("Custom")
                                .font(.caption)
                                .foregroundColor(Theme.accent)
                        }
                    }
                }

                Spacer()

                if isDeleting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .padding(Theme.Spacing.sm)
                } else {
                    Button(action: { showingDeleteAlert = true }) {
                        Image(systemName: "trash")
                            .foregroundColor(Theme.error.opacity(0.7))
                            .padding(Theme.Spacing.sm)
                    }
                    .buttonStyle(PlainButtonStyle())
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .padding(Theme.Spacing.md)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
        }
        .buttonStyle(PlainButtonStyle())
        .alert("Delete Exercise?", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive, action: onDelete)
        } message: {
            Text("Are you sure you want to delete \(exercise.name)?")
        }
    }
}
```

### Success Criteria
- [ ] Loading spinner shows during initial fetch
- [ ] Error state shows with retry button on failure
- [ ] Empty state shows correct message (spec: "No exercises found. Add your first exercise above!")
- [ ] Weight increment field appears in add form
- [ ] Button shows "Adding..." during creation
- [ ] Validation errors display inline
- [ ] Form clears on success, retains values on error
- [ ] Delete shows confirmation with exercise name
- [ ] 409 conflict error displays in alert
- [ ] Clicking exercise row navigates to history

### Confirmation Gate
Test all scenarios: empty state, populated list, create with validation errors, create success, delete success, delete conflict.

---

## Phase 5: ExerciseHistoryView with Charts

### Overview
Replace placeholder ExerciseHistoryView with real API data, Swift Charts for weight progression, and PR badge.

### Changes Required

**Update: `ios/BradOS/BradOS/Views/Lifting/ExercisesView.swift`**

Replace ExerciseHistoryView (lines 171-288) with:

```swift
import Charts

struct ExerciseHistoryView: View {
    let exerciseId: Int
    let exerciseName: String

    @StateObject private var viewModel: ExerciseHistoryViewModel
    @State private var showingEditSheet = false

    init(exerciseId: Int, exerciseName: String) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        _viewModel = StateObject(wrappedValue: ExerciseHistoryViewModel(exerciseId: exerciseId))
    }

    var body: some View {
        Group {
            switch viewModel.historyState {
            case .idle, .loading:
                LoadingView(message: "Loading history...")

            case .error(let error):
                errorView(error)

            case .loaded(let history):
                contentView(history)
            }
        }
        .background(Theme.background)
        .navigationTitle(viewModel.history?.exerciseName ?? exerciseName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    Task { await viewModel.loadExerciseForEdit() }
                    showingEditSheet = true
                }) {
                    Image(systemName: "pencil")
                        .foregroundColor(Theme.accent)
                }
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            EditExerciseSheet(viewModel: viewModel, isPresented: $showingEditSheet)
        }
        .task {
            await viewModel.loadHistory()
        }
    }

    // MARK: - Content View

    @ViewBuilder
    private func contentView(_ history: ExerciseHistory) -> some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.lg) {
                // Personal Record Badge
                if let pr = history.personalRecord {
                    prSection(pr)
                }

                if viewModel.hasHistory {
                    // Weight Progression Chart
                    chartSection

                    // Set History Table
                    historyTableSection(history.entries)
                } else {
                    noHistoryView
                }
            }
            .padding(Theme.Spacing.md)
        }
    }

    // MARK: - PR Section

    @ViewBuilder
    private func prSection(_ pr: PersonalRecord) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            GenericBadge(text: "PR", color: Theme.warning)

            Text("\(Int(pr.weight)) lbs x \(pr.reps) reps")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)

            Spacer()
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
    }

    // MARK: - Chart Section

    @ViewBuilder
    private var chartSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Weight Progression")

            Chart(viewModel.chartData, id: \.date) { point in
                LineMark(
                    x: .value("Date", point.date),
                    y: .value("Weight", point.weight)
                )
                .foregroundStyle(Theme.accent)
                .interpolationMethod(.catmullRom)

                PointMark(
                    x: .value("Date", point.date),
                    y: .value("Weight", point.weight)
                )
                .foregroundStyle(Theme.accent)
                .annotation(position: .top) {
                    Text("\(Int(point.weight))")
                        .font(.caption2)
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .chartYAxisLabel("lbs")
            .chartXAxis {
                AxisMarks(values: .automatic) { value in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                }
            }
            .frame(height: 200)
            .padding(Theme.Spacing.md)
            .cardStyle()
        }
    }

    // MARK: - History Table Section

    @ViewBuilder
    private func historyTableSection(_ entries: [ExerciseHistoryEntry]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Set History")

            // Header row
            HStack {
                Text("Date")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Weight")
                    .frame(width: 70, alignment: .trailing)
                Text("Reps")
                    .frame(width: 50, alignment: .trailing)
                Text("Sets")
                    .frame(width: 40, alignment: .trailing)
            }
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, Theme.Spacing.md)

            // Data rows (reverse chronological)
            ForEach(entries.sorted { ($0.parsedDate ?? .distantPast) > ($1.parsedDate ?? .distantPast) }) { entry in
                HStack {
                    Text(formatDate(entry.date))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(Int(entry.bestWeight)) lbs")
                        .frame(width: 70, alignment: .trailing)
                    Text("\(entry.bestSetReps)")
                        .frame(width: 50, alignment: .trailing)
                    Text("\(entry.sets.count)")
                        .frame(width: 40, alignment: .trailing)
                }
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)
                .padding(Theme.Spacing.md)
                .background(Theme.backgroundSecondary)
                .cornerRadius(Theme.CornerRadius.md)
            }
        }
    }

    // MARK: - No History View

    @ViewBuilder
    private var noHistoryView: some View {
        EmptyStateView(
            iconName: "clock",
            title: "No History Yet",
            message: "Complete workouts with this exercise to see your progress here."
        )
        .padding(.top, Theme.Spacing.xl)
    }

    // MARK: - Error View

    @ViewBuilder
    private func errorView(_ error: Error) -> some View {
        EmptyStateView(
            iconName: "exclamationmark.triangle",
            title: "Exercise Not Found",
            message: error.localizedDescription,
            buttonTitle: "Try Again"
        ) {
            Task { await viewModel.loadHistory() }
        }
        .padding(Theme.Spacing.md)
    }

    // MARK: - Helpers

    private func formatDate(_ dateString: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = iso.date(from: dateString) {
            return date.formatted(date: .numeric, time: .omitted)
        }

        let dateOnly = DateFormatter()
        dateOnly.dateFormat = "yyyy-MM-dd"
        if let date = dateOnly.date(from: dateString) {
            return date.formatted(date: .numeric, time: .omitted)
        }

        return dateString
    }
}
```

### Success Criteria
- [ ] Loading spinner shows during fetch
- [ ] Error state shows "Exercise Not Found" for 404
- [ ] "No History Yet" shows when entries is empty
- [ ] PR badge displays with yellow "PR" text and weight x reps
- [ ] Chart shows weight progression line with points
- [ ] Chart Y-axis labeled "lbs"
- [ ] Chart X-axis shows formatted dates
- [ ] Table displays Date, Weight, Reps, Sets columns
- [ ] Table entries in reverse chronological order (most recent first)
- [ ] Edit button in toolbar opens sheet

### Confirmation Gate
Test with exercise that has history, exercise with no history, and non-existent exercise ID.

---

## Phase 6: Edit Exercise Sheet

### Overview
Add the edit dialog accessible from the exercise history page with validation.

### Changes Required

**Add to `ios/BradOS/BradOS/Views/Lifting/ExercisesView.swift`** (after ExerciseHistoryView):

```swift
struct EditExerciseSheet: View {
    @ObservedObject var viewModel: ExerciseHistoryViewModel
    @Binding var isPresented: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Exercise Name") {
                    TextField("Name", text: $viewModel.editName)
                }

                Section("Weight Increment") {
                    HStack {
                        TextField("5", text: $viewModel.editWeightIncrement)
                            .keyboardType(.decimalPad)
                        Text("lbs per progression")
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                if let error = viewModel.editValidationError {
                    Section {
                        Text(error)
                            .foregroundColor(Theme.error)
                    }
                }

                if let error = viewModel.updateError {
                    Section {
                        Text(error)
                            .foregroundColor(Theme.error)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Edit Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        viewModel.clearUpdateError()
                        isPresented = false
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        Task {
                            if await viewModel.updateExercise() {
                                isPresented = false
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(viewModel.isUpdating || viewModel.editName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .interactiveDismissDisabled(viewModel.isUpdating)
        }
    }
}
```

### Success Criteria
- [ ] Edit sheet opens with pre-filled name and weight increment
- [ ] Name validation error shows for empty/too long names
- [ ] Weight increment validation error shows for non-positive values
- [ ] Save button disabled during update
- [ ] Cancel closes without saving
- [ ] Successful save closes sheet and updates history title
- [ ] Dialog remains open on validation/API error

### Confirmation Gate
Test edit with valid changes, invalid name, invalid weight increment, and API error scenarios.

---

## Testing Strategy

### Unit Tests
- `Exercise+DTOs`: Encoding CreateExerciseDTO, UpdateExerciseDTO
- `ExerciseHistory`: Decoding from sample JSON
- `ExercisesViewModel`: Validation logic, state transitions
- `ExerciseHistoryViewModel`: Chart data preparation, validation

### Integration Tests
- Full CRUD flow: create → read → update → delete
- Navigation: exercises list → history → edit → back
- Error handling: network errors, 409 conflict

### Manual Testing Checklist
- [ ] Empty exercise library shows correct message
- [ ] Create exercise with default weight increment
- [ ] Create exercise with custom weight increment (2.5)
- [ ] Validation error for empty name
- [ ] Validation error for 101-character name
- [ ] Validation error for zero weight increment
- [ ] "Adding..." button state during creation
- [ ] Form clears after successful creation
- [ ] Form retains values on API error
- [ ] Delete confirmation shows exercise name
- [ ] Successful delete removes from list
- [ ] 409 conflict shows "Cannot delete exercise that is used in a plan"
- [ ] Exercise history shows loading state
- [ ] Exercise history shows PR badge
- [ ] Chart displays weight progression
- [ ] Table shows history in reverse chronological order
- [ ] Edit dialog pre-fills current values
- [ ] Edit validation works
- [ ] Edit success updates name in nav bar

---

## References

- **Spec**: `ios/specs/exercise-library.md`
- **Backend routes**: `packages/server/src/routes/exercise.routes.ts`
- **Backend types**: `packages/shared/src/types/database.ts` (lines 261-287)
- **Validation schema**: `packages/shared/src/schemas/exercise.schema.ts`
- **Current iOS view**: `ios/BradOS/BradOS/Views/Lifting/ExercisesView.swift`
- **iOS model**: `ios/BradOS/BradOS/Models/Exercise.swift`
- **Navigation**: `ios/BradOS/BradOS/Views/Lifting/LiftingTabView.swift` (lines 44-46, 74-77)

---

## File Summary

### New Files
| File | Purpose |
|------|---------|
| `Models/ExerciseHistory.swift` | History, entry, PR types |
| `ViewModels/LoadState.swift` | Generic loading state enum |
| `ViewModels/ExercisesViewModel.swift` | List view state management |
| `ViewModels/ExerciseHistoryViewModel.swift` | History view state management |
| `Services/ExerciseService.swift` | API calls for exercises |

### Modified Files
| File | Changes |
|------|---------|
| `Models/Exercise.swift` | Add CreateExerciseDTO, UpdateExerciseDTO |
| `Views/Lifting/ExercisesView.swift` | Major refactor: ViewModel integration, weight increment field, loading/error states, real API calls, Swift Charts, edit sheet |
