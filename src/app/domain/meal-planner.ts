import {
  CookingHistoryEntry,
  Ingredient,
  PantryItem,
  PlannedMeal,
  PlanSlot,
  PlannerWeights,
  Recipe,
} from './kitchen.models';
import {
  isCompatibleSideDish,
  isNutritionallyComplete,
  recipeMacroGroups,
  type MacroGroup,
} from './nutrition-groups';

export const DEFAULT_PLANNER_WEIGHTS: PlannerWeights = {
  pantryUse: 3,
  expiringIngredient: 5,
  favorite: 2,
  recentCooking: 4,
  repeatedInWeek: 8,
};

interface ScoreBreakdown {
  pantryUse: number;
  expiringIngredient: number;
  favorite: number;
  recentCooking: number;
  repeatedInWeek: number;
}

export interface GeneratePlanOptions {
  slots: readonly PlanSlot[];
  recipes: readonly Recipe[];
  pantryItems: readonly PantryItem[];
  cookingHistory: readonly CookingHistoryEntry[];
  today: string;
  weights?: Partial<PlannerWeights>;
  ingredients: readonly Ingredient[];
}

export function isSideDishRecipe(recipe: Recipe): boolean {
  return recipe.tags.includes('contorno');
}

export function isMainPlanRecipe(recipe: Recipe): boolean {
  return !recipe.excludedFromPlan && !isSideDishRecipe(recipe);
}

export function isAvailableSideDish(recipe: Recipe): boolean {
  return !recipe.excludedFromPlan && isSideDishRecipe(recipe);
}

export function needsSideDish(recipe: Recipe, ingredients: readonly Ingredient[]): boolean {
  return !isNutritionallyComplete(recipeMacroGroups(recipe, ingredients));
}

export function requiresSideDishForMeal(
  meal: PlannedMeal,
  recipes: readonly Recipe[],
  ingredients: readonly Ingredient[],
): boolean {
  if (!meal.recipeId) {
    return false;
  }
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const mainIds = [
    meal.recipeId,
    ...meal.additionalRecipeIds.filter((id) => {
      const recipe = recipeById.get(id);
      return recipe !== undefined && !isSideDishRecipe(recipe);
    }),
  ];
  const groups = new Set<MacroGroup>();
  for (const id of mainIds) {
    const recipe = recipeById.get(id);
    if (!recipe) {
      continue;
    }
    for (const group of recipeMacroGroups(recipe, ingredients)) {
      groups.add(group);
    }
  }
  return !isNutritionallyComplete(groups);
}

export function isSideDishCompatibleWithMain(
  main: Recipe,
  side: Recipe,
  ingredients: readonly Ingredient[],
): boolean {
  return isCompatibleSideDish(
    recipeMacroGroups(main, ingredients),
    recipeMacroGroups(side, ingredients),
  );
}

export function isMealCompositionValid(
  meal: PlannedMeal,
  recipes: readonly Recipe[],
  ingredients: readonly Ingredient[],
): boolean {
  if (!meal.recipeId) {
    return !meal.sideRecipeId && meal.additionalRecipeIds.length === 0;
  }

  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const allIds = [meal.recipeId, meal.sideRecipeId, ...meal.additionalRecipeIds].filter(
    (id): id is string => id !== null && id !== undefined,
  );
  if (new Set(allIds).size !== allIds.length) {
    return false;
  }

  const mainRecipes: Recipe[] = [];
  const sideRecipes: Recipe[] = [];
  const main = recipeById.get(meal.recipeId);
  if (!main || !isMainPlanRecipe(main)) {
    return false;
  }
  mainRecipes.push(main);

  if (meal.sideRecipeId) {
    const side = recipeById.get(meal.sideRecipeId);
    if (!side || !isAvailableSideDish(side)) {
      return false;
    }
    sideRecipes.push(side);
  }

  for (const id of meal.additionalRecipeIds) {
    const recipe = recipeById.get(id);
    if (!recipe) {
      return false;
    }
    if (isSideDishRecipe(recipe)) {
      if (!isAvailableSideDish(recipe)) {
        return false;
      }
      sideRecipes.push(recipe);
    } else {
      if (!isMainPlanRecipe(recipe)) {
        return false;
      }
      mainRecipes.push(recipe);
    }
  }

  const mainGroups = new Set<MacroGroup>();
  let mainCarbohydrateRecipes = 0;
  for (const recipe of mainRecipes) {
    const groups = recipeMacroGroups(recipe, ingredients);
    if (groups.has('carbohydrate')) {
      mainCarbohydrateRecipes += 1;
    }
    for (const group of groups) {
      mainGroups.add(group);
    }
  }
  if (
    mainCarbohydrateRecipes > 1 ||
    (isNutritionallyComplete(mainGroups) && sideRecipes.length > 0)
  ) {
    return false;
  }

  const coveredGroups = new Set(mainGroups);
  for (const side of sideRecipes) {
    const sideGroups = recipeMacroGroups(side, ingredients);
    if (!isCompatibleSideDish(coveredGroups, sideGroups)) {
      return false;
    }
    for (const group of sideGroups) {
      coveredGroups.add(group);
    }
  }
  return true;
}

