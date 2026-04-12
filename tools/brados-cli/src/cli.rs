use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "brados",
    about = "CLI for interacting with the BradOS Firebase API"
)]
pub struct Cli {
    /// Use dev endpoints instead of prod
    #[arg(long, global = true)]
    pub dev: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Meal plan operations
    Mealplan(MealplanCmd),
    /// Meals CRUD operations
    Meals(MealsCmd),
    /// Health sync read operations
    HealthSync(HealthSyncCmd),
    /// Shopping list operations
    Shoppinglist(ShoppinglistCmd),
    /// Recipe operations
    Recipes(RecipesCmd),
    /// Ingredient operations
    Ingredients(IngredientsCmd),
}

#[derive(Parser, Debug)]
pub struct MealplanCmd {
    #[command(subcommand)]
    pub action: MealplanAction,
}

#[derive(Subcommand, Debug)]
pub enum MealplanAction {
    /// Generate a new meal plan
    Generate,
    /// Get the latest meal plan session
    Latest,
    /// Get a specific meal plan session
    Get {
        /// Session ID
        session_id: String,
    },
    /// Critique a meal plan
    Critique {
        /// Session ID
        session_id: String,
        /// Critique message
        message: String,
    },
    /// Finalize a meal plan
    Finalize {
        /// Session ID
        session_id: String,
    },
}

#[derive(Parser, Debug)]
pub struct MealsCmd {
    #[command(subcommand)]
    pub action: MealsAction,
}

#[derive(Subcommand, Debug)]
pub enum MealsAction {
    /// List all meals
    List,
    /// Get a specific meal
    Get {
        /// Meal ID
        id: String,
    },
    /// Create a new meal
    Create {
        /// Meal name
        #[arg(long)]
        name: String,
        /// Meal type (breakfast, lunch, dinner)
        #[arg(long)]
        meal_type: String,
        /// Effort level (1-5)
        #[arg(long)]
        effort: u8,
        /// Whether the meal contains red meat
        #[arg(long, default_value_t = false)]
        has_red_meat: bool,
        /// Whether the meal can be prepped ahead
        #[arg(long, default_value_t = false)]
        prep_ahead: bool,
        /// URL for the recipe
        #[arg(long)]
        url: String,
    },
    /// Update an existing meal
    Update {
        /// Meal ID
        id: String,
        /// Meal name
        #[arg(long)]
        name: Option<String>,
        /// Meal type (breakfast, lunch, dinner)
        #[arg(long)]
        meal_type: Option<String>,
        /// Effort level (1-5)
        #[arg(long)]
        effort: Option<u8>,
        /// Set has_red_meat to true
        #[arg(long, conflicts_with = "no_red_meat")]
        has_red_meat: bool,
        /// Set has_red_meat to false
        #[arg(long, conflicts_with = "has_red_meat")]
        no_red_meat: bool,
        /// Set prep_ahead to true
        #[arg(long, conflicts_with = "no_prep_ahead")]
        prep_ahead: bool,
        /// Set prep_ahead to false
        #[arg(long, conflicts_with = "prep_ahead")]
        no_prep_ahead: bool,
        /// URL for the recipe
        #[arg(long)]
        url: Option<String>,
    },
    /// Delete a meal
    Delete {
        /// Meal ID
        id: String,
    },
}

#[derive(Parser, Debug)]
pub struct ShoppinglistCmd {
    #[command(subcommand)]
    pub action: ShoppinglistAction,
}

#[derive(Subcommand, Debug)]
pub enum ShoppinglistAction {
    /// Generate a shopping list
    Generate {
        /// Session ID (defaults to latest session)
        session_id: Option<String>,
    },
}

#[derive(Parser, Debug)]
pub struct HealthSyncCmd {
    #[command(subcommand)]
    pub action: HealthSyncAction,
}

