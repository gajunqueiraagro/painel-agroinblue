/**
 * PARC-CADEIA-01 passo 3 — valor e vencimento da parcela de compra parcelada pelo modal do lançamento: a parcela e o lançamento
 * mudam juntos, o total novo da compra aparece ANTES de salvar, e a paga não muda.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { edicaoDaParcela, podeSerParcelaDeContrato, MOTIVO_PARCELA_PAGA } from './parcelaNoModal';
import { lerSituacaoDoContrato } from './situacaoDoContrato';

/* a forma de `fn_financiamento_situacao` (valores sintéticos): 4 parcelas de 341,35 / 341,33; a 1ª paga */
const parcela = (n: number, valor: number, venc: string, situacao: string) => ({
  id: `par-${n}`, numero: n, data_vencimento: venc, valor_principal: valor, valor_juros: 0, valor_total: valor,
  situacao, pago_em: situacao === 'paga' ? venc : null, valor_pago: situacao === 'paga' ? valor : 0,
  lancamento_id: `lan-${n}`, lancamento_juros_id: null, fonte: 'lancamento', diverge: false,
});
const BRUTO = {
  financiamento_id: 'fin-1', natureza: 'parcelamento', hoje: '2026-10-07',
  parcelas: [parcela(1, 341.35, '2026-08-07', 'paga'), parcela(2, 341.35, '2026-09-06', 'vencida'), parcela(3, 341.35, '2026-10-06', 'vencida'), parcela(4, 341.33, '2026-11-05', 'pendente')],
  cartoes: { valor_contrato: 1365.38, pago: 341.35, a_vencer: 341.33, vencido: 682.70, pagas: 1, parcelas: 4, juros_previstos: 0, soma_principal: 1365.38, soma_total: 1365.38, divergentes: 0 },
};
const SIT = (() => { const s = lerSituacaoDoContrato(BRUTO); if (!s) throw new Error('fixture torta'); return s; })();

describe('edicaoDaParcela', () => {
  it('nada mudou: não há o que mandar ao contrato, e nenhuma frase', () => {
    const e = edicaoDaParcela(SIT, 'lan-3', 341.35, '2026-10-06');
    expect(e).toMatchObject({ numero: 3, total: 4, paga: false, mudou: false, frase: null, totalAntesCent: 136538, totalDepoisCent: 136538 });
  });
  it('só o vencimento mudou: a lista leva a data nova SÓ nesta parcela, e o total da compra não muda (sem frase)', () => {
    const e = edicaoDaParcela(SIT, 'lan-3', 341.35, '2026-10-20');
    expect(e?.mudou).toBe(true);
    expect(e?.frase).toBeNull();
    expect(e?.lista).toEqual([
      { id: 'par-1', data_vencimento: '2026-08-07', valor: 341.35 },
      { id: 'par-2', data_vencimento: '2026-09-06', valor: 341.35 },
      { id: 'par-3', data_vencimento: '2026-10-20', valor: 341.35 },
      { id: 'par-4', data_vencimento: '2026-11-05', valor: 341.33 },
    ]);
  });
  it('o valor mudou: o total novo é a SOMA da lista, em centavos, e a frase diz de quanto para quanto', () => {
    const e = edicaoDaParcela(SIT, 'lan-3', 300, '2026-10-06');
    expect(e?.mudou).toBe(true);
    expect(e?.totalDepoisCent).toBe(132403);
    expect(e?.frase).toBe('A compra passa de 1.365,38 para 1.324,03.');
    expect(e?.lista[2]).toEqual({ id: 'par-3', data_vencimento: '2026-10-06', valor: 300 });
  });
  it('UM centavo conta: nada é arredondado nem engolido', () => {
    const e = edicaoDaParcela(SIT, 'lan-4', 341.34, '2026-11-05');
    expect(e?.mudou).toBe(true);
    expect(e?.frase).toBe('A compra passa de 1.365,38 para 1.365,39.');
  });
  it('parcela PAGA: nunca "mudou", a lista leva o valor e a data DELA mesmo que o modal diga outra coisa', () => {
    const e = edicaoDaParcela(SIT, 'lan-1', 999, '2027-01-01');
    expect(e).toMatchObject({ paga: true, mudou: false, frase: null });
    expect(e?.lista[0]).toEqual({ id: 'par-1', data_vencimento: '2026-08-07', valor: 341.35 });
    expect(MOTIVO_PARCELA_PAGA).toBe('Parcela paga: valor e vencimento não mudam.');
  });
  it('vencimento apagado vai NULO na lista (o banco recusa com a frase dele; a tela não inventa data)', () => {
    const e = edicaoDaParcela(SIT, 'lan-3', 341.35, '');
    expect(e?.mudou).toBe(true);
    expect(e?.lista[2].data_vencimento).toBeNull();
  });
  it('lançamento que não é parcela deste contrato: nulo', () => {
    expect(edicaoDaParcela(SIT, 'lan-99', 100, '2026-10-06')).toBeNull();
  });
  it('o prefiltro de quem pode ser parcela', () => {
    expect(podeSerParcelaDeContrato({ origem_tipo: 'parcela_principal' })).toBe(true);
    expect(podeSerParcelaDeContrato({ origem_tipo: null })).toBe(false);
    expect(podeSerParcelaDeContrato(null)).toBe(false);
  });
});

describe('o modal do lançamento, lido da FONTE', () => {
  const modal = readFileSync(resolve(__dirname, '../../components/financeiro-v2/LancamentoV2Dialog.tsx'), 'utf8');
  it('a gravação da parcela vai ANTES do gravador de sempre, só na edição e só quando mudou; a recusa para tudo', () => {
    const i = modal.indexOf('const recusa = await gravarParcelaDoModal(contratoDaParcela.financiamentoId, edicaoParcela.lista, edicaoParcela.totalDepoisCent);');
    const j = modal.indexOf('const ok = await onSave(form, currentEditId || undefined);');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(j);
    expect(modal).toContain('if (currentIsEdit && contratoDaParcela && edicaoParcela && edicaoParcela.mudou) {');
    expect(modal).toContain('if (recusa) { setErroAntesDeSalvar(recusa); setSaving(false); return; }');
  });
  it('parcela paga: valor e vencimento em leitura, com o motivo escrito no rodapé', () => {
    expect(modal).toContain("disabled={lockedFields?.includes('valor') || isOCTitulo || parcelaPaga}");
    expect(modal).toContain('disabled={isOCTitulo || parcelaPaga}');
    expect(modal).toContain('{edicaoParcela.paga ? MOTIVO_PARCELA_PAGA : edicaoParcela.frase}');
  });
  it('lançamento comum não consulta contrato nenhum (o prefiltro) e não ganha nó novo no HTML', () => {
    expect(modal).toContain('const idDaPossivelParcela = open && lancamento?.id && podeSerParcelaDeContrato(lancamento) ? lancamento.id : null;');
    expect(modal).toContain('{edicaoParcela && (edicaoParcela.paga || edicaoParcela.frase) && (');
  });
});
