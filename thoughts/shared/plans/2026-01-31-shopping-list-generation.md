# Shopping List Generation

## Overview

Client-side shopping list computed on iOS from cached ingredient/recipe data. Updates automatically when the meal plan changes (generation or critique). Sorted by grocery store section with pantry staples at the bottom. Copyable to clipboard.

## Current State

- Firebase schema designed (another agent migrating now): `ingredients`, `recipes`, `meals` collections
- `recipes/{id}.ingredients` is an array of `[{ingredientId, quantity, unit}]`
- `ingredients/{id}` has `name` only — **no `storeSection` field exists yet**
- ~232 canonical ingredients, ~82 recipes — small enough to cache entirely client-side
- Most quantities are null (PG data had quantity=0). Shopping list must work without quantities.
- No existing clipboard, share, or caching-from-API patterns in the iOS app
- Existing caching patterns: singleton services with in-memory cache (StretchManifestLoader, MeditationManifestService)

## Desired End State

1. When a meal plan is generated or modified via critique, a shopping list appears automatically
2. Shopping list groups items by grocery store section (Produce, Dairy, Meat, etc.)
3. Same ingredient across multiple meals is aggregated (1 lb ground beef x2 = 2 lb ground beef)
4. "Pantry Staples" section sorts to the bottom with a note that you likely already have these
5. User can tap "Copy" and paste into iOS Notes as a readable checklist

## What We're NOT Doing

- Server-side shopping list endpoint (client-side only)
- Interactive iOS Notes checkboxes (not possible — Apple has no public API for this)
- Ingredient CRUD UI on iOS (can add later)
- Quantity editing (quantities are mostly null; list shows what to buy, not how much)
- Reminders app integration (possible future enhancement)
- Recipe steps display

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Computation | Client-side | Data is small (<50 KB total), avoids extra API calls per critique |
| Caching | Singleton service, in-memory | Follows StretchManifestLoader pattern. ~232 ingredients + ~82 recipes loaded once |
| Store section source | `storeSection` field on `ingredients` collection | Keeps classification with the data, not hardcoded in the app |
| Clipboard format | Plain text, one item per line | Simple, reliable, works everywhere |
| Pantry classification | `storeSection == "Pantry Staples"` | Uses the same section system, just sorts last |
| Shopping list state | Computed property on ViewModel | No persistence needed — recomputed from plan + cached data |

## Data Model Dependency

**The `ingredients` collection needs a `storeSection` field.** This is the one schema change required from the migration agent.

```
ingredients/{ingredientId}
├── name: string                    // "strawberries"
├── storeSection: string            // "Produce"   <-- NEW
├── createdAt: timestamp
└── updatedAt: timestamp
```

### Store Sections (predefined, ordered)

| Order | Section | Examples |
|-------|---------|----------|
| 1 | Produce | strawberries, garlic, fresh basil, lemons, arugula |
| 2 | Dairy & Eggs | milk, cheddar cheese, eggs, butter, yogurt, sour cream |
| 3 | Meat & Seafood | chicken breasts, 80% lean ground beef, salmon, bacon |
| 4 | Deli | sliced turkey, sliced ham, salami |
| 5 | Bakery & Bread | bread, baguette, brioche buns, tortillas, pita bread, naan |
| 6 | Frozen | frozen broccoli, Eggo waffles, Tyson dinosaur nuggets, fish sticks |
| 7 | Canned & Jarred | crushed tomatoes, black beans, chicken broth, chipotle in adobo |
| 8 | Pasta & Grains | spaghetti, linguine, microwave rice, rolled oats, flour |
| 9 | Snacks & Cereal | Goldfish crackers, Honey Nut Cheerios, granola, Nutri-Grain bars |
| 10 | Condiments & Spreads | mayonnaise, peanut butter, soy sauce, maple syrup, jam |
| 11 | Pantry Staples | cinnamon, cumin, garlic powder, paprika, vanilla extract, vinegars, honey |

Pantry Staples always sorts last. Within a section, items sort alphabetically.

### Section Assignment

The migration script (or a follow-up script) needs to assign `storeSection` to each of the ~232 ingredients. This can be done with a simple mapping object keyed by canonical name. Most assignments are obvious from the ingredient name. A few guidelines:

- Fresh herbs (basil, parsley, cilantro, thyme, dill, rosemary, mint) → **Produce**
- Branded frozen items (Eggo, Tyson, Freschetta) → **Frozen**
- Branded cereals (Cheerios, Raisin Bran, Special K) → **Snacks & Cereal**
- Branded packaged items (Kraft mac, Pillsbury dough) → **Frozen** or **Pasta & Grains** depending on storage
- Spices, seasonings, baking basics, vinegars, cooking spray → **Pantry Staples**
- Sauces (soy sauce, Worcestershire, hot sauce, barbecue sauce) → **Condiments & Spreads**
- Jams, preserves, peanut butter, honey → **Condiments & Spreads** (honey) or **Pantry Staples** (honey is borderline — user can adjust)

---

## Implementation

### Phase 1: Backend — Ingredients & Recipes API Endpoints

Add two read-only endpoints so the iOS app can fetch ingredient and recipe data for caching.

**Files to create:**

`packages/functions/src/types/ingredient.ts`
```typescript
interface Ingredient extends BaseEntity {
  name: string;
  store_section: string;
}
```

`packages/functions/src/types/recipe.ts`
```typescript
interface RecipeIngredient {
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
}

interface Recipe extends BaseEntity {
  meal_id: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[] | null;
}
```

`packages/functions/src/schemas/ingredient.schema.ts`
- Zod schemas (read-only for now, no create/update needed)

`packages/functions/src/schemas/recipe.schema.ts`
- Zod schemas (read-only for now)

`packages/functions/src/repositories/ingredient.repository.ts`
- Extends BaseRepository. Collection: `'ingredients'`
- Method: `findAll()` (inherited)

`packages/functions/src/repositories/recipe.repository.ts`
- Extends BaseRepository. Collection: `'recipes'`
- Methods: `findAll()`, `findByMealIds(mealIds: string[])`

`packages/functions/src/handlers/ingredients.ts`
- Express app following barcodes.ts pattern
- Routes: `GET /` (list all)
- stripPathPrefix('ingredients'), requireAppCheck

`packages/functions/src/handlers/recipes.ts`
- Express app following barcodes.ts pattern
- Routes: `GET /` (list all)
- stripPathPrefix('recipes'), requireAppCheck

`packages/functions/src/index.ts`
- Add `devIngredients`, `prodIngredients`, `devRecipes`, `prodRecipes` exports

**Testing:**
- Unit: repository findAll, handler response shape
- Manual: curl against emulator, verify ingredient count (232) and recipe count (82)

**Success criteria:**
- `npm run typecheck && npm run lint && npm test` passes
- `GET /api/dev/ingredients` returns all ingredients with `storeSection` field
- `GET /api/dev/recipes` returns all recipes with `ingredients` arrays

---

### Phase 2: iOS Models & API Client

Add models for Ingredient, Recipe, and ShoppingList types. Add API methods to fetch ingredients and recipes.

**Files to create:**

`ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Ingredient.swift`
```swift
public struct Ingredient: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let storeSection: String
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id, name
        case storeSection = "store_section"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
```

`ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Recipe.swift`
```swift
public struct RecipeIngredient: Codable, Hashable, Sendable {
    public let ingredientId: String
    public let quantity: Double?
    public let unit: String?

    public enum CodingKeys: String, CodingKey {
        case ingredientId = "ingredient_id"
        case quantity, unit
    }
}

public struct Recipe: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let mealId: String
    public let ingredients: [RecipeIngredient]
    public let createdAt: Date
    public let updatedAt: Date

    public enum CodingKeys: String, CodingKey {
        case id
        case mealId = "meal_id"
        case ingredients
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
```

`ios/BradOS/BradOSCore/Sources/BradOSCore/Models/ShoppingList.swift`
```swift
/// A single item on the shopping list (aggregated across meals)
public struct ShoppingListItem: Identifiable, Hashable, Sendable {
    public let id: String           // ingredientId
    public let name: String
    public let totalQuantity: Double?
    public let unit: String?
    public let mealCount: Int       // how many meals use this ingredient

    public var displayText: String {
        if let qty = totalQuantity, let unit = unit {
            return "\(formatQuantity(qty)) \(unit) \(name)"
        }
        return name
    }
}

/// A section of the shopping list (one per store area)
public struct ShoppingListSection: Identifiable, Hashable, Sendable {
    public let id: String           // section name
    public let name: String         // display name
    public let sortOrder: Int
    public let items: [ShoppingListItem]
    public let isPantryStaples: Bool
}

/// Store section definitions with sort order
public enum StoreSection: String, CaseIterable, Sendable {
    case produce = "Produce"
    case dairyAndEggs = "Dairy & Eggs"
    case meatAndSeafood = "Meat & Seafood"
    case deli = "Deli"
    case bakeryAndBread = "Bakery & Bread"
    case frozen = "Frozen"
    case cannedAndJarred = "Canned & Jarred"
    case pastaAndGrains = "Pasta & Grains"
    case snacksAndCereal = "Snacks & Cereal"
    case condimentsAndSpreads = "Condiments & Spreads"
    case pantryStaples = "Pantry Staples"

    public var sortOrder: Int {
        switch self {
        case .produce: return 1
        case .dairyAndEggs: return 2
        case .meatAndSeafood: return 3
        case .deli: return 4
        case .bakeryAndBread: return 5
        case .frozen: return 6
        case .cannedAndJarred: return 7
        case .pastaAndGrains: return 8
        case .snacksAndCereal: return 9
        case .condimentsAndSpreads: return 10
        case .pantryStaples: return 11
        }
    }

    public var isPantryStaples: Bool { self == .pantryStaples }
}
```

