/**
 * FIN-REGRA-MODAL-02 — a migration 114280 (a sugestão e a conta administrativa do modal "Fazenda fora da regra da conta"), pela fonte.
 * Entra no commit JUNTO com a migration, depois do "aprovo lote" e do apply (o ensaio no proto é a prova do comportamento).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('114280 — a sugestão da regra fazenda × conta', () => {
  it('114280: a ordem da sugestão (descrição → fornecedor → ITR única/maior → histórico) e a conta ADM só de custo fixo do mesmo tipo', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261028114280_fin_regra_modal_02_sugestao.sql'), 'utf8');
    const ordem = ["'origem', 'descricao'", "'origem', 'fornecedor'", "'origem', 'itr_unica'", "'origem', 'itr_maior'", 'when s.itr then null', "'origem', 'historico'"]
      .map((x) => sql.indexOf(x));
    expect(ordem.every((i) => i > 0)).toBe(true);
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem);
    expect(sql).toContain("and c.grupo_custo like 'Custo Fixo %' and c.tipo_operacao is not distinct from p.tipo_operacao");
    expect(sql).toContain('where a.pelo_nome or a.n = 1');
  });
});
