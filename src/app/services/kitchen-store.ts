import { effect, Injectable, signal } from '@angular/core';
import {
  CookingHistoryEntry,
  IngredientCategory,
  Ingredient,
  MealPlan,
  MealSlot,
  PantryItem,
  PlanSlot,
  PlannedMeal,
  Recipe,
  RecipeCategory,
  RecipeIngredient,
  MeasurementUnit,
  NutritionGroup,
  ShoppingNeed,
  ShoppingList,
  ShoppingListEntry,
  WorkflowStatus,
} from '../domain/kitchen.models';
import {
  canAddAdditionalRecipe,
  chooseSideDish,
  generateWeeklyPlan,
  isAvailableSideDish,
  isMealCompositionValid,
  isMealReadyForApproval,
  isMainPlanRecipe,
  isSideDishCompatibleWithMain,
  requiresSideDishForMeal,
} from '../domain/meal-planner';
import { calculateShoppingNeeds } from '../domain/shopping-calculator';
import { inferNutritionGroups, normalizeNutritionGroups } from '../domain/nutrition-groups';
import { DEMO_INGREDIENTS, DEMO_PANTRY_ITEMS, DEMO_RECIPES } from '../data/demo-data';
import { AuthService } from './auth.service';
import { SupabaseKitchenRepository } from './supabase-kitchen.repository';
import type { ShoppingListChange } from './supabase-kitchen.repository';

interface PersistedKitchenState {
  version: 1;
  ingredients?: Ingredient[];
  pantryItems: PantryItem[];
  recipes: Recipe[];
  cookingHistory: CookingHistoryEntry[];
  mealPlan: MealPlan;
  shoppingList: ShoppingList;
}

const STORAGE_KEY = 'maja-kitchen-state-v1';

@Injectable({ providedIn: 'root' })
export class KitchenStore {
  private readonly ingredientsState = signal<Ingredient[]>([...DEMO_INGREDIENTS]);
  private readonly pantryState = signal<PantryItem[]>(DEMO_PANTRY_ITEMS);
  private readonly recipesState = signal<Recipe[]>(DEMO_RECIPES);
  private readonly cookingHistoryState = signal<CookingHistoryEntry[]>([]);
  private readonly mealPlanState = signal<MealPlan>({
    status: 'draft',
    meals: [],
    approvedAt: null,
  });
  private readonly shoppingListState = signal<ShoppingList>({
    status: 'draft',
    items: [],
    approvedAt: null,
    completedAt: null,
  });
  private readonly remoteModeState = signal(false);
  readonly ingredients = this.ingredientsState.asReadonly();
  readonly pantryItems = this.pantryState.asReadonly();
  readonly recipes = this.recipesState.asReadonly();
  readonly cookingHistory = this.cookingHistoryState.asReadonly();
  readonly mealPlan = this.mealPlanState.asReadonly();
  readonly shoppingList = this.shoppingListState.asReadonly();
  readonly error = signal<string | null>(null);
  readonly success = signal<{ id: number; message: string } | null>(null);
  readonly loading = signal(false);
  readonly syncing = signal(false);

