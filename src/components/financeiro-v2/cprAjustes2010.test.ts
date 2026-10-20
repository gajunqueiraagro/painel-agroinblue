/**
 * CPR-AJUSTES-20-10 — Contas a Pagar e Receber como extrato de banco (Gabriel, 20/10/2026; mock "CPR Saldo do Dia"):
 * (1) "A receber" antes de "A pagar"; (2) o saldo do dia na ÚLTIMA linha do dia ("Saldo em dd/mm/aaaa"), a faixa de cima só com a
 * data e o quando; (3) dentro do dia, entradas e depois saídas, cada grupo do maior valor ao menor; (4) todo vencido em aberto conta
 * no saldo de HOJE, com o selo "vencido" e o aviso de quantos não apareceram no extrato já conciliado. Dado sintético.
 * A tela não se monta em teste: o desenho é lido da FONTE; as regras, do dono (`cprRecorte.ts`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ordenarDoDiaCpr, recortarCpr, serieDoSaldoCpr, totaisDeHojeCpr, type ContaCpr } from '@/lib/financeiro/cprRecorte';

const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const tela = semComentario(readFileSync(resolve(__dirname, 'ContasPagarReceberTab.tsx'), 'utf8'));
const doc = semComentario(readFileSync(resolve(__dirname, '../../lib/pdf/cpr/DocumentoCpr.tsx'), 'utf8'));
const fluxo = semComentario(readFileSync(resolve(__dirname, 'CprFluxoPrevisto.tsx'), 'utf8'));

let n = 0;
const conta = (venc: string, valor: number, o: Partial<ContaCpr> = {}): ContaCpr => ({
  id: `c${++n}`, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor,
  conta_bancaria_id: 'IP', ...o,
});
const entra = (venc: string, valor: number) => conta(venc, valor, { tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: 'IP' });

describe('(1) A receber ANTES de A pagar', () => {
  it('no cabeçalho, nas linhas, nas faixas (dia, Caixa inicial, Fim do período) e nos cartões', () => {
    const cab = tela.slice(tela.indexOf('data-testid="cpr-cabecalho"'), tela.indexOf('testId="cpr-caixa-inicial"'));
    expect(cab.indexOf('>A receber<')).toBeGreaterThan(0);
    expect(cab.indexOf('>A receber<')).toBeLessThan(cab.indexOf('>A pagar<'));
    /* a linha da conta */
    expect(tela).toContain('<span style={larg(regua.receber)} className="text-right">{receber ? celValor : null}</span>\n                        <span style={larg(regua.pagar)} className="text-right">{receber ? null : celValor}</span>');
    /* a faixa (o mesmo componente desenha o Caixa inicial, o "Saldo em", os vencidos e o Fim do período) */
    const faixa = tela.slice(tela.indexOf('function Faixa('), tela.indexOf('function CelValor(') > tela.indexOf('function Faixa(') ? tela.indexOf('function CelValor(') : undefined);
    expect(faixa.indexOf("tipo=\"receber\"")).toBeGreaterThan(0);
    expect(faixa.indexOf("tipo=\"receber\"")).toBeLessThan(faixa.indexOf("tipo=\"pagar\""));
    /* os cartões e a faixa recolhida do Ampliado */
    expect(tela.indexOf('testId="cpr-card-receber"')).toBeLessThan(tela.indexOf('testId="cpr-card-pagar"'));
    expect(tela.indexOf('<CelRecolhida rotulo="A receber"')).toBeLessThan(tela.indexOf('<CelRecolhida rotulo="A pagar"'));
  });
  it('no PDF: cabeçalho, linha, faixa, "Saldo em", Fim do período e os dois resumos', () => {
    const cab = doc.slice(doc.indexOf('function CabecalhoDaTabela('), doc.indexOf('function LinhaDaConta('));
    expect(cab.indexOf('>A receber<')).toBeLessThan(cab.indexOf('>A pagar<'));
    for (const trecho of ['function LinhaDaConta(', 'function LinhaDaFaixa(', 'function LinhaDoFecho(', 'function LinhaResumo(']) {
      const ini = doc.indexOf(trecho);
      const corpo = doc.slice(ini, doc.indexOf('\nfunction ', ini + 10));
      expect(corpo.indexOf('receber'), trecho).toBeGreaterThan(0);
      expect(corpo.lastIndexOf('largura={W.receber}') < 0 || corpo.indexOf('W.receber') < corpo.indexOf('W.pagar'), trecho).toBe(true);
    }
    expect(doc.indexOf('c={m.fim.receber}')).toBeLessThan(doc.indexOf('c={m.fim.pagar}'));
    expect(doc).toContain("colunas={['A receber', 'A pagar', 'Saldo no fim da semana']}");
    expect(doc).toContain("colunas={['Caixa hoje', 'A receber', 'A pagar', 'Saldo no fim']}");
  });
});

