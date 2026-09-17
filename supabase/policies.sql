-- Row Level Security para AirMaintain.
-- Corre esto completo en el SQL Editor de Supabase (Database > SQL Editor).
-- Asume que las tablas ya existen tal como en el modelo (clients, equipment_types,
-- equipment, maintenance_plans, review_points, users, operator_clients,
-- maintenances, maintenance_items, maintenance_photos) y que users.id = auth.uid()
-- del usuario correspondiente (mismo UUID que en Supabase Auth).

alter table clients enable row level security;
alter table equipment_types enable row level security;
alter table equipment enable row level security;
alter table maintenance_plans enable row level security;
alter table review_points enable row level security;
alter table users enable row level security;
alter table operator_clients enable row level security;
alter table maintenances enable row level security;
alter table maintenance_items enable row level security;
alter table maintenance_photos enable row level security;

-- Helper: ¿el usuario autenticado es admin?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'admin');
$$;

-- Helper: ids de clients a los que el usuario autenticado tiene acceso.
create or replace function my_client_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select client_id from operator_clients where operator_id = auth.uid()
  union
  select id from clients where is_admin();
$$;

-- users: cada uno ve su propia fila; admin ve todas.
drop policy if exists users_select on users;
create policy users_select on users for select
  using (id = auth.uid() or is_admin());

-- operator_clients: cada operador ve sus propias asignaciones; admin ve todas.
drop policy if exists operator_clients_select on operator_clients;
create policy operator_clients_select on operator_clients for select
  using (operator_id = auth.uid() or is_admin());

-- clients: visibles si están en my_client_ids().
drop policy if exists clients_select on clients;
create policy clients_select on clients for select
  using (id in (select my_client_ids()));

-- equipment_types: visibles si su client_id es accesible.
drop policy if exists equipment_types_select on equipment_types;
create policy equipment_types_select on equipment_types for select
  using (client_id in (select my_client_ids()));

-- equipment: visible si su equipment_type es accesible.
drop policy if exists equipment_select on equipment;
create policy equipment_select on equipment for select
  using (equipment_type_id in (select id from equipment_types where client_id in (select my_client_ids())));

-- maintenance_plans: visibles si su equipment_type es accesible.
drop policy if exists maintenance_plans_select on maintenance_plans;
create policy maintenance_plans_select on maintenance_plans for select
  using (equipment_type_id in (select id from equipment_types where client_id in (select my_client_ids())));

-- review_points: visibles si su equipment_type es accesible.
drop policy if exists review_points_select on review_points;
create policy review_points_select on review_points for select
  using (equipment_type_id in (select id from equipment_types where client_id in (select my_client_ids())));

-- maintenances: visibles si el equipo es accesible; solo se puede insertar
-- asignándose a uno mismo sobre un equipo accesible.
drop policy if exists maintenances_select on maintenances;
create policy maintenances_select on maintenances for select
  using (
    equipment_id in (
      select e.id from equipment e
      join equipment_types et on et.id = e.equipment_type_id
      where et.client_id in (select my_client_ids())
    )
  );

drop policy if exists maintenances_insert on maintenances;
create policy maintenances_insert on maintenances for insert
  with check (
    assigned_to = auth.uid()
    and equipment_id in (
      select e.id from equipment e
      join equipment_types et on et.id = e.equipment_type_id
      where et.client_id in (select my_client_ids())
    )
  );

-- maintenance_items: visibles/insertables si la maintenance es accesible.
drop policy if exists maintenance_items_select on maintenance_items;
create policy maintenance_items_select on maintenance_items for select
  using (maintenance_id in (select id from maintenances));

drop policy if exists maintenance_items_insert on maintenance_items;
create policy maintenance_items_insert on maintenance_items for insert
  with check (
    maintenance_id in (select id from maintenances where assigned_to = auth.uid())
  );

-- maintenance_photos: mismo criterio que maintenance_items.
drop policy if exists maintenance_photos_select on maintenance_photos;
create policy maintenance_photos_select on maintenance_photos for select
  using (maintenance_id in (select id from maintenances));

drop policy if exists maintenance_photos_insert on maintenance_photos;
create policy maintenance_photos_insert on maintenance_photos for insert
  with check (
    maintenance_id in (select id from maintenances where assigned_to = auth.uid())
  );
