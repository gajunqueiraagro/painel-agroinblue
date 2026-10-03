/**
 * PR-CONC-CONFERENCIA-FECHAMENTO-DIA — a mesa do dia: "a data do banco manda" (R1–R5).
 *
 * ⚠ OS FIXTURES SÃO O RETORNO REAL DE `fn_extratos_espelhados` (proto, 03/10), compactados (texto cortado em 40, campos que a
 *   mesa não lê fora) — `mesaDoDia.fixture.json`. Cada um leva os `internos` como `useEspelhoInternas` os calcula.
 * ⚠ A IGUALDADE COM O CAIXA É A PROVA DE QUE A MESA NÃO INVENTA RÉGUA: o sistema de cada dia = `sistema_caixa` do dia
 *   (CONC-CAIXA-PONTA-01, a regra do banco) MENOS as internas (o banco não as exporta; a mesa as tira, PR-ESPELHO-07 item D)
 *   MENOS os sobre- e sub-aplicados. Esses dois o caixa trata "como hoje" (valor cheio na data de pagamento — exceção
 *   registrada no CONC-CAIXA-PONTA-01), e a mesa os mostra como diferença real (R5); por isso saem dos DOIS lados, pelo
 *   mesmo conjunto que a lib usa (`lancamentosSobreAplicados`, `lancamentosSubAplicados`).
 * ⚠ O ORÁCULO (`mesaDoDiaAntes.fixture.ts`) é a mesa do HEAD 6ccd86e9 byte a byte: as mutações deste arquivo mostram que
 *   cada teste derruba a regra antiga pela razão certa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  montarMesa, lancamentosSobreAplicados, lancamentosSubAplicados, sinalDoAplicado,
  type EspelhadosReais,
} from './mesaDoDia';
import { montarMesaAntes } from './mesaDoDiaAntes.fixture';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';

type Caso = { internos: string[]; esp: EspelhadosReais };
const FIX: Record<string, Caso> = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/mesaDoDia.fixture.json'), 'utf8'));
const caso = (nome: string) => {
  const c = FIX[nome];
  if (!c) throw new Error(`fixture ${nome} ausente`);
  return { esp: c.esp, internos: new Set(c.internos) };
};
const mesa = (nome: string, ancoraN1: 'extrato' | 'lancamento' = 'extrato') => {
  const { esp, internos } = caso(nome);
  return montarMesa(esp, internos, { ancoraN1 });
};
const doDia = <T extends { data: string | null }>(dias: readonly T[], data: string): T => {
  const d = dias.find((x) => x.data === data);
  if (!d) throw new Error(`dia ${data} ausente`);
  return d;
};
/* estrutural: serve à mesa nova e à do oráculo (que não tem `restos`) */
type DiaComLinhas = {
  data: string | null; banco: number; sistema: number; pareados: unknown[]; paredosN1: unknown[];
  extratosSemPar: unknown[]; lancsSemPar: unknown[]; internas: unknown[]; restos?: unknown[];
};
const temLinha = (d: DiaComLinhas) =>
  d.pareados.length + d.paredosN1.length + d.extratosSemPar.length + d.lancsSemPar.length + d.internas.length + (d.restos?.length ?? 0) > 0;
const diasComDiferenca = (dias: readonly DiaComLinhas[]) =>
  dias.filter((d) => temLinha(d) && !saldoConfere(d.banco - d.sistema)).map((d) => d.data);
const id8 = (s: string) => s.slice(0, 8);