**API Protocol additions** — add to `APIClientProtocol.swift`:
```swift
// MARK: - Ingredients
func getIngredients() async throws -> [Ingredient]

// MARK: - Recipes
func getRecipes() async throws -> [Recipe]
```

**API Client** — add implementations to `APIClient.swift`
**Mock Client** — add mock implementations to `MockAPIClient.swift`

**Testing:**
- Decoding tests: capture JSON from emulator, decode into models, assert fields
- Xcode build succeeds

**Success criteria:**
- All decoding tests pass
- Xcode build succeeds
- API methods exist on protocol, client, and mock

---

### Phase 3: Recipe Cache Service

Singleton service that loads all ingredients and recipes once, then serves them from memory. Follows the StretchManifestLoader pattern.

**File to create:**

`ios/BradOS/BradOSCore/Sources/BradOSCore/Services/RecipeCacheService.swift`

```swift
@MainActor
public class RecipeCacheService: ObservableObject {
    public static let shared = RecipeCacheService()

    @Published public private(set) var isLoaded = false
    @Published public private(set) var error: String?

    /// All ingredients keyed by ID
    private var ingredientsById: [String: Ingredient] = [:]

    /// All recipes keyed by mealId
    private var recipesByMealId: [String: Recipe] = [:]

    private let apiClient: APIClientProtocol

    public init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
    }

    /// Load all ingredients and recipes. Call once on app launch or first use.
    public func loadIfNeeded() async {
        guard !isLoaded else { return }
        do {
            async let ingredientsTask = apiClient.getIngredients()
            async let recipesTask = apiClient.getRecipes()

            let (ingredients, recipes) = try await (ingredientsTask, recipesTask)

            ingredientsById = Dictionary(uniqueKeysWithValues: ingredients.map { ($0.id, $0) })
            recipesByMealId = Dictionary(uniqueKeysWithValues: recipes.map { ($0.mealId, $0) })
            isLoaded = true
            error = nil
        } catch {
            self.error = "Failed to load recipe data"
        }
    }

    /// Get ingredient by ID
    public func ingredient(byId id: String) -> Ingredient? {
        ingredientsById[id]
    }

    /// Get recipe for a meal
    public func recipe(forMealId mealId: String) -> Recipe? {
        recipesByMealId[mealId]
    }

    /// Get all ingredients for a set of meal IDs (for shopping list)
    public func ingredientTuples(forMealIds mealIds: [String]) -> [(Ingredient, Double?, String?)] {
        var results: [(Ingredient, Double?, String?)] = []
        for mealId in mealIds {
            guard let recipe = recipesByMealId[mealId] else { continue }
            for ri in recipe.ingredients {
                guard let ingredient = ingredientsById[ri.ingredientId] else { continue }
                results.append((ingredient, ri.quantity, ri.unit))
            }
        }
        return results
    }
}
```

**Testing:**
- Unit test: given mock ingredients and recipes, `ingredientTuples(forMealIds:)` returns correct tuples
- Unit test: `loadIfNeeded()` only fetches once (idempotent)

**Success criteria:**
- Tests pass
- Xcode build succeeds

---

### Phase 4: Shopping List Computation

Pure function that takes ingredient tuples and produces a sorted, aggregated, sectioned shopping list. No side effects, easy to test.

**File to create:**

`ios/BradOS/BradOSCore/Sources/BradOSCore/Services/ShoppingListBuilder.swift`

