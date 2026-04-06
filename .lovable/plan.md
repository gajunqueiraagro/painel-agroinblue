## Feature: Aba Metas/Previsto

### Objetivo
Permitir ao usuário registrar metas mensais de GMD por categoria e preços previstos, alimentando o cenário "Previsto" do Painel do Consultor com dados reais de ganho de peso e valorização.

---

### 1. Banco de Dados — Novas Tabelas

#### `meta_gmd_mensal`
Armazena o GMD previsto por categoria, por mês, por fazenda.
- `fazenda_id`, `cliente_id`, `ano_mes` (ex: "2025-03")
- `categoria` (mamotes_m, desmama_m, garrotes, bois, touros, mamotes_f, desmama_f, novilhas, vacas)
- `gmd_previsto` (numeric, kg/cab/dia)
- RLS por cliente

#### `meta_preco_mercado`
Mesma estrutura de `preco_mercado` existente, mas para o cenário previsto/meta.
- `ano_mes`, `bloco`, `categoria`, `unidade`, `valor`, `agio_perc`
- RLS por cliente (sem `fazenda_id`, como o original)

#### `meta_preco_mercado_status`
Controle de status por mês (rascunho/parcial/validado), mesma lógica de `preco_mercado_status`.

---

### 2. Tela — GMD Previsto (sub-aba)

- Seletor de ano no topo
- Grid 9 categorias × 12 meses
- Input: GMD (kg/cab/dia) com 3 casas decimais
- Colunas calculadas automáticas (somente leitura):
  - **Peso Final Previsto** = Peso Início + (GMD × dias do mês)
  - Peso Início do mês N = Peso Final do mês N-1 (cadeia)
  - Peso Início de Jan = peso médio do saldo inicial ou último fechamento dez do ano anterior
- Botão "Copiar ano anterior"
- Botão "Salvar"
- Visual: mesma densidade do Painel do Consultor (text-[10px])

---

### 3. Tela — Preços Previstos (sub-aba)

- Reutiliza a estrutura da tela `PrecoMercadoTab` existente
- Mesmos blocos: Frigorífico, Gado Magro Macho, Gado Magro Fêmea
- Mesmas colunas: Categoria, Unidade, Valor, Ágio %
- Seletor de mês, status (rascunho/parcial/validado)
- Botão "Copiar mês anterior"
- Dados salvos em `meta_preco_mercado` (separados do realizado)

---

### 4. Integração com `vw_zoot_fazenda_mensal`

- Alterar a view para que o cenário `meta` utilize `meta_gmd_mensal` como fonte de GMD
- O cálculo do `gmd_numerador_kg` e `peso_total_final_kg` para meta passará a ser derivado do GMD previsto × cabeças médias × dias
- Isso automaticamente alimenta o Painel do Consultor sem alterações no front

---

### 5. Navegação

- Nova aba "Metas" no menu principal (ou dentro do Hub se preferir)
- Duas sub-abas internas: "GMD Previsto" | "Preços Previstos"

---

### Ordem de execução
1. Migration: criar tabelas `meta_gmd_mensal`, `meta_preco_mercado`, `meta_preco_mercado_status`
2. Hook `useMetaGmd` + tela `MetaGmdTab`
3. Hook `useMetaPrecoMercado` + tela `MetaPrecoTab`
4. Aba "Metas" com sub-abas na navegação
5. Alterar view `vw_zoot_fazenda_mensal` para consumir `meta_gmd_mensal`
