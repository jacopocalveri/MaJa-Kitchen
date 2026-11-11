import { Injectable } from '@angular/core';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  Ingredient,
  MealPlan,
  PantryItem,
  PlannedMeal,
  Recipe,
  ShoppingList,
  ShoppingListEntry,
  MeasurementUnit,
  NutritionGroup,
} from '../domain/kitchen.models';
import type {
  CookingHistoryRow,
  IngredientRow,
  MealPlanEntryAdditionalRecipeRow,
  MealPlanEntryRow,
  MealPlanRow,
  PantryItemRow,
  RecipeIngredientRow,
  RecipeRow,
  ShoppingListItemRow,
  ShoppingListRow,
  Database,
} from '../domain/database.types';
import { SupabaseConnection } from './supabase-connection';

export interface KitchenSnapshot {
  ingredients: Ingredient[];
  pantryItems: PantryItem[];
  recipes: Recipe[];
  cookingHistory: { recipeId: string; cookedOn: string }[];
  mealPlan: MealPlan;
  shoppingList: ShoppingList;
  mealPlanId: string | null;
  shoppingListId: string | null;
}

export type ShoppingListChange =
  { eventType: 'DELETE'; id: string } | { eventType: 'INSERT' | 'UPDATE'; item: ShoppingListEntry };

@Injectable({ providedIn: 'root' })
export class SupabaseKitchenRepository {
  constructor(private readonly connection: SupabaseConnection) {}