/** A igualdade com o caixa, dia a dia — devolve os dias que NÃO batem (vazio = prova). */
function divergenciasDoCaixa(nome: string): string[] {
  const { esp, internos } = caso(nome);
  const dias = montarMesa(esp, internos);
  const excluir = new Set([...lancamentosSobreAplicados(esp), ...lancamentosSubAplicados(esp).keys()]);
  const caixa = new Map<string, number>();
  for (const c of esp.sistema_caixa ?? []) {
    if (internos.has(c.lancamento_id) || excluir.has(c.lancamento_id)) continue;
    caixa.set(c.data ?? 'sem', (caixa.get(c.data ?? 'sem') ?? 0) + Number(c.valor));
  }
  const falhas: string[] = [];
  let comparados = 0;
  for (const d of dias) {
    let excluido = 0;
    for (const p of d.pareados) for (const f of p.filhas) if (excluir.has(f.lancamento_id)) excluido += sinalDoAplicado(f.sis, p.extrato.valor) * f.valor_aplicado;
    for (const g of d.paredosN1) if (excluir.has(g.sis.lancamento_id)) excluido += sinalDoAplicado(g.sis, g.extratos[0].extrato.valor) * g.soma;
    for (const r of d.restos) excluido += Math.sign(r.sis.valor_assinado || 1) * r.resto;
    const k = d.data ?? 'sem';
    if (temLinha(d)) comparados += 1;
    if (Math.abs(d.sistema - excluido - (caixa.get(k) ?? 0)) > 0.005) falhas.push(`${k}: mesa ${d.sistema - excluido} x caixa ${caixa.get(k) ?? 0}`);
    caixa.delete(k);
  }
  caixa.forEach((v, k) => { if (Math.abs(v) > 0.005) falhas.push(`${k}: só no caixa ${v}`); });
  /* a prova reporta o tamanho do conjunto: dia nenhum comparado não é prova */
  if (comparados === 0) falhas.push('nenhum dia comparado');
  return falhas;
}

describe('T1 — 02/09 no NJ Sicredi Lavoura: os 5 movimentos no dia, banco = sistema = 73.178,92', () => {
  const dias = mesa('nj_sicredi_lavoura_2026_09');
  const d = doDia(dias, '2026-09-02');

  it('os 5 extratos de 02/09 viram linha no dia (nenhum consumido), e o dia confere', () => {
    expect(d.pareados.map((p) => p.extrato.valor).sort((a, b) => a - b)).toEqual([-16629.2, -5940, 6048, 39700.12, 50000]);
    expect(d.paredosN1).toHaveLength(0);
    expect(d.banco).toBeCloseTo(73178.92, 2);
    expect(d.sistema).toBeCloseTo(73178.92, 2);
    expect(saldoConfere(d.banco - d.sistema)).toBe(true);
  });

  it('o T Cortez 39.700,12 leva os 14 vínculos dele, inclusive a venda 4c17bbd8 de 04/09 ("parte de 11.080,80 · resto em 04/09")', () => {
    const p = d.pareados.find((x) => x.extrato.valor === 39700.12);
    expect(p?.filhas).toHaveLength(14);
    const venda = p?.filhas.find((f) => id8(f.lancamento_id) === '4c17bbd8');
    expect(venda?.lancadoEm).toBe('2026-09-04');
    expect(venda?.parte).toEqual({ valorCheio: 11080.8, restoEm: ['2026-09-04'] });
    expect(Math.abs((p?.diferenca ?? 1))).toBeLessThan(0.005);
  });

  it('o Nelson −5.940,00 leva os 7 vínculos dele, inclusive o carregamento 17278cd6 de 09/09', () => {
    const p = d.pareados.find((x) => x.extrato.valor === -5940);
    expect(p?.filhas).toHaveLength(7);
    expect(p?.filhas.find((f) => id8(f.lancamento_id) === '17278cd6')?.parte?.restoEm).toEqual(['2026-09-09']);
  });

  it('MUTAÇÃO: com o N:1 ancorado no lançamento (a mesa de antes), 02/09 volta a "diferença 33.760,12"', () => {
    const { esp, internos } = caso('nj_sicredi_lavoura_2026_09');
    const antes = doDia(montarMesaAntes(esp, internos), '2026-09-02');
    expect(antes.sistema).toBeCloseTo(39418.8, 2);
    expect(antes.banco - antes.sistema).toBeCloseTo(33760.12, 2);
    expect(saldoConfere(antes.banco - antes.sistema)).toBe(false);
  });
});