export function isMealReadyForApproval(
  meal: PlannedMeal,
  recipes: readonly Recipe[],
  ingredients: readonly Ingredient[],
): boolean {
  if (!isMealCompositionValid(meal, recipes, ingredients) || !meal.recipeId) {
    return !meal.recipeId && isMealCompositionValid(meal, recipes, ingredients);
  }
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const mainGroups = new Set<MacroGroup>();
  const mainIds = [
    meal.recipeId,
    ...meal.additionalRecipeIds.filter((id) => {
      const recipe = recipeById.get(id);
      return recipe !== undefined && !isSideDishRecipe(recipe);
    }),
  ];
  for (const id of mainIds) {
    const recipe = recipeById.get(id);
    if (!recipe) {
      return false;
    }
    for (const group of recipeMacroGroups(recipe, ingredients)) {
      mainGroups.add(group);
    }
  }
  const hasSideDish =
    Boolean(meal.sideRecipeId) ||
    meal.additionalRecipeIds.some((id) => {
      const recipe = recipeById.get(id);
      return recipe !== undefined && isSideDishRecipe(recipe);
    });
  return isNutritionallyComplete(mainGroups) || hasSideDish;
}

export function canAddAdditionalRecipe(
  meal: PlannedMeal,
  candidate: Recipe,
  recipes: readonly Recipe[],
): boolean {
  if (
    !meal.recipeId ||
    meal.recipeId === candidate.id ||
    meal.sideRecipeId === candidate.id ||
    meal.additionalRecipeIds.includes(candidate.id)
  ) {
    return false;
  }
  return (
    recipes.some((recipe) => recipe.id === candidate.id) &&
    (isMainPlanRecipe(candidate) || isAvailableSideDish(candidate))
  );
}

export function chooseSideDish(
  main: Recipe,
  options: GeneratePlanOptions,
  usedSideRecipeIds: ReadonlySet<string> = new Set(),
  weights: PlannerWeights = DEFAULT_PLANNER_WEIGHTS,
): Recipe | null {
  if (!needsSideDish(main, options.ingredients)) {
    return null;
  }
  const mainGroups = recipeMacroGroups(main, options.ingredients);
  const candidates = options.recipes.filter(
    (recipe) =>
      isAvailableSideDish(recipe) &&
      isSideDishCompatibleWithMain(main, recipe, options.ingredients),
  );
  return (
    chooseRecipe(
      candidates,
      options,
      usedSideRecipeIds,
      weights,
      (side) =>
        [...recipeMacroGroups(side, options.ingredients)].filter((group) => !mainGroups.has(group))
          .length,
    )?.recipe ?? null
  );
}

export function generateWeeklyPlan(options: GeneratePlanOptions): PlannedMeal[] {
  const weights = { ...DEFAULT_PLANNER_WEIGHTS, ...options.weights };
  const eligible = options.recipes
    .filter(isMainPlanRecipe)
    .sort((a, b) => a.id.localeCompare(b.id));
  const sideDishes = options.recipes
    .filter(isAvailableSideDish)
    .sort((left, right) => left.id.localeCompare(right.id));
  const usedRecipeIds = new Set(
    options.slots
      .filter((slot) => slot.locked && slot.recipeId)
      .map((slot) => slot.recipeId)
      .filter((recipeId): recipeId is string => recipeId !== null && recipeId !== undefined),
  );
  const usedSideRecipeIds = new Set(
    options.slots
      .filter((slot) => slot.locked && slot.sideRecipeId)
      .map((slot) => slot.sideRecipeId)
      .filter((recipeId): recipeId is string => recipeId !== null && recipeId !== undefined),
  );
  const plan: PlannedMeal[] = [];

  for (const slot of options.slots) {
    if (slot.locked) {
      const recipeId = slot.recipeId ?? null;
      if (recipeId) {
        usedRecipeIds.add(recipeId);
      }
      plan.push({
        ...slot,
        recipeId,
        sideRecipeId: slot.sideRecipeId ?? null,
        additionalRecipeIds: slot.additionalRecipeIds ?? [],
        score: 0,
        reason: recipeId ? 'Pasto bloccato' : 'Slot bloccato e vuoto',
      });
      continue;
    }

    const unused = eligible.filter((recipe) => !usedRecipeIds.has(recipe.id));
    const candidates = unused.length > 0 ? unused : eligible;
    const ranked = candidates
      .map((recipe) => {
        const breakdown = scoreRecipe(recipe, options, usedRecipeIds, weights);
        return {
          recipe,
          score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
          breakdown,
        };
      })
      .sort(
        (left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id),
      );
    const selected = ranked[0];

    if (!selected) {
      plan.push({
        ...slot,
        recipeId: null,
        sideRecipeId: null,
        additionalRecipeIds: [],
        score: 0,
        reason: 'Nessuna ricetta disponibile',
      });
      continue;
    }

    usedRecipeIds.add(selected.recipe.id);
    plan.push({
      ...slot,
      recipeId: selected.recipe.id,
      sideRecipeId: null,
      additionalRecipeIds: [],
      score: selected.score,
      reason: explainScore(selected.recipe, selected.breakdown),
    });
  }

  return plan.map((meal, index) => {
    if (!meal.recipeId) {
      return { ...meal, sideRecipeId: null, additionalRecipeIds: [] };
    }

    const main = options.recipes.find((recipe) => recipe.id === meal.recipeId);
    if (!main || !needsSideDish(main, options.ingredients)) {
      return { ...meal, sideRecipeId: null };
    }

    const lockedSideId = options.slots[index]?.locked ? options.slots[index]?.sideRecipeId : null;
    const lockedSide = sideDishes.find(
      (recipe) =>
        recipe.id === lockedSideId &&
        isSideDishCompatibleWithMain(main, recipe, options.ingredients),
    );
    if (lockedSide) {
      usedSideRecipeIds.add(lockedSide.id);
      return { ...meal, sideRecipeId: lockedSide.id };
    }

    const selectedSide = chooseSideDish(main, options, usedSideRecipeIds, weights);
    if (!selectedSide) {
      return { ...meal, sideRecipeId: null };
    }
    usedSideRecipeIds.add(selectedSide.id);
    return { ...meal, sideRecipeId: selectedSide.id };
  });
}

