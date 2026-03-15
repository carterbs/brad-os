export interface ShoppingListItem {
  ingredient_id: string;
  name: string;
  store_section: string;
  total_quantity: number | null;
  unit: string | null;
  meal_count: number;
  display_text: string;
}

export interface ShoppingListSection {
  name: string;
  sort_order: number;
  items: ShoppingListItem[];
}

export interface ShoppingListResult {
  sections: ShoppingListSection[];
}
