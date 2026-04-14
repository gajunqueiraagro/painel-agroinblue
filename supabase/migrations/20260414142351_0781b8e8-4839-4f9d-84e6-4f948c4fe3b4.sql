-- Temporarily disable the guard to allow backfill into closed months
ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;
ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_meta_admin_only;

DO $$
DECLARE
  v_sta_rita  uuid := '161b905e-f14c-4a9b-965f-dd3c8f82dc74';
  v_cliente   uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  v_new_id    uuid;
BEGIN

  -- JUN 24 - bois: 5 cab, 400kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-06-24', 'transferencia_entrada',
    'bois', 5, 400, 'realizado', 'realizado', false,
    'c11b12a0-e485-4e47-815d-89ad0e9ef73b', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = 'c11b12a0-e485-4e47-815d-89ad0e9ef73b';

  -- JUN 24 - mamotes_f: 6 cab, 80kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-06-24', 'transferencia_entrada',
    'mamotes_f', 6, 80, 'realizado', 'realizado', false,
    'f2a1d6a8-f281-40f5-bfa9-8c82374da45a', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = 'f2a1d6a8-f281-40f5-bfa9-8c82374da45a';

  -- JUN 24 - mamotes_m: 9 cab, 80kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-06-24', 'transferencia_entrada',
    'mamotes_m', 9, 80, 'realizado', 'realizado', false,
    'e007dc7b-87c6-4959-8f8c-ffe017e1a5c4', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = 'e007dc7b-87c6-4959-8f8c-ffe017e1a5c4';

  -- JUN 24 - touros: 1 cab, 650kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-06-24', 'transferencia_entrada',
    'touros', 1, 650, 'realizado', 'realizado', false,
    '4191e465-ad47-4a73-b2c4-2f061bfa0abb', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = '4191e465-ad47-4a73-b2c4-2f061bfa0abb';

  -- JUN 24 - vacas: 15 cab, 450kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-06-24', 'transferencia_entrada',
    'vacas', 15, 450, 'realizado', 'realizado', false,
    '61ac717b-a85b-4813-9ffe-ebda247a085d', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = '61ac717b-a85b-4813-9ffe-ebda247a085d';

  -- JUL 26 - novilhas: 160 cab, 360kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-07-26', 'transferencia_entrada',
    'novilhas', 160, 360, 'realizado', 'realizado', false,
    '3f24c07c-7d63-4e79-96ec-6f918984ffef', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = '3f24c07c-7d63-4e79-96ec-6f918984ffef';

  -- JUL 27 - novilhas: 132 cab, 360kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-07-27', 'transferencia_entrada',
    'novilhas', 132, 360, 'realizado', 'realizado', false,
    'b654427c-ca61-41e9-84ad-474aebf7a18c', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = 'b654427c-ca61-41e9-84ad-474aebf7a18c';

  -- JUL 28 - bois: 2 cab, 450kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-07-28', 'transferencia_entrada',
    'bois', 2, 450, 'realizado', 'realizado', false,
    'ffd430a4-e44c-41b8-bdc0-348d94c4ab22', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = 'ffd430a4-e44c-41b8-bdc0-348d94c4ab22';

  -- JUL 28 - mamotes_m: 1 cab, 80kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-07-28', 'transferencia_entrada',
    'mamotes_m', 1, 80, 'realizado', 'realizado', false,
    '88da83eb-54dd-46c1-83f3-8bab119febc3', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = '88da83eb-54dd-46c1-83f3-8bab119febc3';

  -- JUL 28 - novilhas: 68 cab, 360kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-07-28', 'transferencia_entrada',
    'novilhas', 68, 360, 'realizado', 'realizado', false,
    'e6cc9ff3-10af-4649-be0b-a8e8002ef2fb', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = 'e6cc9ff3-10af-4649-be0b-a8e8002ef2fb';

  -- JUL 28 - vacas: 7 cab, 450kg
  INSERT INTO lancamentos (fazenda_id, cliente_id, data, tipo, categoria,
    quantidade, peso_medio_kg, cenario, status_operacional, cancelado,
    transferencia_par_id, origem_registro)
  VALUES (v_sta_rita, v_cliente, '2023-07-28', 'transferencia_entrada',
    'vacas', 7, 450, 'realizado', 'realizado', false,
    '181a4d4d-9543-4183-9386-c731c5454a5c', 'backfill_par')
  RETURNING id INTO v_new_id;
  UPDATE lancamentos SET transferencia_par_id = v_new_id WHERE id = '181a4d4d-9543-4183-9386-c731c5454a5c';

END $$;

-- Re-enable triggers
ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;
ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_meta_admin_only;