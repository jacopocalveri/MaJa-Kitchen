import {
  IngredientCategory,
  MeasurementUnit,
  NutritionGroup,
  RecipeCategory,
  StorageLocation,
  WorkflowStatus,
} from './kitchen.models';

type Table<Row extends Record<string, unknown>, Insert extends Record<string, unknown>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type HouseholdRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
};

export type IngredientRow = {
  id: string;
  household_id: string;
  canonical_name: string;
  name: string;
  category: IngredientCategory;
  nutrition_groups: NutritionGroup[];
  created_at: string;
};

export type PantryItemRow = {
  id: string;
  household_id: string;
  ingredient_id: string;
  quantity: number;
  unit: MeasurementUnit;
  location: StorageLocation;
  expires_on: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeRow = {
  id: string;
  household_id: string;
  title: string;
  description: string;
  servings: number;
  prep_minutes: number;
  category: RecipeCategory;
  tags: string[];
  instructions: string[];
  favorite: boolean;
  excluded_from_plan: boolean;
  repeatable: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredientRow = {
  household_id: string;
  recipe_id: string;
  ingredient_id: string;
};

export type MealPlanRow = {
  id: string;
  household_id: string;
  week_start: string;
  status: WorkflowStatus;
  is_active: boolean;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type MealPlanEntryRow = {
  id: string;
  household_id: string;
  meal_plan_id: string;
  meal_date: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'other';
  recipe_id: string | null;
  side_recipe_id: string | null;
  locked: boolean;
  score: number;
  reason: string;
  created_at: string;
};

export type MealPlanEntryAdditionalRecipeRow = {
  household_id: string;
  meal_plan_entry_id: string;
  recipe_id: string;
  sort_order: number;
};

export type ShoppingListRow = {
  id: string;
  household_id: string;
  meal_plan_id: string;
  status: WorkflowStatus;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ShoppingListItemRow = {
  id: string;
  household_id: string;
  shopping_list_id: string;
  ingredient_id: string | null;
  name: string;
  category: IngredientCategory;
  quantity: number | null;
  unit: MeasurementUnit;
  checked: boolean;
  manual: boolean;
  created_at: string;
};

export type CookingHistoryRow = {
  id: string;
  household_id: string;
  recipe_id: string;
  cooked_on: string;
  cooked_by: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      households: Table<
        HouseholdRow,
        Pick<HouseholdRow, 'name' | 'created_by'> & Partial<Pick<HouseholdRow, 'id'>>
      >;
      household_members: Table<
        HouseholdMemberRow,
        Pick<HouseholdMemberRow, 'household_id' | 'user_id'> &
          Partial<Pick<HouseholdMemberRow, 'role'>>
      >;
      ingredients: Table<
        IngredientRow,
        Pick<IngredientRow, 'household_id' | 'canonical_name' | 'name' | 'category'> &
          Partial<Pick<IngredientRow, 'id' | 'nutrition_groups'>>
      >;
      pantry_items: Table<
        PantryItemRow,
        Pick<PantryItemRow, 'household_id' | 'ingredient_id' | 'quantity' | 'unit' | 'location'> &
          Partial<Pick<PantryItemRow, 'id' | 'expires_on'>>
      >;
      recipes: Table<
        RecipeRow,
        Pick<
          RecipeRow,
          'household_id' | 'title' | 'servings' | 'prep_minutes' | 'category' | 'created_by'
        > &
          Partial<
            Pick<
              RecipeRow,
              | 'id'
              | 'description'
              | 'tags'
              | 'instructions'
              | 'favorite'
              | 'excluded_from_plan'
              | 'repeatable'
            >
          >
      >;
      recipe_ingredients: Table<
        RecipeIngredientRow,
        Pick<RecipeIngredientRow, 'household_id' | 'recipe_id' | 'ingredient_id'>
      >;
      meal_plans: Table<
        MealPlanRow,
        Pick<MealPlanRow, 'household_id' | 'week_start' | 'created_by'> &
          Partial<Pick<MealPlanRow, 'id' | 'status' | 'is_active' | 'approved_by' | 'approved_at'>>
      >;
      meal_plan_entries: Table<
        MealPlanEntryRow,
        Pick<MealPlanEntryRow, 'household_id' | 'meal_plan_id' | 'meal_date' | 'slot'> &
          Partial<
            Pick<
              MealPlanEntryRow,
              'id' | 'recipe_id' | 'side_recipe_id' | 'locked' | 'score' | 'reason'
            >
          >
      >;
      meal_plan_entry_additional_recipes: Table<
        MealPlanEntryAdditionalRecipeRow,
        Pick<
          MealPlanEntryAdditionalRecipeRow,
          'household_id' | 'meal_plan_entry_id' | 'recipe_id'
        > &
          Partial<Pick<MealPlanEntryAdditionalRecipeRow, 'sort_order'>>
      >;
      shopping_lists: Table<
        ShoppingListRow,
        Pick<ShoppingListRow, 'household_id' | 'meal_plan_id' | 'created_by'> &
          Partial<
            Pick<ShoppingListRow, 'id' | 'status' | 'approved_by' | 'approved_at' | 'completed_at'>
          >
      >;
      shopping_list_items: Table<
        ShoppingListItemRow,
        Pick<
          ShoppingListItemRow,
          'household_id' | 'shopping_list_id' | 'name' | 'category' | 'quantity' | 'unit'
        > &
          Partial<Pick<ShoppingListItemRow, 'id' | 'ingredient_id' | 'checked' | 'manual'>>
      >;
      cooking_history: Table<
        CookingHistoryRow,
        Pick<CookingHistoryRow, 'household_id' | 'recipe_id' | 'cooked_by'> &
          Partial<Pick<CookingHistoryRow, 'id' | 'cooked_on'>>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_household_with_seed: {
        Args: { p_name?: string };
        Returns: string;
      };
      is_household_member: {
        Args: { target_household_id: string };
        Returns: boolean;
      };
      approve_meal_plan: {
        Args: { p_meal_plan_id: string };
        Returns: undefined;
      };
      complete_shopping_list: {
        Args: { p_shopping_list_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
