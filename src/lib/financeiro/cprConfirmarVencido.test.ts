/**
 * CPR-D1 — o "Ainda vai acontecer" muda SÓ o vencimento (nenhum outro campo regravado) e o motivo do "Não vai acontecer" é o MESMO
 * texto que a `fn_lancamento_descancelar` (118490) exige. Dado sintético (o fixture do semClassificacao).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';
import { soOQueMudou } from '@/lib/financeiro/camposMudados';
import { MOTIVO_NAO_VAI_ACONTECER_CPR, MOTIVO_NAO_VAI_DESLIGADO, formDoNovoVencimentoCpr } from '@/lib/financeiro/cprConfirmarVencido';

const FIX: { lancamento: LancamentoV2 } = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/semClassificacao.fixture.json'), 'utf8'));

describe('"Ainda vai acontecer": o vencimento passa para hoje e mais nada', () => {
  it('o form é o lançamento como está, com o vencimento novo e SÓ ele marcado como mudado', () => {
    const f = formDoNovoVencimentoCpr(FIX.lancamento, '2026-11-24');
    expect(f.data_vencimento).toBe('2026-11-24');
    expect(f.camposMudados).toEqual(['data_vencimento']);
    expect(f.valor).toBe(FIX.lancamento.valor);
    expect(f.data_competencia).toBe(FIX.lancamento.data_competencia);
    /* o desfazer é o mesmo gesto com o vencimento de antes */
    expect(formDoNovoVencimentoCpr(FIX.lancamento, '2026-07-08').data_vencimento).toBe('2026-07-08');
  });

  it('o UPDATE do gravador leva só o vencimento (e as marcas de quem grava), nunca valor, conta, fornecedor ou classificação', () => {
    const f = formDoNovoVencimentoCpr(FIX.lancamento, '2026-11-24');
    const payload = {
      fazenda_id: f.fazenda_id, conta_bancaria_id: f.conta_bancaria_id, data_competencia: f.data_competencia, data_vencimento: f.data_vencimento,
      data_pagamento: f.data_pagamento, valor: f.valor, sinal: -1, tipo_operacao: f.tipo_operacao, status_transacao: f.status_transacao,
      descricao: f.descricao, subcentro: f.subcentro, favorecido_id: f.favorecido_id, safra_id: f.safra_id, ano_mes: '2026-11',
      editado_manual: true, updated_by: 'u',
    };
    expect(Object.keys(soOQueMudou(payload, f.camposMudados)).sort()).toEqual(['data_vencimento', 'editado_manual', 'updated_by']);
  });
});

describe('"Não vai acontecer"', () => {
  it('o motivo é o MESMO que a fn_lancamento_descancelar exige (senão nada se desfaz)', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261028118490_cpr_d1_lancamento_descancelar.sql'), 'utf8');
    expect(sql).toContain(`c_motivo constant text := '${MOTIVO_NAO_VAI_ACONTECER_CPR}';`);
  });
  it('com o lote 118490 no banco, o botão está ligado (nenhum motivo de desligado)', () => {
    expect(MOTIVO_NAO_VAI_DESLIGADO).toBeNull();
  });
});
