import { Ingredient, MeasurementUnit, PlannedMeal, Recipe, ShoppingNeed } from './kitchen.models';

interface ShoppingCalculationOptions {
  planStatus: 'draft' | 'approved';
  meals: readonly PlannedMeal[];
  recipes: readonly Recipe[];
  ingredients: readonly Ingredient[];
}

type Dimension = 'mass' | 'volume' | 'count';
type BaseUnit = 'g' | 'ml' | 'pz';

const UNIT_FACTORS: Record<MeasurementUnit, { dimension: Dimension; factor: number }> = {
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  l: { dimension: 'volume', factor: 1000 },
  pz: { dimension: 'count', factor: 1 },
};

const BASE_UNITS: Record<Dimension, BaseUnit> = {
  mass: 'g',
  volume: 'ml',
  count: 'pz',
};

export function calculateShoppingNeeds({
  planStatus,
  meals,
  recipes,
  ingredients,
}: ShoppingCalculationOptions): ShoppingNeed[] {
  if (planStatus !== 'approved') {
    throw new Error('La lista della spesa può essere calcolata solo da un piano approvato.');
  }

  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const required = new Set<string>();

  for (const meal of meals) {
    for (const recipeId of [meal.recipeId, meal.sideRecipeId, ...meal.additionalRecipeIds]) {
      if (!recipeId) {
        continue;
      }
      const recipe = recipeById.get(recipeId);
      if (!recipe) {
        throw new Error(`Ricetta non trovata: ${recipeId}`);
      }
      for (const item of recipe.ingredients) {
        required.add(item.ingredientId);
      }
    }
  }

  const needs: ShoppingNeed[] = [];
  for (const ingredientId of required) {
    const ingredient = ingredientById.get(ingredientId);
    if (!ingredient) {
      throw new Error(`Ingrediente non trovato: ${ingredientId}`);
    }
    needs.push({
      ingredientId,
      name: ingredient.name,
      category: ingredient.category,
    });
  }

  return needs.sort(
    (left, right) =>
      left.category.localeCompare(right.category) || left.name.localeCompare(right.name),
  );
}

export function convertCompatibleQuantity(
  quantity: number,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
): number | null {
  const from = UNIT_FACTORS[fromUnit];
  const to = UNIT_FACTORS[toUnit];
  if (from.dimension !== to.dimension) {
    return null;
  }
  return roundQuantity((quantity * from.factor) / to.factor);
}

function roundQuantity(quantity: number): number {
  return Math.round((quantity + Number.EPSILON) * 100) / 100;
}
