/**
 * REC-VALOR-CERTO-02 — Contas a Pagar e Receber diz o que ainda é estimativa.
 * O dono do recorte (`cprRecorte.ts`) REPARTE o total a pagar em confirmado + estimado; quem JULGA "estimado" é a regra única
 * de `recorrenciasDoMes.ts` (`ocorrenciaEstimada`), pelo conjunto que `idsEstimados` monta. A tela só desenha (lida da fonte).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { recortarCpr, serieDoSaldoCpr, contaEstimadaCpr, type ContaCpr } from './cprRecorte';
import { ocorrenciaEstimada } from './recorrenciasDoMes';
import { idsEstimados } from '@/hooks/useRecorrencias';

const HOJE = '2026-10-05';
const PERIODO = { de: '2026-10-05', ate: '2026-11-04' };
const conta = (id: string, venc: string | null, valor: number, o: Partial<ContaCpr> = {}): ContaCpr => ({
  id, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor, conta_bancaria_id: 'bb', ...o,
});
const centavosDe = (reais: number) => Math.round(reais * 100);

const LINHAS: ContaCpr[] = [
  conta('avulsa', '2026-10-10', 1000),                                   // não é de recorrência
  conta('rec-certa', '2026-10-12', 250.1),                               // recorrência de valor certo (fora do conjunto)
  conta('rec-est-1', '2026-10-15', 333.33),                              // estimada
  conta('rec-est-2', '2026-10-20', 0.07),                                // estimada
  conta('rec-est-venc', '2026-10-01', 80),                               // estimada, VENCIDA
  conta('avulsa-venc', '2026-09-20', 40),                                // vencida, confirmada
  conta('rec-est-fora', '2026-12-01', 999),                              // estimada, FORA do período
  conta('entrada', '2026-10-18', 5000, { tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: 'bb' }),
  conta('entrada-est', '2026-10-19', 700, { tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: 'bb' }),
  conta('paga-est', '2026-10-08', 123, { status_transacao: 'realizado', data_pagamento: '2026-10-08' }),
];
const ESTIMADAS = new Set(['rec-est-1', 'rec-est-2', 'rec-est-venc', 'rec-est-fora', 'entrada-est', 'paga-est']);
const recorte = (incluirVencidos: boolean, estimadas?: ReadonlySet<string>) =>
  recortarCpr(LINHAS, { periodo: PERIODO, hoje: HOJE, incluirVencidos, estimadas });

describe('o dono reparte o total a pagar em confirmado + estimado, em centavos', () => {
  it('com os vencidos: as duas fatias, valor e quantidade', () => {
    const r = recorte(true, ESTIMADAS);
    expect(r.aPagarEstimado).toEqual({ valor: 33333 + 7 + 8000, qtd: 3 });
    expect(r.aPagarConfirmado).toEqual({ valor: 100000 + 25010 + 4000, qtd: 3 });
  });
  it('INVARIANTE: confirmado + estimado = total a pagar do MESMO recorte, ao centavo — com e sem os vencidos', () => {
    for (const inc of [true, false]) {
      const r = recorte(inc, ESTIMADAS);
      expect(r.aPagarConfirmado.valor + r.aPagarEstimado.valor).toBe(centavosDe(r.total.pagar.valor));
      expect(r.aPagarConfirmado.qtd + r.aPagarEstimado.qtd).toBe(r.total.pagar.contas);
      expect(r.aReceberConfirmado.valor + r.aReceberEstimado.valor).toBe(centavosDe(r.total.receber.valor));
      expect(r.aReceberConfirmado.qtd + r.aReceberEstimado.qtd).toBe(r.total.receber.contas);
    }
  });
  it('a caixa "Incluir vencidos" desligada tira a vencida das duas fatias (é o recorte do rodapé)', () => {
    const r = recorte(false, ESTIMADAS);
    expect(r.aPagarEstimado).toEqual({ valor: 33340, qtd: 2 });
    expect(r.aPagarConfirmado).toEqual({ valor: 125010, qtd: 2 });
  });
  it('conta que NÃO é de recorrência é confirmada; sem o conjunto, tudo é confirmado e o estimado é zero', () => {
    expect(contaEstimadaCpr({ id: 'avulsa' }, ESTIMADAS)).toBe(false);
    const r = recorte(true);
    expect(r.aPagarEstimado).toEqual({ valor: 0, qtd: 0 });
    expect(r.aPagarConfirmado.valor).toBe(centavosDe(r.total.pagar.valor));
    expect(recorte(true, new Set()).aPagarEstimado).toEqual({ valor: 0, qtd: 0 });
  });
  it('fora do período e PAGA não entram em fatia nenhuma, mesmo estando no conjunto', () => {
    const r = recorte(true, ESTIMADAS);
    const soma = r.aPagarConfirmado.valor + r.aPagarEstimado.valor;
    expect(soma).toBe(100000 + 25010 + 4000 + 33333 + 7 + 8000);          // sem os 999,00 de fora e sem os 123,00 pagos
  });
  it('A RECEBER tem as suas duas fatias, à parte', () => {
    const r = recorte(true, ESTIMADAS);
    expect(r.aReceberEstimado).toEqual({ valor: 70000, qtd: 1 });
    expect(r.aReceberConfirmado).toEqual({ valor: 500000, qtd: 1 });
  });
  it('NADA MUDA NO SALDO: baldes, totais e a série (partida, menor e fim) são os mesmos com e sem o conjunto', () => {
    const sem = recorte(true), com = recorte(true, ESTIMADAS);
    expect(com.total).toEqual(sem.total);
    expect(com.vencidos.pagar).toEqual(sem.vencidos.pagar);
    expect(com.periodoSoma.linhas.map(l => l.id)).toEqual(sem.periodoSoma.linhas.map(l => l.id));
    const a = serieDoSaldoCpr(sem, 10000), b = serieDoSaldoCpr(com, 10000);
    expect(b).toEqual(a);
    expect(b.fim).not.toBeNull();
  });
});

describe('quem julga é a regra única (`ocorrenciaEstimada`)', () => {
  it('a confirmar, em aberto e sem a marca: estimada; com a MARCA do valor do mês vira confirmada; REALIZADA ou conciliada, confirmada', () => {
    expect(ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: null, status: 'programado' })).toBe(true);
    expect(ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: '2026-10-05T12:00:00Z', status: 'programado' })).toBe(false);
    expect(ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: null, status: 'realizado' })).toBe(false);
    expect(ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: null, status: 'conciliado' })).toBe(false);
  });
  it('recorrência de valor certo nunca é estimada', () => {
    expect(ocorrenciaEstimada({ valorAConfirmar: false, valorDoMesEm: null, status: 'previsto' })).toBe(false);
  });
  it('`idsEstimados` monta o conjunto das ocorrências de recorrências A CONFIRMAR pela mesma função', () => {
    const ids = idsEstimados([
      { id: 'a', recorrencia_id: 'r', valor: 10, status_transacao: 'previsto', valor_do_mes_em: null },
      { id: 'b', recorrencia_id: 'r', valor: 10, status_transacao: 'programado', valor_do_mes_em: '2026-10-05T12:00:00Z' },
      { id: 'c', recorrencia_id: 'r', valor: 10, status_transacao: 'realizado', valor_do_mes_em: null },
      { id: 'd', recorrencia_id: 'r', valor: 10, status_transacao: 'agendado' },
      { recorrencia_id: 'r', valor: 10, status_transacao: 'previsto' },
    ]);
    expect([...ids].sort()).toEqual(['a', 'd']);
  });
  it('a estimada que ganha a marca sai do estimado e entra no confirmado — o total não muda', () => {
    const antes = recorte(true, ESTIMADAS);
    const depois = recorte(true, new Set([...ESTIMADAS].filter(id => id !== 'rec-est-1')));
    expect(depois.aPagarEstimado.valor).toBe(antes.aPagarEstimado.valor - 33333);
    expect(depois.aPagarConfirmado.valor).toBe(antes.aPagarConfirmado.valor + 33333);
    expect(depois.total).toEqual(antes.total);
  });
});

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('uma regra só, e a tela só desenha (lido da FONTE)', () => {
  it('o dono do recorte NÃO julga: não cita a marca do valor do mês nem o tipo do valor', () => {
    const f = fonte('src/lib/financeiro/cprRecorte.ts');
    for (const proibido of ['valor_do_mes', 'valorDoMes', 'tipo_valor', 'valorAConfirmar', 'recorrencia']) expect(`${proibido}:${f.includes(proibido)}`).toBe(`${proibido}:false`);
    expect(f).toContain('export const contaEstimadaCpr = (c: Pick<ContaCpr, \'id\'>, estimadas?: ReadonlySet<string>): boolean => !!estimadas && estimadas.has(c.id);');
  });
  it('o julgamento existe em UM lugar: a tela de Recorrências e o conjunto da CPR chamam `ocorrenciaEstimada`', () => {
    const dono = fonte('src/lib/financeiro/recorrenciasDoMes.ts');
    expect(dono).toContain('export function ocorrenciaEstimada(');
    expect(dono).toContain('const estimada = ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: o.valorDoMesEm, status: o.status });');
    /* a marca só é lida dentro da regra única */
    expect(dono.match(/!o\.valorDoMesEm/g)).toHaveLength(1);
    const hook = fonte('src/hooks/useRecorrencias.ts');
    expect(hook).toContain('ocorrenciaEstimada({ valorAConfirmar: true, valorDoMesEm: o.valorDoMesEm, status: o.status })');
    expect(hook).toContain("if (idsDasRegras.length === 0) return { ids: new Set(), incompleto: false };");
  });
  it('a tela entrega o conjunto ao dono, lê as duas fatias dele e não julga', () => {
    const f = fonte('src/components/financeiro-v2/ContasPagarReceberTab.tsx');
    expect(f).toContain("queryKey: ['cpr-estimadas', clienteId],");
    expect(f.match(/recortarCpr\(linhas, \{[^}]*estimadas \}\)/g)).toHaveLength(2);
    expect(f).toContain('const estimada = !paga && contaEstimadaCpr(l, estimadas);');
    expect(f).toContain('const temEstimado = recorte.aPagarEstimado.valor > 0;');
    for (const proibido of ['valor_do_mes', 'tipo_valor', 'ocorrenciaEstimada']) expect(`${proibido}:${f.includes(proibido)}`).toBe(`${proibido}:false`);
  });
  it('o selo: 9px, 14px de altura, nunca corta, com a frase no title; a linha continua com 18px', () => {
    const f = fonte('src/components/financeiro-v2/ContasPagarReceberTab.tsx');
    expect(f).toContain('<span data-testid="cpr-selo-estimado" title={tituloDoSelo} className="h-[14px] shrink-0 whitespace-nowrap rounded bg-amber-100 px-1 text-[9px] leading-[14px] text-amber-700"> estimado </span>');
    expect(f).toContain("const TITULO_SELO_ESTIMADO = 'valor estimado pela recorrência · informe o valor do mês no lançamento';");
    expect(f).toContain("'flex h-[18px] w-full shrink-0 items-center gap-1 border-b px-3 text-left text-[10px]',");
  });
  it('o aviso de leitura INCOMPLETA (teto das ocorrências estimadas) é escrito no title do selo, dos dois totais e do cartão', () => {
    const f = fonte('src/components/financeiro-v2/ContasPagarReceberTab.tsx');
    expect(f).toContain("const avisoEstimadasIncompleto = estimadasDoCliente?.incompleto ? AVISO_ESTIMADAS_INCOMPLETO : '';");
    expect(f).toContain("const tituloDoSelo = TITULO_SELO_ESTIMADO + (avisoEstimadasIncompleto ? `\\n${avisoEstimadasIncompleto}` : '');");
    /* a busca sabe achar: o aviso é usado em quatro lugares (a frase do selo, confirmado, estimado pelo selo, cartão) */
    expect(f.match(/avisoEstimadasIncompleto \?/g)).toHaveLength(3);
    expect(f.match(/tituloDoSelo/g)).toHaveLength(3);
    const hook = fonte('src/hooks/useRecorrencias.ts');
    expect(hook).toContain('return { ids: idsEstimados(linhas), incompleto: linhas.length >= TETO_OCORRENCIAS_ESTIMADAS };');
  });
  it('os dois totais moram num lugar RESERVADO de largura declarada, na terceira linha do Ampliado, e só se preenchem com estimado > 0', () => {
    const f = fonte('src/components/financeiro-v2/ContasPagarReceberTab.tsx');
    expect(f).toContain('<div data-testid="cpr-confirmado-estimado" className="flex h-[16px] w-[316px] shrink-0 items-center justify-end gap-3 text-[9.5px]"> {temEstimado && (');
    expect(f).toContain('<div className="flex min-w-0 flex-1 basis-0 justify-end">{ctlRecadoExport}</div> {ctlConfirmadoEstimado} </div>');
    expect(f.match(/\{ctlConfirmadoEstimado\}/g)).toHaveLength(1);
  });
});
