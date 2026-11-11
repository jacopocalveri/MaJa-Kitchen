import { Ingredient, NutritionGroup, Recipe } from './kitchen.models';

export type MacroGroup = Exclude<NutritionGroup, 'other'>;

export const MACRO_GROUPS: readonly MacroGroup[] = ['carbohydrate', 'protein', 'vegetable'];

export function normalizeNutritionGroups(groups: readonly NutritionGroup[]): NutritionGroup[] {
  const unique = new Set(groups);
  if (unique.size > 1) {
    unique.delete('other');
  }
  return [...unique].sort((left, right) => groupOrder(left) - groupOrder(right));
}

function groupOrder(group: NutritionGroup): number {
  return group === 'other' ? MACRO_GROUPS.length : MACRO_GROUPS.indexOf(group);
}

export function inferNutritionGroups(
  name: string,
  category: Ingredient['category'],
): NutritionGroup[] | null {
  const normalized = name
    .toLocaleLowerCase('it')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  if (/(ceci|fagiol|lenticch|pisell|lupin|legum)/.test(normalized)) {
    return ['carbohydrate', 'protein'];
  }
  if (
    /(patat|pasta|riso|cous[\s-]?cous|orzo|farro|avena|quinoa|cereali|pane|farina|polenta|semola|mais|grissin|cracker|weetabix|bulgur|grano)/.test(
      normalized,
    )
  ) {
    return ['carbohydrate'];
  }
  if (
    /(olio|sale|pepe|aceto|zucchero|miele|spez|erbe|origano|basilico|prezzemolo|rosmarino|menta|salvia|cumino|curcuma|curry|harissa|lievito|limon|lime|aranc|pompel|avocado|banan|mela|pera|pesca|frutt|uva|caffe|cacao)/.test(
      normalized,
    )
  ) {
    return ['other'];
  }
  if (
    category === 'meat-fish' ||
    category === 'dairy' ||
    /(carne|pollo|tacchin|manzo|vitello|maiale|agnello|pesce|tonno|salmone|merluzz|calamar|gamber|acciugh|vongol|uova|albume|latte|yogurt|formagg|parmig|pecorino|ricotta|mozzarella|tofu|seitan|soia)/.test(
      normalized,
    )
  ) {
    return ['protein'];
  }
  if (category === 'bakery') {
    return ['carbohydrate'];
  }
  if (category === 'fruit-vegetables') {
    return ['vegetable'];
  }
  return null;
}

export function ingredientMacroGroups(ingredient: Ingredient): MacroGroup[] {
  const groups =
    (ingredient.nutritionGroups?.length ?? 0) > 0
      ? ingredient.nutritionGroups
      : (inferNutritionGroups(ingredient.name, ingredient.category) ?? []);
  return groups.filter((group): group is MacroGroup => group !== 'other');
}

export function recipeMacroGroups(
  recipe: Recipe,
  ingredients: readonly Ingredient[],
): Set<MacroGroup> {
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const groups = new Set<MacroGroup>();
  for (const recipeIngredient of recipe.ingredients) {
    const ingredient = ingredientById.get(recipeIngredient.ingredientId);
    if (!ingredient) {
      continue;
    }
    for (const group of ingredientMacroGroups(ingredient)) {
      groups.add(group);
    }
  }
  return groups;
}

export function isNutritionallyComplete(groups: ReadonlySet<MacroGroup>): boolean {
  return MACRO_GROUPS.every((group) => groups.has(group));
}

export function isCompatibleSideDish(
  mainGroups: ReadonlySet<MacroGroup>,
  sideGroups: ReadonlySet<MacroGroup>,
): boolean {
  return (
    !(mainGroups.has('carbohydrate') && sideGroups.has('carbohydrate')) &&
    [...sideGroups].some((group) => !mainGroups.has(group))
  );
}
