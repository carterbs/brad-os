mod cli;
mod client;
mod commands;
mod error;
mod output;
mod types;

use clap::Parser;
use std::process;

use cli::{
    Cli, Commands, HealthSyncAction, IngredientsAction, MealplanAction, MealsAction,
    RecipesAction, ShoppinglistAction,
};
use client::ApiClient;
use output::print_error;

fn run() -> Result<(), error::CliError> {
    let cli = Cli::parse();
    let client = ApiClient::from_env(cli.dev)?;

    match cli.command {
        Commands::Mealplan(cmd) => match cmd.action {
            MealplanAction::Generate => commands::mealplan::generate(&client)?,
            MealplanAction::Latest => commands::mealplan::latest(&client)?,
            MealplanAction::Get { session_id } => {
                commands::mealplan::get(&client, &session_id)?;
            }
            MealplanAction::Critique {
                session_id,
                message,
            } => {
                commands::mealplan::critique(&client, &session_id, &message)?;
            }
            MealplanAction::Finalize { session_id } => {
                commands::mealplan::finalize(&client, &session_id)?;
            }
        },
        Commands::Meals(cmd) => match cmd.action {
            MealsAction::List => commands::meals::list(&client)?,
            MealsAction::Get { id } => commands::meals::get(&client, &id)?,
            MealsAction::Create {
                name,
                meal_type,
                effort,
                has_red_meat,
                prep_ahead,
                url,
            } => {
                commands::meals::create(
                    &client,
                    &name,
                    &meal_type,
                    effort,
                    has_red_meat,
                    prep_ahead,
                    &url,
                )?;
            }
            MealsAction::Update {
                id,
                name,
                meal_type,
                effort,
                has_red_meat,
                no_red_meat,
                prep_ahead,
                no_prep_ahead,
                url,
            } => {
                // Resolve boolean toggle flags
                let red_meat_val = if has_red_meat {
                    Some(true)
                } else if no_red_meat {
                    Some(false)
                } else {
                    None
                };
                let prep_ahead_val = if prep_ahead {
                    Some(true)
                } else if no_prep_ahead {
                    Some(false)
                } else {
                    None
                };

                commands::meals::update(
                    &client,
                    &id,
                    name.as_deref(),
                    meal_type.as_deref(),
                    effort,
                    red_meat_val,
                    prep_ahead_val,
                    url.as_deref(),
                )?;
            }
            MealsAction::Delete { id } => commands::meals::delete(&client, &id)?,
        },
        Commands::HealthSync(cmd) => match cmd.action {
            HealthSyncAction::Recovery { date } => {
                commands::health_sync::recovery(&client, date.as_deref())?;
            }
            HealthSyncAction::RecoveryHistory { days } => {
                commands::health_sync::recovery_history(&client, days)?;
            }
            HealthSyncAction::Baseline => commands::health_sync::baseline(&client)?,
            HealthSyncAction::Weight { days } => {
                commands::health_sync::weight(&client, days)?;
            }
            HealthSyncAction::Hrv { days } => {
                commands::health_sync::hrv(&client, days)?;
            }
            HealthSyncAction::Rhr { days } => {
                commands::health_sync::rhr(&client, days)?;
            }
            HealthSyncAction::Sleep { days } => {
                commands::health_sync::sleep(&client, days)?;
            }
        },
        Commands::Shoppinglist(cmd) => match cmd.action {
            ShoppinglistAction::Generate { session_id } => {
                commands::shoppinglist::generate(&client, session_id.as_deref())?;
            }
        },
        Commands::Recipes(cmd) => match cmd.action {
            RecipesAction::List => commands::recipes::list(&client)?,
            RecipesAction::Get { id, meal_id } => {
                commands::recipes::get(&client, id.as_deref(), meal_id.as_deref())?;
            }
            RecipesAction::Create {
                meal_id,
                ingredients_json,
                steps_json,
            } => {
                commands::recipes::create(
                    &client,
                    &meal_id,
                    &ingredients_json,
                    steps_json.as_deref(),
                )?;
            }
            RecipesAction::Update {
                id,
                ingredients_json,
                steps_json,
                clear_steps,
            } => {
                commands::recipes::update(
                    &client,
                    &id,
                    ingredients_json.as_deref(),
                    steps_json.as_deref(),
                    clear_steps,
                )?;
            }
            RecipesAction::Delete { id } => commands::recipes::delete(&client, &id)?,
        },
        Commands::Ingredients(cmd) => match cmd.action {
            IngredientsAction::List => commands::ingredients::list(&client)?,
            IngredientsAction::Get { id } => commands::ingredients::get(&client, &id)?,
            IngredientsAction::Create {
                name,
                store_section,
            } => {
                commands::ingredients::create(&client, &name, &store_section)?;
            }
            IngredientsAction::Update {
                id,
                name,
                store_section,
            } => {
                commands::ingredients::update(
                    &client,
                    &id,
                    name.as_deref(),
                    store_section.as_deref(),
                )?;
            }
            IngredientsAction::Delete { id } => commands::ingredients::delete(&client, &id)?,
        },
    }

    Ok(())
}

fn main() {
    match run() {
        Ok(()) => process::exit(0),
        Err(err) => {
            print_error(&err);
            process::exit(1);
        }
    }
}
