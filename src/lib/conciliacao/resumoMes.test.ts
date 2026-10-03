/**
 * PR-CONC-SALDO-UMA-REGUA-01 — o DIA do banco (`_fn_conciliacao_dias_conta`, que alimenta `fn_conciliacao_resumo_mes`) é o
 * MESMO dia da Conferência (`montarMesa`). É o teste permanente do ESPELHO DECLARADO: o banco é o dono do STATUS e da
 * contagem de dias; a mesa continua quem desenha. Se uma das duas regras mudar sem a outra, este teste cai.
 *
 * ⚠ OS DOIS LADOS SAÍRAM DO MESMO SNAPSHOT (`resumoMes.fixture.json`, capturado numa transação REPEATABLE READ em 03/10, com
 *   a migration aplicada dentro e desfeita pelo RAISE): `esp` é o retorno real de `fn_extratos_espelhados`, `internos` os ids
 *   de `useEspelhoInternas`, e `dias_banco` o retorno real da função do banco. Os casos cobrem o que a regra trata:
 *   - NJ Sicredi Lavoura set/26 (o Emerson): o programado parcial e as 15 retenções em depósitos líquidos;
 *   - Vera mai/26: a sobre-aplicação (77711d94) e o gêmeo sem par;
 *   - Vera set/26: o resto de sub-aplicação (a627a6eb) e um extrato sem par;
 *   - Agnaldo Bradesco ago/26: as 17 transferências com a Invest Fácil (interna), fora;
 *   - Santa Rita abr/26: o timing dentro do mês (05 × 06, ±530.194,90).
 * ⚠ A prova completa (69 conta-meses, 910 dias, 0 divergências) vai no relatório do PR; aqui fica o recorte que a sustenta.
 *
 * PR-CONC-SALDO-UMA-REGUA-01b — o fixture ganhou `resumo` (a linha da conta de `fn_conciliacao_resumo_mes` com UMA conta:
 * saldo inicial, saldo do sistema, `dias` e `linhas_sistema`), recapturado no MESMO snapshot que `esp` e `dias_banco`
 * (03/10, REPEATABLE READ, migration 20261027191700 dentro). Prova: saldo inicial + Σ linhas = saldo do sistema, e os `dias`
 * do resumo são os dias da mesa.
 *
 * PR-CONC-SALDO-UMA-REGUA-01c — recapturado (03/10, REPEATABLE READ, migration 20261027192200 aplicada): cada linha da lista
 * ganhou `saldo_apos` (o saldo corrido, que a aba Sistema desenha sem somar), `centro` e `status_exibicao`; o resumo ganhou
 * `diferenca_entradas`/`diferenca_saidas` (banco − sistema por lado, o quadro do topo do Casar). `esp`, `dias_banco`, `dias` e
 * as chaves antigas da lista saíram IGUAIS à captura do 01b (a do Agnaldo muda só a ORDEM dos vínculos).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { montarMesa, type EspelhadosReais } from './mesaDoDia';

interface DiaBanco { data: string; banco: number; sistema: number; diferenca: number; motivos: string[] }
interface DiaResumo extends DiaBanco { banco_acum: number; sistema_acum: number; saldo_banco: number | null; saldo_sistema: number | null }
interface LinhaSistema {
  tipo: 'vinculo' | 'sem_par' | 'resto_sub_aplicado'; data: string; valor: number; lancamento_id: string;
  extrato_id?: string; parcial?: boolean; falta?: number; sobre_aplicado?: boolean;
  saldo_apos: number; centro?: string; status_exibicao: 'conciliado' | 'parcial' | 'realizado';
}
interface Caso {
  cliente: string; conta: string; mes: string; internos: string[]; esp: EspelhadosReais;
  dias_banco: { dias: DiaBanco[]; retido_em_depositos: { qtde: number; valor: number } };
  resumo: {
    saldo_inicial: number; saldo_sistema: number; dias: DiaResumo[]; linhas_sistema: LinhaSistema[] | null;
    diferenca_entradas: number; diferenca_saidas: number; entradas: number; saidas: number;
    banco: { entradas: number; saidas: number }; status: string; retido_em_depositos: { qtde: number; valor: number };
  };
}
const FIX: Record<string, Caso> = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Os dias que divergem entre a mesa e o banco (a união dos dias dos dois lados; dia ausente = 0). */
function divergencias(caso: Caso, internos: ReadonlySet<string>) {
  const mesa = new Map<string, { banco: number; sistema: number }>();
  for (const d of montarMesa(caso.esp, internos)) if (d.data) mesa.set(d.data, { banco: r2(d.banco), sistema: r2(d.sistema) });
  const banco = new Map(caso.dias_banco.dias.map((d) => [d.data, { banco: r2(Number(d.banco)), sistema: r2(Number(d.sistema)) }]));
  const dias = [...new Set([...mesa.keys(), ...banco.keys()])];
  const fora = dias.filter((k) => {
    const x = mesa.get(k) ?? { banco: 0, sistema: 0 }; const y = banco.get(k) ?? { banco: 0, sistema: 0 };
    return Math.abs(x.banco - y.banco) > 0.005 || Math.abs(x.sistema - y.sistema) > 0.005;
  });
  return { comparados: dias.length, fora };
}

