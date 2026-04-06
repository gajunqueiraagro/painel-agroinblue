## Plano: Cenário Meta — Movimentações + Consolidação

### Definição do Modelo
- **Movimentações** são a fonte da verdade (não tabelas de input manual)
- **GMD** atua apenas sobre o estoque remanescente
- **Pesos de saída** vêm da própria movimentação
- **Tela por categoria** = consolidação/visualização

---

### 1. Migration: Coluna `cenario` na tabela `lancamentos`
- Adicionar coluna `cenario text NOT NULL DEFAULT 'realizado'`
- Valores possíveis: `'realizado'`, `'meta'`
- Índice parcial para queries do meta
- **Importante**: Os triggers existentes (guard_mes_fechado_p1, audit, auto_transferencia) devem ser atualizados para ignorar lançamentos com cenario='meta' — o meta não participa de fechamentos nem conciliação

### 2. Atualizar triggers existentes
- `guard_lancamento_mes_fechado_p1`: ignorar cenario='meta'
- `audit_trigger_lancamentos`: registrar mas com módulo 'meta'
- `auto_create_transferencia_entrada`: ignorar cenario='meta' (transferências meta não geram par automático)
- `validar_conciliacao_rebanho`: filtrar apenas cenario='realizado'

### 3. Tela de Movimentação Meta
- Reutilizar a lógica de `MovimentacaoTab` existente
- Filtro fixo `cenario='meta'`
- Mesmos campos: tipo, categoria, quantidade, peso, data
- Acessível via Hub Metas

### 4. Tela de Consolidação por Categoria/Mês
- Grid somente-leitura que consolida:
  - SI (do mês anterior ou saldo inicial)
  - EE, SE, EI, SiI (das movimentações meta)
  - GMD previsto (da tabela `meta_gmd_mensal`)
  - SF, Peso Final, Produção Biológica (calculados)
- Fórmula:
  ```
  SF = SI + EE - SE + EI - SiI
  Cab Médias = (SI + SF) / 2
  Produção Bio = Cab Médias × GMD × Dias
  Peso Total Final = PtInicial + PtEntradas - PtSaídas + Produção Bio
  Peso Médio Final = Peso Total Final / SF
  ```

### 5. Integração com Painel do Consultor
- View `vw_zoot_fazenda_mensal` cenario='meta' consumirá as movimentações meta + GMD previsto
- Mesmos indicadores do realizado, alimentados por dados planejados

---

### Ordem de execução
1. Migration (coluna + triggers)
2. Tela de movimentação meta
3. Tela de consolidação por categoria
4. Integração com view/painel