  private activeHouseholdId: string | null = null;
  private activeUserId: string | null = null;
  private remotePlanId: string | null = null;
  private remoteShoppingListId: string | null = null;
  private stopShoppingSubscription: (() => void) | null = null;
  private remoteGeneration = 0;
  private pendingRemoteOperations = 0;
  private successMessageId = 0;
  private remoteQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly auth: AuthService,
    private readonly remote: SupabaseKitchenRepository,
  ) {
    this.restore();
    effect(() => {
      const status = this.auth.status();
      const householdId = this.auth.householdId();
      const userId = this.auth.user()?.id ?? null;
      if (
        status === 'ready' &&
        householdId &&
        userId &&
        (!this.remoteModeState() ||
          this.activeHouseholdId !== householdId ||
          this.activeUserId !== userId)
      ) {
        void this.loadRemote(householdId, userId);
      } else if (status === 'demo') {
        this.deactivateRemote();
      } else if (
        status === 'unauthenticated' ||
        status === 'needs-household' ||
        status === 'error'
      ) {
        this.deactivateRemote();
        this.resetToDemo();
      }
    });
  }

  isRemote(): boolean {
    return this.remoteModeState();
  }

  addPantryItem(item: Omit<PantryItem, 'id'>): void {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      this.error.set('La quantità deve essere maggiore di zero.');
      return;
    }
    if (!this.ingredientsState().some((ingredient) => ingredient.id === item.ingredientId)) {
      this.error.set('Scegli un ingrediente presente nel catalogo.');
      return;
    }
    const name =
      this.ingredientsState().find((ingredient) => ingredient.id === item.ingredientId)?.name ??
      'Ingrediente';
    const savedItem = { ...item, id: createId() };
    this.pantryState.update((items) => [...items, savedItem]);
    if (this.remoteModeState()) {
      this.enqueueRemote(async (householdId) => {
        await this.remote.addPantryItem(householdId, savedItem);
        this.showSuccess(`${name} aggiunto alla dispensa.`);
      });
    } else {
      this.showSuccess(`${name} aggiunto alla dispensa.`);
    }
    this.persist();
  }

  async addPantryItemByName(
    name: string,
    category: IngredientCategory,
    item: Omit<PantryItem, 'id' | 'ingredientId'>,
    nutritionGroups?: NutritionGroup[],
  ): Promise<void> {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      this.error.set('La quantità deve essere maggiore di zero.');
      return;
    }

    const ingredient = await this.ensureIngredientByName(name, category, nutritionGroups);
    if (!ingredient) {
      return;
    }
    this.addPantryItem({ ...item, ingredientId: ingredient.id });
  }

  async ensureIngredientByName(
    name: string,
    category: IngredientCategory,
    nutritionGroups?: NutritionGroup[],
  ): Promise<Ingredient | null> {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (!normalizedName || normalizedName.length > 100) {
      this.error.set('Il nome dell’ingrediente deve contenere da 1 a 100 caratteri.');
      return null;
    }

    const requestedGroups =
      nutritionGroups === undefined ? undefined : normalizeNutritionGroups(nutritionGroups);
    if (requestedGroups?.length === 0) {
      this.error.set('Classifica l’ingrediente nei gruppi nutrizionali prima di salvarlo.');
      return null;
    }

    const canonicalName = normalizedName.toLocaleLowerCase('it');
    const existing = this.ingredientsState().find(
      (entry) => entry.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it') === canonicalName,
    );
    if (existing) {
      if (requestedGroups === undefined) {
        return existing;
      }
      if (
        existing.nutritionGroups.length === requestedGroups.length &&
        existing.nutritionGroups.every((group) => requestedGroups.includes(group))
      ) {
        return existing;
      }
      const updated = { ...existing, nutritionGroups: requestedGroups };
      this.ingredientsState.update((ingredients) =>
        ingredients.map((ingredient) => (ingredient.id === existing.id ? updated : ingredient)),
      );
      this.enqueueRemote((householdId) =>
        this.remote.updateIngredientNutritionGroups(householdId, existing.id, requestedGroups),
      );
      this.persist();
      return updated;
    }

    const groups =
      requestedGroups ??
      normalizeNutritionGroups(inferNutritionGroups(normalizedName, category) ?? ['other']);
    if (this.remoteModeState()) {
      const householdId = this.activeHouseholdId;
      const generation = this.remoteGeneration;
      if (!householdId) {
        this.error.set('La sessione non è associata a una casa.');
        return null;
      }
      this.syncing.set(true);
      try {
        const ingredient = await this.remote.createOrGetIngredient(
          householdId,
          normalizedName,
          category,
          groups,
        );
        if (generation !== this.remoteGeneration || householdId !== this.activeHouseholdId) {
          return null;
        }
        this.ingredientsState.update((ingredients) =>
          ingredients.some((entry) => entry.id === ingredient.id)
            ? ingredients
            : [...ingredients, ingredient],
        );
        return ingredient;
      } catch (error) {
        this.error.set(errorMessage(error, 'Impossibile aggiungere l’ingrediente al catalogo.'));
        return null;
      } finally {
        if (generation === this.remoteGeneration) {
          this.syncing.set(false);
        }
      }
    }

    const ingredient = {
      id: createId(),
      name: normalizedName,
      category,
      nutritionGroups: groups,
    };
    this.ingredientsState.update((ingredients) => [...ingredients, ingredient]);
    this.persist();
    return ingredient;
  }

  removePantryItem(id: string): void {
    const item = this.pantryState().find((entry) => entry.id === id);
    if (!item) {
      this.error.set('L’ingrediente non è più presente in dispensa.');
      return;
    }
    const name =
      this.ingredientsState().find((ingredient) => ingredient.id === item.ingredientId)?.name ??
      'Ingrediente';
    this.pantryState.update((items) => items.filter((item) => item.id !== id));
    if (this.remoteModeState()) {
      this.enqueueRemote(async (householdId) => {
        await this.remote.removePantryItem(householdId, id);
        this.showSuccess(`${name} rimosso dalla dispensa.`);
      });
    } else {
      this.showSuccess(`${name} rimosso dalla dispensa.`);
    }
    this.persist();
  }

  showSuccess(message: string): void {
    this.success.set({ id: ++this.successMessageId, message });
  }

  clearSuccess(): void {
    this.success.set(null);
  }

  updatePantryItem(
    id: string,
    updates: Pick<PantryItem, 'quantity' | 'unit' | 'location' | 'expiresOn'>,
  ): void {
    if (!Number.isFinite(updates.quantity) || updates.quantity <= 0) {
      this.error.set('La quantità deve essere maggiore di zero.');
      return;
    }
    this.pantryState.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
    const updatedItem = this.pantryState().find((item) => item.id === id);
    if (updatedItem) {
      this.enqueueRemote((householdId) => this.remote.updatePantryItem(householdId, updatedItem));
    }
    this.persist();
  }

  saveRecipe(recipe: Omit<Recipe, 'id'>, id?: string): void {
    if (
      !recipe.title.trim() ||
      recipe.ingredients.length === 0 ||
      !Number.isFinite(recipe.servings) ||
      recipe.servings < 1 ||
      !Number.isFinite(recipe.prepMinutes) ||
      recipe.prepMinutes < 0
    ) {
      this.error.set('La ricetta deve avere un titolo e almeno un ingrediente.');
      return;
    }
    if (
      new Set(recipe.ingredients.map((item) => item.ingredientId)).size !==
      recipe.ingredients.length
    ) {
      this.error.set('Un ingrediente può comparire una sola volta nella ricetta.');
      return;
    }
    if (
      recipe.ingredients.some(
        (item) =>
          !this.ingredientsState().some((ingredient) => ingredient.id === item.ingredientId),
      )
    ) {
      this.error.set('La ricetta contiene un ingrediente non presente nel catalogo.');
      return;
    }
    if (id && !this.recipesState().some((existing) => existing.id === id)) {
      this.error.set('La ricetta da modificare non esiste più.');
      return;
    }
    const savedRecipe: Recipe = { ...recipe, id: id ?? createId() };
    this.recipesState.update((recipes) =>
      id
        ? recipes.map((existing) => (existing.id === id ? savedRecipe : existing))
        : [...recipes, savedRecipe],
    );
    this.enqueueRemote((householdId, userId) =>
      this.remote.saveRecipe(householdId, userId, savedRecipe),
    );
    this.persist();
  }

  removeRecipe(id: string): void {
    if (
      this.mealPlanState().meals.some((meal) => meal.recipeId === id || meal.sideRecipeId === id) ||
      this.cookingHistoryState().some((entry) => entry.recipeId === id)
    ) {
      this.error.set(
        'Questa ricetta è presente nel piano o nello storico: escludila invece di eliminarla.',
      );
      return;
    }
    this.recipesState.update((recipes) => recipes.filter((recipe) => recipe.id !== id));
    this.enqueueRemote((householdId) => this.remote.removeRecipe(householdId, id));
    this.persist();
  }

  toggleFavorite(recipeId: string): void {
    this.recipesState.update((recipes) =>
      recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, favorite: !recipe.favorite } : recipe,
      ),
    );
    const recipe = this.recipesState().find((item) => item.id === recipeId);
    if (recipe) {
      this.enqueueRemote((householdId) =>
        this.remote.updateRecipeFlag(householdId, recipeId, 'favorite', recipe.favorite),
      );
    }
    this.persist();
  }

  toggleRecipeExcluded(recipeId: string): void {
    this.recipesState.update((recipes) =>
      recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, excludedFromPlan: !recipe.excludedFromPlan } : recipe,
      ),
    );
    const recipe = this.recipesState().find((item) => item.id === recipeId);
    if (recipe) {
      this.enqueueRemote((householdId) =>
        this.remote.updateRecipeFlag(
          householdId,
          recipeId,
          'excluded_from_plan',
          recipe.excludedFromPlan,
        ),
      );
    }
    this.persist();
  }

  recordCooked(recipeId: string, cookedOn = localDate(new Date())): void {
    this.cookingHistoryState.update((history) => [...history, { recipeId, cookedOn }]);
    this.enqueueRemote((householdId, userId) =>
      this.remote.recordCooked(householdId, userId, recipeId, cookedOn),
    );
    this.persist();
  }

  generatePlan(requestedSlots: readonly PlanSlot[], today = new Date()): void {
    if (requestedSlots.length === 0) {
      this.error.set('Seleziona almeno un pranzo o una cena per generare il piano.');
      return;
    }
    const slotKeys = new Set<string>();
    for (const slot of requestedSlots) {
      const date = new Date(`${slot.date}T12:00:00`);
      const key = `${slot.date}:${slot.slot}`;
      if (Number.isNaN(date.getTime()) || localDate(date) !== slot.date || slotKeys.has(key)) {
        this.error.set('Le date o i pasti selezionati non sono validi.');
        return;
      }
      slotKeys.add(key);
    }
    const slotsToGenerate = [...requestedSlots].sort(
      (left, right) => left.date.localeCompare(right.date) || left.slot.localeCompare(right.slot),
    );
    const start = mondayOf(new Date(`${slotsToGenerate[0].date}T12:00:00`));
    const currentPlan = this.mealPlanState();
    const preserveLocks = currentPlan.status === 'draft';
    const slots: PlanSlot[] = slotsToGenerate.map(({ date, slot }) => {
      const previous = preserveLocks
        ? currentPlan.meals.find((meal) => meal.date === date && meal.slot === slot && meal.locked)
        : undefined;
      return {
        date,
        slot,
        locked: previous !== undefined,
        recipeId: previous?.recipeId ?? null,
        sideRecipeId: previous?.sideRecipeId ?? null,
        additionalRecipeIds: previous?.additionalRecipeIds ?? [],
      };
    });

    this.mealPlanState.set({
      status: 'draft',
      meals: generateWeeklyPlan({
        slots,
        recipes: this.recipesState(),
        ingredients: this.ingredientsState(),
        pantryItems: this.pantryState(),
        cookingHistory: this.cookingHistoryState(),
        today: localDate(today),
      }),
      approvedAt: null,
    });
    this.shoppingListState.set({ status: 'draft', items: [], approvedAt: null, completedAt: null });
    this.remotePlanId = null;
    this.remoteShoppingListId = null;
    this.stopShoppingSubscription?.();
    this.stopShoppingSubscription = null;
    if (this.remoteModeState()) {
      this.enqueueRemote(async (householdId, userId) => {
        this.remotePlanId = await this.remote.saveDraftPlan(
          householdId,
          userId,
          localDate(start),
          this.mealPlanState().meals,
        );
      });
    }
    this.persist();
  }

  editApprovedPlan(): void {
    const plan = this.mealPlanState();
    if (plan.status !== 'approved' || plan.meals.length === 0) {
      this.error.set('Non c’è un piano approvato da modificare.');
      return;
    }

    const firstDate = [...plan.meals].sort((left, right) => left.date.localeCompare(right.date))[0]
      .date;
    const start = mondayOf(new Date(`${firstDate}T12:00:00`));
    const meals = plan.meals.map((meal) => ({ ...meal, locked: false }));
    this.mealPlanState.set({ status: 'draft', meals, approvedAt: null });
    this.shoppingListState.set({ status: 'draft', items: [], approvedAt: null, completedAt: null });
    this.remotePlanId = null;
    this.remoteShoppingListId = null;
    this.stopShoppingSubscription?.();
    this.stopShoppingSubscription = null;
    if (this.remoteModeState()) {
      this.enqueueRemote(async (householdId, userId) => {
        this.remotePlanId = await this.remote.saveDraftPlan(
          householdId,
          userId,
          localDate(start),
          meals,
        );
      });
    }
    this.persist();
  }

  deleteMealPlan(): void {
    const meals = this.mealPlanState().meals;
    if (meals.length === 0) {
      this.error.set('Non c’è un piano da eliminare.');
      return;
    }
    const planId = this.remotePlanId;

    this.stopShoppingSubscription?.();
    this.stopShoppingSubscription = null;
    this.mealPlanState.set({ status: 'draft', meals: [], approvedAt: null });
    this.shoppingListState.set({
      status: 'draft',
      items: [],
      approvedAt: null,
      completedAt: null,
    });

    if (this.remoteModeState()) {
      this.enqueueRemote(async (householdId) => {
        if (!planId) {
          throw new Error('Il piano non è ancora stato sincronizzato.');
        }
        await this.remote.deleteMealPlan(householdId, planId);
        this.remotePlanId = null;
        this.remoteShoppingListId = null;
      });
    } else {
      this.remotePlanId = null;
      this.remoteShoppingListId = null;
    }
    this.persist();
  }

  replaceMeal(date: string, slot: MealSlot, recipeId: string | null): void {
    if (!this.requireDraftPlan()) {
      return;
    }
    const currentMeal = this.mealPlanState().meals.find(
      (meal) => meal.date === date && meal.slot === slot,
    );
    if (!currentMeal || currentMeal.locked) {
      this.error.set('Sblocca il pasto prima di modificarlo.');
      return;
    }
    if (
      recipeId &&
      !this.recipesState().some((recipe) => recipe.id === recipeId && isMainPlanRecipe(recipe))
    ) {
      this.error.set('La ricetta selezionata non è disponibile per il piano.');
      return;
    }
    const mainRecipe = recipeId
      ? this.recipesState().find((recipe) => recipe.id === recipeId)
      : undefined;
    const additionalRecipeIds = recipeId ? currentMeal.additionalRecipeIds : [];
    const mainMeal: PlannedMeal = {
      ...currentMeal,
      recipeId,
      sideRecipeId: null,
      additionalRecipeIds,
      score: 0,
      reason: recipeId ? 'Scelta manualmente' : 'Pasto rimosso',
    };
    const existingSide = currentMeal.sideRecipeId
      ? this.recipesState().find((recipe) => recipe.id === currentMeal.sideRecipeId)
      : undefined;
    const compatibleExistingSide =
      mainRecipe &&
      requiresSideDishForMeal(mainMeal, this.recipesState(), this.ingredientsState()) &&
      existingSide &&
      isAvailableSideDish(existingSide) &&
      isMealCompositionValid(
        { ...mainMeal, sideRecipeId: existingSide.id },
        this.recipesState(),
        this.ingredientsState(),
      )
        ? existingSide.id
        : null;
    const suggestedSideId =
      mainRecipe && requiresSideDishForMeal(mainMeal, this.recipesState(), this.ingredientsState())
        ? (chooseSideDish(
            mainRecipe,
            this.plannerOptions(),
            new Set(
              this.mealPlanState()
                .meals.filter((meal) => meal.date !== date || meal.slot !== slot)
                .map((meal) => meal.sideRecipeId)
                .filter((id): id is string => id !== null),
            ),
          )?.id ?? null)
        : null;
    const proposedSideId = compatibleExistingSide ?? suggestedSideId;
    const sideRecipeId =
      proposedSideId &&
      isMealCompositionValid(
        { ...mainMeal, sideRecipeId: proposedSideId },
        this.recipesState(),
        this.ingredientsState(),
      )
        ? proposedSideId
        : null;
    const updatedMeal: PlannedMeal = { ...mainMeal, sideRecipeId };
    if (!isMealCompositionValid(updatedMeal, this.recipesState(), this.ingredientsState())) {
      this.error.set(
        'La modifica non è compatibile con i piatti aggiunti. Rimuovi prima gli extra non compatibili.',
      );
      return;
    }
    this.mealPlanState.update((plan) => ({
      ...plan,
      meals: plan.meals.map((meal) =>
        meal.date === date && meal.slot === slot ? updatedMeal : meal,
      ),
    }));
    this.persistPlan();
    this.persist();
  }

  replaceSideDish(date: string, slot: MealSlot, sideRecipeId: string | null): void {
    if (!this.requireDraftPlan()) {
      return;
    }
    const currentMeal = this.mealPlanState().meals.find(
      (meal) => meal.date === date && meal.slot === slot,
    );
    if (!currentMeal || currentMeal.locked) {
      this.error.set('Sblocca il pasto prima di modificare il contorno.');
      return;
    }
    if (!currentMeal.recipeId) {
      this.error.set('Scegli prima un piatto principale.');
      return;
    }
    if (
      sideRecipeId &&
      !this.recipesState().some(
        (recipe) => recipe.id === sideRecipeId && isAvailableSideDish(recipe),
      )
    ) {
      this.error.set('La ricetta selezionata non è disponibile come contorno.');
      return;
    }
    const mainRecipe = this.recipesState().find((recipe) => recipe.id === currentMeal.recipeId);
    if (!mainRecipe) {
      this.error.set('Il piatto principale non è più disponibile.');
      return;
    }
    if (
      !requiresSideDishForMeal(currentMeal, this.recipesState(), this.ingredientsState()) &&
      sideRecipeId !== null
    ) {
      this.error.set('Questo piatto è già completo e non richiede un contorno.');
      return;
    }
    const sideRecipe = sideRecipeId
      ? this.recipesState().find((recipe) => recipe.id === sideRecipeId)
      : undefined;
    if (
      sideRecipe &&
      !isSideDishCompatibleWithMain(mainRecipe, sideRecipe, this.ingredientsState())
    ) {
      this.error.set(
        'Scegli un contorno che copra gruppi mancanti senza aggiungere carboidrati già presenti.',
      );
      return;
    }
    const updatedMeal: PlannedMeal = {
      ...currentMeal,
      sideRecipeId,
    };
    if (!isMealCompositionValid(updatedMeal, this.recipesState(), this.ingredientsState())) {
      this.error.set('Il contorno non è compatibile con gli altri piatti di questo pasto.');
      return;
    }
    this.mealPlanState.update((plan) => ({
      ...plan,
      meals: plan.meals.map((meal) =>
        meal.date === date && meal.slot === slot ? updatedMeal : meal,
      ),
    }));
    this.persistPlan();
    this.persist();
  }

  addAdditionalRecipe(date: string, slot: MealSlot, recipeId: string): void {
    if (!this.requireDraftPlan()) {
      return;
    }
    const meal = this.mealPlanState().meals.find(
      (entry) => entry.date === date && entry.slot === slot,
    );
    if (!meal || meal.locked) {
      this.error.set('Sblocca il pasto prima di aggiungere un piatto.');
      return;
    }
    const recipe = this.recipesState().find((entry) => entry.id === recipeId);
    if (!recipe || !canAddAdditionalRecipe(meal, recipe, this.recipesState())) {
      this.error.set('Il piatto non è disponibile o è già presente in questo pasto.');
      return;
    }
    this.mealPlanState.update((plan) => ({
      ...plan,
      meals: plan.meals.map((entry) =>
        entry.date === date && entry.slot === slot
          ? { ...entry, additionalRecipeIds: [...entry.additionalRecipeIds, recipe.id] }
          : entry,
      ),
    }));
    this.persistPlan();
    this.persist();
  }

  removeAdditionalRecipe(date: string, slot: MealSlot, recipeId: string): void {
    if (!this.requireDraftPlan()) {
      return;
    }
    const meal = this.mealPlanState().meals.find(
      (entry) => entry.date === date && entry.slot === slot,
    );
    if (!meal || meal.locked || !meal.additionalRecipeIds.includes(recipeId)) {
      this.error.set('Il piatto aggiuntivo non è disponibile per la rimozione.');
      return;
    }
    this.mealPlanState.update((plan) => ({
      ...plan,
      meals: plan.meals.map((entry) =>
        entry.date === date && entry.slot === slot
          ? {
              ...entry,
              additionalRecipeIds: entry.additionalRecipeIds.filter((id) => id !== recipeId),
            }
          : entry,
      ),
    }));
    this.persistPlan();
    this.persist();
  }

  toggleMealLock(date: string, slot: MealSlot): void {
    if (!this.requireDraftPlan()) {
      return;
    }
    this.mealPlanState.update((plan) => ({
      ...plan,
      meals: plan.meals.map((meal) =>
        meal.date === date && meal.slot === slot ? { ...meal, locked: !meal.locked } : meal,
      ),
    }));
    this.persistPlan();
    this.persist();
  }

  approvePlan(): void {
    const plan = this.mealPlanState();
    if (plan.status !== 'draft') {
      this.error.set('Il piano non è in bozza.');
      return;
    }
    if (!plan.meals.some((meal) => meal.recipeId !== null)) {
      this.error.set('Aggiungi almeno un pasto prima di approvare il piano.');
      return;
    }
    const recipes = this.recipesState();
    const ingredients = this.ingredientsState();
    const invalidMeal = plan.meals.find(
      (meal) => !isMealReadyForApproval(meal, recipes, ingredients),
    );
    if (invalidMeal) {
      this.error.set(
        'Completa ogni pasto con il contorno compatibile suggerito; i piatti completi non ne richiedono uno.',
      );
      return;
    }
    let needs: ShoppingNeed[];
    try {
      needs = calculateShoppingNeeds({
        planStatus: 'approved',
        meals: plan.meals,
        recipes,
        ingredients,
      });
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Impossibile calcolare la lista della spesa.',
      );
      return;
    }
    const approvedAt = new Date().toISOString();
    this.mealPlanState.set({ ...plan, status: 'approved', approvedAt });
    this.shoppingListState.set({
      status: 'draft',
      items: needs.map((need) => ({
        ...need,
        id: createId(),
        quantity: null,
        unit: 'pz',
        checked: false,
        manual: false,
      })),
      approvedAt: null,
      completedAt: null,
    });
    if (this.remoteModeState()) {
      const items = this.shoppingListState().items;
      this.enqueueRemote(async (householdId, userId) => {
        if (!this.remotePlanId) {
          throw new Error('Il piano non è ancora stato sincronizzato.');
        }
        await this.remote.approvePlan(this.remotePlanId);
        this.remoteShoppingListId = await this.remote.createShoppingList(
          householdId,
          userId,
          this.remotePlanId,
          items,
        );
        this.subscribeToShoppingList();
      });
    }
    this.persist();
  }

  addManualShoppingItem(ingredientId: string): void {
    const ingredient = this.ingredientsState().find((item) => item.id === ingredientId);
    if (!ingredient) {
      this.error.set('Scegli un ingrediente valido.');
      return;
    }
    if (!this.requireDraftShoppingList()) {
      return;
    }
    if (this.shoppingListState().items.some((item) => item.ingredientId === ingredientId)) {
      this.error.set(`${ingredient.name} è già presente nella lista.`);
      return;
    }
    const item: ShoppingListEntry = {
      id: createId(),
      ingredientId,
      name: ingredient.name,
      category: ingredient.category,
      quantity: null,
      unit: 'pz',
      checked: false,
      manual: true,
    };
    this.shoppingListState.update((list) => ({ ...list, items: [...list.items, item] }));
    this.enqueueRemote(async (householdId) => {
      if (!this.remoteShoppingListId) {
        throw new Error('La lista non è ancora stata sincronizzata.');
      }
      await this.remote.addShoppingItem(householdId, this.remoteShoppingListId, item);
    });
    this.persist();
  }

  removeShoppingItem(id: string): void {
    if (!this.requireDraftShoppingList()) {
      return;
    }
    this.shoppingListState.update((list) => ({
      ...list,
      items: list.items.filter((item) => item.id !== id),
    }));
    this.enqueueRemote((householdId) => this.remote.removeShoppingItem(householdId, id));
    this.persist();
  }

  updateShoppingItem(id: string, quantity: number | null, unit?: MeasurementUnit): void {
    const list = this.shoppingListState();
    if (
      list.completedAt ||
      (list.status !== 'draft' && list.status !== 'approved') ||
      (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0))
    ) {
      this.error.set('Inserisci una quantità valida nella lista non ancora completata.');
      return;
    }
    this.shoppingListState.update((list) => ({
      ...list,
      items: list.items.map((item) =>
        item.id === id ? { ...item, quantity, unit: unit ?? item.unit } : item,
      ),
    }));
    const updated = this.shoppingListState().items.find((item) => item.id === id);
    if (updated) {
      this.enqueueRemote((householdId) =>
        this.remote.updateShoppingItem(householdId, id, {
          quantity: updated.quantity,
          unit: updated.unit,
        }),
      );
    }
    this.persist();
  }

  toggleShoppingItem(id: string): void {
    const list = this.shoppingListState();
    if (list.status !== 'approved') {
      this.error.set('Approva la lista prima di spuntare gli articoli.');
      return;
    }
    if (list.completedAt) {
      this.error.set('La spesa è già stata completata.');
      return;
    }
    const itemToCheck = list.items.find((item) => item.id === id);
    if (itemToCheck && !itemToCheck.checked && itemToCheck.quantity === null) {
      this.error.set(`Inserisci la quantità acquistata di ${itemToCheck.name}.`);
      return;
    }
    this.shoppingListState.update((list) => ({
      ...list,
      items: list.items.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item,
      ),
    }));
    const item = this.shoppingListState().items.find((entry) => entry.id === id);
    if (item) {
      this.enqueueRemote((householdId) =>
        this.remote.updateShoppingItem(householdId, id, { checked: item.checked }),
      );
    }
    this.persist();
  }

  allShoppingItemsChecked(): boolean {
    const items = this.shoppingListState().items;
    return items.length > 0 && items.every((item) => item.checked);
  }

  setAllShoppingItemsChecked(checked: boolean): void {
    const list = this.shoppingListState();
    if (list.status !== 'approved' || list.completedAt) {
      this.error.set('La lista non è modificabile in questo momento.');
      return;
    }
    if (checked && list.items.some((item) => item.quantity === null)) {
      this.error.set('Inserisci le quantità degli articoli prima di selezionarli tutti.');
      return;
    }
    if (list.items.every((item) => item.checked === checked)) {
      return;
    }
    this.shoppingListState.update((current) => ({
      ...current,
      items: current.items.map((item) => ({ ...item, checked })),
    }));
    this.enqueueRemote(async (householdId) => {
      if (!this.remoteShoppingListId) {
        throw new Error('La lista non è ancora stata sincronizzata.');
      }
      await this.remote.setShoppingItemsChecked(householdId, this.remoteShoppingListId, checked);
    });
    this.persist();
  }

  approveShoppingList(): void {
    if (this.mealPlanState().status !== 'approved' || this.shoppingListState().status !== 'draft') {
      this.error.set('La lista non è in bozza.');
      return;
    }
    this.shoppingListState.update((list) => ({
      ...list,
      status: 'approved',
      approvedAt: new Date().toISOString(),
    }));
    this.enqueueRemote(async (householdId, userId) => {
      if (!this.remoteShoppingListId) {
        throw new Error('La lista non è ancora stata sincronizzata.');
      }
      await this.remote.approveShoppingList(householdId, userId, this.remoteShoppingListId);
    });
    this.persist();
  }

  completeShopping(): void {
    const list = this.shoppingListState();
    if (list.status !== 'approved' || list.completedAt) {
      this.error.set('Approva la lista prima di completare la spesa.');
      return;
    }
    const missingQuantity = list.items.find((item) => item.checked && item.quantity === null);
    if (missingQuantity) {
      this.error.set(`Inserisci la quantità acquistata di ${missingQuantity.name}.`);
      return;
    }
    if (this.remoteModeState()) {
      this.enqueueRemote(async (_householdId) => {
        if (!this.remoteShoppingListId) {
          throw new Error('La lista non è ancora stata sincronizzata.');
        }
        await this.remote.completeShoppingList(this.remoteShoppingListId);
        if (this.activeHouseholdId && this.activeUserId) {
          await this.loadRemote(this.activeHouseholdId, this.activeUserId);
        }
      });
      return;
    }
    const purchased = list.items.filter(
      (item): item is ShoppingListEntry & { quantity: number } =>
        item.checked && item.quantity !== null,
    );
    this.pantryState.update((pantry) => {
      const next = [...pantry];
      for (const item of purchased) {
        const existingIndex = next.findIndex(
          (pantryItem) =>
            pantryItem.ingredientId === item.ingredientId &&
            pantryItem.unit === item.unit &&
            pantryItem.location === 'pantry',
        );
        if (existingIndex >= 0) {
          const existing = next[existingIndex];
          next[existingIndex] = { ...existing, quantity: existing.quantity + item.quantity };
        } else {
          next.push({
            id: createId(),
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unit: item.unit,
            location: 'pantry',
            expiresOn: null,
          });
        }
      }
      return next;
    });
    this.shoppingListState.update((current) => ({
      ...current,
      completedAt: new Date().toISOString(),
    }));
    this.persist();
  }

  private async loadRemote(householdId: string, userId: string): Promise<void> {
    const generation = ++this.remoteGeneration;
    this.activeHouseholdId = householdId;
    this.activeUserId = userId;
    this.remoteModeState.set(true);
    this.loading.set(true);
    this.stopShoppingSubscription?.();
    this.stopShoppingSubscription = null;
    this.remotePlanId = null;
    this.remoteShoppingListId = null;
    this.ingredientsState.set([]);
    this.pantryState.set([]);
    this.recipesState.set([]);
    this.cookingHistoryState.set([]);
    this.mealPlanState.set({ status: 'draft', meals: [], approvedAt: null });
    this.shoppingListState.set({
      status: 'draft',
      items: [],
      approvedAt: null,
      completedAt: null,
    });
    this.error.set(null);
    try {
      const snapshot = await this.remote.loadSnapshot(householdId);
      if (generation !== this.remoteGeneration) {
        return;
      }
      this.ingredientsState.set(snapshot.ingredients.map(normalizeIngredient));
      this.pantryState.set(snapshot.pantryItems);
      this.recipesState.set(snapshot.recipes);
      this.cookingHistoryState.set(snapshot.cookingHistory);
      this.mealPlanState.set(normalizeMealPlan(snapshot.mealPlan));
      this.shoppingListState.set(snapshot.shoppingList);
      this.remotePlanId = snapshot.mealPlanId;
      this.remoteShoppingListId = snapshot.shoppingListId;
      this.subscribeToShoppingList();
    } catch (error) {
      if (generation === this.remoteGeneration) {
        this.error.set(errorMessage(error, 'Impossibile caricare i dati della cucina.'));
      }
    } finally {
      if (generation === this.remoteGeneration) {
        this.loading.set(false);
      }
    }
  }

  private enqueueRemote(operation: (householdId: string, userId: string) => Promise<void>): void {
    if (!this.remoteModeState()) {
      return;
    }
    const householdId = this.activeHouseholdId;
    const userId = this.activeUserId;
    if (!householdId || !userId) {
      this.error.set('La sessione non è associata a una casa.');
      return;
    }
    const generation = this.remoteGeneration;
    this.pendingRemoteOperations += 1;
    this.syncing.set(true);
    this.remoteQueue = this.remoteQueue
      .then(async () => {
        if (generation === this.remoteGeneration) {
          await operation(householdId, userId);
        }
      })
      .catch(async (error: unknown) => {
        if (generation === this.remoteGeneration) {
          const message = errorMessage(error, 'Impossibile sincronizzare le modifiche.');
          await this.loadRemote(householdId, userId);
          this.error.set(message);
        }
      })
      .finally(() => {
        this.pendingRemoteOperations -= 1;
        this.syncing.set(this.pendingRemoteOperations > 0);
      });
  }

  private persistPlan(): void {
    if (!this.remoteModeState()) {
      return;
    }
    this.enqueueRemote(async (householdId) => {
      if (!this.remotePlanId) {
        throw new Error('Il piano non è ancora stato sincronizzato.');
      }
      await this.remote.replacePlanEntries(
        householdId,
        this.remotePlanId,
        this.mealPlanState().meals,
      );
    });
  }

  private plannerOptions() {
    return {
      slots: [],
      recipes: this.recipesState(),
      pantryItems: this.pantryState(),
      cookingHistory: this.cookingHistoryState(),
      ingredients: this.ingredientsState(),
      today: localDate(new Date()),
    };
  }

  private subscribeToShoppingList(): void {
    if (!this.remoteShoppingListId) {
      return;
    }
    this.stopShoppingSubscription?.();
    this.stopShoppingSubscription = this.remote.subscribeToShoppingList(
      this.remoteShoppingListId,
      (change) => this.applyShoppingListChange(change),
      (error) => this.error.set(error.message),
    );
  }

  private applyShoppingListChange(change: ShoppingListChange): void {
    this.shoppingListState.update((list) => {
      if (change.eventType === 'DELETE') {
        return { ...list, items: list.items.filter((item) => item.id !== change.id) };
      }
      const existing = list.items.some((item) => item.id === change.item.id);
      const items = existing
        ? list.items.map((item) => (item.id === change.item.id ? change.item : item))
        : [...list.items, change.item];
      return { ...list, items };
    });
  }

  private deactivateRemote(): void {
    this.remoteGeneration += 1;
    this.stopShoppingSubscription?.();
    this.stopShoppingSubscription = null;
    this.remoteModeState.set(false);
    this.loading.set(false);
    this.activeHouseholdId = null;
    this.activeUserId = null;
    this.remotePlanId = null;
    this.remoteShoppingListId = null;
  }

  private resetToDemo(): void {
    this.ingredientsState.set([...DEMO_INGREDIENTS]);
    this.pantryState.set([...DEMO_PANTRY_ITEMS]);
    this.recipesState.set([...DEMO_RECIPES]);
    this.cookingHistoryState.set([]);
    this.mealPlanState.set({ status: 'draft', meals: [], approvedAt: null });
    this.shoppingListState.set({
      status: 'draft',
      items: [],
      approvedAt: null,
      completedAt: null,
    });
    this.error.set(null);
  }

  clearError(): void {
    this.error.set(null);
  }

  private requireDraftPlan(): boolean {
    if (this.mealPlanState().status !== 'draft') {
      this.error.set('Le modifiche sono disponibili solo in bozza.');
      return false;
    }
    return true;
  }

  private requireDraftShoppingList(): boolean {
    if (this.shoppingListState().status !== 'draft') {
      this.error.set('Puoi modificare la lista solo mentre è in bozza.');
      return false;
    }
    return true;
  }

  private restore(): void {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }
      const value: unknown = JSON.parse(stored);
      if (!isPersistedKitchenState(value)) {
        throw new Error('I dati salvati non hanno un formato valido.');
      }
      if (value.ingredients) {
        this.ingredientsState.set(value.ingredients.map(normalizeIngredient));
      }
      this.pantryState.set(value.pantryItems);
      this.recipesState.set(value.recipes);
      this.cookingHistoryState.set(value.cookingHistory);
      this.mealPlanState.set(normalizeMealPlan(value.mealPlan));
      this.shoppingListState.set(value.shoppingList);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Impossibile leggere i dati salvati nel browser.',
      );
    }
  }

  private persist(): void {
    if (this.remoteModeState()) {
      return;
    }
    try {
      const state: PersistedKitchenState = {
        version: 1,
        ingredients: this.ingredientsState(),
        pantryItems: this.pantryState(),
        recipes: this.recipesState(),
        cookingHistory: this.cookingHistoryState(),
        mealPlan: this.mealPlanState(),
        shoppingList: this.shoppingListState(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      this.error.set(null);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Impossibile salvare i dati nel browser.',
      );
    }
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPantryItem(value: unknown): value is PantryItem {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['id'] === 'string' &&
    typeof value['ingredientId'] === 'string' &&
    typeof value['quantity'] === 'number' &&
    Number.isFinite(value['quantity']) &&
    value['quantity'] > 0 &&
    isMeasurementUnit(value['unit']) &&
    isStorageLocation(value['location']) &&
    (typeof value['expiresOn'] === 'string' || value['expiresOn'] === null)
  );
}

function isIngredient(value: unknown): value is Ingredient {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    isIngredientCategory(value['category']) &&
    (value['nutritionGroups'] === undefined ||
      (Array.isArray(value['nutritionGroups']) && value['nutritionGroups'].every(isNutritionGroup)))
  );
}

