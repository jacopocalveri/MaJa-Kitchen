import { CommonModule } from '@angular/common';
import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IngredientCategory,
  MealSlot,
  MeasurementUnit,
  PantryItem,
  PlannedMeal,
  Recipe,
  RecipeCategory,
  RecipeIngredient,
  ShoppingListEntry,
  StorageLocation,
  NutritionGroup,
  PlanSlot,
} from './domain/kitchen.models';
import { KitchenStore } from './services/kitchen-store';
import { convertCompatibleQuantity } from './domain/shopping-calculator';
import {
  canAddAdditionalRecipe as canAddAdditionalRecipeToMeal,
  isAvailableSideDish,
  isMealCompositionValid,
  isMainPlanRecipe,
  isSideDishRecipe as isSideDishRecipeInPlan,
  requiresSideDishForMeal,
} from './domain/meal-planner';
import { inferNutritionGroups, normalizeNutritionGroups } from './domain/nutrition-groups';
import { AuthService } from './services/auth.service';

type AppSection = 'overview' | 'pantry' | 'recipes' | 'planner' | 'shopping';
type PantryLocationFilter = 'all' | StorageLocation;
type ExpiryFilter = 'all' | 'expiring';

interface MealDay {
  date: string;
  meals: PlannedMeal[];
}

interface PlanDateSelection {
  date: string;
  lunch: boolean;
  dinner: boolean;
}

interface PlanCalendarDay {
  date: string;
  day: number;
  selected: boolean;
  today: boolean;
  inCurrentMonth: boolean;
}

interface RecipeIngredientDraft {
  ingredientName: string;
  category: IngredientCategory;
  nutritionGroups: NutritionGroup[];
}

