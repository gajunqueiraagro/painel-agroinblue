/**
 * OC-CORRECOES-01 C1 · OC-TITULO-AJUSTAR-01 — o titulo de OC em aberto no modal do lancamento. A regra e' pura (aqui); o banco
 * (`oc_titulo_ajustar`) foi provado em `supabase/tests/oc_titulo_ajustar_01_test.sql`; a LIGACAO no modal se prende pela fonte (o
 * modal inteiro nao monta no jsdom sem dezenas de mocks — o mesmo desenho do teste "fonte" do abate).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tituloOCAjustavel, motivoTituloOCTravado, camposDoAjusteOC } from './ajusteDoTituloOC';

describe('o titulo de OC em aberto se ajusta no modal', () => {
  it('em aberto e sem conciliacao: ajustavel; realizado e conciliado: travado, com o porque e onde', () => {
    for (const s of ['previsto', 'programado', 'agendado']) expect(tituloOCAjustavel(s, false)).toBe(true);
    expect(tituloOCAjustavel('realizado', false)).toBe(false);
    expect(tituloOCAjustavel('programado', true)).toBe(false);
    expect(motivoTituloOCTravado('programado', false)).toBeNull();
    expect(motivoTituloOCTravado('realizado', false)).toMatch(/estorne o recebimento\/pagamento primeiro/);
    expect(motivoTituloOCTravado('programado', true)).toMatch(/desfaça a conciliação na Conferência/);
  });

  it('o Receb. 3/3 da 0731374f: so o vencimento mudou (30/07 -> 30/06) vai pela OC', () => {
    const antes = { tipo_operacao: '1-Entradas', data_vencimento: '2026-07-30', conta_destino_id: 'cta', plano_conta_id: 'pl' };
    expect(camposDoAjusteOC(antes, { ...antes, data_vencimento: '2026-06-30' })).toEqual({ data_vencimento: '2026-06-30' });
    expect(camposDoAjusteOC(antes, { ...antes })).toEqual({});
  });

  it('a conta e da direcao do titulo (receita: destino; despesa: origem); a classificacao so com chave nova', () => {
    const rec = { tipo_operacao: '1-Entradas', data_vencimento: '2026-07-30', conta_destino_id: 'a', conta_bancaria_id: null, plano_conta_id: 'pl' };
    expect(camposDoAjusteOC(rec, { ...rec, conta_destino_id: 'b' })).toEqual({ conta_bancaria_id: 'b' });
    expect(camposDoAjusteOC(rec, { ...rec, conta_bancaria_id: 'z' })).toEqual({});
    const desp = { tipo_operacao: '2-Saídas', data_vencimento: '2026-07-30', conta_bancaria_id: 'a', plano_conta_id: 'pl' };
    expect(camposDoAjusteOC(desp, { ...desp, conta_bancaria_id: 'b' })).toEqual({ conta_bancaria_id: 'b' });
    expect(camposDoAjusteOC(rec, { ...rec, plano_conta_id: 'femeas-adultas' })).toEqual({ plano_conta_id: 'femeas-adultas' });
    expect(camposDoAjusteOC(rec, { ...rec, plano_conta_id: null })).toEqual({});   // sem chave nao "limpa" a classificacao
  });

  it('fonte: o modal manda os tres pela OC ANTES do gravador de sempre, e so trava o vencimento/classificacao fora do aberto', () => {
    const src = readFileSync('src/components/financeiro-v2/LancamentoV2Dialog.tsx', 'utf8');
    const rpc = src.indexOf("rpc('oc_titulo_ajustar'");
    const salvar = src.indexOf('const ok = await onSave(form, currentEditId || undefined);');
    expect(rpc).toBeGreaterThan(0);
    expect(rpc).toBeLessThan(salvar);
    expect(src).toContain('camposDoAjusteOC(lancamento, form)');
    expect(src).toContain('disabled={(isOCTitulo && !ocAjustavel) || parcelaPaga}');
    expect(src).toContain("subcentroDesabilitado={(isOCTitulo && !ocAjustavel) ||");
    expect(src).not.toMatch(/DatePicker value=\{dataVencimento\}[^>]*disabled=\{isOCTitulo \|\| parcelaPaga\}/);
  });
});
