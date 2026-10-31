/**
 * PROD-EVOLUCAO-01a — os números da Evolução no Ano.
 * (1) O QUE NÃO MUDA (Gabriel 30/10 17:16): saldos, cabeças por tipo, peso final e GMD de cada mês saem iguais aos de entrada.
 * (2) O QUE MUDA, com o OK (30/10 18:45, "ok lotacao, gmd"): a lotação pela área de pecuária do mês e o GMD do acumulado ponderado —
 *     o antes × depois da prévia preso aqui (Agnaldo, Global, jan/26: 0,67 → 1,12; o GMD do total, média simples × ponderado).
 */
import { describe, expect, it } from 'vitest';
import {
  avisosDaEvolucao, deltaSobreMeta, gmdPonderado, lotacaoDoMes, lotacaoDoPeriodo, mesesDoPeriodo, montarEvolucao, ultimoMesFechado,
  type MesDaEvolucao,
} from './evolucaoAno';
import { mesesDaEvolucao } from '@/hooks/useEvolucaoDoAno';

const mes = (m: number, o: Partial<MesDaEvolucao> = {}): MesDaEvolucao => ({
  mes: m, fechado: true, saldoInicio: 1000, saldoFinal: 1000, pesoInicioKg: 300_000, pesoFinalKg: 303_000,
  cab: {}, kg: {}, kgCarcacaAbate: 0, evolEntrou: 0, evolSaiu: 0, kgEvolEntrou: 0, kgEvolSaiu: 0,
  pesoMedioFinal: 303, gmd: 0.1, producaoBio: 3000, cabInicio: 1000, cabFinal: 1000, dias: 30, uaMedia: 673.33, areaPecuaria: 1000, ...o,
});
const linha = (ev: ReturnType<typeof montarEvolucao>, id: string) => {
  const l = ev.linhas.find((x) => x.id === id); if (!l) throw new Error(`sem a linha ${id}`); return l;
};

describe('o que NÃO muda — sai igual ao que entra', () => {
  const real = [
    mes(1, { saldoInicio: 1545, saldoFinal: 1545, cab: { nascimento: 3, abate: 40, morte: 2 }, pesoMedioFinal: 392.7, gmd: 0.593 }),
    mes(2, { saldoInicio: 1545, saldoFinal: 1602, cab: { compra: 60, morte: 3 }, pesoMedioFinal: 399.4, gmd: 0.237 }),
  ];
  const ev = montarEvolucao({ real, meta: [], unidade: 'cab', periodo: 'acum', global: true });
  it('saldo início, saldo final e as cabeças de cada tipo, mês a mês', () => {
    expect(linha(ev, 'saldo-inicio').meses.slice(0, 2)).toEqual([1545, 1545]);
    expect(linha(ev, 'saldo-final').meses.slice(0, 2)).toEqual([1545, 1602]);
    expect(linha(ev, 'abate').meses.slice(0, 2)).toEqual([40, 0]);
    expect(linha(ev, 'compra').meses.slice(0, 2)).toEqual([0, 60]);
    expect(linha(ev, 'morte').meses.slice(0, 2)).toEqual([2, 3]);
  });
  it('peso final e GMD de cada mês fechado', () => {
    expect(linha(ev, 'peso-final').meses.slice(0, 2)).toEqual([392.7, 399.4]);
    expect(linha(ev, 'gmd').meses.slice(0, 2)).toEqual([0.593, 0.237]);
  });
  it('mês aberto não mostra indicador ("—"), como hoje', () => {
    const e = montarEvolucao({ real: [mes(1), mes(2, { fechado: false })], meta: [], unidade: 'cab', periodo: 'acum', global: true });
    expect(linha(e, 'gmd').meses[1]).toBeNull();
    expect(linha(e, 'peso-final').meses[1]).toBeNull();
    expect(e.ultimoFechado).toBe(1);
  });
  it('o hook monta o saldo início pela regra de hoje: jan = saldo_inicial; depois o saldo_sistema do mês anterior', () => {
    const meses = mesesDaEvolucao({
      cenario: 'realizado',
      totaisPorMes: { 1: { saldo_inicial: 100, saldo_final: 110, saldo_sistema: 109 }, 2: { saldo_inicial: 999, saldo_final: 120, saldo_sistema: 120 } },
      fazendaByMes: {}, rawCategorias: [], porMesTipo: { '01': { abate: 4 } }, areaPorMes: [],
    });
    expect(meses.map((m) => m.saldoInicio)).toEqual([100, 109]);
    expect(meses[0].cab.abate).toBe(4);
  });
});

