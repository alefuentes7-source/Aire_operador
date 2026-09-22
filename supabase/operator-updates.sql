-- Permite al operador completar una mantención pendiente (la que crea el cron
-- del admin) y actualizar sus puntos de revisión. Correr en el SQL Editor.

drop policy if exists maintenances_update_operator on maintenances;
create policy maintenances_update_operator on maintenances for update
  using (
    status in ('pending', 'in_progress')
    and equipment_id in (
      select e.id from equipment e
      join equipment_types et on et.id = e.equipment_type_id
      where et.client_id in (select my_client_ids())
    )
  )
  with check (assigned_to = auth.uid());

drop policy if exists maintenance_items_update_operator on maintenance_items;
create policy maintenance_items_update_operator on maintenance_items for update
  using (
    maintenance_id in (
      select m.id from maintenances m
      where m.status in ('pending', 'in_progress')
        and m.equipment_id in (
          select e.id from equipment e
          join equipment_types et on et.id = e.equipment_type_id
          where et.client_id in (select my_client_ids())
        )
    )
  );