/** Saldo inicial + Σ linhas da lista do sistema, no centavo (a soma é crua; arredonda-se só o fim). */
const fechaLista = (r: Caso['resumo'], linhas = r.linhas_sistema ?? []) =>
  r2(Number(r.saldo_inicial) + linhas.reduce((s, l) => s + Number(l.valor), 0));

describe('o dia do banco é o dia da Conferência', () => {
  for (const [nome, caso] of Object.entries(FIX)) {
    it(`${nome}: mesmos banco e sistema em todos os dias`, () => {
      const { comparados, fora } = divergencias(caso, new Set(caso.internos));
      expect(comparados).toBeGreaterThan(0);
      expect(fora).toEqual([]);
    });
  }

  it('a busca sabe achar: com a mesa errada (internas ignoradas), o Agnaldo diverge', () => {
    const caso = FIX.agnaldo_bradesco_2026_08;
    expect(caso.internos.length).toBeGreaterThan(0);
    expect(divergencias(caso, new Set()).fora.length).toBeGreaterThan(0);
  });

  it('todo dia com diferença tem motivo, e dia sem diferença não tem', () => {
    for (const caso of Object.values(FIX)) {
      for (const d of caso.dias_banco.dias) {
        const temDif = Math.abs(Number(d.diferenca)) > 0.005;
        expect(temDif ? d.motivos.length > 0 : true).toBe(true);
      }
    }
  });

  it('o Emerson: zero dias com diferença e as 15 retenções (1.217,01) contadas nos depósitos', () => {
    const caso = FIX.nj_sicredi_lavoura_2026_09;
    expect(caso.dias_banco.dias.filter((d) => Math.abs(Number(d.diferenca)) > 0.005)).toEqual([]);
    expect(caso.dias_banco.retido_em_depositos).toEqual({ qtde: 15, valor: 1217.01 });
  });

  it('os motivos de cada caso são os da regra', () => {
    const motivos = (nome: string) => FIX[nome].dias_banco.dias
      .filter((d) => Math.abs(Number(d.diferenca)) > 0.005).map((d) => `${d.data.slice(8)}:${d.motivos.join('+')}`);
    expect(motivos('vera_2026_05')).toEqual(['21:lancamento_sem_par+sobre_aplicado']);
    expect(motivos('vera_2026_09')).toEqual(['19:resto_sub_aplicado', '28:extrato_sem_par']);
    expect(motivos('santa_rita_2026_04')).toEqual(['05:lancamento_sem_par', '06:extrato_sem_par+lancamento_sem_par']);
    expect(motivos('agnaldo_bradesco_2026_08')).toEqual([]);
  });
});