describe('o que MUDA, com o OK do Gabriel (a prévia antes × depois)', () => {
  it('LOTAÇÃO: Agnaldo, Global, jan/26 — antes 0,67 (área do cadastro 2.004,13) · depois 1,12 (área de pecuária do mês 1.198,51)', () => {
    const ua = 0.67 * 2004.13; // a UA do mês não muda; muda só a área
    const m = mes(1, { uaMedia: ua, areaPecuaria: 1198.51 });
    expect(Number((ua / 2004.13).toFixed(2))).toBe(0.67); // ANTES
    expect(Number(lotacaoDoMes(m)!.toFixed(2))).toBe(1.12); // DEPOIS
  });
  it('LOTAÇÃO do período = Σ UA ÷ Σ área (ponderada pela área de cada mês), não a média simples', () => {
    const a = mes(1, { uaMedia: 1000, areaPecuaria: 1000 }); const b = mes(2, { uaMedia: 900, areaPecuaria: 600 });
    expect(lotacaoDoPeriodo([a, b])).toBeCloseTo(1900 / 1600, 10);
    expect(lotacaoDoPeriodo([a, b])).not.toBeCloseTo((1 + 1.5) / 2, 3);
  });
  it('GMD do acumulado = Σ PB ÷ Σ(cab médias × dias) — o ponderado; ANTES era a média simples dos GMDs', () => {
    const a = mes(2, { producaoBio: 1400 * 28 * 0.2, cabInicio: 1400, cabFinal: 1400, dias: 28, gmd: 0.2 });
    const b = mes(3, { producaoBio: 2100 * 31 * 0.6, cabInicio: 2100, cabFinal: 2100, dias: 31, gmd: 0.6 });
    const antes = (0.2 + 0.6) / 2;
    const depois = gmdPonderado([a, b])!;
    expect(antes).toBeCloseTo(0.4, 10);
    expect(depois).toBeCloseTo((1400 * 28 * 0.2 + 2100 * 31 * 0.6) / (1400 * 28 + 2100 * 31), 10);
    expect(depois).toBeGreaterThan(antes);
    const ev = montarEvolucao({ real: [mes(1, { fechado: true }), a, b], meta: [], unidade: 'cab', periodo: 'acum', global: true });
    expect(linha(ev, 'gmd').acum).toBeCloseTo(gmdPonderado([mes(1), a, b])!, 10);
  });
});

describe('os blocos (Gabriel 30/10): entradas · saídas · internas', () => {
  const real = [mes(1, { cab: { nascimento: 5, compra: 10, abate: 7, venda: 3, consumo: 1, morte: 2, transferencia_entrada: 50, transferencia_saida: 50 }, evolSaiu: 20 })];
  it('Global: a transferência entre fazendas é INTERNA e não entra nos totais das externas', () => {
    const ev = montarEvolucao({ real, meta: [], unidade: 'cab', periodo: 'acum', global: true });
    expect(linha(ev, 'entradas').meses[0]).toBe(15);
    expect(linha(ev, 'saidas').meses[0]).toBe(-13);
    expect(linha(ev, 'transferencia').meses[0]).toBe(50);
    expect(linha(ev, 'evolucao').meses[0]).toBe(20);
    expect(ev.linhas.some((l) => l.id === 'transferencia_entrada')).toBe(false);
  });
  it('uma fazenda: a transferência vira entrada/saída EXTERNA dela', () => {
    const ev = montarEvolucao({ real, meta: [], unidade: 'cab', periodo: 'acum', global: false });
    expect(linha(ev, 'entradas').meses[0]).toBe(65);
    expect(linha(ev, 'saidas').meses[0]).toBe(-63);
    expect(ev.linhas.some((l) => l.id === 'transferencia')).toBe(false);
  });
  it('cada número leva à origem: compra/abate/venda → OC; nascimento/consumo/morte → Lanç.; saldo final e indicadores → Fech.', () => {
    const ev = montarEvolucao({ real, meta: [], unidade: 'cab', periodo: 'acum', global: true });
    expect(['compra', 'abate', 'venda'].map((id) => linha(ev, id).destino)).toEqual(['oc', 'oc', 'oc']);
    expect(['nascimento', 'consumo', 'morte'].map((id) => linha(ev, id).destino)).toEqual(['lanc', 'lanc', 'lanc']);
    expect(['saldo-final', 'peso-final', 'gmd', 'lotacao'].map((id) => linha(ev, id).destino)).toEqual(['fech', 'fech', 'fech', 'fech']);
  });
});