```swift
public enum ShoppingListBuilder {

    /// Build a sectioned shopping list from a meal plan
    public static func build(
        fromPlanEntries entries: [MealPlanEntry],
        using cache: RecipeCacheService
    ) -> [ShoppingListSection] {
        // 1. Collect unique mealIds (skip nil / "eating out")
        let mealIds = entries.compactMap { $0.mealId }
        let uniqueMealIds = Array(Set(mealIds))

        // 2. Get all (ingredient, quantity, unit) tuples
        let tuples = cache.ingredientTuples(forMealIds: uniqueMealIds)

        // 3. Aggregate by ingredientId
        let aggregated = aggregate(tuples)

        // 4. Group by storeSection
        let grouped = Dictionary(grouping: aggregated) { $0.storeSection }

        // 5. Build sections, sorted by store order, pantry last
        return grouped.map { (sectionName, items) in
            let section = StoreSection(rawValue: sectionName) ?? .pantryStaples
            return ShoppingListSection(
                id: sectionName,
                name: sectionName,
                sortOrder: section.sortOrder,
                items: items.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending },
                isPantryStaples: section.isPantryStaples
            )
        }
        .sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Aggregate tuples by ingredient ID, summing quantities where units match
    private static func aggregate(
        _ tuples: [(Ingredient, Double?, String?)]
    ) -> [ShoppingListItem] {
        // ... group by ingredient.id, sum quantities, count meals ...
    }
}
```

**Aggregation rules:**
1. Group by `ingredient.id`
2. If all entries for an ingredient have the same unit → sum quantities
3. If units differ → show total quantity as nil (just the name)
4. If all quantities are nil → show name only, with `mealCount` for context
5. Store `storeSection` from the ingredient for grouping

**Testing (the most important tests in this plan):**
- Aggregation: same ingredient, same unit → quantities summed
- Aggregation: same ingredient, different units → quantity shown as nil
- Aggregation: same ingredient, all null quantities → name only with meal count
- Sectioning: items grouped by storeSection
- Sort order: sections sorted by predefined order, Pantry Staples last
- Sort within section: alphabetical by name
- Empty plan → empty list
- Plan with "eating out" (null mealId) slots → those slots skipped
- Meal with no recipe → that meal's ingredients skipped (no crash)
- Stress: plan with all 82 meals → all ingredients aggregated correctly

**Success criteria:**
- All unit tests pass
- `npm run typecheck && npm run lint && npm test` passes (backend unchanged)
- Xcode build succeeds

---

### Phase 5: Clipboard Copy

Formats the shopping list as plain text with Unicode checkbox symbols and copies to clipboard.

**File to create:**

`ios/BradOS/BradOSCore/Sources/BradOSCore/Services/ShoppingListFormatter.swift`

```swift
public enum ShoppingListFormatter {

    /// Format shopping list for clipboard (plain text, one item per line)
    public static func formatForClipboard(_ sections: [ShoppingListSection]) -> String {
        var lines: [String] = []

        for section in sections {
            if section.isPantryStaples {
                lines.append("")
                lines.append("\(section.name) (you may already have these)")
            } else {
                lines.append("")
                lines.append(section.name)
            }

            for item in section.items {
                lines.append(item.displayText)
            }
        }

        return lines
            .dropFirst()  // remove leading blank line
            .joined(separator: "\n")
    }

    /// Copy to system clipboard
    public static func copyToClipboard(_ sections: [ShoppingListSection]) {
        let text = formatForClipboard(sections)
        UIPasteboard.general.string = text
    }
}
```

**Example output:**
```
Produce
arugula
avocado
cherry tomatoes
fresh basil
garlic
lemons
strawberries

Dairy & Eggs
butter
cheddar cheese
eggs
2 cups milk

Meat & Seafood
2 lb 80% lean ground beef
chicken breasts

Pantry Staples (you may already have these)
chili powder
cinnamon
cumin
garlic powder
```

**Testing:**
- Unit test: format produces expected string for known input
- Unit test: Pantry Staples section has the "(you may already have these)" note
- Unit test: empty list → empty string
- Manual: copy on simulator, paste into Notes, verify readable

**Success criteria:**
- Unit tests pass
- Manual clipboard test on simulator

---

### Phase 6: ViewModel Integration

Add shopping list state to MealPlanViewModel and trigger recomputation on plan changes.

**File to modify:** `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/MealPlanViewModel.swift` (from Phase 6 of the main meal plan implementation plan)

**Additions:**

