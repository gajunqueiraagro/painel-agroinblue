
-- Step 1: Reassign lancamentos from duplicate fornecedores to the oldest one
WITH dupes AS (
  SELECT cliente_id, nome_normalizado, 
         (array_agg(id ORDER BY created_at))[1] AS keep_id,
         (array_agg(id ORDER BY created_at))[2:] AS remove_ids
  FROM financeiro_fornecedores
  WHERE nome_normalizado IS NOT NULL
  GROUP BY cliente_id, nome_normalizado
  HAVING count(*) > 1
),
flat AS (
  SELECT keep_id, unnest(remove_ids) AS remove_id
  FROM dupes
)
UPDATE financeiro_lancamentos_v2 l
SET favorecido_id = f.keep_id
FROM flat f
WHERE l.favorecido_id = f.remove_id;

-- Step 2: Reassign contratos references too
WITH dupes AS (
  SELECT cliente_id, nome_normalizado, 
         (array_agg(id ORDER BY created_at))[1] AS keep_id,
         (array_agg(id ORDER BY created_at))[2:] AS remove_ids
  FROM financeiro_fornecedores
  WHERE nome_normalizado IS NOT NULL
  GROUP BY cliente_id, nome_normalizado
  HAVING count(*) > 1
),
flat AS (
  SELECT keep_id, unnest(remove_ids) AS remove_id
  FROM dupes
)
UPDATE financeiro_contratos c
SET fornecedor_id = f.keep_id
FROM flat f
WHERE c.fornecedor_id = f.remove_id;

-- Step 3: Delete the duplicate fornecedores (keep oldest)
WITH dupes AS (
  SELECT cliente_id, nome_normalizado, 
         (array_agg(id ORDER BY created_at))[1] AS keep_id,
         (array_agg(id ORDER BY created_at))[2:] AS remove_ids
  FROM financeiro_fornecedores
  WHERE nome_normalizado IS NOT NULL
  GROUP BY cliente_id, nome_normalizado
  HAVING count(*) > 1
),
flat AS (
  SELECT unnest(remove_ids) AS remove_id FROM dupes
)
DELETE FROM financeiro_fornecedores
WHERE id IN (SELECT remove_id FROM flat);

-- Step 4: Create unique index
CREATE UNIQUE INDEX idx_financeiro_fornecedores_cliente_nome_norm_unique
  ON public.financeiro_fornecedores (cliente_id, nome_normalizado)
  WHERE nome_normalizado IS NOT NULL;
