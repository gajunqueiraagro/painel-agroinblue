/**
 * CAIXA-FOLHA-RATEIO-01 — o pacote da outra parte do rateio vira comprovante: UMA ação ("Anexar ao rateio"), cada arquivo aos lançamentos da
 * parte do cliente do mês e da natureza dele, nunca "Guardar". ⚠ Dado INVENTADO (`rateioNaCaixa.casos.ts`).
 */
import { describe, it, expect } from 'vitest';
import { linhasDasFontes, type Lido, type LinhaDaCaixa } from './caixaPorEmail';
import type { LeituraDaCaixa } from './lerDaCaixa';
import { comRateio, competenciasDoRateio, FRASE_PAGADOR_NAO_TITULAR, mesSeguinte, nomeDoRateio, type ContextoDoRateio } from './rateioNaCaixa';
import { CPF_DO_CLIENTE, LANCAMENTOS, PACOTE, TERCEIRO } from './rateioNaCaixa.casos';

/* o que o hook faz com a leitura (o boleto vira BoletoLido com o pagador) */
const paraLido = (r: LeituraDaCaixa): Lido => (r.k === 'boletos'
  ? { k: 'boletos', boletos: r.boletos.map((b) => ({ codigoBarras: b.codigo_barras, linha: b.linha, vencimento: b.vencimento, valor: b.valor,
      beneficiario: r.beneficiario.nome, pagador: r.pagador.documento || r.pagador.nome ? { documento: r.pagador.documento, nome: r.pagador.nome } : null })) }
  : r);
const linhasDo = (pacote: Record<string, LeituraDaCaixa>): LinhaDaCaixa[] =>
  linhasDasFontes(Object.entries(pacote).map(([nome, r]) => ({ chave: nome, nome, tipoDoArquivo: 'pdf', lido: paraLido(r) })), {}, {}, '2026-11-27', true, new Set());
const CTX: ContextoDoRateio = { terceiros: [TERCEIRO], lancamentos: LANCAMENTOS, titulares: [CPF_DO_CLIENTE] };
const porArquivo = (ls: LinhaDaCaixa[]) => Object.fromEntries(ls.map((l) => [l.fontes[0], l]));

