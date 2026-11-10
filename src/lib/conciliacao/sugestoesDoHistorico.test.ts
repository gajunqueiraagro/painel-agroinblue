/**
 * CONC-SUGESTOES-FONTE-01 item 4 (Gabriel 08/11, B) — o FORNECEDOR DO HISTÓRICO primeiro; o que entrou SÓ POR TEXTO PARECIDO no fim.
 * O formato do caso MECANICA LIDER (BB 08/10, −6.000,00), SINTÉTICO: o histórico diz o fornecedor "Oficina Exemplo" (que o texto do
 * banco não nomeia); os em aberto dele (1.403,35 e 330,00) nunca apareciam; só vinham dois da "Liderança Exemplo" (a última palavra do
 * banco, "LIDER", é o começo de LIDERANÇA: texto parecido, que o histórico desmente).
 */
import { describe, it, expect } from 'vitest';
import { sugerirCasamentos, SELO_SO_TEXTO, type CandidatoSugestao } from './sugestoesCasamento';
import {
  emLotes, fornecedorDoMovimento, janelaDoMes, lerFornecedoresDoHistorico, termosDosMovimentos, TERMOS_POR_LOTE,
} from './fornecedoresDoHistorico';

const EXTRATO = { data: '2031-10-08', historico: 'PIX - ENVIADO - 08/10 15:21 MECANICA LIDER', valor: -6000 };
const c = (id: string, o: Partial<CandidatoSugestao>): CandidatoSugestao => ({
  lancamento_id: id, data_vencimento: '2031-10-09', competencia: '2031-10-01', valor_assinado: -100, descricao: 'Serviço',
  fornecedor: 'Oficina Exemplo', favorecido_id: 'f-oficina', status_transacao: 'previsto', ja_conciliado: false, ...o,
});
const CANDIDATOS = [
  c('lid-1', { fornecedor: 'Liderança Exemplo Contábil', favorecido_id: 'f-lid', valor_assinado: -915, data_vencimento: '2031-10-20' }),
  c('lid-2', { fornecedor: 'Liderança Exemplo Contábil', favorecido_id: 'f-lid', valor_assinado: -1621, data_vencimento: '2031-10-30' }),
  c('ofi-1', { valor_assinado: -1403.35, data_vencimento: '2031-10-10' }),
  c('ofi-2', { valor_assinado: -330, data_vencimento: '2031-10-06' }),
];
const ids = (r: ReturnType<typeof sugerirCasamentos>) => r.map((s) => s.lancamentos.map((x) => x.lancamento_id).join('+'));

describe('o fornecedor do histórico nas sugestões', () => {
  it('sem o histórico: a lista de antes (só a Liderança, por texto parecido)', () => {
    const r = sugerirCasamentos(EXTRATO, CANDIDATOS);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.lancamentos.every((x) => x.favorecido_id === 'f-lid'))).toBe(true);
    expect(r.some((s) => s.motivo.startsWith(SELO_SO_TEXTO))).toBe(false);
  });

  it('com o histórico: os em aberto do fornecedor do histórico no topo; a Liderança no fim com "só texto parecido"', () => {
    const r = sugerirCasamentos(EXTRATO, CANDIDATOS, { fornecedorDoHistorico: 'f-oficina' });
    expect(ids(r).slice(0, 2)).toEqual(['ofi-1', 'ofi-2']);
    expect(r[0]).toMatchObject({ tipo: 'do_historico', motivo: 'do histórico · previsto 1.403,35', valorDiferente: true });
    const fim = r.slice(2);
    expect(fim.length).toBeGreaterThan(0);
    for (const s of fim) {
      expect(s.lancamentos.every((x) => x.favorecido_id === 'f-lid')).toBe(true);
      expect(s.motivo.startsWith(`${SELO_SO_TEXTO} · `)).toBe(true);
    }
    expect(r.find((s) => s.tipo === 'nome_valor')?.motivo).toBe(`${SELO_SO_TEXTO} · valor diferente`);
  });

  it('a janela do fornecedor do histórico é a do P153b (±5 dias, só em aberto)', () => {
    const longe = [c('ofi-3', { valor_assinado: -50, data_vencimento: '2031-10-14' })];
    expect(sugerirCasamentos(EXTRATO, longe, { fornecedorDoHistorico: 'f-oficina' })).toEqual([]);
    const pago = [c('ofi-4', { valor_assinado: -50, status_transacao: 'realizado' })];
    expect(sugerirCasamentos(EXTRATO, pago, { fornecedorDoHistorico: 'f-oficina' })).toEqual([]);
    const perto = [c('ofi-5', { valor_assinado: -50, data_vencimento: '2031-10-13' })];
    expect(sugerirCasamentos(EXTRATO, perto, { fornecedorDoHistorico: 'f-oficina' }).map((s) => s.tipo)).toEqual(['do_historico']);
  });

  it('o mesmo valor de outro fornecedor não é "só texto": fica no meio, sem o selo', () => {
    const exato = c('outro', { fornecedor: 'Posto Exemplo', favorecido_id: 'f-posto', valor_assinado: -6000 });
    const r = sugerirCasamentos(EXTRATO, [...CANDIDATOS, exato], { fornecedorDoHistorico: 'f-oficina' });
    expect(ids(r).indexOf('outro')).toBe(2);
    expect(r[2].motivo).toBe('mesmo valor');
  });

  it('o mesmo valor do fornecedor do histórico vem antes de tudo', () => {
    const exato = c('ofi-exato', { valor_assinado: -6000, status_transacao: 'realizado' });
    const r = sugerirCasamentos(EXTRATO, [...CANDIDATOS, exato], { fornecedorDoHistorico: 'f-oficina' });
    expect(ids(r)[0]).toBe('ofi-exato');
  });
});

describe('o pedido ao banco (a mesma regra do "Procurar no histórico")', () => {
  it('termos = o nomeDoHistorico de cada movimento, sem repetir', () => {
    const t = termosDosMovimentos([EXTRATO, { ...EXTRATO, data: '2031-10-20', historico: 'PIX - AGENDAMENTO - 20/10 05:37 MECANICA LIDER' }]);
    expect(t).toEqual(['MECANICA LIDER']);
  });
  it('a janela do modal: 1º/jan do ano até o fim do mês seguinte', () => {
    expect(janelaDoMes('2031-10')).toEqual({ de: '2031-01-01', ate: '2031-11-30' });
    expect(janelaDoMes('2031-12')).toEqual({ de: '2031-01-01', ate: '2032-01-31' });
  });
  it('em lotes', () => {
    const l = emLotes(Array.from({ length: 2 * TERMOS_POR_LOTE + 1 }, (_, i) => i));
    expect(l.map((x) => x.length)).toEqual([TERMOS_POR_LOTE, TERMOS_POR_LOTE, 1]);
  });
  it('lê a resposta e acha o fornecedor de um movimento pelo mesmo termo', () => {
    const m = lerFornecedoresDoHistorico({ 'MECANICA LIDER': { fornecedor_id: 'f-oficina', vezes: 5 }, RUIM: null, X: { fornecedor_id: 3 } });
    expect([...m]).toEqual([['MECANICA LIDER', 'f-oficina']]);
    expect(fornecedorDoMovimento(m, EXTRATO)).toBe('f-oficina');
    expect(fornecedorDoMovimento(m, { historico: 'PIX OUTRO NOME', data: '2031-10-08' })).toBeNull();
    expect(lerFornecedoresDoHistorico([1, 2]).size).toBe(0);
  });
});
