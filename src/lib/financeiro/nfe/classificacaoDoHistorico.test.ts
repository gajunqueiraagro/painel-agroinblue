/**
 * NOTA-CONTA-MESMO-TIPO-01 — a conta sugerida pelo histórico do fornecedor (dados SINTÉTICOS, o desenho do caso do milho do NJ).
 *   H1 a mais usada nos 12 meses vence a mais recente usada uma vez
 *   H2 empate = a mais recente
 *   H3 fora dos 12 meses não conta; sem histórico = nada
 *   H4 a leitura do banco só pega o MESMO tipo ("2-Saídas"): a receita do fornecedor que também compra de nós nunca é sugerida
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classificacaoDoHistorico, type LinhaDoHistorico } from './classificacaoDoHistorico';

const l = (plano: string, data: string): LinhaDoHistorico => ({ plano_conta_id: plano, subcentro: plano, macro_custo: null, grupo_custo: null,
  centro_custo: null, escopo_negocio: null, data });

describe('a conta pelo histórico do fornecedor', () => {
  it('H1 — a mais usada nos 12 meses vence a mais recente usada uma vez', () => {
    const h = [l('outras_adm', '2026-07-13'), l('nutricao', '2026-07-01'), l('nutricao', '2026-06-01'), l('nutricao', '2026-05-01')];
    expect(classificacaoDoHistorico(h)?.plano_conta_id).toBe('nutricao');
    expect(classificacaoDoHistorico(h)?.data).toBe('2026-07-01');
  });
  it('H2 — empate fica com a mais recente', () => {
    expect(classificacaoDoHistorico([l('a', '2026-07-10'), l('b', '2026-07-01'), l('b', '2026-06-01'), l('a', '2026-05-01')])?.plano_conta_id).toBe('a');
  });
  it('H3 — fora dos 12 meses não conta; sem histórico, nada', () => {
    expect(classificacaoDoHistorico([l('a', '2026-07-10'), l('b', '2025-06-01'), l('b', '2025-05-01')])?.plano_conta_id).toBe('a');
    expect(classificacaoDoHistorico([])).toBeNull();
  });
  it('H4 — a leitura do banco pede só o mesmo tipo da nota de compra', () => {
    const src = readFileSync(join(__dirname, '..', 'nfeConsultas.ts'), 'utf8');
    const corpo = src.slice(src.indexOf('export async function ultimaClassificacaoDoFornecedor'), src.indexOf('export async function fazendaPeloHistoricoDoFornecedor'));
    expect(corpo).toMatch(/\.eq\('tipo_operacao', '2-Saídas'\)/);
    expect(corpo).toMatch(/classificacaoDoHistorico\(/);
  });
});