#[derive(Subcommand, Debug)]
pub enum HealthSyncAction {
    /// Get latest recovery or recovery for a specific date
    Recovery {
        /// Recovery date in YYYY-MM-DD format
        #[arg(long)]
        date: Option<String>,
    },
    /// Get recovery history for the last N days
    RecoveryHistory {
        /// Number of days to fetch
        #[arg(long)]
        days: Option<u16>,
    },
    /// Get the current recovery baseline
    Baseline,
    /// Get latest weight or weight history
    Weight {
        /// Number of days to fetch
        #[arg(long)]
        days: Option<u16>,
    },
    /// Get latest HRV or HRV history
    Hrv {
        /// Number of days to fetch
        #[arg(long)]
        days: Option<u16>,
    },
    /// Get latest resting heart rate or RHR history
    Rhr {
        /// Number of days to fetch
        #[arg(long)]
        days: Option<u16>,
    },
    /// Get latest sleep or sleep history
    Sleep {
        /// Number of days to fetch
        #[arg(long)]
        days: Option<u16>,
    },
}

#[derive(Parser, Debug)]
pub struct RecipesCmd {
    #[command(subcommand)]
    pub action: RecipesAction,
}

#[derive(Subcommand, Debug)]
pub enum RecipesAction {
    /// List all recipes
    List,
    /// Get a recipe by ID or by meal ID
    Get {
        /// Recipe ID
        #[arg(long, conflicts_with = "meal_id")]
        id: Option<String>,
        /// Meal ID to look up recipe for
        #[arg(long, conflicts_with = "id")]
        meal_id: Option<String>,
    },
    /// Create a new recipe for a meal
    Create {
        /// Meal ID to attach recipe to
        #[arg(long)]
        meal_id: String,
        /// Ingredients as JSON array: [{"ingredient_id":"...","quantity":4,"unit":"count"}]
        #[arg(long)]
        ingredients_json: String,
        /// Steps as JSON array: [{"step_number":1,"instruction":"..."}]
        #[arg(long)]
        steps_json: Option<String>,
    },
    /// Update an existing recipe
    Update {
        /// Recipe ID
        id: String,
        /// Ingredients as JSON array (replaces all ingredients)
        #[arg(long)]
        ingredients_json: Option<String>,
        /// Steps as JSON array (replaces all steps)
        #[arg(long)]
        steps_json: Option<String>,
        /// Clear all steps (set to null)
        #[arg(long, conflicts_with = "steps_json")]
        clear_steps: bool,
    },
    /// Delete a recipe
    Delete {
        /// Recipe ID
        id: String,
    },
}

#[derive(Parser, Debug)]
pub struct IngredientsCmd {
    #[command(subcommand)]
    pub action: IngredientsAction,
}

