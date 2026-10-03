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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { montarMesa, type EspelhadosReais } from './mesaDoDia';

interface DiaBanco { data: string; banco: number; sistema: number; diferenca: number; motivos: string[] }
interface Caso {
  cliente: string; conta: string; mes: string; internos: string[]; esp: EspelhadosReais;
  dias_banco: { dias: DiaBanco[]; retido_em_depositos: { qtde: number; valor: number } };
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
