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
}
interface Caso {
  cliente: string; conta: string; mes: string; internos: string[]; esp: EspelhadosReais;
  dias_banco: { dias: DiaBanco[]; retido_em_depositos: { qtde: number; valor: number } };
  resumo: { saldo_inicial: number; saldo_sistema: number; dias: DiaResumo[]; linhas_sistema: LinhaSistema[] | null };
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