describe('T2 — o mês inteiro: só 28/09 (Pix do Emerson sem par), e a igualdade com o caixa em todos os dias', () => {
  it('Sicredi Lavoura set/26: de 11 dias com diferença para 1, 28/09 −17.345,60, e o motivo é o extrato sem par', () => {
    const dias = mesa('nj_sicredi_lavoura_2026_09');
    expect(diasComDiferenca(dias)).toEqual(['2026-09-28']);
    const d = doDia(dias, '2026-09-28');
    expect(d.banco - d.sistema).toBeCloseTo(-17345.6, 2);
    expect(d.extratosSemPar.map((e) => e.valor)).toEqual([-17345.6]);
    const { esp, internos } = caso('nj_sicredi_lavoura_2026_09');
    expect(diasComDiferenca(montarMesaAntes(esp, internos))).toHaveLength(11);
  });

  it.each(Object.keys(FIX))('igualdade com o caixa (− internas − sobre/sub-aplicados), dia a dia: %s', (nome) => {
    expect(divergenciasDoCaixa(nome)).toEqual([]);
  });

  it('o Agnaldo Bradesco ago/26 tem as 17 internas, e elas ficam fora da soma (e da igualdade)', () => {
    const { esp, internos } = caso('agnaldo_bradesco_2026_08');
    expect(internos.size).toBe(17);
    const dias = montarMesa(esp, internos);
    expect(dias.reduce((a, d) => a + d.internas.length, 0)).toBe(17);
    expect(diasComDiferenca(dias)).toEqual([]);
  });
});

describe('T3 — N:1 com todos os extratos no mesmo dia continua bloco', () => {
  it('sintético: 600 + 400 no mesmo dia pagando um lançamento de 1.000 — bloco, e o dia confere', () => {
    const esp: EspelhadosReais = {
      escopo: { cliente_id: 'c', conta_id: 'k', ano_mes: '2026-09', nome_conta: 'X' },
      saldos: { inicial: 0, final_oficial: null, periodo_ini: null, periodo_fim: null, extrato_ini: null, extrato_fim: null },
      ofx_completo: [
        { extrato_id: 'e1', data: '2026-09-10', historico: 'a', documento: null, valor: -600, status: 'conciliado', flag_dup: false, flag_investimento: false },
        { extrato_id: 'e2', data: '2026-09-10', historico: 'b', documento: null, valor: -400, status: 'conciliado', flag_dup: false, flag_investimento: false },
      ],
      sistema_completo: [{ lancamento_id: 'l1', data: '2026-09-08', descricao: 'x', centro: null, subcentro: null, valor_assinado: -1000, sinal: '-1', status: 'conciliado' }],
      vinculos: [
        { extrato_id: 'e1', lancamento_id: 'l1', valor_aplicado: 600, tipo_aprovacao: 'manual', grupo_id: 'g' },
        { extrato_id: 'e2', lancamento_id: 'l1', valor_aplicado: 400, tipo_aprovacao: 'manual', grupo_id: 'g' },
      ],
      versao: 't', gerado_em: 't',
    };
    const [d] = montarMesa(esp, new Set());
    expect(d.data).toBe('2026-09-10');
    expect(d.pareados).toHaveLength(0);
    expect(d.paredosN1).toHaveLength(1);
    expect(d.paredosN1[0].grupoId).toBe('g');
    expect(d.paredosN1[0].lancadoEm).toBe('2026-09-08');
    expect(d.sistema).toBeCloseTo(-1000, 2);
    expect(saldoConfere(d.banco - d.sistema)).toBe(true);
  });

  it('real: o 77711d94 (2 extratos de −360,00 em 21/05, só dele) segue bloco no dia', () => {
    const d = doDia(mesa('a1b2_itau_personalite_2026_05'), '2026-05-21');
    expect(d.paredosN1.map((g) => id8(g.sis.lancamento_id))).toEqual(['77711d94']);
  });
});

describe('T4 — lançamento pago em 2 dias: aparece nos 2, e as partes somam o cheio', () => {
  it('a venda 4c17bbd8 (11.080,80, lançada em 04/09) aparece sob o extrato de 02/09 e sob o de 04/09', () => {
    const dias = mesa('nj_sicredi_lavoura_2026_09');
    const partes = dias.flatMap((d) => d.pareados.flatMap((p) => p.filhas
      .filter((f) => id8(f.lancamento_id) === '4c17bbd8').map((f) => ({ dia: d.data, f }))));
    expect(partes.map((x) => x.dia)).toEqual(['2026-09-02', '2026-09-04']);
    expect(partes.map((x) => x.f.parte?.restoEm)).toEqual([['2026-09-04'], ['2026-09-02']]);
    expect(partes.reduce((a, x) => a + x.f.valor_aplicado, 0)).toBeCloseTo(11080.8, 2);
    expect(partes.every((x) => x.f.parte?.valorCheio === 11080.8)).toBe(true);
  });
});