@Component({
  imports: [CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  readonly store = inject(KitchenStore);
  readonly auth = inject(AuthService);
  readonly authMode = signal<'login' | 'signup'>('login');
  readonly householdSetupMode = signal<'join' | 'create'>('join');
  readonly showHouseholdInvite = signal(false);
  readonly showUserMenu = signal(false);
  readonly showKitchen = computed(
    () => this.auth.status() === 'demo' || this.auth.status() === 'ready',
  );
  readonly activeSection = signal<AppSection>('overview');
  readonly searchText = signal('');
  readonly locationFilter = signal<PantryLocationFilter>('all');
  readonly expiryFilter = signal<ExpiryFilter>('all');
  readonly recipeTagFilter = signal('all');
  readonly onlyReadyRecipes = signal(false);
  readonly showRecipeForm = signal(false);
  readonly addingMealKey = signal<string | null>(null);
  readonly localToday = localDate(new Date());
  readonly planDateSelections = signal<PlanDateSelection[]>([]);
  readonly calendarMonth = signal(this.localToday.slice(0, 7));
  readonly planCalendarWeekdays = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  readonly planCalendarDays = computed(() =>
    this.buildPlanCalendarDays(this.calendarMonth(), this.planDateSelections()),
  );
  readonly planCalendarMonthLabel = computed(() =>
    new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(
      new Date(`${this.calendarMonth()}-01T12:00:00`),
    ),
  );
  readonly todayHeading = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(new Date(`${this.localToday}T12:00:00`))
    .toLocaleUpperCase('it-IT');
  readonly mealDays = computed(() => this.groupMeals(this.store.mealPlan().meals));
  readonly expiringPantryItems = computed(() =>
    this.store.pantryItems().filter((item) => this.isExpiringSoon(item)),
  );
  readonly expiringCount = computed(
    () => this.store.pantryItems().filter((item) => this.isExpiringSoon(item)).length,
  );
  readonly readyRecipeCount = computed(
    () => this.store.recipes().filter((recipe) => this.missingIngredients(recipe) <= 1).length,
  );
  readonly visiblePantry = computed(() => {
    const search = this.searchText().trim().toLocaleLowerCase('it');
    return this.store.pantryItems().filter((item) => {
      const ingredient = this.store.ingredients().find((entry) => entry.id === item.ingredientId);
      const matchesSearch = !search || ingredient?.name.toLocaleLowerCase('it').includes(search);
      const matchesLocation =
        this.locationFilter() === 'all' || item.location === this.locationFilter();
      const matchesExpiry =
        this.expiryFilter() === 'all' ||
        (this.expiryFilter() === 'expiring' && this.isExpiringSoon(item));
      return matchesSearch && matchesLocation && matchesExpiry;
    });
  });
  readonly visibleRecipes = computed(() => {
    const search = this.searchText().trim().toLocaleLowerCase('it');
    return this.store.recipes().filter((recipe) => {
      const matchesSearch =
        !search ||
        recipe.title.toLocaleLowerCase('it').includes(search) ||
        recipe.tags.some((tag) => tag.toLocaleLowerCase('it').includes(search));
      const matchesTag =
        this.recipeTagFilter() === 'all' || recipe.tags.includes(this.recipeTagFilter());
      const matchesStock = !this.onlyReadyRecipes() || this.missingIngredients(recipe) <= 1;
      return matchesSearch && matchesTag && matchesStock;
    });
  });

  readonly navItems: { id: AppSection; label: string; icon: string }[] = [
    { id: 'overview', label: 'Panoramica', icon: '⌂' },
    { id: 'pantry', label: 'Dispensa', icon: '▤' },
    { id: 'recipes', label: 'Ricette', icon: '✳' },
    { id: 'planner', label: 'Piano pasti', icon: '▦' },
    { id: 'shopping', label: 'Spesa', icon: '⌑' },
  ];
  readonly units: MeasurementUnit[] = ['g', 'kg', 'ml', 'l', 'pz'];
  readonly shoppingUnits: MeasurementUnit[] = ['g', 'kg', 'ml', 'l', 'pz'];
  readonly locations: StorageLocation[] = ['pantry', 'fridge', 'freezer'];
  readonly recipeCategories: RecipeCategory[] = ['breakfast', 'lunch', 'dinner', 'other'];
  readonly ingredientCategories: IngredientCategory[] = [
    'fruit-vegetables',
    'dairy',
    'meat-fish',
    'bakery',
    'pantry',
    'other',
  ];
  readonly nutritionGroupOptions: { value: NutritionGroup; label: string }[] = [
    { value: 'carbohydrate', label: 'Carboidrati' },
    { value: 'protein', label: 'Proteine' },
    { value: 'vegetable', label: 'Verdure' },
    { value: 'other', label: 'Altro' },
  ];

  authEmail = '';
  authPassword = '';
  householdName = 'Casa MaJa';
  householdInviteCodeInput = '';

  pantryIngredientName = '';
  pantryIngredientCategory: IngredientCategory = 'other';
  pantryNutritionGroups: NutritionGroup[] = [];
  pantryQuantity = 1;
  pantryUnit: MeasurementUnit = 'pz';
  pantryLocation: StorageLocation = 'fridge';
  pantryExpiresOn = '';

  editingRecipeId: string | null = null;
  recipeTitle = '';
  recipeDescription = '';
  recipeServings = 2;
  recipePrepMinutes = 20;
  recipeCategory: RecipeCategory = 'dinner';
  recipeTags = '';
  recipeRepeatable = false;
  recipeInstructions = '';
  recipeIngredientsDraft: RecipeIngredientDraft[] = [
    { ingredientName: '', category: 'other', nutritionGroups: [] },
  ];

  shoppingIngredientId = this.store.ingredients()[0]?.id ?? '';
  additionalRecipeId = '';
  private planDateSelectionTouched = false;

  constructor() {
    let observedHouseholdId: string | null | undefined;
    effect(() => {
      const householdId = this.auth.householdId();
      const meals = this.store.mealPlan().meals;
      if (householdId !== observedHouseholdId) {
        observedHouseholdId = householdId;
        this.planDateSelectionTouched = false;
        this.planDateSelections.set([]);
        if (householdId !== null) {
          return;
        }
      }
      if (meals.length > 0 && !this.planDateSelectionTouched) {
        const selections = this.selectionsFromMeals(meals);
        this.planDateSelections.set(selections);
        if (selections[0]) {
          this.calendarMonth.set(selections[0].date.slice(0, 7));
        }
      }
    });
    effect(() => {
      const ingredients = this.store.ingredients();
      const firstIngredientId = ingredients[0]?.id;
      if (!firstIngredientId) {
        return;
      }
      if (!ingredients.some((ingredient) => ingredient.id === this.shoppingIngredientId)) {
        this.shoppingIngredientId = firstIngredientId;
      }
    });
    effect((onCleanup) => {
      const storeError = this.store.error();
      const authError = this.auth.error();
      const success = this.store.success();
      if (!storeError && !authError && !success) {
        return;
      }

      const timeout = window.setTimeout(() => {
        if (storeError && this.store.error() === storeError) {
          this.store.clearError();
        }
        if (authError && this.auth.error() === authError) {
          this.auth.clearMessages();
        }
        if (success && this.store.success()?.id === success.id) {
          this.store.clearSuccess();
        }
      }, 5000);
      onCleanup(() => window.clearTimeout(timeout));
    });
    void this.auth.initialize();
  }

  selectSection(section: AppSection): void {
    this.activeSection.set(section);
    this.searchText.set('');
  }

  sectionTitle(): string {
    return this.navItems.find((item) => item.id === this.activeSection())?.label ?? 'Panoramica';
  }

  ingredientName(id: string): string {
    return (
      this.store.ingredients().find((ingredient) => ingredient.id === id)?.name ?? 'Ingrediente'
    );
  }

  locationLabel(location: StorageLocation): string {
    return { pantry: 'Dispensa', fridge: 'Frigo', freezer: 'Freezer' }[location];
  }

  categoryLabel(category: IngredientCategory): string {
    return {
      'fruit-vegetables': 'Frutta e verdura',
      dairy: 'Latticini',
      'meat-fish': 'Carne e pesce',
      bakery: 'Panetteria',
      pantry: 'Dispensa',
      other: 'Altro',
    }[category];
  }

  updatePantryIngredientName(name: string): void {
    this.pantryIngredientName = name;
    const existing = this.findIngredient(name);
    if (existing) {
      this.pantryIngredientCategory = existing.category;
      this.pantryNutritionGroups =
        existing.nutritionGroups.length > 0
          ? [...existing.nutritionGroups]
          : (inferNutritionGroups(existing.name, existing.category) ?? []);
      return;
    }
    this.pantryNutritionGroups = inferNutritionGroups(name, this.pantryIngredientCategory) ?? [];
  }

  updatePantryIngredientCategory(category: IngredientCategory): void {
    this.pantryIngredientCategory = category;
    this.pantryNutritionGroups = inferNutritionGroups(this.pantryIngredientName, category) ?? [];
  }

  togglePantryNutritionGroup(group: NutritionGroup, event: Event): void {
    this.pantryNutritionGroups = this.updatedNutritionGroups(
      this.pantryNutritionGroups,
      group,
      event,
    );
  }

  isNewIngredient(name: string): boolean {
    const canonicalName = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
    return (
      canonicalName.length > 0 &&
      !this.store.ingredients().some((ingredient) => {
        const existingName = ingredient.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
        return existingName === canonicalName;
      })
    );
  }

  recipeCategoryLabel(category: RecipeCategory): string {
    return {
      breakfast: 'Colazione',
      lunch: 'Pranzo',
      dinner: 'Cena',
      other: 'Altro',
    }[category];
  }

  isExpiringSoon(item: PantryItem): boolean {
    if (!item.expiresOn) {
      return false;
    }
    const days = Math.ceil(
      (Date.parse(`${item.expiresOn}T00:00:00Z`) -
        Date.parse(`${localDate(new Date())}T00:00:00Z`)) /
        86_400_000,
    );
    return days >= 0 && days <= 3;
  }

  expiryLabel(item: PantryItem): string {
    if (!item.expiresOn) {
      return 'Senza scadenza';
    }
    const days = Math.ceil(
      (Date.parse(`${item.expiresOn}T00:00:00Z`) -
        Date.parse(`${localDate(new Date())}T00:00:00Z`)) /
        86_400_000,
    );
    if (days < 0) {
      return 'Scaduto';
    }
    if (days === 0) {
      return 'Scade oggi';
    }
    if (days <= 3) {
      return `Scade tra ${days} ${days === 1 ? 'giorno' : 'giorni'}`;
    }
    return `Scade il ${formatDate(item.expiresOn)}`;
  }

  missingIngredients(recipe: Recipe): number {
    const stockedIds = new Set(
      this.store
        .pantryItems()
        .filter((item) => item.quantity > 0)
        .map((item) => item.ingredientId),
    );
    return recipe.ingredients.filter((item) => !stockedIds.has(item.ingredientId)).length;
  }

  recipeById(id: string | null): Recipe | undefined {
    return id ? this.store.recipes().find((recipe) => recipe.id === id) : undefined;
  }

  mealNeedsSideDish(meal: PlannedMeal): boolean {
    return requiresSideDishForMeal(meal, this.store.recipes(), this.store.ingredients());
  }

  isSideDishEligibleForMeal(recipe: Recipe, meal: PlannedMeal): boolean {
    const main = meal.recipeId ? this.recipeById(meal.recipeId) : undefined;
    return Boolean(
      main &&
      this.mealNeedsSideDish(meal) &&
      isAvailableSideDish(recipe) &&
      isMealCompositionValid(
        { ...meal, sideRecipeId: recipe.id },
        this.store.recipes(),
        this.store.ingredients(),
      ),
    );
  }

  isSideDishAvailable(recipe: Recipe): boolean {
    return isAvailableSideDish(recipe);
  }

  isAdditionalRecipeEligible(recipe: Recipe, meal: PlannedMeal): boolean {
    return canAddAdditionalRecipeToMeal(meal, recipe, this.store.recipes());
  }

  hasAdditionalRecipeOptions(meal: PlannedMeal): boolean {
    return this.store.recipes().some((recipe) => this.isAdditionalRecipeEligible(recipe, meal));
  }

  mealKey(meal: PlannedMeal): string {
    return `${meal.date}-${meal.slot}`;
  }

  toggleAdditionalRecipeForm(meal: PlannedMeal): void {
    const key = this.mealKey(meal);
    this.addingMealKey.set(this.addingMealKey() === key ? null : key);
    this.additionalRecipeId = '';
  }

  addAdditionalRecipe(meal: PlannedMeal): void {
    if (!this.additionalRecipeId) {
      return;
    }
    this.store.clearError();
    this.store.addAdditionalRecipe(meal.date, meal.slot, this.additionalRecipeId);
    if (!this.store.error()) {
      this.additionalRecipeId = '';
      this.addingMealKey.set(null);
    }
  }

  additionalRecipeLabel(id: string): string {
    const recipe = this.recipeById(id);
    if (!recipe) {
      return 'Piatto aggiuntivo';
    }
    return `${isSideDishRecipeInPlan(recipe) ? 'Contorno aggiuntivo' : 'Piatto principale aggiuntivo'}: ${recipe.title}`;
  }

  recipeIngredientsLabel(recipe: Recipe): string {
    return recipe.ingredients.map((item) => this.ingredientName(item.ingredientId)).join(' · ');
  }

  dayLabel(date: string): string {
    return new Intl.DateTimeFormat('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${date}T12:00:00`));
  }

  shortDayLabel(date: string): string {
    return new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(
      new Date(`${date}T12:00:00`),
    );
  }

  formatDate(date: string): string {
    return formatDate(date);
  }

  togglePlanDate(date: string): void {
    this.store.clearError();
    this.planDateSelectionTouched = true;
    this.planDateSelections.update((selections) => {
      if (selections.some((selection) => selection.date === date)) {
        return selections.filter((selection) => selection.date !== date);
      }
      return [...selections, { date, lunch: true, dinner: true }].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
    });
    this.calendarMonth.set(date.slice(0, 7));
  }

  changeCalendarMonth(offset: number): void {
    const month = new Date(`${this.calendarMonth()}-01T12:00:00`);
    month.setMonth(month.getMonth() + offset);
    this.calendarMonth.set(localDate(month).slice(0, 7));
  }

  removePlanDate(date: string): void {
    this.planDateSelectionTouched = true;
    this.planDateSelections.update((selections) =>
      selections.filter((selection) => selection.date !== date),
    );
  }

  setPlanDateSlot(date: string, slot: MealSlot, selected: boolean): void {
    this.planDateSelectionTouched = true;
    this.planDateSelections.update((selections) =>
      selections.map((selection) =>
        selection.date === date ? { ...selection, [slot]: selected } : selection,
      ),
    );
  }

  canGeneratePlan(): boolean {
    return this.planDateSelections().some((selection) => selection.lunch || selection.dinner);
  }

  generatePlan(): void {
    const slots: PlanSlot[] = this.planDateSelections().flatMap((selection) => [
      ...(selection.lunch ? [{ date: selection.date, slot: 'lunch' as const, locked: false }] : []),
      ...(selection.dinner
        ? [{ date: selection.date, slot: 'dinner' as const, locked: false }]
        : []),
    ]);
    if (slots.length === 0) {
      this.store.error.set('Seleziona almeno un pranzo o una cena per generare il piano.');
      return;
    }
    this.planDateSelectionTouched = true;
    this.store.generatePlan(slots);
  }

  async addPantryItem(): Promise<void> {
    if (!this.pantryNutritionGroups.length) {
      this.store.error.set(
        'Classifica l’ingrediente nei gruppi nutrizionali prima di aggiungerlo.',
      );
      return;
    }
    this.store.clearError();
    await this.store.addPantryItemByName(
      this.pantryIngredientName,
      this.pantryIngredientCategory,
      {
        quantity: this.pantryQuantity,
        unit: this.pantryUnit,
        location: this.pantryLocation,
        expiresOn: this.pantryExpiresOn || null,
      },
      this.pantryNutritionGroups,
    );
    if (!this.store.error()) {
      this.pantryIngredientName = '';
      this.pantryQuantity = 1;
      this.pantryExpiresOn = '';
      this.pantryNutritionGroups = [];
      this.pantryIngredientCategory = 'other';
    }
  }

  submitAuth(): void {
    if (this.authMode() === 'login') {
      void this.auth.signIn(this.authEmail.trim(), this.authPassword);
    } else {
      void this.auth.signUp(this.authEmail.trim(), this.authPassword);
    }
  }

  createHousehold(): void {
    void this.auth.createHousehold(this.householdName);
  }

  joinHousehold(): void {
    void this.auth.joinHousehold(this.householdInviteCodeInput);
  }

  async copyHouseholdInviteCode(): Promise<void> {
    const inviteCode = this.auth.householdInviteCode();
    if (!inviteCode) {
      this.auth.error.set('Genera prima un codice invito.');
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteCode);
      this.auth.message.set('Codice copiato. Invialo alla persona che vuoi invitare.');
    } catch (error) {
      this.auth.error.set(
        error instanceof Error
          ? `Impossibile copiare il codice: ${error.message}`
          : 'Impossibile copiare il codice invito.',
      );
    }
  }

  signOut(): void {
    this.showUserMenu.set(false);
    void this.auth.signOut();
  }

  userInitials(): string {
    const email = this.auth.user()?.email?.trim();
    if (!email) {
      return 'J';
    }
    const localPart = email.split('@')[0] ?? email;
    const parts = localPart.split(/[._-]+/).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toLocaleUpperCase('it-IT');
    }
    return localPart.slice(0, 2).toLocaleUpperCase('it-IT');
  }

  @HostListener('document:click', ['$event'])
  closeUserMenuOutside(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.profile-menu-container')) {
      this.showUserMenu.set(false);
    }
  }

  deleteMealPlan(): void {
    if (window.confirm('Eliminare il piano e la relativa lista della spesa?')) {
      this.store.deleteMealPlan();
    }
  }

  updatePantryItem(item: PantryItem, quantity: string | number): void {
    const value = Number(quantity);
    this.store.updatePantryItem(item.id, {
      quantity: value,
      unit: item.unit,
      location: item.location,
      expiresOn: item.expiresOn,
    });
  }

  updatePantryLocation(item: PantryItem, location: StorageLocation): void {
    this.store.updatePantryItem(item.id, {
      quantity: item.quantity,
      unit: item.unit,
      location,
      expiresOn: item.expiresOn,
    });
  }

  updatePantryUnit(item: PantryItem, unit: MeasurementUnit): void {
    const quantity = convertCompatibleQuantity(item.quantity, item.unit, unit);
    if (quantity === null) {
      this.store.error.set('Non è possibile convertire tra unità di massa, volume e pezzi.');
      return;
    }
    this.store.updatePantryItem(item.id, {
      quantity,
      unit,
      location: item.location,
      expiresOn: item.expiresOn,
    });
  }

  updatePantryExpiry(item: PantryItem, expiresOn: string): void {
    this.store.updatePantryItem(item.id, {
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expiresOn: expiresOn || null,
    });
  }

  shoppingItemsByCategory(category: IngredientCategory): ShoppingListEntry[] {
    return this.store.shoppingList().items.filter((item) => item.category === category);
  }

  isPlanEligible(recipe: Recipe): boolean {
    return isMainPlanRecipe(recipe);
  }

  openNewRecipe(): void {
    this.closeRecipeForm();
    this.showRecipeForm.set(true);
  }

  addRecipeIngredient(): void {
    this.recipeIngredientsDraft.push({
      ingredientName: '',
      category: 'other',
      nutritionGroups: [],
    });
  }

  updateRecipeIngredientName(index: number, name: string): void {
    const draft = this.recipeIngredientsDraft[index];
    if (!draft) {
      return;
    }
    draft.ingredientName = name;
    const existing = this.findIngredient(name);
    if (existing) {
      draft.category = existing.category;
      draft.nutritionGroups =
        existing.nutritionGroups.length > 0
          ? [...existing.nutritionGroups]
          : (inferNutritionGroups(existing.name, existing.category) ?? []);
      return;
    }
    draft.nutritionGroups = inferNutritionGroups(name, draft.category) ?? [];
  }

  updateRecipeIngredientCategory(index: number, category: IngredientCategory): void {
    const draft = this.recipeIngredientsDraft[index];
    if (!draft) {
      return;
    }
    draft.category = category;
    draft.nutritionGroups = inferNutritionGroups(draft.ingredientName, category) ?? [];
  }

  toggleRecipeIngredientGroup(index: number, group: NutritionGroup, event: Event): void {
    const draft = this.recipeIngredientsDraft[index];
    if (!draft) {
      return;
    }
    draft.nutritionGroups = this.updatedNutritionGroups(draft.nutritionGroups, group, event);
  }

  removeRecipeIngredient(index: number): void {
    this.recipeIngredientsDraft = this.recipeIngredientsDraft.filter(
      (_, position) => position !== index,
    );
  }

  private findIngredient(name: string) {
    const canonicalName = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
    return this.store
      .ingredients()
      .find(
        (ingredient) =>
          ingredient.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it') === canonicalName,
      );
  }

  private updatedNutritionGroups(
    groups: NutritionGroup[],
    group: NutritionGroup,
    event: Event,
  ): NutritionGroup[] {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return groups;
    }
    if (group === 'other') {
      return target.checked ? ['other'] : [];
    }
    const selected = new Set(groups.filter((item) => item !== 'other'));
    if (target.checked) {
      selected.add(group);
    } else {
      selected.delete(group);
    }
    return normalizeNutritionGroups([...selected]);
  }

  editRecipe(recipe: Recipe): void {
    this.editingRecipeId = recipe.id;
    this.recipeTitle = recipe.title;
    this.recipeDescription = recipe.description;
    this.recipeServings = recipe.servings;
    this.recipePrepMinutes = recipe.prepMinutes;
    this.recipeCategory = recipe.category;
    this.recipeTags = recipe.tags.join(', ');
    this.recipeRepeatable = recipe.repeatable;
    this.recipeInstructions = recipe.instructions.join('\n');
    this.recipeIngredientsDraft = recipe.ingredients.map((item) => {
      const ingredient = this.store.ingredients().find((entry) => entry.id === item.ingredientId);
      return {
        ingredientName: ingredient?.name ?? '',
        category: ingredient?.category ?? 'other',
        nutritionGroups: ingredient?.nutritionGroups.length
          ? [...ingredient.nutritionGroups]
          : ingredient
            ? (inferNutritionGroups(ingredient.name, ingredient.category) ?? [])
            : [],
      };
    });
    this.showRecipeForm.set(true);
  }

  async saveRecipe(): Promise<void> {
    if (!this.recipeTitle.trim() || this.recipeServings < 1 || this.recipePrepMinutes < 0) {
      this.store.error.set('Inserisci un titolo, porzioni valide e tempi corretti.');
      return;
    }
    if (
      this.recipeIngredientsDraft.length === 0 ||
      this.recipeIngredientsDraft.some(
        (item) => !item.ingredientName.trim() || item.nutritionGroups.length === 0,
      )
    ) {
      this.store.error.set(
        'Inserisci il nome di ogni ingrediente e assegnagli un gruppo nutrizionale.',
      );
      return;
    }
    const ingredientNames = this.recipeIngredientsDraft.map((item) =>
      item.ingredientName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it'),
    );
    if (new Set(ingredientNames).size !== ingredientNames.length) {
      this.store.error.set('Un ingrediente può comparire una sola volta nella ricetta.');
      return;
    }

    this.store.clearError();
    const ingredients: RecipeIngredient[] = [];
    for (const draft of this.recipeIngredientsDraft) {
      const ingredient = await this.store.ensureIngredientByName(
        draft.ingredientName,
        draft.category,
        draft.nutritionGroups,
      );
      if (!ingredient) {
        return;
      }
      ingredients.push({ ingredientId: ingredient.id });
    }

    this.store.saveRecipe(
      {
        title: this.recipeTitle.trim(),
        description: this.recipeDescription.trim(),
        servings: this.recipeServings,
        prepMinutes: this.recipePrepMinutes,
        category: this.recipeCategory,
        tags: this.recipeTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        instructions: this.recipeInstructions
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean),
        ingredients,
        favorite: this.editingRecipeId
          ? (this.store.recipes().find((recipe) => recipe.id === this.editingRecipeId)?.favorite ??
            false)
          : false,
        excludedFromPlan: this.editingRecipeId
          ? (this.store.recipes().find((recipe) => recipe.id === this.editingRecipeId)
              ?.excludedFromPlan ?? false)
          : false,
        repeatable: this.recipeRepeatable,
      },
      this.editingRecipeId ?? undefined,
    );
    if (!this.store.error()) {
      this.closeRecipeForm();
    }
  }

  closeRecipeForm(): void {
    this.showRecipeForm.set(false);
    this.editingRecipeId = null;
    this.recipeTitle = '';
    this.recipeDescription = '';
    this.recipeServings = 2;
    this.recipePrepMinutes = 20;
    this.recipeCategory = 'dinner';
    this.recipeTags = '';
    this.recipeRepeatable = false;
    this.recipeInstructions = '';
    this.recipeIngredientsDraft = [{ ingredientName: '', category: 'other', nutritionGroups: [] }];
  }

  deleteRecipe(recipe: Recipe): void {
    if (window.confirm(`Eliminare "${recipe.title}"?`)) {
      this.store.removeRecipe(recipe.id);
    }
  }

  addShoppingItem(): void {
    this.store.clearError();
    this.store.addManualShoppingItem(this.shoppingIngredientId);
  }

  updateShoppingQuantity(item: ShoppingListEntry, quantity: string | number | null): void {
    const parsedQuantity = quantity === '' || quantity === null ? null : Number(quantity);
    this.store.updateShoppingItem(item.id, parsedQuantity);
  }

  updateShoppingUnit(item: ShoppingListEntry, unit: MeasurementUnit): void {
    this.store.updateShoppingItem(item.id, item.quantity, unit);
  }

  async copyShoppingList(): Promise<void> {
    const text = this.store
      .shoppingList()
      .items.map((item) => {
        const quantity = item.quantity === null ? '' : ` — ${item.quantity} ${item.unit}`;
        return `${item.checked ? '[x]' : '[ ]'} ${item.name}${quantity}`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text || 'La lista della spesa è vuota.');
    } catch (error) {
      this.store.error.set(
        error instanceof Error
          ? `Impossibile copiare la lista: ${error.message}`
          : 'Impossibile copiare la lista.',
      );
    }
  }

  dateStatus(date: string): string {
    const today = localDate(new Date());
    if (date === today) {
      return 'Oggi';
    }
    const tomorrow = new Date(`${today}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date === localDate(tomorrow)) {
      return 'Domani';
    }
    return this.shortDayLabel(date);
  }

  private groupMeals(meals: readonly PlannedMeal[]): MealDay[] {
    const byDate = new Map<string, PlannedMeal[]>();
    for (const meal of meals) {
      const dayMeals = byDate.get(meal.date) ?? [];
      dayMeals.push(meal);
      byDate.set(meal.date, dayMeals);
    }
    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, dayMeals]) => ({
        date,
        meals: dayMeals.sort((left, right) => left.slot.localeCompare(right.slot)),
      }));
  }

  private selectionsFromMeals(meals: readonly PlannedMeal[]): PlanDateSelection[] {
    const byDate = new Map<string, PlanDateSelection>();
    for (const meal of meals) {
      const selection = byDate.get(meal.date) ?? {
        date: meal.date,
        lunch: false,
        dinner: false,
      };
      selection[meal.slot] = true;
      byDate.set(meal.date, selection);
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  }

  private buildPlanCalendarDays(
    monthValue: string,
    selections: readonly PlanDateSelection[],
  ): PlanCalendarDay[] {
    const monthStart = new Date(`${monthValue}-01T12:00:00`);
    const firstVisibleDate = new Date(monthStart);
    firstVisibleDate.setDate(firstVisibleDate.getDate() - ((firstVisibleDate.getDay() + 6) % 7));
    const selectedDates = new Set(selections.map((selection) => selection.date));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstVisibleDate);
      date.setDate(firstVisibleDate.getDate() + index);
      const dateValue = localDate(date);
      return {
        date: dateValue,
        day: date.getDate(),
        selected: selectedDates.has(dateValue),
        today: dateValue === this.localToday,
        inCurrentMonth: date.getMonth() === monthStart.getMonth(),
      };
    });
  }
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  );
}
