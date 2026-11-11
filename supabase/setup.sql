-- Esegui dal Supabase Dashboard > SQL Editor; rieseguilo dopo gli aggiornamenti di questo file.
-- Il seed viene creato per l'utente autenticato chiamando create_household_with_seed().

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, created_by)
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  canonical_name text not null check (length(trim(canonical_name)) between 1 and 100),
  name text not null check (length(trim(name)) between 1 and 100),
  category text not null check (
    category in ('fruit-vegetables', 'dairy', 'meat-fish', 'bakery', 'pantry', 'other')
  ),
  nutrition_groups text[] not null default '{}'
    check (nutrition_groups <@ array['carbohydrate', 'protein', 'vegetable', 'other']::text[]),
  created_at timestamptz not null default now(),
  unique (household_id, canonical_name),
  unique (id, household_id)
);

alter table public.ingredients
  add column if not exists nutrition_groups text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredients_nutrition_groups_check'
      and conrelid = 'public.ingredients'::regclass
  ) then
    alter table public.ingredients
      add constraint ingredients_nutrition_groups_check
      check (nutrition_groups <@ array['carbohydrate', 'protein', 'vegetable', 'other']::text[]);
  end if;
end;
$$;

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ingredient_id uuid not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'pz')),
  location text not null check (location in ('pantry', 'fridge', 'freezer')),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ingredient_id, household_id)
    references public.ingredients(id, household_id) on delete restrict,
  unique (id, household_id)
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 140),
  description text not null default '',
  servings integer not null default 2 check (servings between 1 and 100),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  category text not null check (category in ('breakfast', 'lunch', 'dinner', 'other')),
  tags text[] not null default '{}',
  instructions text[] not null default '{}',
  favorite boolean not null default false,
  excluded_from_plan boolean not null default false,
  repeatable boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.recipe_ingredients (
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  primary key (recipe_id, ingredient_id),
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete cascade,
  foreign key (ingredient_id, household_id)
    references public.ingredients(id, household_id) on delete restrict
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  is_active boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  check (
    (status = 'draft' and approved_by is null and approved_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null)
  ),
  check (not is_active or status = 'approved')
);

create unique index if not exists meal_plans_one_active_per_week
  on public.meal_plans (household_id, week_start)
  where status = 'approved' and is_active;

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_id uuid not null,
  meal_date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'other')),
  recipe_id uuid,
  side_recipe_id uuid,
  locked boolean not null default false,
  score numeric(8, 3) not null default 0,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint meal_plan_entries_id_household_key unique (id, household_id),
  unique (meal_plan_id, meal_date, slot),
  foreign key (meal_plan_id, household_id)
    references public.meal_plans(id, household_id) on delete cascade,
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete restrict,
  constraint meal_plan_entries_side_recipe_household_fkey
    foreign key (side_recipe_id, household_id)
    references public.recipes(id, household_id) on delete restrict
);

alter table public.meal_plan_entries
  add column if not exists side_recipe_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_entries_side_recipe_household_fkey'
      and conrelid = 'public.meal_plan_entries'::regclass
  ) then
    alter table public.meal_plan_entries
      add constraint meal_plan_entries_side_recipe_household_fkey
      foreign key (side_recipe_id, household_id)
      references public.recipes(id, household_id) on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_entries_id_household_key'
      and conrelid = 'public.meal_plan_entries'::regclass
  ) then
    alter table public.meal_plan_entries
      add constraint meal_plan_entries_id_household_key unique (id, household_id);
  end if;
end;
$$;

create table if not exists public.meal_plan_entry_additional_recipes (
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_entry_id uuid not null,
  recipe_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (meal_plan_entry_id, recipe_id),
  foreign key (meal_plan_entry_id, household_id)
    references public.meal_plan_entries(id, household_id) on delete cascade,
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete restrict
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  unique (meal_plan_id),
  foreign key (meal_plan_id, household_id)
    references public.meal_plans(id, household_id) on delete cascade,
  check (
    (status = 'draft' and approved_by is null and approved_at is null and completed_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null)
  )
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  shopping_list_id uuid not null,
  ingredient_id uuid,
  name text not null check (length(trim(name)) between 1 and 140),
  category text not null check (
    category in ('fruit-vegetables', 'dairy', 'meat-fish', 'bakery', 'pantry', 'other')
  ),
  quantity numeric(12, 3) check (quantity is null or quantity > 0),
  unit text not null default 'pz' check (unit in ('g', 'kg', 'ml', 'l', 'pz')),
  checked boolean not null default false,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (shopping_list_id, household_id)
    references public.shopping_lists(id, household_id) on delete cascade,
  foreign key (ingredient_id, household_id)
    references public.ingredients(id, household_id) on delete restrict
);