describe('T5 — o aviso "lançado em" não entra na diferença', () => {
  it('Sicredi Lavoura set/26: 11 vínculos com data de lançamento ≠ data do banco, e nenhum desses dias difere por isso', () => {
    const dias = mesa('nj_sicredi_lavoura_2026_09');
    const comAviso = dias.filter((d) => d.pareados.some((p) => p.filhas.some((f) => f.lancadoEm)));
    expect(dias.flatMap((d) => d.pareados.flatMap((p) => p.filhas.filter((f) => f.lancadoEm))).length).toBe(11);
    expect(comAviso.length).toBeGreaterThan(0);
    for (const d of comAviso) expect(saldoConfere(d.banco - d.sistema)).toBe(true);
  });
});

describe('T6 — extrato com aplicado ≠ valor: diferença real', () => {
  it('sintético: extrato −100,00 com 80,00 aplicados — a linha e o dia mostram 20,00', () => {
    const esp: EspelhadosReais = {
      escopo: { cliente_id: 'c', conta_id: 'k', ano_mes: '2026-09', nome_conta: 'X' },
      saldos: { inicial: 0, final_oficial: null, periodo_ini: null, periodo_fim: null, extrato_ini: null, extrato_fim: null },
      ofx_completo: [{ extrato_id: 'e1', data: '2026-09-10', historico: 'a', documento: null, valor: -100, status: 'conciliado', flag_dup: false, flag_investimento: false }],
      sistema_completo: [{ lancamento_id: 'l1', data: '2026-09-10', descricao: 'x', centro: null, subcentro: null, valor_assinado: -80, sinal: '-1', status: 'conciliado' }],
      vinculos: [{ extrato_id: 'e1', lancamento_id: 'l1', valor_aplicado: 80, tipo_aprovacao: 'manual', grupo_id: null }],
      versao: 't', gerado_em: 't',
    };
    const [d] = montarMesa(esp, new Set());
    expect(d.pareados[0].diferenca).toBeCloseTo(20, 2);
    expect(d.banco - d.sistema).toBeCloseTo(-20, 2);
  });
});

describe('T7 — internas, candidatos, sem par e "Só não conciliados": a mesma saída de antes', () => {
  it.each(['agnaldo_bradesco_2026_08', 'nj_sicredi_lavoura_2026_09', 'nj_itau_bba_2026_09'])('%s: internas, extratos sem par e lançamentos sem par iguais aos de antes', (nome) => {
    const { esp, internos } = caso(nome);
    const chave = (dias: { data: string | null; internas: { lancamento_id: string }[]; extratosSemPar: { extrato_id: string }[]; lancsSemPar: { lancamento_id: string }[] }[]) =>
      dias.map((d) => [d.data, d.internas.map((s) => s.lancamento_id), d.extratosSemPar.map((e) => e.extrato_id), d.lancsSemPar.map((s) => s.lancamento_id)])
        .filter(([, a, b, c]) => (a as string[]).length + (b as string[]).length + (c as string[]).length > 0);
    expect(chave(montarMesa(esp, internos))).toEqual(chave(montarMesaAntes(esp, internos)));
  });

  it('candidatos: cada um no dia do vencimento e fora das somas, como antes', () => {
    const { esp, internos } = caso('nj_itau_bba_2026_09');
    const comCand: EspelhadosReais = { ...esp, sistema_candidatos: [{
      lancamento_id: 'cand', data_vencimento: '2026-09-15', competencia: '2026-09-01', valor: 500, valor_assinado: -500, sinal: '-1',
      descricao: 'x', centro: null, subcentro: null, status_transacao: 'programado', cenario: 'realizado', cultura: null,
      numero_documento: null, tipo_documento: null, favorecido_id: null, fornecedor: null, safra_codigo: null, safra_descricao: null,
      vencido: false, ja_conciliado: false, sem_conta: false,
    }] };
    const novo = montarMesa(comCand, internos); const antes = montarMesaAntes(comCand, internos);
    expect(novo.flatMap((d) => d.candidatos.map((c) => [d.data, c.lancamento_id]))).toEqual(antes.flatMap((d) => d.candidatos.map((c) => [d.data, c.lancamento_id])));
    expect(doDia(novo, '2026-09-15').sistema).toBe(doDia(antes, '2026-09-15').sistema);
  });
});