function isNutritionGroup(value: unknown): value is NutritionGroup {
  return (
    value === 'carbohydrate' || value === 'protein' || value === 'vegetable' || value === 'other'
  );
}

function normalizeIngredient(ingredient: Ingredient): Ingredient {
  const groups = Array.isArray(ingredient.nutritionGroups) ? ingredient.nutritionGroups : [];
  return {
    ...ingredient,
    nutritionGroups: normalizeNutritionGroups(groups),
  };
}

function normalizeMealPlan(mealPlan: MealPlan): MealPlan {
  return {
    ...mealPlan,
    meals: mealPlan.meals.map((meal) => ({
      ...meal,
      additionalRecipeIds: Array.isArray(meal.additionalRecipeIds) ? meal.additionalRecipeIds : [],
    })),
  };
}

function isRecipe(value: unknown): value is Recipe {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['id'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['description'] === 'string' &&
    typeof value['servings'] === 'number' &&
    Number.isFinite(value['servings']) &&
    typeof value['prepMinutes'] === 'number' &&
    Number.isFinite(value['prepMinutes']) &&
    isRecipeCategory(value['category']) &&
    Array.isArray(value['tags']) &&
    value['tags'].every((tag: unknown) => typeof tag === 'string') &&
    Array.isArray(value['instructions']) &&
    value['instructions'].every((step: unknown) => typeof step === 'string') &&
    Array.isArray(value['ingredients']) &&
    value['ingredients'].every(isRecipeIngredient) &&
    typeof value['favorite'] === 'boolean' &&
    typeof value['excludedFromPlan'] === 'boolean' &&
    typeof value['repeatable'] === 'boolean'
  );
}