create table if not exists public.cooking_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id uuid not null,
  cooked_on date not null default current_date,
  cooked_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (recipe_id, household_id)
    references public.recipes(id, household_id) on delete restrict
);

-- Migra le ricette esistenti: le quantità non fanno più parte degli ingredienti.
delete from public.recipe_ingredients as target_row
using public.recipe_ingredients as duplicate_row
where target_row.recipe_id = duplicate_row.recipe_id
  and target_row.ingredient_id = duplicate_row.ingredient_id
  and target_row.ctid > duplicate_row.ctid;

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_pkey;
alter table public.recipe_ingredients
  drop column if exists quantity,
  drop column if exists unit;
alter table public.recipe_ingredients
  add constraint recipe_ingredients_pkey primary key (recipe_id, ingredient_id);

alter table public.shopping_list_items
  alter column quantity drop not null,
  alter column unit set default 'pz';

create index if not exists pantry_items_household_expiry_idx
  on public.pantry_items (household_id, expires_on);
create index if not exists recipes_household_category_idx
  on public.recipes (household_id, category);
create index if not exists meal_plans_household_week_idx
  on public.meal_plans (household_id, week_start desc);
create index if not exists shopping_lists_household_created_idx
  on public.shopping_lists (household_id, created_at desc);
create index if not exists cooking_history_household_cooked_idx
  on public.cooking_history (household_id, cooked_on desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pantry_items_set_updated_at on public.pantry_items;
create trigger pantry_items_set_updated_at
  before update on public.pantry_items
  for each row execute function public.set_updated_at();

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.enforce_household_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_count integer;
begin
  perform 1
  from public.households
  where id = new.household_id
  for update;

  select count(*) into member_count
  from public.household_members
  where household_id = new.household_id;

  if member_count >= 2 then
    raise exception 'A household can have at most two members.';
  end if;

  return new;
end;
$$;

drop trigger if exists household_member_limit on public.household_members;
create trigger household_member_limit
  before insert on public.household_members
  for each row execute function public.enforce_household_member_limit();

create or replace function public.create_household_with_seed(p_name text default 'Casa MaJa')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_household_id uuid;
  new_recipe_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1 from public.household_members where user_id = current_user_id
  ) then
    raise exception 'This user already belongs to a household.';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Casa MaJa'), current_user_id)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, current_user_id, 'owner');

  insert into public.ingredients (household_id, canonical_name, name, category)
  values
    (new_household_id, 'pomodori', 'Pomodori', 'fruit-vegetables'),
    (new_household_id, 'zucchine', 'Zucchine', 'fruit-vegetables'),
    (new_household_id, 'spinaci', 'Spinaci', 'fruit-vegetables'),
    (new_household_id, 'aglio', 'Aglio', 'fruit-vegetables'),
    (new_household_id, 'limoni', 'Limoni', 'fruit-vegetables'),
    (new_household_id, 'pasta', 'Pasta', 'pantry'),
    (new_household_id, 'riso', 'Riso', 'pantry'),
    (new_household_id, 'farina', 'Farina', 'pantry'),
    (new_household_id, 'olio-extravergine', 'Olio extravergine', 'pantry'),
    (new_household_id, 'uova', 'Uova', 'dairy'),
    (new_household_id, 'latte', 'Latte', 'dairy'),
    (new_household_id, 'parmigiano', 'Parmigiano', 'dairy'),
    (new_household_id, 'petto-di-pollo', 'Petto di pollo', 'meat-fish'),
    (new_household_id, 'pane', 'Pane', 'bakery');

  insert into public.pantry_items (household_id, ingredient_id, quantity, unit, location)
  select new_household_id, id, quantity, unit, location
  from (
    values
      ('pomodori', 3::numeric, 'pz', 'fridge'),
      ('zucchine', 2::numeric, 'pz', 'fridge'),
      ('spinaci', 120::numeric, 'g', 'fridge'),
      ('pasta', 500::numeric, 'g', 'pantry'),
      ('riso', 300::numeric, 'g', 'pantry'),
      ('uova', 4::numeric, 'pz', 'fridge'),
      ('latte', 500::numeric, 'ml', 'fridge'),
      ('parmigiano', 100::numeric, 'g', 'fridge'),
      ('olio-extravergine', 1::numeric, 'l', 'pantry'),
      ('aglio', 2::numeric, 'pz', 'pantry'),
      ('limoni', 2::numeric, 'pz', 'fridge'),
      ('petto-di-pollo', 350::numeric, 'g', 'freezer')
  ) as seed(canonical_name, quantity, unit, location)
  join public.ingredients i
    on i.household_id = new_household_id
   and i.canonical_name = seed.canonical_name;

  insert into public.recipes (
    household_id, title, description, servings, prep_minutes, category, tags, instructions, created_by
  ) values (
    new_household_id,
    'Pasta al pomodoro',
    'Un grande classico, semplice e profumato.',
    2,
    25,
    'dinner',
    array['vegetariano', 'veloce'],
    array['Cuoci la pasta al dente.', 'Rosola aglio e pomodori con olio.', 'Manteca la pasta con il sugo.'],
    current_user_id
  ) returning id into new_recipe_id;

  insert into public.recipe_ingredients (household_id, recipe_id, ingredient_id)
  select new_household_id, new_recipe_id, i.id
  from (
    values
      ('pasta'),
      ('pomodori'),
      ('aglio'),
      ('olio-extravergine')
  ) as seed(canonical_name)
  join public.ingredients i
    on i.household_id = new_household_id
   and i.canonical_name = seed.canonical_name;

  insert into public.recipes (
    household_id, title, description, servings, prep_minutes, category, tags, instructions, created_by
  ) values (
    new_household_id,
    'Frittata di zucchine',
    'Morbida, dorata e pronta in pochi minuti.',
    2,
    20,
    'lunch',
    array['vegetariano', 'veloce'],
    array['Taglia le zucchine a rondelle.', 'Cuocile in padella.', 'Aggiungi le uova sbattute e cuoci da entrambi i lati.'],
    current_user_id
  ) returning id into new_recipe_id;

  insert into public.recipe_ingredients (household_id, recipe_id, ingredient_id)
  select new_household_id, new_recipe_id, i.id
  from (
    values
      ('zucchine'),
      ('uova'),
      ('parmigiano')
  ) as seed(canonical_name)
  join public.ingredients i
    on i.household_id = new_household_id
   and i.canonical_name = seed.canonical_name;

  insert into public.recipes (
    household_id, title, description, servings, prep_minutes, category, tags, instructions, created_by
  ) values (
    new_household_id,
    'Risotto agli spinaci',
    'Cremoso e perfetto per usare gli spinaci freschi.',
    2,
    35,
    'lunch',
    array['vegetariano'],
    array['Tosta il riso.', 'Aggiungi brodo poco alla volta.', 'Unisci gli spinaci e manteca con parmigiano.'],
    current_user_id
  ) returning id into new_recipe_id;

  insert into public.recipe_ingredients (household_id, recipe_id, ingredient_id)
  select new_household_id, new_recipe_id, i.id
  from (
    values
      ('riso'),
      ('spinaci'),
      ('parmigiano')
  ) as seed(canonical_name)
  join public.ingredients i
    on i.household_id = new_household_id
   and i.canonical_name = seed.canonical_name;

  insert into public.recipes (
    household_id, title, description, servings, prep_minutes, category, tags, instructions, favorite, created_by
  ) values (
    new_household_id,
    'Pollo al limone',
    'Bocconcini di pollo teneri con una salsa agrumata.',
    2,
    30,
    'dinner',
    array['senza glutine'],
    array['Taglia il pollo a bocconcini.', 'Rosolalo con olio e succo di limone.', 'Cuoci finché è dorato e ben cotto.'],
    true,
    current_user_id
  ) returning id into new_recipe_id;

  insert into public.recipe_ingredients (household_id, recipe_id, ingredient_id)
  select new_household_id, new_recipe_id, i.id
  from (
    values
      ('petto-di-pollo'),
      ('limoni'),
      ('olio-extravergine')
  ) as seed(canonical_name)
  join public.ingredients i
    on i.household_id = new_household_id
   and i.canonical_name = seed.canonical_name;

  return new_household_id;