describe('o pacote da outra parte do rateio', () => {
  it('as 8 linhas entram no MESMO pacote, com "Anexar ao rateio" e sem "Guardar"', () => {
    const ls = comRateio(linhasDo(PACOTE), CTX);
    expect(ls).toHaveLength(8);
    expect(new Set(ls.map((l) => l.rateio?.pacote))).toEqual(new Set(['acordo-1:2026-11']));
    expect(ls.every((l) => l.rateio?.documentos === 8)).toBe(true);
    expect(ls.map((l) => l.acoes)).toEqual(ls.map(() => ['anexar_rateio', 'ignorar']));
    expect(ls.every((l) => l.noSistema.selo?.texto === 'rateio')).toBe(true);
  });
  it('cada arquivo vai aos lançamentos da natureza e das pessoas dele (nunca ao lançamento próprio do cliente)', () => {
    const l = porArquivo(comRateio(linhasDo(PACOTE), CTX));
    const ids = (k: string) => (l[k].rateio?.alvos ?? []).map((a) => a.id).sort();
    expect(ids('folha A nov.pdf')).toEqual(['sal-ana', 'sal-bruno']);
    expect(ids('folha B nov.pdf')).toEqual(['fora-carla', 'sal-carla']);
    expect(ids('13 A nov.pdf')).toEqual(['13-ana', '13-bruno']);
    expect(ids('13 B nov.pdf')).toEqual(['13-carla']);
    expect(ids('darf inss nov.pdf')).toEqual(['inss-1', 'inss-2']);
    expect(ids('gfd nov.pdf')).toEqual(['fgts-1', 'fgts-2', 'fgts13-1', 'fgts13-2']);
    expect(ids('relacao fgts nov.pdf')).toEqual(['fgts-1', 'fgts-2', 'fgts13-1', 'fgts13-2']);
    expect(ids('resumo a mao.pdf')).toEqual(['reembolso']);
    expect(l['resumo a mao.pdf'].noSistema.texto).toBe('sem leitura: o resumo do contador → anexa a Rateio Folha Pagamento · 04/12/2026');
    expect(l['darf inss nov.pdf'].noSistema.texto).toBe('anexa a INSS ×2');
    expect(l['darf inss nov.pdf'].rateio?.competencia).toBe('2026-11');
  });
  it('sem lançamento do mês a linha fica só com Ignorar e diz; lendo o banco, diz que procura', () => {
    const vazio = comRateio(linhasDo(PACOTE), { ...CTX, lancamentos: [] });
    expect(vazio.every((l) => l.acoes.join() === 'ignorar')).toBe(true);
    expect(porArquivo(vazio)['gfd nov.pdf'].noSistema.texto).toBe('nenhum lançamento de 11/2026 para anexar');
    expect(porArquivo(vazio)['resumo a mao.pdf'].noSistema.texto).toBe('nenhum lançamento de 12/2026 para anexar');
    const lendo = comRateio(linhasDo(PACOTE), { ...CTX, lancamentos: null });
    expect(porArquivo(lendo)['gfd nov.pdf'].noSistema.texto).toBe('procurando os lançamentos de 11/2026…');
    expect(lendo.every((l) => !l.acoes.includes('anexar_rateio'))).toBe(true);
  });
  it('sem acordo de rateio nada muda; o arquivo sem leitura fora de um pacote segue como era', () => {
    const base = linhasDo(PACOTE);
    expect(comRateio(base, { terceiros: [], lancamentos: LANCAMENTOS, titulares: [] })).toEqual(base);
    const so = linhasDo({ 'resumo a mao.pdf': PACOTE['resumo a mao.pdf'] });
    expect(comRateio(so, CTX)).toEqual(so);
  });
  it('o DARF de quem NÃO é titular (e não é de rateio) perde o "Guardar": é comprovante de outro', () => {
    const outro: LeituraDaCaixa = { ...PACOTE['darf inss nov.pdf'], k: 'boletos', boletos: [{ ok: true, codigo_barras: '7'.repeat(44), linha: '7'.repeat(48), tipo: 'arrecadacao', banco: null, valor: 10, vencimento: '2026-12-18' }],
      beneficiario: { documento: null, nome: 'Receita Federal', confira: true }, pagador: { documento: '55566677788', nome: 'OUTRA PESSOA', confira: false } };
    const [l] = linhasDo({ 'darf.pdf': outro });
    const comGuardar = { ...l, acoes: ['guardar', 'ignorar'] satisfies LinhaDaCaixa['acoes'] };
    const [r] = comRateio([comGuardar], CTX);
    expect(r.acoes).toEqual(['ignorar']);
    expect(r.noSistema.texto).toBe(FRASE_PAGADOR_NAO_TITULAR);
    /* o do titular continua podendo guardar */
    const [doCliente] = comRateio([{ ...comGuardar, boleto: l.boleto ? { ...l.boleto, pagador: { documento: CPF_DO_CLIENTE, nome: null } } : null }], CTX);
    expect(doCliente.acoes).toEqual(['guardar', 'ignorar']);
  });
  it('as competências a ler: a do pacote e a seguinte (o reembolso)', () => {
    expect(competenciasDoRateio(linhasDo(PACOTE), [TERCEIRO])).toEqual(['2026-11', '2026-12']);
    expect(competenciasDoRateio(linhasDo(PACOTE), [])).toEqual([]);
    expect(mesSeguinte('2026-12')).toBe('2027-01');
    expect(nomeDoRateio('Pec.3M-Ana Exemplo')).toBe('ana exemplo');
    expect(nomeDoRateio('Ana Exemplo')).toBeNull();
  });
});
