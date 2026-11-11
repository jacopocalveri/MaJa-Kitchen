export const MEAL_SLOTS = ['lunch', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export type MeasurementUnit = 'g' | 'kg' | 'ml' | 'l' | 'pz';
export type StorageLocation = 'pantry' | 'fridge' | 'freezer';
export type IngredientCategory =
  'fruit-vegetables' | 'dairy' | 'meat-fish' | 'bakery' | 'pantry' | 'other';
export type NutritionGroup = 'carbohydrate' | 'protein' | 'vegetable' | 'other';
export type RecipeCategory = 'breakfast' | 'lunch' | 'dinner' | 'other';
export type WorkflowStatus = 'draft' | 'approved';

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  nutritionGroups: NutritionGroup[];
}

export interface PantryItem {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: MeasurementUnit;
  location: StorageLocation;
  expiresOn: string | null;
}

export interface RecipeIngredient {
  ingredientId: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  category: RecipeCategory;
  tags: string[];
  instructions: string[];
  ingredients: RecipeIngredient[];
  favorite: boolean;
  excludedFromPlan: boolean;
  repeatable: boolean;
}

export interface CookingHistoryEntry {
  recipeId: string;
  cookedOn: string;
}

export interface PlanSlot {
  date: string;
  slot: MealSlot;
  locked: boolean;
  recipeId?: string | null;
  sideRecipeId?: string | null;
  additionalRecipeIds?: string[];
}

export interface PlannedMeal extends PlanSlot {
  recipeId: string | null;
  additionalRecipeIds: string[];
  score: number;
  reason: string;
}

export interface PlannerWeights {
  pantryUse: number;
  expiringIngredient: number;
  favorite: number;
  recentCooking: number;
  repeatedInWeek: number;
}

export interface ShoppingNeed {
  ingredientId: string;
  name: string;
  category: IngredientCategory;
}

export interface ShoppingListEntry extends ShoppingNeed {
  id: string;
  quantity: number | null;
  unit: MeasurementUnit;
  checked: boolean;
  manual: boolean;
}

export interface MealPlan {
  status: WorkflowStatus;
  meals: PlannedMeal[];
  approvedAt: string | null;
}

export interface ShoppingList {
  status: WorkflowStatus;
  items: ShoppingListEntry[];
  approvedAt: string | null;
  completedAt: string | null;
}