describe('(2) o saldo do dia na ÚLTIMA linha do dia', () => {
  it('a faixa de cima do dia só tem a data e o quando — nenhum valor', () => {
    const fd = tela.slice(tela.indexOf('function FaixaDoDia('), tela.indexOf('function Faixa('));
    expect(fd).not.toMatch(/pagar|receber|saldo|CelValor/);
    expect(tela).toContain("g.tipo === 'dia' ? (");
    /* a data completa e o dia da semana por extenso */
    expect(tela).toContain('"EEEE · dd/MM/yyyy"');
  });
  it('depois das linhas do dia vem "Saldo em dd/mm/aaaa", com a receber, a pagar e o saldo do grupo, fundo azul claro e negrito', () => {
    const ini = tela.indexOf('{g.linhas.map((l) => {');
    const fecho = tela.slice(tela.indexOf("{g.tipo === 'dia' && (", ini));
    expect(tela.indexOf("{g.tipo === 'dia' && (", ini)).toBeGreaterThan(ini);
    expect(fecho).toContain("titulo={`Saldo em ${format(parseISO(g.chave), 'dd/MM/yyyy')}`}");
    expect(fecho).toContain('pagar={g.pagar} receber={g.receber} saldo={g.saldo}');
    expect(fecho).toContain('font-bold text-primary');
    expect(fecho).toContain('FUNDO_DIA');
    expect(fecho).toContain('fundoNegativo');
  });
  it('o "Saldo em" de cada dia é o saldo CORRIDO da série: anterior + a receber − a pagar', () => {
    const hoje = '2026-10-20';
    const r = recortarCpr([conta('2026-10-21', 1896.83), entra('2026-11-05', 21000), conta('2026-11-05', 8119)],
      { periodo: { de: '2026-10-01', ate: '2026-11-30' }, hoje, incluirVencidos: true, ancoras: new Map([['IP', '2026-10-09']]) });
    const s = serieDoSaldoCpr(r, 10000);
    expect(s.dias.map((d) => [d.data, d.saldo])).toEqual([['2026-10-21', 8103.17], ['2026-11-05', 20984.17]]);
    expect(s.dias[1].saldo).toBe(Math.round((8103.17 + 21000 - 8119) * 100) / 100);
  });
});