function chooseRecipe(
  candidates: readonly Recipe[],
  options: GeneratePlanOptions,
  usedRecipeIds: ReadonlySet<string>,
  weights: PlannerWeights,
  coverageScore: (recipe: Recipe) => number = () => 0,
): { recipe: Recipe; score: number; breakdown: ScoreBreakdown } | null {
  const ranked = candidates
    .map((recipe) => {
      const breakdown = scoreRecipe(recipe, options, usedRecipeIds, weights);
      return {
        recipe,
        coverage: coverageScore(recipe),
        score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
        breakdown,
      };
    })
    .sort(
      (left, right) =>
        right.coverage - left.coverage ||
        right.score - left.score ||
        left.recipe.id.localeCompare(right.recipe.id),
    );
  return ranked[0] ?? null;
}

function scoreRecipe(
  recipe: Recipe,
  options: GeneratePlanOptions,
  usedRecipeIds: ReadonlySet<string>,
  weights: PlannerWeights,
): ScoreBreakdown {
  const ingredientIds = new Set(recipe.ingredients.map((ingredient) => ingredient.ingredientId));
  const inStockIds = new Set(
    options.pantryItems
      .filter(
        (item) =>
          item.quantity > 0 &&
          (item.expiresOn === null || daysBetween(options.today, item.expiresOn) >= 0),
      )
      .map((item) => item.ingredientId),
  );
  const stockedCount = [...ingredientIds].filter((id) => inStockIds.has(id)).length;
  const pantryUse =
    ingredientIds.size === 0 ? 0 : (stockedCount / ingredientIds.size) * weights.pantryUse;
  const expiringIds = new Set(
    options.pantryItems
      .filter(
        (item) =>
          item.expiresOn !== null &&
          daysBetween(options.today, item.expiresOn) >= 0 &&
          daysBetween(options.today, item.expiresOn) <= 3,
      )
      .map((item) => item.ingredientId),
  );
  const expiringCount = [...ingredientIds].filter((id) => expiringIds.has(id)).length;
  const expiringIngredient = expiringCount * weights.expiringIngredient;
  const favorite = recipe.favorite ? weights.favorite : 0;
  const mostRecentCook = options.cookingHistory
    .filter((entry) => entry.recipeId === recipe.id)
    .map((entry) => daysBetween(entry.cookedOn, options.today))
    .filter((days) => days >= 0 && days <= 21)
    .sort((left, right) => left - right)[0];
  const recentCooking =
    mostRecentCook === undefined ? 0 : -weights.recentCooking * ((21 - mostRecentCook) / 21);
  const repeatedInWeek =
    usedRecipeIds.has(recipe.id) && !recipe.repeatable ? -weights.repeatedInWeek : 0;

  return { pantryUse, expiringIngredient, favorite, recentCooking, repeatedInWeek };
}

function explainScore(recipe: Recipe, score: ScoreBreakdown): string {
  const reasons: string[] = [];
  if (score.expiringIngredient > 0) {
    reasons.push('usa ingredienti in scadenza');
  }
  if (score.pantryUse > 0) {
    reasons.push('usa ingredienti già disponibili');
  }
  if (score.favorite > 0) {
    reasons.push('è tra i preferiti');
  }
  if (score.recentCooking < 0) {
    reasons.push('bilancia una preparazione recente');
  }
  if (score.repeatedInWeek < 0) {
    reasons.push('ripetizione necessaria per il numero di pasti');
  }
  if (reasons.length === 0) {
    reasons.push('varia il piano');
  }
  return `${recipe.title}: ${reasons.join(', ')}`;
}

function daysBetween(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toTime - fromTime) / 86_400_000);
}