describe('T8 — a âncora antiga (a do Extrato da planilha) tem a MESMA saída de antes', () => {
  /* os campos novos são acréscimo (o Extrato da planilha não os lê); fora eles, a saída tem de ser idêntica */
  const semCamposNovos = (dias: ReturnType<typeof montarMesa>) => JSON.parse(JSON.stringify(dias, (k, v) =>
    (k === 'lancadoEm' || k === 'parte' || k === 'sobreAplicado' || k === 'restos') ? undefined : v));
  it.each(Object.keys(FIX))('%s', (nome) => {
    const { esp, internos } = caso(nome);
    expect(semCamposNovos(montarMesa(esp, internos, { ancoraN1: 'lancamento' }))).toEqual(JSON.parse(JSON.stringify(montarMesaAntes(esp, internos))));
  });

  it('o Extrato da planilha pede a âncora antiga, e só ele', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/v2/lib/mesa/extratoDaPlanilha.ts'), 'utf8');
    expect(src).toMatch(/montarMesa\(data, internos, \{ ancoraN1: 'lancamento' \}\)/);
    const tela = readFileSync(resolve(process.cwd(), 'src/components/financeiro-v2/EspelhoConciliacaoTab.tsx'), 'utf8');
    expect(tela).not.toMatch(/ancoraN1/);
  });
});

describe('T10 — sobre-aplicação: diferença real, com o motivo', () => {
  it('77711d94 (2 × −360,00 num lançamento de −360,00; o gêmeo d88ea17e sem par): 21/05 mostra 360,00', () => {
    const d = doDia(mesa('a1b2_itau_personalite_2026_05'), '2026-05-21');
    const g = d.paredosN1.find((x) => id8(x.sis.lancamento_id) === '77711d94');
    expect(g?.sobreAplicado).toBe(true);
    expect(d.lancsSemPar.map((s) => id8(s.lancamento_id))).toEqual(['d88ea17e']);
    expect(d.banco - d.sistema).toBeCloseTo(360, 2);
  });

  it('eabe167e (1 vínculo de 375.000 num lançamento de 215.000): o extrato tem o motivo; 30/06 difere pela outra metade sem par', () => {
    const d = doDia(mesa('77d3_bb_2026_06'), '2026-06-30');
    const p = d.pareados.find((x) => x.filhas.some((f) => id8(f.lancamento_id) === 'eabe167e'));
    expect(p?.sobreAplicado).toBe(true);
    expect(d.lancsSemPar.map((s) => s.valor_assinado)).toEqual([160000]);
    expect(d.banco - d.sistema).toBeCloseTo(-160000, 2);
  });

  it('a transferência com um vínculo por ponta NÃO é sobre-aplicação (NJ set/26, 8d9a3188: 220.000 no BB e no Itaú BBA)', () => {
    for (const nome of ['nj_bb_2026_09_transferencia', 'nj_itau_bba_2026_09']) {
      const { esp } = caso(nome);
      expect((esp.vinculos ?? []).filter((v) => id8(v.lancamento_id) === '8d9a3188')).toHaveLength(2);
      expect([...lancamentosSobreAplicados(esp)].some((l) => id8(l) === '8d9a3188')).toBe(false);
    }
  });
});