function isRecipeIngredient(value: unknown): value is RecipeIngredient {
  return isRecord(value) && typeof value['ingredientId'] === 'string';
}

function isPlannedMeal(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['date'] === 'string' &&
    (value['slot'] === 'lunch' || value['slot'] === 'dinner') &&
    typeof value['locked'] === 'boolean' &&
    (typeof value['recipeId'] === 'string' || value['recipeId'] === null) &&
    (value['sideRecipeId'] === undefined ||
      typeof value['sideRecipeId'] === 'string' ||
      value['sideRecipeId'] === null) &&
    (value['additionalRecipeIds'] === undefined ||
      (Array.isArray(value['additionalRecipeIds']) &&
        value['additionalRecipeIds'].every((id: unknown) => typeof id === 'string'))) &&
    typeof value['score'] === 'number' &&
    typeof value['reason'] === 'string'
  );
}

function isShoppingItem(value: unknown): value is ShoppingListEntry {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['ingredientId'] === 'string' &&
    typeof value['name'] === 'string' &&
    isIngredientCategory(value['category']) &&
    (value['quantity'] === null ||
      (typeof value['quantity'] === 'number' &&
        Number.isFinite(value['quantity']) &&
        value['quantity'] > 0)) &&
    isMeasurementUnit(value['unit']) &&
    typeof value['checked'] === 'boolean' &&
    typeof value['manual'] === 'boolean'
  );
}