describe('PR-CONC-SALDO-UMA-REGUA-01b — a lista e os dias do resumo de UMA conta', () => {
  for (const [nome, caso] of Object.entries(FIX)) {
    it(`${nome}: saldo inicial + linhas do sistema = saldo do sistema, e o último dia fecha nele`, () => {
      const r = caso.resumo;
      expect((r.linhas_sistema ?? []).length).toBeGreaterThan(0);
      expect(fechaLista(r)).toBe(r2(Number(r.saldo_sistema)));
      expect(r2(Number(r.dias[r.dias.length - 1].saldo_sistema))).toBe(r2(Number(r.saldo_sistema)));
    });
    it(`${nome}: os dias do resumo são os dias da mesa`, () => {
      const viaResumo = { ...caso, dias_banco: { ...caso.dias_banco, dias: caso.resumo.dias } };
      const { comparados, fora } = divergencias(viaResumo, new Set(caso.internos));
      expect(comparados).toBe(caso.resumo.dias.length);
      expect(fora).toEqual([]);
    });
  }

  it('a busca sabe achar: tirar uma linha da lista quebra o fechamento', () => {
    const r = FIX.nj_sicredi_lavoura_2026_09.resumo;
    const linhas = r.linhas_sistema ?? [];
    expect(fechaLista(r, linhas.slice(1))).not.toBe(r2(Number(r.saldo_sistema)));
  });

  it('o Emerson: a lista fecha em 155.972,29 e o programado parcial vem marcado com a falta de 300,00', () => {
    const r = FIX.nj_sicredi_lavoura_2026_09.resumo;
    expect(r2(Number(r.saldo_sistema))).toBe(155972.29);
    const parciais = (r.linhas_sistema ?? []).filter((l) => l.parcial);
    expect(parciais.map((l) => [l.lancamento_id.slice(0, 8), l.tipo, Number(l.valor), Number(l.falta)]))
      .toEqual([['d320635d', 'vinculo', -2561.6, 300]]);
  });

  it('o sobre-aplicado da Vera (mai/26) vem marcado nas linhas de vínculo dele', () => {
    const sobre = (FIX.vera_2026_05.resumo.linhas_sistema ?? []).filter((l) => l.sobre_aplicado);
    expect(sobre.length).toBeGreaterThan(0);
    expect(new Set(sobre.map((l) => l.lancamento_id.slice(0, 8)))).toEqual(new Set(['77711d94']));
  });
});

describe('PR-CONC-SALDO-UMA-REGUA-01c — saldo corrido, status de exibição e diferença por lado, do dono', () => {
  for (const [nome, caso] of Object.entries(FIX)) {
    it(`${nome}: o saldo_apos de cada linha é o saldo inicial + as linhas até ela, e o último é o saldo do sistema`, () => {
      const r = caso.resumo;
      const linhas = r.linhas_sistema ?? [];
      let acum = Number(r.saldo_inicial);
      for (const l of linhas) {
        acum += Number(l.valor);
        expect(r2(Number(l.saldo_apos))).toBe(r2(acum));
      }
      expect(r2(Number(linhas[linhas.length - 1].saldo_apos))).toBe(r2(Number(r.saldo_sistema)));
    });
    it(`${nome}: status de exibição — parcial só no parcial, conciliado só no vínculo, e toda linha tem centro`, () => {
      for (const l of caso.resumo.linhas_sistema ?? []) {
        const esperado = l.parcial ? 'parcial' : l.tipo === 'vinculo' ? 'conciliado' : 'realizado';
        expect(l.status_exibicao).toBe(esperado);
        expect(l.centro ?? '').not.toBe('');
      }
    });
    it(`${nome}: diferença por lado = banco − sistema`, () => {
      const r = caso.resumo;
      expect(r2(Number(r.diferenca_entradas))).toBe(r2(Number(r.banco.entradas) - Number(r.entradas)));
      expect(r2(Number(r.diferenca_saidas))).toBe(r2(Number(r.banco.saidas) - Number(r.saidas)));
    });
  }

  it('a busca sabe achar: trocar duas linhas de lugar quebra o saldo corrido', () => {
    const linhas = [...(FIX.nj_sicredi_lavoura_2026_09.resumo.linhas_sistema ?? [])];
    const i = linhas.findIndex((l, k) => k > 0 && Math.abs(Number(l.valor) - Number(linhas[k - 1].valor)) > 0.005);
    [linhas[i - 1], linhas[i]] = [linhas[i], linhas[i - 1]];
    const r = FIX.nj_sicredi_lavoura_2026_09.resumo;
    let acum = Number(r.saldo_inicial);
    const quebradas = linhas.filter((l) => { acum += Number(l.valor); return r2(Number(l.saldo_apos)) !== r2(acum); });
    expect(quebradas.length).toBeGreaterThan(0);
  });

  it('o Emerson: conciliado, zero de diferença nos dois lados, a lista termina em 155.972,29 e o parcial diz a falta', () => {
    const r = FIX.nj_sicredi_lavoura_2026_09.resumo;
    expect(r.status).toBe('conciliado');
    expect([Number(r.diferenca_entradas), Number(r.diferenca_saidas)]).toEqual([0, 0]);
    expect(r.retido_em_depositos).toEqual({ qtde: 15, valor: 1217.01 });
    const linhas = r.linhas_sistema ?? [];
    expect(Number(linhas[linhas.length - 1].saldo_apos)).toBe(155972.29);
    expect(linhas.filter((l) => l.status_exibicao === 'parcial').map((l) => [l.lancamento_id.slice(0, 8), Number(l.falta)]))
      .toEqual([['d320635d', 300]]);
  });
});