end;
$$;

create or replace function public.approve_meal_plan(p_meal_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_plan public.meal_plans%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into target_plan
  from public.meal_plans
  where id = p_meal_plan_id
    and public.is_household_member(household_id)
  for update;

  if not found or target_plan.status <> 'draft' then
    raise exception 'The meal plan is unavailable or is not a draft.';
  end if;

  update public.meal_plans
  set is_active = false
  where household_id = target_plan.household_id
    and is_active
    and id <> target_plan.id;

  update public.meal_plans
  set status = 'approved',
      is_active = true,
      approved_by = current_user_id,
      approved_at = now()
  where id = target_plan.id;
end;
$$;

create or replace function public.complete_shopping_list(p_shopping_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_list public.shopping_lists%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into target_list
  from public.shopping_lists
  where id = p_shopping_list_id
    and public.is_household_member(household_id)
  for update;

  if not found or target_list.status <> 'approved' or target_list.completed_at is not null then
    raise exception 'The shopping list is unavailable or already completed.';
  end if;

  if exists (
    select 1
    from public.shopping_list_items
    where shopping_list_id = target_list.id
      and checked
      and quantity is null
  ) then
    raise exception 'Set a quantity for every purchased item before completing the list.';
  end if;

  insert into public.pantry_items (
    household_id, ingredient_id, quantity, unit, location
  )
  select target_list.household_id, ingredient_id, quantity, unit, 'pantry'
  from public.shopping_list_items
  where shopping_list_id = target_list.id
    and checked
    and ingredient_id is not null;

  update public.shopping_lists
  set completed_at = now()
  where id = target_list.id;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.ingredients enable row level security;
alter table public.pantry_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.meal_plan_entry_additional_recipes enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.cooking_history enable row level security;

drop policy if exists households_member_select on public.households;
create policy households_member_select on public.households
  for select to authenticated using (public.is_household_member(id));
drop policy if exists households_member_update on public.households;
create policy households_member_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

drop policy if exists household_members_member_select on public.household_members;
create policy household_members_member_select on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists ingredients_household_access on public.ingredients;
create policy ingredients_household_access on public.ingredients
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists pantry_items_household_access on public.pantry_items;
create policy pantry_items_household_access on public.pantry_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists recipes_household_access on public.recipes;
create policy recipes_household_access on public.recipes
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists recipe_ingredients_household_access on public.recipe_ingredients;
create policy recipe_ingredients_household_access on public.recipe_ingredients
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists meal_plans_household_access on public.meal_plans;
create policy meal_plans_household_access on public.meal_plans
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists meal_plan_entries_household_access on public.meal_plan_entries;
create policy meal_plan_entries_household_access on public.meal_plan_entries
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists meal_plan_entry_additional_recipes_household_access
  on public.meal_plan_entry_additional_recipes;
create policy meal_plan_entry_additional_recipes_household_access
  on public.meal_plan_entry_additional_recipes
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists shopping_lists_household_access on public.shopping_lists;
create policy shopping_lists_household_access on public.shopping_lists
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists shopping_list_items_household_access on public.shopping_list_items;
create policy shopping_list_items_household_access on public.shopping_list_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists cooking_history_household_access on public.cooking_history;
create policy cooking_history_household_access on public.cooking_history
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

revoke all on
  public.households,
  public.household_members,
  public.ingredients,
  public.pantry_items,
  public.recipes,
  public.recipe_ingredients,
  public.meal_plans,
  public.meal_plan_entries,
  public.meal_plan_entry_additional_recipes,
  public.shopping_lists,
  public.shopping_list_items,
  public.cooking_history
from anon;

grant select, insert, update, delete on
  public.households,
  public.household_members,
  public.ingredients,
  public.pantry_items,
  public.recipes,
  public.recipe_ingredients,
  public.meal_plans,
  public.meal_plan_entries,
  public.meal_plan_entry_additional_recipes,
  public.shopping_lists,
  public.shopping_list_items,
  public.cooking_history
to authenticated;
grant usage on schema public to authenticated;

revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
revoke all on function public.enforce_household_member_limit() from public, anon, authenticated;
grant execute on function public.enforce_household_member_limit() to authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to authenticated;
revoke all on function public.create_household_with_seed(text) from public, anon;
grant execute on function public.create_household_with_seed(text) to authenticated;
revoke all on function public.approve_meal_plan(uuid) from public, anon;
grant execute on function public.approve_meal_plan(uuid) to authenticated;
revoke all on function public.complete_shopping_list(uuid) from public, anon;
grant execute on function public.complete_shopping_list(uuid) to authenticated;

alter table public.shopping_list_items replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'shopping_list_items'
    )
  then
    execute 'alter publication supabase_realtime add table public.shopping_list_items';
  end if;
end;
$$;