function isPersistedKitchenState(value: unknown): value is PersistedKitchenState {
  if (!isRecord(value) || value['version'] !== 1) {
    return false;
  }
  const mealPlan = value['mealPlan'];
  const shoppingList = value['shoppingList'];
  const history = value['cookingHistory'];
  return (
    (value['ingredients'] === undefined ||
      (Array.isArray(value['ingredients']) && value['ingredients'].every(isIngredient))) &&
    Array.isArray(value['pantryItems']) &&
    value['pantryItems'].every(isPantryItem) &&
    Array.isArray(value['recipes']) &&
    value['recipes'].every(isRecipe) &&
    Array.isArray(history) &&
    history.every(
      (entry: unknown) =>
        isRecord(entry) &&
        typeof entry['recipeId'] === 'string' &&
        typeof entry['cookedOn'] === 'string',
    ) &&
    isRecord(mealPlan) &&
    isWorkflowStatus(mealPlan['status']) &&
    Array.isArray(mealPlan['meals']) &&
    mealPlan['meals'].every(isPlannedMeal) &&
    (typeof mealPlan['approvedAt'] === 'string' || mealPlan['approvedAt'] === null) &&
    isRecord(shoppingList) &&
    isWorkflowStatus(shoppingList['status']) &&
    Array.isArray(shoppingList['items']) &&
    shoppingList['items'].every(isShoppingItem) &&
    (typeof shoppingList['approvedAt'] === 'string' || shoppingList['approvedAt'] === null) &&
    (typeof shoppingList['completedAt'] === 'string' || shoppingList['completedAt'] === null)
  );
}

function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return value === 'draft' || value === 'approved';
}

function isMeasurementUnit(value: unknown): value is MeasurementUnit {
  return value === 'g' || value === 'kg' || value === 'ml' || value === 'l' || value === 'pz';
}

function isStorageLocation(value: unknown): value is PantryItem['location'] {
  return value === 'pantry' || value === 'fridge' || value === 'freezer';
}

function isIngredientCategory(value: unknown): value is IngredientCategory {
  return (
    value === 'fruit-vegetables' ||
    value === 'dairy' ||
    value === 'meat-fish' ||
    value === 'bakery' ||
    value === 'pantry' ||
    value === 'other'
  );
}

function isRecipeCategory(value: unknown): value is RecipeCategory {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'other';
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  return monday;
}

function createId(): string {
  return crypto.randomUUID();
}