#[derive(Subcommand, Debug)]
pub enum IngredientsAction {
    /// List all ingredients
    List,
    /// Get an ingredient by ID
    Get {
        /// Ingredient ID
        id: String,
    },
    /// Create a new ingredient
    Create {
        /// Ingredient name
        #[arg(long)]
        name: String,
        /// Store section (valid: Produce, Dairy & Eggs, Meat & Seafood, Deli, Bakery & Bread, Frozen, Canned & Jarred, Pasta & Grains, Snacks & Cereal, Condiments & Spreads, Pantry Staples)
        #[arg(long)]
        store_section: String,
    },
    /// Update an existing ingredient
    Update {
        /// Ingredient ID
        id: String,
        /// Ingredient name
        #[arg(long)]
        name: Option<String>,
        /// Store section
        #[arg(long)]
        store_section: Option<String>,
    },
    /// Delete an ingredient
    Delete {
        /// Ingredient ID
        id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Cli {
        Cli::parse_from(std::iter::once("brados").chain(args.iter().copied()))
    }

    #[test]
    fn parse_mealplan_generate() {
        let cli = parse(&["mealplan", "generate"]);
        assert!(!cli.dev);
        assert!(matches!(cli.command, Commands::Mealplan(ref cmd)
            if matches!(cmd.action, MealplanAction::Generate)));
    }

    #[test]
    fn parse_dev_meals_list() {
        let cli = parse(&["--dev", "meals", "list"]);
        assert!(cli.dev);
        assert!(matches!(cli.command, Commands::Meals(ref cmd)
            if matches!(cmd.action, MealsAction::List)));
    }

    #[test]
    fn parse_meals_create_with_all_fields() {
        let cli = parse(&[
            "meals",
            "create",
            "--name",
            "Tacos",
            "--meal-type",
            "dinner",
            "--effort",
            "3",
            "--has-red-meat",
            "--url",
            "",
        ]);
        match &cli.command {
            Commands::Meals(cmd) => match &cmd.action {
                MealsAction::Create {
                    name,
                    meal_type,
                    effort,
                    has_red_meat,
                    prep_ahead,
                    url,
                } => {
                    assert_eq!(name, "Tacos");
                    assert_eq!(meal_type, "dinner");
                    assert_eq!(*effort, 3);
                    assert!(*has_red_meat);
                    assert!(!*prep_ahead);
                    assert_eq!(url, "");
                }
                _ => panic!("expected Create"),
            },
            _ => panic!("expected Meals"),
        }
    }

    #[test]
    fn parse_shoppinglist_generate_no_session() {
        let cli = parse(&["shoppinglist", "generate"]);
        match &cli.command {
            Commands::Shoppinglist(cmd) => match &cmd.action {
                ShoppinglistAction::Generate { session_id } => {
                    assert!(session_id.is_none());
                }
            },
            _ => panic!("expected Shoppinglist"),
        }
    }

    #[test]
    fn parse_shoppinglist_generate_with_session() {
        let cli = parse(&["shoppinglist", "generate", "abc123"]);
        match &cli.command {
            Commands::Shoppinglist(cmd) => match &cmd.action {
                ShoppinglistAction::Generate { session_id } => {
                    assert_eq!(session_id.as_deref(), Some("abc123"));
                }
            },
            _ => panic!("expected Shoppinglist"),
        }
    }

    #[test]
    fn parse_health_sync_recovery_with_date() {
        let cli = parse(&["health-sync", "recovery", "--date", "2026-03-22"]);
        match &cli.command {
            Commands::HealthSync(cmd) => match &cmd.action {
                HealthSyncAction::Recovery { date } => {
                    assert_eq!(date.as_deref(), Some("2026-03-22"));
                }
                _ => panic!("expected Recovery"),
            },
            _ => panic!("expected HealthSync"),
        }
    }

    #[test]
    fn parse_health_sync_weight_days() {
        let cli = parse(&["health-sync", "weight", "--days", "30"]);
        match &cli.command {
            Commands::HealthSync(cmd) => match &cmd.action {
                HealthSyncAction::Weight { days } => {
                    assert_eq!(*days, Some(30));
                }
                _ => panic!("expected Weight"),
            },
            _ => panic!("expected HealthSync"),
        }
    }

    #[test]
    fn parse_mealplan_critique() {
        let cli = parse(&["mealplan", "critique", "sess_1", "swap Monday dinner"]);
        match &cli.command {
            Commands::Mealplan(cmd) => match &cmd.action {
                MealplanAction::Critique {
                    session_id,
                    message,
                } => {
                    assert_eq!(session_id, "sess_1");
                    assert_eq!(message, "swap Monday dinner");
                }
                _ => panic!("expected Critique"),
            },
            _ => panic!("expected Mealplan"),
        }
    }

    #[test]
    fn parse_recipes_list() {
        let cli = parse(&["recipes", "list"]);
        assert!(matches!(cli.command, Commands::Recipes(ref cmd)
            if matches!(cmd.action, RecipesAction::List)));
    }

    #[test]
    fn parse_recipes_get_by_id() {
        let cli = parse(&["recipes", "get", "--id", "recipe_1"]);
        match &cli.command {
            Commands::Recipes(cmd) => match &cmd.action {
                RecipesAction::Get { id, meal_id } => {
                    assert_eq!(id.as_deref(), Some("recipe_1"));
                    assert!(meal_id.is_none());
                }
                _ => panic!("expected Get"),
            },
            _ => panic!("expected Recipes"),
        }
    }

    #[test]
    fn parse_recipes_get_by_meal_id() {
        let cli = parse(&["recipes", "get", "--meal-id", "meal_1"]);
        match &cli.command {
            Commands::Recipes(cmd) => match &cmd.action {
                RecipesAction::Get { id, meal_id } => {
                    assert!(id.is_none());
                    assert_eq!(meal_id.as_deref(), Some("meal_1"));
                }
                _ => panic!("expected Get"),
            },
            _ => panic!("expected Recipes"),
        }
    }

    #[test]
    fn parse_recipes_create() {
        let cli = parse(&[
            "recipes",
            "create",
            "--meal-id",
            "meal_1",
            "--ingredients-json",
            r#"[{"ingredient_id":"ing_1"}]"#,
            "--steps-json",
            r#"[{"step_number":1,"instruction":"Do it"}]"#,
        ]);
        match &cli.command {
            Commands::Recipes(cmd) => match &cmd.action {
                RecipesAction::Create {
                    meal_id,
                    ingredients_json,
                    steps_json,
                } => {
                    assert_eq!(meal_id, "meal_1");
                    assert!(ingredients_json.contains("ing_1"));
                    assert!(steps_json.is_some());
                }
                _ => panic!("expected Create"),
            },
            _ => panic!("expected Recipes"),
        }
    }

    #[test]
    fn parse_recipes_update_with_clear_steps() {
        let cli = parse(&["recipes", "update", "recipe_1", "--clear-steps"]);
        match &cli.command {
            Commands::Recipes(cmd) => match &cmd.action {
                RecipesAction::Update {
                    id, clear_steps, steps_json, ..
                } => {
                    assert_eq!(id, "recipe_1");
                    assert!(*clear_steps);
                    assert!(steps_json.is_none());
                }
                _ => panic!("expected Update"),
            },
            _ => panic!("expected Recipes"),
        }
    }

    #[test]
    fn parse_recipes_delete() {
        let cli = parse(&["recipes", "delete", "recipe_1"]);
        match &cli.command {
            Commands::Recipes(cmd) => match &cmd.action {
                RecipesAction::Delete { id } => {
                    assert_eq!(id, "recipe_1");
                }
                _ => panic!("expected Delete"),
            },
            _ => panic!("expected Recipes"),
        }
    }

    #[test]
    fn parse_ingredients_list() {
        let cli = parse(&["ingredients", "list"]);
        assert!(matches!(cli.command, Commands::Ingredients(ref cmd)
            if matches!(cmd.action, IngredientsAction::List)));
    }

    #[test]
    fn parse_ingredients_get() {
        let cli = parse(&["ingredients", "get", "ing_1"]);
        match &cli.command {
            Commands::Ingredients(cmd) => match &cmd.action {
                IngredientsAction::Get { id } => {
                    assert_eq!(id, "ing_1");
                }
                _ => panic!("expected Get"),
            },
            _ => panic!("expected Ingredients"),
        }
    }

    #[test]
    fn parse_ingredients_create() {
        let cli = parse(&[
            "ingredients",
            "create",
            "--name",
            "Tomatoes",
            "--store-section",
            "Produce",
        ]);
        match &cli.command {
            Commands::Ingredients(cmd) => match &cmd.action {
                IngredientsAction::Create {
                    name,
                    store_section,
                } => {
                    assert_eq!(name, "Tomatoes");
                    assert_eq!(store_section, "Produce");
                }
                _ => panic!("expected Create"),
            },
            _ => panic!("expected Ingredients"),
        }
    }

    #[test]
    fn parse_ingredients_update() {
        let cli = parse(&["ingredients", "update", "ing_1", "--name", "Roma Tomatoes"]);
        match &cli.command {
            Commands::Ingredients(cmd) => match &cmd.action {
                IngredientsAction::Update {
                    id,
                    name,
                    store_section,
                } => {
                    assert_eq!(id, "ing_1");
                    assert_eq!(name.as_deref(), Some("Roma Tomatoes"));
                    assert!(store_section.is_none());
                }
                _ => panic!("expected Update"),
            },
            _ => panic!("expected Ingredients"),
        }
    }

    #[test]
    fn parse_ingredients_delete() {
        let cli = parse(&["ingredients", "delete", "ing_1"]);
        match &cli.command {
            Commands::Ingredients(cmd) => match &cmd.action {
                IngredientsAction::Delete { id } => {
                    assert_eq!(id, "ing_1");
                }
                _ => panic!("expected Delete"),
            },
            _ => panic!("expected Ingredients"),
        }
    }

    #[test]
    fn parse_meals_update_partial() {
        let cli = parse(&["meals", "update", "meal_1", "--name", "New Name"]);
        match &cli.command {
            Commands::Meals(cmd) => match &cmd.action {
                MealsAction::Update {
                    id,
                    name,
                    meal_type,
                    effort,
                    url,
                    ..
                } => {
                    assert_eq!(id, "meal_1");
                    assert_eq!(name.as_deref(), Some("New Name"));
                    assert!(meal_type.is_none());
                    assert!(effort.is_none());
                    assert!(url.is_none());
                }
                _ => panic!("expected Update"),
            },
            _ => panic!("expected Meals"),
        }
    }
}