  async loadSnapshot(householdId: string): Promise<KitchenSnapshot> {
    const client = await this.requireClient();
    const [
      ingredientResult,
      pantryResult,
      recipeResult,
      recipeIngredientResult,
      historyResult,
      planResult,
    ] = await Promise.all([
      client.from('ingredients').select('*').eq('household_id', householdId).order('name'),
      client.from('pantry_items').select('*').eq('household_id', householdId).order('created_at'),
      client.from('recipes').select('*').eq('household_id', householdId).order('title'),
      client
        .from('recipe_ingredients')
        .select('*')
        .eq('household_id', householdId)
        .order('recipe_id'),
      client
        .from('cooking_history')
        .select('*')
        .eq('household_id', householdId)
        .order('cooked_on', { ascending: false }),
      client
        .from('meal_plans')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    throwIfError(ingredientResult.error);
    throwIfError(pantryResult.error);
    throwIfError(recipeResult.error);
    throwIfError(recipeIngredientResult.error);
    throwIfError(historyResult.error);
    throwIfError(planResult.error);

    const ingredients = (ingredientResult.data ?? []).map(mapIngredient);
    const pantryItems = (pantryResult.data ?? []).map(mapPantryItem);
    const recipeIngredients = groupRecipeIngredients(recipeIngredientResult.data ?? []);
    const recipes = (recipeResult.data ?? []).map((row) =>
      mapRecipe(row, recipeIngredients.get(row.id) ?? []),
    );
    const cookingHistory = (historyResult.data ?? []).map(mapCookingHistory);

    if (!planResult.data) {
      return {
        ingredients,
        pantryItems,
        recipes,
        cookingHistory,
        mealPlan: { status: 'draft', meals: [], approvedAt: null },
        shoppingList: {
          status: 'draft',
          items: [],
          approvedAt: null,
          completedAt: null,
        },
        mealPlanId: null,
        shoppingListId: null,
      };
    }

    const planRow = planResult.data;
    const entryResult = await client
      .from('meal_plan_entries')
      .select('*')
      .eq('household_id', householdId)
      .eq('meal_plan_id', planRow.id)
      .order('meal_date')
      .order('slot');
    throwIfError(entryResult.error);
    const additionalRecipeResult = (entryResult.data ?? []).length
      ? await client
          .from('meal_plan_entry_additional_recipes')
          .select('*')
          .eq('household_id', householdId)
          .in(
            'meal_plan_entry_id',
            (entryResult.data ?? []).map((entry) => entry.id),
          )
          .order('sort_order')
      : null;
    if (additionalRecipeResult) {
      throwIfError(additionalRecipeResult.error);
    }

    const shoppingListResult = await client
      .from('shopping_lists')
      .select('*')
      .eq('household_id', householdId)
      .eq('meal_plan_id', planRow.id)
      .maybeSingle();
    throwIfError(shoppingListResult.error);

    const shoppingListRow = shoppingListResult.data;
    const shoppingItemsResult = shoppingListRow
      ? await client
          .from('shopping_list_items')
          .select('*')
          .eq('household_id', householdId)
          .eq('shopping_list_id', shoppingListRow.id)
          .order('category')
          .order('name')
      : null;
    if (shoppingItemsResult) {
      throwIfError(shoppingItemsResult.error);
    }

    return {
      ingredients,
      pantryItems,
      recipes,
      cookingHistory,
      mealPlan: mapMealPlan(planRow, entryResult.data ?? [], additionalRecipeResult?.data ?? []),
      shoppingList: shoppingListRow
        ? mapShoppingList(shoppingListRow, shoppingItemsResult?.data ?? [])
        : { status: 'draft', items: [], approvedAt: null, completedAt: null },
      mealPlanId: planRow.id,
      shoppingListId: shoppingListRow?.id ?? null,
    };
  }

  async addPantryItem(householdId: string, item: PantryItem): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client.from('pantry_items').insert({
      id: item.id,
      household_id: householdId,
      ingredient_id: item.ingredientId,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expires_on: item.expiresOn,
    });
    throwIfError(error);
  }

  async createOrGetIngredient(
    householdId: string,
    name: string,
    category: Ingredient['category'],
    nutritionGroups: NutritionGroup[],
  ): Promise<Ingredient> {
    const client = await this.requireClient();
    const canonicalName = canonicalizeIngredientName(name);
    const insertResult = await client
      .from('ingredients')
      .upsert(
        {
          household_id: householdId,
          canonical_name: canonicalName,
          name: name.trim(),
          category,
          nutrition_groups: nutritionGroups,
        },
        { onConflict: 'household_id,canonical_name', ignoreDuplicates: true },
      )
      .select('id, name, category, nutrition_groups')
      .maybeSingle();
    throwIfError(insertResult.error);

    if (insertResult.data) {
      return {
        id: insertResult.data.id,
        name: insertResult.data.name,
        category: insertResult.data.category,
        nutritionGroups: insertResult.data.nutrition_groups,
      };
    }

    const existingResult = await client
      .from('ingredients')
      .select('id, name, category, nutrition_groups')
      .eq('household_id', householdId)
      .eq('canonical_name', canonicalName)
      .single();
    throwIfError(existingResult.error);
    if (!existingResult.data) {
      throw new Error('Supabase non ha restituito l’ingrediente creato.');
    }
    if (!sameNutritionGroups(existingResult.data.nutrition_groups, nutritionGroups)) {
      await this.updateIngredientNutritionGroups(
        householdId,
        existingResult.data.id,
        nutritionGroups,
      );
    }
    return {
      id: existingResult.data.id,
      name: existingResult.data.name,
      category: existingResult.data.category,
      nutritionGroups,
    };
  }

  async updateIngredientNutritionGroups(
    householdId: string,
    ingredientId: string,
    nutritionGroups: NutritionGroup[],
  ): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('ingredients')
      .update({ nutrition_groups: nutritionGroups })
      .eq('id', ingredientId)
      .eq('household_id', householdId);
    throwIfError(error);
  }