describe('unidade, período, meta e desfrute', () => {
  it('@: o abate é carcaça ÷ 15, o resto kg ÷ 30; kg é o peso vivo', () => {
    const real = [mes(1, { cab: { abate: 10, venda: 4 }, kg: { abate: 5000, venda: 1200 }, kgCarcacaAbate: 2700 })];
    expect(linha(montarEvolucao({ real, meta: [], unidade: 'arroba', periodo: 'acum', global: true }), 'abate').meses[0]).toBe(180);
    expect(linha(montarEvolucao({ real, meta: [], unidade: 'arroba', periodo: 'acum', global: true }), 'venda').meses[0]).toBe(40);
    expect(linha(montarEvolucao({ real, meta: [], unidade: 'kg', periodo: 'acum', global: true }), 'abate').meses[0]).toBe(5000);
  });
  it('período: Mês = o último fechado; Acum. = jan até ele; Ano = os 12', () => {
    expect(mesesDoPeriodo('mes', 9)).toEqual([9]);
    expect(mesesDoPeriodo('acum', 3)).toEqual([1, 2, 3]);
    expect(mesesDoPeriodo('ano', 3)).toHaveLength(12);
    expect(mesesDoPeriodo('acum', null)).toEqual([]);
    expect(ultimoMesFechado([mes(1), mes(2), mes(3, { fechado: false })])).toBe(2);
  });
  it('a meta é a do MESMO período (a régua do Δ); Δ % sobre ela; sem meta = "—"', () => {
    const real = [mes(1, { cab: { abate: 30 } }), mes(2, { cab: { abate: 30 } }), mes(3, { fechado: false, cab: { abate: 99 } })];
    const meta = [mes(1, { cab: { abate: 20 } }), mes(2, { cab: { abate: 20 } }), mes(3, { cab: { abate: 20 } })];
    const ev = montarEvolucao({ real, meta, unidade: 'cab', periodo: 'acum', global: true });
    const abate = linha(ev, 'abate');
    expect(abate.acum).toBe(60);
    expect(abate.meta).toBe(40);
    expect(deltaSobreMeta(abate)).toBeCloseTo(50, 10);
    expect(deltaSobreMeta(linha(montarEvolucao({ real, meta: [], unidade: 'cab', periodo: 'acum', global: true }), 'abate'))).toBeNull();
  });
  it('desfrute = (abates + vendas + consumo) ÷ rebanho inicial do ano × 100; morte não entra; o Δ é em pontos', () => {
    const real = [mes(1, { saldoInicio: 2000, cab: { abate: 30, venda: 10, consumo: 2, morte: 50 } }), mes(2, { cab: { abate: 8 } })];
    const meta = [mes(1, { saldoInicio: 2000, cab: { abate: 20 } }), mes(2, { cab: { abate: 20 } })];
    const d = linha(montarEvolucao({ real, meta, unidade: 'cab', periodo: 'acum', global: true }), 'desfrute');
    expect(d.meses[0]).toBeCloseTo(2.1, 10);
    expect(d.acum).toBeCloseTo(2.5, 10);
    expect(d.meta).toBeCloseTo(2, 10);
    expect(deltaSobreMeta(d)).toBeCloseTo(0.5, 10);
  });
  it('@ produzidas = produção biológica ÷ 30, só mês fechado', () => {
    const ev = montarEvolucao({ real: [mes(1, { producaoBio: 3000 }), mes(2, { fechado: false, producaoBio: 999 })], meta: [], unidade: 'cab', periodo: 'acum', global: true });
    expect(linha(ev, 'arrobas-produzidas').meses.slice(0, 2)).toEqual([100, null]);
    expect(linha(ev, 'arrobas-produzidas').acum).toBe(100);
  });
});

describe('a conferência fala: o GMD que salta e por quê', () => {
  it('mar com GMD 3,181 porque o peso médio final vai de 273,6 para 372,0 kg', () => {
    const fmt = (v: number, c: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    const avisos = avisosDaEvolucao([mes(2, { pesoMedioFinal: 273.6, gmd: 0.48 }), mes(3, { pesoMedioFinal: 372, gmd: 3.181 })], fmt, (m) => ['', 'Jan', 'Fev', 'Mar'][m]);
    expect(avisos).toEqual([{ mes: 3, texto: 'Mar: GMD 3,181 — o peso médio final vai de 273,6 kg para 372,0 kg. Conferir o Fechamento Área do mês.' }]);
  });
});