describe('(3) dentro do dia: entradas, depois saídas, cada grupo do maior valor ao menor', () => {
  it('05/11: a entrada de 21.000 primeiro; depois as saídas, 12.000 antes de 8.119', () => {
    const iatf = conta('2026-11-05', 8119.4, { descricao: 'Protocolo IATF' } as Partial<ContaCpr>);
    const gf = conta('2026-11-05', 12000);
    const pontero = entra('2026-11-05', 21000);
    const peq = entra('2026-11-05', 50);
    expect(ordenarDoDiaCpr([iatf, peq, gf, pontero]).map((l) => l.valor)).toEqual([21000, 50, 12000, 8119.4]);
  });
  it('empate de valor: a ordem é estável (pela chave da linha), qualquer que seja a entrada', () => {
    const a = conta('2026-11-05', 100, { id: 'a' }), b = conta('2026-11-05', 100, { id: 'b' });
    expect(ordenarDoDiaCpr([b, a]).map((l) => l.id)).toEqual(ordenarDoDiaCpr([a, b]).map((l) => l.id));
  });
  it('a tela ordena todo dia (hoje inclusive) pelo dono', () => {
    expect(Array.from(tela.matchAll(/ordenarDoDiaCpr\(/g)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('(4) o vencido conta no saldo de HOJE, com o selo e o aviso', () => {
  it('Vera · Itaú Personalite: conciliado até 09/10, a Transf. Aplicação CDB de 290.000 vencida em 09/10 entra hoje', () => {
    const hoje = '2026-10-20';
    const cdb = conta('2026-10-09', 290000, { tipo_operacao: '3-Transferências', conta_bancaria_id: 'IP', conta_destino_id: 'CDB' });
    const fgts = conta('2026-10-21', 1896.83, { status_transacao: 'agendado' });
    const r = recortarCpr([cdb, fgts], { periodo: { de: '2026-10-01', ate: '2026-11-30' }, hoje, incluirVencidos: true, conta: 'IP', ancoras: new Map([['IP', '2026-10-09']]) });
    expect(r.vencidos.anteriores.linhas.map((l) => l.id)).toEqual([cdb.id]);
    const s = serieDoSaldoCpr(r, 293896.08);
    const th = totaisDeHojeCpr(s);
    expect(th.pagar).toEqual({ valor: 290000, contas: 1 });
    expect(s.partida.saldo).toBe(3896.08);
    expect(s.dias.find((d) => d.data === '2026-10-21')?.saldo).toBe(1999.25);
  });
  it('a tela: hoje é um dia com os vencidos dentro, o selo "vencido" na linha e o aviso na faixa; o grupo "fora do saldo" não existe', () => {
    expect(tela).toContain('data-testid="cpr-selo-vencido"');
    expect(tela).toContain('data-testid="cpr-aviso-hoje"');
    expect(tela).toContain("entra' : 'entram'} hoje · confirme se ainda vai acontecer");
    expect(tela).toContain('const th = totaisDeHojeCpr(serie);');
    expect(tela).not.toMatch(/anteriores à conciliação[^`]*fora do saldo/);
    expect(tela).not.toContain('MOTIVO_ANTERIORES');
    expect(tela).not.toContain("tipo: 'vencidos_anteriores'");
    /* a tela não soma o dia de hoje: lê do dono */
    const grupos = tela.slice(tela.indexOf('const grupos = useMemo((): Grupo[] => {'), tela.indexOf('// ── Abrir o lançamento'));
    expect(grupos).not.toMatch(/Math\.round\(/);
    /* o Fluxo não diz mais "anterior à conciliação, fora do saldo" */
    expect(fluxo).not.toContain('vencidosForaDoSaldo');
  });
  it('"Incluir vencidos" desligado: sai da LISTA de hoje e o saldo de hoje continua o mesmo (a faixa diz)', () => {
    expect(tela).toContain('...(incluirVencidos ? doSeg(vencidos.linhas) : [])');
    expect(tela).toContain("`o saldo inclui ${nVencidos} ${nVencidos === 1 ? 'vencido' : 'vencidos'} fora da lista`");
  });
});

describe('CPR-SEM-CORTE-01 — nada de "…" na CPR', () => {
  it('nenhum truncate, text-ellipsis ou line-clamp na tela nem no Fluxo', () => {
    expect(tela).not.toMatch(/\btruncate\b|text-ellipsis|line-clamp/);
    expect(fluxo).not.toMatch(/\btruncate\b|text-ellipsis|line-clamp/);
  });
});