  async updatePantryItem(householdId: string, item: PantryItem): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('pantry_items')
      .update({
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        expires_on: item.expiresOn,
      })
      .eq('id', item.id)
      .eq('household_id', householdId);
    throwIfError(error);
  }

  async removePantryItem(householdId: string, id: string): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('pantry_items')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId);
    throwIfError(error);
  }

  async saveRecipe(householdId: string, userId: string, recipe: Recipe): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client.from('recipes').upsert({
      id: recipe.id,
      household_id: householdId,
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      prep_minutes: recipe.prepMinutes,
      category: recipe.category,
      tags: recipe.tags,
      instructions: recipe.instructions,
      favorite: recipe.favorite,
      excluded_from_plan: recipe.excludedFromPlan,
      repeatable: recipe.repeatable,
      created_by: userId,
    });
    throwIfError(error);

    const deleteResult = await client
      .from('recipe_ingredients')
      .delete()
      .eq('household_id', householdId)
      .eq('recipe_id', recipe.id);
    throwIfError(deleteResult.error);
    if (recipe.ingredients.length === 0) {
      return;
    }
    const ingredientResult = await client.from('recipe_ingredients').insert(
      recipe.ingredients.map((item) => ({
        household_id: householdId,
        recipe_id: recipe.id,
        ingredient_id: item.ingredientId,
      })),
    );
    throwIfError(ingredientResult.error);
  }

  async removeRecipe(householdId: string, id: string): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('recipes')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId);
    throwIfError(error);
  }

  async updateRecipeFlag(
    householdId: string,
    id: string,
    field: 'favorite' | 'excluded_from_plan',
    value: boolean,
  ): Promise<void> {
    const client = await this.requireClient();
    const update =
      field === 'favorite'
        ? client.from('recipes').update({ favorite: value })
        : client.from('recipes').update({ excluded_from_plan: value });
    const { error } = await update.eq('id', id).eq('household_id', householdId);
    throwIfError(error);
  }

  async recordCooked(
    householdId: string,
    userId: string,
    recipeId: string,
    cookedOn: string,
  ): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client.from('cooking_history').insert({
      household_id: householdId,
      recipe_id: recipeId,
      cooked_by: userId,
      cooked_on: cookedOn,
    });
    throwIfError(error);
  }

  async saveDraftPlan(
    householdId: string,
    userId: string,
    weekStart: string,
    meals: readonly PlannedMeal[],
  ): Promise<string> {
    const client = await this.requireClient();
    const deleteResult = await client
      .from('meal_plans')
      .delete()
      .eq('household_id', householdId)
      .eq('status', 'draft');
    throwIfError(deleteResult.error);

    const insertResult = await client
      .from('meal_plans')
      .insert({ household_id: householdId, week_start: weekStart, created_by: userId })
      .select('id')
      .single();
    throwIfError(insertResult.error);
    const planId = insertResult.data?.id;
    if (!planId) {
      throw new Error('Supabase non ha restituito l’ID del piano creato.');
    }
    await this.replacePlanEntries(householdId, planId, meals);
    return planId;
  }

  async replacePlanEntries(
    householdId: string,
    mealPlanId: string,
    meals: readonly PlannedMeal[],
  ): Promise<void> {
    const client = await this.requireClient();
    const deleteResult = await client
      .from('meal_plan_entries')
      .delete()
      .eq('household_id', householdId)
      .eq('meal_plan_id', mealPlanId);
    throwIfError(deleteResult.error);
    if (meals.length === 0) {
      return;
    }
    const insertResult = await client
      .from('meal_plan_entries')
      .insert(
        meals.map((meal) => ({
          household_id: householdId,
          meal_plan_id: mealPlanId,
          meal_date: meal.date,
          slot: meal.slot,
          recipe_id: meal.recipeId,
          side_recipe_id: meal.sideRecipeId ?? null,
          locked: meal.locked,
          score: meal.score,
          reason: meal.reason,
        })),
      )
      .select('id, meal_date, slot');
    throwIfError(insertResult.error);
    const additionalRecipes: {
      household_id: string;
      meal_plan_entry_id: string;
      recipe_id: string;
      sort_order: number;
    }[] = [];
    for (const entry of insertResult.data ?? []) {
      const meal = meals.find(
        (candidate) => candidate.date === entry.meal_date && candidate.slot === entry.slot,
      );
      for (const [sortOrder, recipeId] of (meal?.additionalRecipeIds ?? []).entries()) {
        additionalRecipes.push({
          household_id: householdId,
          meal_plan_entry_id: entry.id,
          recipe_id: recipeId,
          sort_order: sortOrder,
        });
      }
    }
    if (additionalRecipes.length > 0) {
      const additionalResult = await client
        .from('meal_plan_entry_additional_recipes')
        .insert(additionalRecipes);
      throwIfError(additionalResult.error);
    }
  }

  async deleteMealPlan(householdId: string, mealPlanId: string): Promise<void> {
    const client = await this.requireClient();
    const { error, count } = await client
      .from('meal_plans')
      .delete({ count: 'exact' })
      .eq('household_id', householdId)
      .eq('id', mealPlanId);
    throwIfError(error);
    if (count === 0) {
      throw new Error('Il piano non è più disponibile per l’eliminazione.');
    }
  }

  async approvePlan(planId: string): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client.rpc('approve_meal_plan', {
      p_meal_plan_id: planId,
    });
    throwIfError(error);
  }

  async createShoppingList(
    householdId: string,
    userId: string,
    planId: string,
    items: readonly ShoppingList['items'][number][],
  ): Promise<string> {
    const client = await this.requireClient();
    const listResult = await client
      .from('shopping_lists')
      .insert({ household_id: householdId, meal_plan_id: planId, created_by: userId })
      .select('id')
      .single();
    throwIfError(listResult.error);
    const shoppingListId = listResult.data?.id;
    if (!shoppingListId) {
      throw new Error('Supabase non ha restituito l’ID della lista creata.');
    }
    if (items.length > 0) {
      const itemResult = await client.from('shopping_list_items').insert(
        items.map((item) => ({
          id: item.id,
          household_id: householdId,
          shopping_list_id: shoppingListId,
          ingredient_id: item.ingredientId,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
          manual: item.manual,
        })),
      );
      throwIfError(itemResult.error);
    }
    return shoppingListId;
  }

  async addShoppingItem(
    householdId: string,
    listId: string,
    item: ShoppingList['items'][number],
  ): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client.from('shopping_list_items').insert({
      id: item.id,
      household_id: householdId,
      shopping_list_id: listId,
      ingredient_id: item.ingredientId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      manual: item.manual,
    });
    throwIfError(error);
  }

  async updateShoppingItem(
    householdId: string,
    id: string,
    updates: {
      quantity?: number | null;
      unit?: MeasurementUnit;
      checked?: boolean;
      manual?: boolean;
    },
  ): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('shopping_list_items')
      .update(updates)
      .eq('id', id)
      .eq('household_id', householdId);
    throwIfError(error);
  }

  async setShoppingItemsChecked(
    householdId: string,
    listId: string,
    checked: boolean,
  ): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('shopping_list_items')
      .update({ checked })
      .eq('household_id', householdId)
      .eq('shopping_list_id', listId);
    throwIfError(error);
  }

  async removeShoppingItem(householdId: string, id: string): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client
      .from('shopping_list_items')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId);
    throwIfError(error);
  }

  async approveShoppingList(householdId: string, userId: string, listId: string): Promise<void> {
    const client = await this.requireClient();
    const { data, error } = await client
      .from('shopping_lists')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', listId)
      .eq('household_id', householdId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    throwIfError(error);
    if (!data) {
      throw new Error('La lista non è più disponibile come bozza.');
    }
  }

  async completeShoppingList(listId: string): Promise<void> {
    const client = await this.requireClient();
    const { error } = await client.rpc('complete_shopping_list', {
      p_shopping_list_id: listId,
    });
    throwIfError(error);
  }

  subscribeToShoppingList(
    listId: string,
    onChange: (change: ShoppingListChange) => void,
    onError: (error: Error) => void,
  ): () => void {
    let channel: RealtimeChannel | null = null;
    let disposed = false;
    void this.requireClient()
      .then((client) => {
        if (disposed) {
          return;
        }
        channel = client
          .channel(`shopping-list-${listId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'shopping_list_items',
              filter: `shopping_list_id=eq.${listId}`,
            },
            (payload) => {
              if (payload.eventType === 'DELETE') {
                const id = payload.old['id'];
                if (typeof id === 'string') {
                  onChange({ eventType: 'DELETE', id });
                }
                return;
              }
              const item = parseShoppingListItem(payload.new);
              if (!item) {
                onError(
                  new Error('Ricevuto un aggiornamento non valido per la lista della spesa.'),
                );
                return;
              }
              onChange({ eventType: payload.eventType, item });
            },
          )
          .subscribe((_status, error) => {
            if (error) {
              onError(error);
            }
          });
      })
      .catch((error: unknown) => {
        onError(asError(error, 'Impossibile avviare la sincronizzazione della lista.'));
      });
    return () => {
      disposed = true;
      const activeChannel = channel;
      if (activeChannel) {
        void this.requireClient()
          .then((client) => {
            void client.removeChannel(activeChannel).catch((error: unknown) => {
              onError(asError(error, 'Impossibile interrompere la sincronizzazione della lista.'));
            });
          })
          .catch((error: unknown) => {
            onError(asError(error, 'Impossibile interrompere la sincronizzazione della lista.'));
          });
      }
    };
  }

  private async requireClient(): Promise<SupabaseClient<Database>> {
    const client = await this.connection.getClient();
    if (!client) {
      throw new Error('Configura Supabase prima di accedere ai dati remoti.');
    }
    return client;
  }
}

function mapIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    nutritionGroups: row.nutrition_groups ?? [],
  };
}

function sameNutritionGroups(left: NutritionGroup[], right: NutritionGroup[]): boolean {
  return left.length === right.length && left.every((group) => right.includes(group));
}

function mapPantryItem(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    quantity: row.quantity,
    unit: row.unit,
    location: row.location,
    expiresOn: row.expires_on,
  };
}

function mapRecipe(row: RecipeRow, ingredients: Recipe['ingredients']): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    category: row.category,
    tags: row.tags,
    instructions: row.instructions,
    ingredients,
    favorite: row.favorite,
    excludedFromPlan: row.excluded_from_plan,
    repeatable: row.repeatable,
  };
}

function groupRecipeIngredients(rows: RecipeIngredientRow[]): Map<string, Recipe['ingredients']> {
  const grouped = new Map<string, Recipe['ingredients']>();
  for (const row of rows) {
    const ingredients = grouped.get(row.recipe_id) ?? [];
    ingredients.push({ ingredientId: row.ingredient_id });
    grouped.set(row.recipe_id, ingredients);
  }
  return grouped;
}

function mapCookingHistory(row: CookingHistoryRow): { recipeId: string; cookedOn: string } {
  return { recipeId: row.recipe_id, cookedOn: row.cooked_on };
}

function mapMealPlan(
  row: MealPlanRow,
  entries: MealPlanEntryRow[],
  additionalRecipes: MealPlanEntryAdditionalRecipeRow[],
): MealPlan {
  const additionalRecipeIdsByEntry = new Map<string, string[]>();
  for (const additional of additionalRecipes) {
    const recipeIds = additionalRecipeIdsByEntry.get(additional.meal_plan_entry_id) ?? [];
    recipeIds.push(additional.recipe_id);
    additionalRecipeIdsByEntry.set(additional.meal_plan_entry_id, recipeIds);
  }
  const meals: PlannedMeal[] = entries
    .filter((entry) => entry.slot === 'lunch' || entry.slot === 'dinner')
    .map((entry) => ({
      date: entry.meal_date,
      slot: entry.slot as 'lunch' | 'dinner',
      recipeId: entry.recipe_id,
      sideRecipeId: entry.side_recipe_id ?? null,
      additionalRecipeIds: additionalRecipeIdsByEntry.get(entry.id) ?? [],
      locked: entry.locked,
      score: entry.score,
      reason: entry.reason,
    }));
  return { status: row.status, meals, approvedAt: row.approved_at };
}

function mapShoppingList(row: ShoppingListRow, items: ShoppingListItemRow[]): ShoppingList {
  return {
    status: row.status,
    items: items.map(mapShoppingListItem),
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
  };
}

function mapShoppingListItem(item: ShoppingListItemRow): ShoppingListEntry {
  return {
    id: item.id,
    ingredientId: item.ingredient_id ?? '',
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    manual: item.manual,
  };
}

function parseShoppingListItem(value: unknown): ShoppingListEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value['id'];
  const shoppingListId = value['shopping_list_id'];
  const ingredientId = value['ingredient_id'];
  const name = value['name'];
  const category = value['category'];
  const rawQuantity = value['quantity'];
  const rawUnit = value['unit'];
  const checked = value['checked'];
  const manual = value['manual'];
  if (
    typeof id !== 'string' ||
    typeof shoppingListId !== 'string' ||
    !(typeof ingredientId === 'string' || ingredientId === null) ||
    typeof name !== 'string' ||
    !isIngredientCategory(category) ||
    !(typeof rawQuantity === 'number' || rawQuantity === null) ||
    (typeof rawQuantity === 'number' && (!Number.isFinite(rawQuantity) || rawQuantity <= 0)) ||
    !isMeasurementUnit(rawUnit) ||
    typeof checked !== 'boolean' ||
    typeof manual !== 'boolean'
  ) {
    return null;
  }
  return {
    id,
    ingredientId: ingredientId ?? '',
    name,
    category,
    quantity: rawQuantity,
    unit: rawUnit,
    checked,
    manual,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIngredientCategory(value: unknown): value is ShoppingListItemRow['category'] {
  return (
    value === 'fruit-vegetables' ||
    value === 'dairy' ||
    value === 'meat-fish' ||
    value === 'bakery' ||
    value === 'pantry' ||
    value === 'other'
  );
}

function isMeasurementUnit(value: unknown): value is ShoppingListItemRow['unit'] {
  return value === 'g' || value === 'kg' || value === 'ml' || value === 'l' || value === 'pz';
}

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

function canonicalizeIngredientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}