describe('T11 — o vínculo conta para a conta do extrato (a meia transferência vira sem par aqui)', () => {
  const MEIAS = ['7c1b7a71', '6d96ab88', 'c84a4e8b'];
  it('77d3 BB jun/26: os 5 lançamentos vinculados só a extrato de outra conta aparecem como sem par no dia deles', () => {
    const { esp } = caso('77d3_bb_2026_06');
    const daConta = new Set(esp.ofx_completo.map((o) => o.extrato_id));
    const soFora = esp.sistema_completo.filter((s) => {
      const vs = (esp.vinculos ?? []).filter((v) => v.lancamento_id === s.lancamento_id);
      return vs.length > 0 && vs.every((v) => !daConta.has(v.extrato_id));
    });
    expect(soFora).toHaveLength(5);
    expect(soFora.map((s) => id8(s.lancamento_id))).toEqual(expect.arrayContaining(MEIAS));
    const dias = mesa('77d3_bb_2026_06');
    for (const s of soFora) expect(doDia(dias, s.data ?? '').lancsSemPar.map((x) => x.lancamento_id)).toContain(s.lancamento_id);
  });

  it('a conta vai de 5 dias com diferença para 1 (30/06, −160.000,00)', () => {
    expect(diasComDiferenca(mesa('77d3_bb_2026_06'))).toEqual(['2026-06-30']);
  });

  it('MUTAÇÃO: com o vínculo de qualquer conta (a mesa de antes), os 5 somem e voltam os 5 dias com diferença', () => {
    const { esp, internos } = caso('77d3_bb_2026_06');
    const antes = montarMesaAntes(esp, internos);
    expect(antes.flatMap((d) => d.lancsSemPar.map((s) => id8(s.lancamento_id))).filter((x) => MEIAS.includes(x))).toEqual([]);
    expect(diasComDiferenca(antes)).toHaveLength(5);
  });

  it('a transferência com as DUAS pontas casadas não vira sem par em nenhuma das duas contas (8d9a3188, BB e Itaú BBA)', () => {
    for (const nome of ['nj_bb_2026_09_transferencia', 'nj_itau_bba_2026_09']) {
      const dias = mesa(nome);
      expect(dias.flatMap((d) => d.lancsSemPar.map((s) => id8(s.lancamento_id)))).not.toContain('8d9a3188');
      expect(dias.flatMap((d) => d.pareados.flatMap((p) => p.filhas.map((f) => id8(f.lancamento_id))))).toContain('8d9a3188');
    }
  });
});

describe('T12 — sub-aplicação: o resto não aplicado aparece, no dia do lançamento', () => {
  it('f33269e9 (0,02 × 0,01 no mesmo dia, 08/07): resto 0,01 e o dia mostra a diferença', () => {
    const d = doDia(mesa('77d3_bradesco_2026_07'), '2026-07-08');
    expect(d.restos.map((r) => [id8(r.sis.lancamento_id), r.aplicado, r.resto])).toEqual([['f33269e9', 0.01, 0.01]]);
    expect(d.banco - d.sistema).toBeCloseTo(-0.01, 2);
  });

  it('a627a6eb (2,09 em 19/09 × 0,13 em 21/09): o aplicado fica em 21/09 (confere), o resto 1,96 em 19/09 (diferença)', () => {
    const dias = mesa('a1b2_itau_personalite_2026_09');
    const d19 = doDia(dias, '2026-09-19');
    expect(d19.restos.map((r) => [id8(r.sis.lancamento_id), r.resto])).toEqual([['a627a6eb', 1.96]]);
    expect(d19.banco - d19.sistema).toBeCloseTo(-1.96, 2);
    expect(saldoConfere(doDia(dias, '2026-09-21').banco - doDia(dias, '2026-09-21').sistema)).toBe(true);
    expect(lancamentosSubAplicados(caso('a1b2_itau_personalite_2026_09').esp).get(
      [...lancamentosSubAplicados(caso('a1b2_itau_personalite_2026_09').esp).keys()].find((k) => id8(k) === 'a627a6eb') ?? '',
    )).toEqual({ aplicado: 0.13, resto: 1.96 });
  });

  it('MUTAÇÃO: sem o resto (a mesa de antes), 19/09 não tem linha e 08/07 "confere"', () => {
    const a = caso('a1b2_itau_personalite_2026_09');
    expect(montarMesaAntes(a.esp, a.internos).find((d) => d.data === '2026-09-19')).toBeUndefined();
    const b = caso('77d3_bradesco_2026_07');
    const d = doDia(montarMesaAntes(b.esp, b.internos), '2026-07-08');
    expect(saldoConfere(d.banco - d.sistema)).toBe(true);
  });

  it('o programado parcial não é sub-aplicado: só entra quem está em `sistema_completo` (o realizado)', () => {
    const { esp } = caso('77d3_bradesco_2026_07');
    const realizados = new Set(esp.sistema_completo.map((s) => s.lancamento_id));
    for (const k of lancamentosSubAplicados(esp).keys()) expect(realizados.has(k)).toBe(true);
  });
});
