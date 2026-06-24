use serde::{Deserialize, Serialize};

/// Meal type enum matching the API's lowercase convention.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MealType {
    Breakfast,
    Lunch,
    Dinner,
}

/// Meal audience enum matching the API's lowercase convention.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MealAudience {
    Family,
    Adult,
}

fn default_meal_audience() -> MealAudience {
    MealAudience::Family
}

/// Meal plan track enum matching the API's lowercase convention.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MealTrack {
    Family,
    Adult,
}

fn default_meal_track() -> MealTrack {
    MealTrack::Family
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meal {
    pub id: String,
    pub name: String,
    pub meal_type: MealType,
    #[serde(default = "default_meal_audience")]
    pub audience: MealAudience,
    pub effort: u8,
    pub has_red_meat: bool,
    pub prep_ahead: bool,
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_planned: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealPlanEntry {
    pub day_index: u8,
    #[serde(default = "default_meal_track")]
    pub meal_track: MealTrack,
    pub meal_type: MealType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meal_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meal_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MealPlanSession {
    pub id: String,
    pub plan: Vec<MealPlanEntry>,
    pub meals_snapshot: Vec<Meal>,
    pub history: Vec<ConversationMessage>,
    pub is_finalized: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operations: Option<Vec<CritiqueOperation>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CritiqueOperation {
    pub day_index: u8,
    #[serde(default = "default_meal_track")]
    pub meal_track: MealTrack,
    pub meal_type: MealType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_meal_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CritiqueResult {
    pub plan: Vec<MealPlanEntry>,
    pub explanation: String,
    pub operations: Vec<CritiqueOperation>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviseResult {
    pub plan: Vec<MealPlanEntry>,
    pub explanation: String,
    pub operations: Vec<CritiqueOperation>,
    pub errors: Vec<String>,
    pub recency_reconciled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateResult {
    pub session_id: String,
    pub plan: Vec<MealPlanEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinalizeResult {
    pub finalized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteMealPlanResult {
    pub deleted: bool,
    pub was_finalized: bool,
    pub recency_reconciled: bool,
}

// Shopping list types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShoppingList {
    pub session_id: String,
    pub sections: Vec<ShoppingListSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShoppingListSection {
    pub name: String,
    pub sort_order: u16,
    pub items: Vec<ShoppingListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShoppingListItem {
    pub ingredient_id: String,
    pub name: String,
    pub store_section: String,
    pub total_quantity: Option<f64>,
    pub unit: Option<String>,
    pub meal_count: u32,
    pub display_text: String,
}

// Recipe types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    pub id: String,
    pub meal_id: String,
    pub ingredients: Vec<RecipeIngredient>,
    pub steps: Option<Vec<RecipeStep>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeIngredient {
    pub ingredient_id: String,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeStep {
    pub step_number: u32,
    pub instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ingredient {
    pub id: String,
    pub name: String,
    pub store_section: String,
    pub created_at: String,
    pub updated_at: String,
}

pub const VALID_STORE_SECTIONS: &[&str] = &[
    "Produce",
    "Dairy & Eggs",
    "Meat & Seafood",
    "Deli",
    "Bakery & Bread",
    "Frozen",
    "Canned & Jarred",
    "Pasta & Grains",
    "Snacks & Cereal",
    "Condiments & Spreads",
    "Pantry Staples",
];

// API envelope types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiSuccess<T> {
    pub success: bool,
    pub data: T,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    pub success: bool,
    pub error: ApiErrorDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorDetail {
    pub code: String,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_api_success_with_meals() {
        let json = r#"{
            "success": true,
            "data": [
                {
                    "id": "meal_1",
                    "name": "Tacos",
                    "meal_type": "dinner",
                    "effort": 3,
                    "has_red_meat": true,
                    "prep_ahead": false,
                    "url": "https://example.com/tacos",
                    "last_planned": "2026-03-01",
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z"
                },
                {
                    "id": "meal_2",
                    "name": "Oatmeal",
                    "meal_type": "breakfast",
                    "effort": 1,
                    "has_red_meat": false,
                    "prep_ahead": true,
                    "url": null,
                    "created_at": "2026-02-01T00:00:00Z",
                    "updated_at": "2026-02-01T00:00:00Z"
                }
            ]
        }"#;
        let parsed: ApiSuccess<Vec<Meal>> = serde_json::from_str(json).unwrap();
        assert!(parsed.success);
        assert_eq!(parsed.data.len(), 2);
        assert_eq!(parsed.data[0].name, "Tacos");
        assert_eq!(parsed.data[0].meal_type, MealType::Dinner);
        assert_eq!(parsed.data[0].audience, MealAudience::Family);
        assert_eq!(
            parsed.data[0].url.as_deref(),
            Some("https://example.com/tacos")
        );
        assert_eq!(parsed.data[1].last_planned, None);
        assert_eq!(parsed.data[1].url, None);
        assert_eq!(parsed.data[1].audience, MealAudience::Family);
    }

    #[test]
    fn deserialize_adult_meal_audience() {
        let json = r#"{
            "id": "meal_1",
            "name": "Protein Oats",
            "meal_type": "breakfast",
            "audience": "adult",
            "effort": 1,
            "has_red_meat": false,
            "prep_ahead": true,
            "url": null,
            "created_at": "2026-02-01T00:00:00Z",
            "updated_at": "2026-02-01T00:00:00Z"
        }"#;
        let meal: Meal = serde_json::from_str(json).unwrap();
        assert_eq!(meal.audience, MealAudience::Adult);
    }

    #[test]
    fn deserialize_meal_plan_session() {
        let json = r#"{
            "id": "session_abc",
            "plan": [
                {
                    "day_index": 0,
                    "meal_track": "adult",
                    "meal_type": "breakfast",
                    "meal_id": "meal_1",
                    "meal_name": "Oatmeal"
                }
            ],
            "meals_snapshot": [],
            "history": [
                {
                    "role": "assistant",
                    "content": "Here is your plan.",
                    "operations": [
                        {
                            "day_index": 0,
                            "meal_track": "adult",
                            "meal_type": "breakfast",
                            "new_meal_id": "meal_1"
                        }
                    ]
                }
            ],
            "is_finalized": false,
            "created_at": "2026-03-01T00:00:00Z",
            "updated_at": "2026-03-01T00:00:00Z"
        }"#;
        let session: MealPlanSession = serde_json::from_str(json).unwrap();
        assert_eq!(session.id, "session_abc");
        assert!(!session.is_finalized);
        assert_eq!(session.plan.len(), 1);
        assert_eq!(session.plan[0].meal_track, MealTrack::Adult);
        assert_eq!(session.history.len(), 1);
        assert!(session.history[0].operations.is_some());
        let operations = session.history[0].operations.as_ref().unwrap();
        assert_eq!(operations[0].meal_track, MealTrack::Adult);
    }

    #[test]
    fn deserialize_legacy_meal_plan_defaults_track_to_family() {
        let json = r#"{
            "day_index": 0,
            "meal_type": "breakfast",
            "meal_id": "meal_1",
            "meal_name": "Oatmeal"
        }"#;
        let entry: MealPlanEntry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.meal_track, MealTrack::Family);

        let json = r#"{
            "day_index": 0,
            "meal_type": "breakfast",
            "new_meal_id": "meal_2"
        }"#;
        let operation: CritiqueOperation = serde_json::from_str(json).unwrap();
        assert_eq!(operation.meal_track, MealTrack::Family);
    }

    #[test]
    fn deserialize_shopping_list() {
        let json = r#"{
            "session_id": "sess_123",
            "sections": [
                {
                    "name": "Produce",
                    "sort_order": 1,
                    "items": [
                        {
                            "ingredient_id": "ing_1",
                            "name": "Tomatoes",
                            "store_section": "Produce",
                            "total_quantity": 4.0,
                            "unit": "count",
                            "meal_count": 2,
                            "display_text": "4 Tomatoes"
                        },
                        {
                            "ingredient_id": "ing_2",
                            "name": "Cilantro",
                            "store_section": "Produce",
                            "meal_count": 1,
                            "display_text": "Cilantro"
                        }
                    ]
                }
            ]
        }"#;
        let list: ShoppingList = serde_json::from_str(json).unwrap();
        assert_eq!(list.session_id, "sess_123");
        assert_eq!(list.sections.len(), 1);
        assert_eq!(list.sections[0].items.len(), 2);
        assert_eq!(list.sections[0].items[0].total_quantity, Some(4.0));
        assert_eq!(list.sections[0].items[1].total_quantity, None);
        assert_eq!(list.sections[0].items[1].unit, None);
    }

    #[test]
    fn deserialize_api_error_response() {
        let json = r#"{
            "success": false,
            "error": {
                "code": "NOT_FOUND",
                "message": "Session not found"
            }
        }"#;
        let err: ApiErrorResponse = serde_json::from_str(json).unwrap();
        assert!(!err.success);
        assert_eq!(err.error.code, "NOT_FOUND");
        assert_eq!(err.error.message, "Session not found");
    }

    #[test]
    fn deserialize_delete_meal_plan_result() {
        let json = r#"{
            "deleted": true,
            "was_finalized": true,
            "recency_reconciled": true
        }"#;
        let result: DeleteMealPlanResult = serde_json::from_str(json).unwrap();
        assert!(result.deleted);
        assert!(result.was_finalized);
        assert!(result.recency_reconciled);
    }

    #[test]
    fn deserialize_recipe_with_steps() {
        let json = r#"{
            "id": "recipe_1",
            "meal_id": "meal_1",
            "ingredients": [
                {"ingredient_id": "ing_1", "quantity": 2.0, "unit": "cups"},
                {"ingredient_id": "ing_2"}
            ],
            "steps": [
                {"step_number": 1, "instruction": "Chop onions"},
                {"step_number": 2, "instruction": "Saute"}
            ],
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }"#;
        let recipe: Recipe = serde_json::from_str(json).unwrap();
        assert_eq!(recipe.id, "recipe_1");
        assert_eq!(recipe.meal_id, "meal_1");
        assert_eq!(recipe.ingredients.len(), 2);
        assert_eq!(recipe.ingredients[0].quantity, Some(2.0));
        assert_eq!(recipe.ingredients[1].quantity, None);
        let steps = recipe.steps.unwrap();
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].step_number, 1);
    }

    #[test]
    fn deserialize_recipe_with_null_steps() {
        let json = r#"{
            "id": "recipe_2",
            "meal_id": "meal_2",
            "ingredients": [],
            "steps": null,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }"#;
        let recipe: Recipe = serde_json::from_str(json).unwrap();
        assert!(recipe.steps.is_none());
    }

    #[test]
    fn deserialize_ingredient() {
        let json = r#"{
            "id": "ing_1",
            "name": "Tomatoes",
            "store_section": "Produce",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }"#;
        let ingredient: Ingredient = serde_json::from_str(json).unwrap();
        assert_eq!(ingredient.id, "ing_1");
        assert_eq!(ingredient.name, "Tomatoes");
        assert_eq!(ingredient.store_section, "Produce");
    }

    #[test]
    fn meal_type_serializes_as_lowercase() {
        let val = serde_json::to_string(&MealType::Breakfast).unwrap();
        assert_eq!(val, r#""breakfast""#);
        let val = serde_json::to_string(&MealType::Lunch).unwrap();
        assert_eq!(val, r#""lunch""#);
        let val = serde_json::to_string(&MealType::Dinner).unwrap();
        assert_eq!(val, r#""dinner""#);
    }

    #[test]
    fn meal_audience_and_track_serialize_as_lowercase() {
        let val = serde_json::to_string(&MealAudience::Adult).unwrap();
        assert_eq!(val, r#""adult""#);
        let val = serde_json::to_string(&MealTrack::Family).unwrap();
        assert_eq!(val, r#""family""#);
    }
}