```swift
// New published property
@Published public var shoppingList: [ShoppingListSection] = []
@Published public var didCopyToClipboard = false

// New dependency
private let recipeCache: RecipeCacheService

// Modified init
public init(apiClient: APIClientProtocol, recipeCache: RecipeCacheService = .shared) {
    self.apiClient = apiClient
    self.recipeCache = recipeCache
}

// Recompute after generate
public func generatePlan() async {
    // ... existing generate logic ...
    // After success:
    await recomputeShoppingList()
}

// Recompute after critique
public func sendCritique() async {
    // ... existing critique logic ...
    // After success:
    await recomputeShoppingList()
}

// Shopping list methods
private func recomputeShoppingList() async {
    await recipeCache.loadIfNeeded()
    guard let plan = session?.plan else {
        shoppingList = []
        return
    }
    shoppingList = ShoppingListBuilder.build(fromPlanEntries: plan, using: recipeCache)
}

public func copyShoppingList() {
    ShoppingListFormatter.copyToClipboard(shoppingList)
    didCopyToClipboard = true

    // Reset after 2 seconds for UI feedback
    Task {
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        didCopyToClipboard = false
    }
}
```

**Success criteria:**
- Shopping list updates after generatePlan() and sendCritique()
- copyShoppingList() puts text on clipboard
- didCopyToClipboard flag resets after 2 seconds

---

### Phase 7: Shopping List View

**Files to create:**

`ios/BradOS/BradOS/Views/MealPlan/ShoppingListView.swift`

Main view showing the sectioned shopping list:
- Section headers with store area name
- Items listed under each section with ingredient display text
- Pantry Staples section visually distinct (dimmed or italic, with subtitle)
- "Copy to Clipboard" button in toolbar
- Brief toast/feedback when copied ("Copied!")
- Empty state when no plan exists

`ios/BradOS/BradOS/Views/MealPlan/MealPlanView.swift` (modify)

Add a segment control or picker at the top of the meal plan view:
- "Plan" | "Shopping List" toggle
- Shopping list tab shows ShoppingListView
- Badge on Shopping List tab showing item count

**UI notes:**
- Follow existing view patterns (ScrollView, VStack, Theme spacing)
- Section headers: bold, left-aligned, with section name
- Items: regular weight, indented under section
- Pantry section: lighter color or separate visual treatment
- Copy button: toolbar trailing position, system "doc.on.doc" icon
- Copied feedback: brief "Copied!" text or checkmark animation

**Testing:**
- Manual on simulator: generate plan → switch to Shopping List tab → verify sections and items
- Manual: tap Copy → paste into Notes → verify readable format
- Manual: send critique that changes meals → verify shopping list updates

**Success criteria:**
- Shopping list displays correctly grouped by store section
- Pantry staples appear at bottom with visual distinction
- Copy button works, feedback shown
- List updates after each plan change

---

## Dependencies on Other Work

| Dependency | Status | What's Needed |
|------------|--------|---------------|
| Firebase migration | In progress | `ingredients` and `recipes` collections populated in emulator |
| `storeSection` field on ingredients | **Not yet planned** | Each ingredient needs a store section assignment |
| Meal plan phases 1-4 (backend) | Not started | Meal CRUD + plan generation + critique must exist first |
| Meal plan phases 5-6 (iOS) | Not started | MealPlanViewModel and MealPlanView must exist before Phase 6-7 here |

**This plan's Phase 1-5 can proceed independently** of the main meal plan iOS phases. Phase 6-7 integrate with the meal plan ViewModel/View and must wait for those.

## Testing Strategy Summary

| Phase | Automated | Manual |
|-------|-----------|--------|
| 1 | Repository + handler unit tests | curl endpoints against emulator |
| 2 | Model decoding tests | — |
| 3 | Cache service unit tests (idempotent load, lookup) | — |
| 4 | **Aggregation + sectioning unit tests** (most important) | — |
| 5 | Formatter output unit tests | Copy/paste on simulator |
| 6 | ViewModel integration (mock data) | — |
| 7 | — | Full flow: generate → view list → critique → list updates → copy → paste |

## References

- Firebase migration plan: `thoughts/shared/plans/2026-01-31-mealplanner-firebase-migration.md`
- Ingredient mapping: `mealplanner-ingredient-mapping.json`
- Main meal plan implementation: `thoughts/shared/plans/2026-01-31-meal-plan-agent-critique-loop.md`
- iOS ViewModel pattern: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/BarcodeWalletViewModel.swift`
- iOS caching pattern: `ios/BradOS/BradOS/Services/StretchManifestLoader.swift`
- iOS model pattern: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/Barcode.swift`
