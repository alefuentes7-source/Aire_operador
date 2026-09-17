-- Datos de prueba para probar la app end-to-end.
-- 1) Corre este bloque tal cual (usa el mes/año actual para que el equipo
--    quede "pendiente" de inmediato).
-- 2) Crea tu usuario operador en Authentication > Users (email + password).
-- 3) Copia su UUID y reemplaza OPERATOR_UUID_AQUI más abajo, luego corre
--    ese segundo bloque.

with new_client as (
  insert into clients (name, description) values ('Cliente Demo', 'Edificio de prueba')
  returning id
),
new_type as (
  insert into equipment_types (client_id, code, name, description, display_order)
  select id, 'SPLIT-INV', 'Split Inverter', 'Split inverter de pared', 1 from new_client
  returning id, client_id
)
insert into maintenance_plans (equipment_type_id, frequency_months, start_month, start_year)
select id, 3, extract(month from now())::int, extract(year from now())::int from new_type;

insert into review_points (equipment_type_id, code, client_description, operator_description, mandatory, photo_required, comments_allowed, display_order)
select id, code, label, label, true, false, true, ord
from equipment_types, (values
  ('cp1', 'Filtros de aire', 'Verificar limpieza y estado de filtros. Limpiar o reemplazar si es necesario.', 1),
  ('cp2', 'Serpentín evaporador', 'Inspeccionar serpentín por suciedad, corrosión o daños físicos.', 2),
  ('cp3', 'Serpentín condensador', 'Revisar limpieza del serpentín exterior. Verificar que no esté obstruido.', 3),
  ('cp4', 'Compresor', 'Verificar ruido inusual, vibraciones y temperatura superficial del compresor.', 4),
  ('cp5', 'Nivel de refrigerante', 'Comprobar presión de gases. Detectar posibles fugas con detector.', 5),
  ('cp6', 'Drenaje y bandeja', 'Verificar que el drenaje esté libre y la bandeja sin acumulación de agua.', 6),
  ('cp7', 'Sistema eléctrico', 'Revisar conexiones, terminales y estado del tablero eléctrico.', 7),
  ('cp8', 'Ventiladores y motores', 'Verificar estado de aspas, rodamientos y corriente de los motores.', 8)
) as cp(code, label, desc2, ord)
where equipment_types.code = 'SPLIT-INV';

insert into equipment (equipment_type_id, code, description, location, brand, model)
select id, code, description, location, brand, model
from equipment_types, (values
  ('AC-001', 'Split Inverter 18.000 BTU', 'Oficina Gerencia - Piso 3', 'Daikin', 'FTXS18LVMA'),
  ('AC-002', 'Split Inverter 12.000 BTU', 'Recepción Principal - Piso 1', 'LG', 'LS-Q12YNZA'),
  ('AC-003', 'Split Inverter 9.000 BTU', 'Sala de Descanso - Piso 2', 'Midea', 'MSA09CRN')
) as e(code, description, location, brand, model)
where equipment_types.code = 'SPLIT-INV';

-- ── Segundo bloque: correr después de crear el usuario en Authentication ──
-- reemplaza OPERATOR_UUID_AQUI por el UUID real del usuario creado.

insert into users (id, name, email, role)
values ('OPERATOR_UUID_AQUI', 'Operador Demo', 'operador@demo.com', 'operator');

insert into operator_clients (operator_id, client_id)
select 'OPERATOR_UUID_AQUI', id from clients where name = 'Cliente Demo';
