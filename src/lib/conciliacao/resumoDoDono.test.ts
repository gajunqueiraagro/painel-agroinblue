/**
 * PR-CONC-SALDO-UMA-REGUA-02 — a leitura do dono do resumo e o que a tela escreve dele.
 *
 * ⚠ A TELA NÃO CALCULA: estes testes provam que o que sai daqui é o que o dono mandou — o parser não inventa número (nulo
 *   continua nulo), as frases saem dos motivos do dono (T2/T3) e o "Fechar contas sem movimento" grava o saldo do dono e
 *   pula a conta com movimento (T8).
 * ⚠ A linha do Emerson (NJ Sicredi Lavoura, set/26) é a do fixture real (`resumoMes.fixture.json`, recapturado no 01c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  lerResumo, lerStatusAno, frasesDoStatus, fraseDoRetido, fraseSemConta, contasParaFecharSemMovimento,
  type LinhaResumo,
} from './resumoDoDono';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/resumoMes.fixture.json'), 'utf8'));
const emerson = () => lerResumo([{ ...FIX.nj_sicredi_lavoura_2026_09.resumo, nivel: 'conta', conta_id: '910e04b0', tem_extrato: true, motivos: [] }])[0];

const base = (x: Record<string, unknown>): LinhaResumo => lerResumo([{ nivel: 'conta', conta_id: 'c1', conta_nome: 'C1', ...x }])[0];

describe('a leitura do dono, sem cast e sem inventar', () => {
  it('o Emerson: conciliado, 155.972,29, zero nos dois lados, retido 1.217,01 (15), a lista com o saldo corrido', () => {
    const l = emerson();
    expect(l.status).toBe('conciliado');
    expect(l.saldo_sistema).toBe(155972.29);
    expect([l.diferenca_entradas, l.diferenca_saidas]).toEqual([0, 0]);
    expect(l.retido_em_depositos).toEqual({ qtde: 15, valor: 1217.01 });
    const linhas = l.linhas_sistema ?? [];
    expect(linhas[linhas.length - 1].saldo_apos).toBe(155972.29);
    expect(linhas.filter((x) => x.status_exibicao === 'parcial').map((x) => [x.lancamento_id?.slice(0, 8), x.falta])).toEqual([['d320635d', 300]]);
  });

  it('numeric em texto vira número; ausente fica NULO (nunca zero); lixo é ignorado', () => {
    const [l] = lerResumo([{ nivel: 'conta', conta_id: 'x', saldo_sistema: '26205.97', saldo_extrato: null, diferenca: null }, 7, null]);
    expect(l.saldo_sistema).toBe(26205.97);
    expect(l.saldo_extrato).toBeNull();
    expect(l.diferenca).toBeNull();
    expect(l.saldo_inicial).toBeNull();
    expect(lerResumo(null)).toEqual([]);
    expect(lerStatusAno([{ ano_mes: '2026-09', nivel: 'total', status: 'parcial' }])[0].status).toBe('pendente'); // não há 'parcial'
  });
});

describe('T2/T3 — as frases do status saem dos motivos do dono', () => {
  it('cada motivo com a sua frase; "N dias com diferença" leva ao PRIMEIRO dia', () => {
    const l = base({
      tem_extrato: true, status: 'nao_conciliado',
      motivos: [
        { motivo: 'dias_com_diferenca', qtde: 2, dias: ['2026-03-03', '2026-03-17'] },
        { motivo: 'saldo_diverge', valor: 150000 },
        { motivo: 'extrato_nao_fecha', valor: 0.02 },
        { motivo: 'saldo_nao_informado', falta: 'final' },
        { motivo: 'sem_extrato' },
      ],
    });
    const f = frasesDoStatus(l);
    /* O real do `toLocaleString` separa "R$" do número com espaço inseparável — normalizado só para comparar. */
    expect(f.map((x) => x.texto.replace(/\s/g, ' '))).toEqual([
      '2 dias com diferença',
      'saldo diverge R$ 150.000,00',
      'o extrato não fecha com o saldo informado R$ 0,02',
      'saldo não informado',
      'sem extrato',
    ]);
    expect(f[0].dia).toBe('2026-03-03');
    /* negativo: o "−" tipográfico colado ao "R$" por word-joiner — a frase quebra, o valor não */
    const neg = frasesDoStatus(base({ tem_extrato: false, motivos: [{ motivo: 'extrato_nao_fecha', valor: -881.49 }] }))[0].texto;
    expect(neg.endsWith('\u2212\u2060R$\u00a0881,49')).toBe(true);
  });

  it('"confere em todos os dias" NUNCA convive com um motivo de dias (e só com extrato)', () => {
    const com = frasesDoStatus(base({ tem_extrato: true, motivos: [{ motivo: 'dias_com_diferenca', qtde: 1, dias: ['2026-09-02'] }] }));
    expect(com.map((x) => x.chave)).not.toContain('confere_dias');
    const sem = frasesDoStatus(base({ tem_extrato: true, motivos: [{ motivo: 'saldo_diverge', valor: 1 }] }));
    expect(sem[0].texto).toBe('confere em todos os dias');
    expect(frasesDoStatus(base({ tem_extrato: false, motivos: [] }))).toEqual([]);
    expect(frasesDoStatus(emerson()).map((x) => x.texto)).toEqual(['confere em todos os dias']);
  });

  it('no total: "N contas não conciliadas" com o nome de cada uma e o primeiro dia dela; "N pendentes"', () => {
    const [t] = lerResumo([{
      nivel: 'total', conta_nome: 'Total', status: 'nao_conciliado', motivos: [
        { motivo: 'contas_nao_conciliadas', qtde: 2, contas: [
          { conta_id: 'a', conta_nome: 'Itau BBA', status: 'nao_conciliado', motivos: [{ motivo: 'dias_com_diferenca', qtde: 1, dias: ['2026-03-03'] }, { motivo: 'saldo_diverge', valor: 150000 }] },
          { conta_id: 'b', conta_nome: 'Cartão BB', status: 'nao_conciliado', motivos: [{ motivo: 'saldo_diverge', valor: -6470.73 }] },
        ] },
        { motivo: 'contas_pendentes', qtde: 3 },
      ],
    }]);
    const f = frasesDoStatus(t);
    expect(f.map((x) => x.texto)).toEqual(['2 contas não conciliadas', '3 pendentes']);
    expect(f[0].contas?.map((c) => [c.conta_nome, c.dia ?? null])).toEqual([['Itau BBA', '2026-03-03'], ['Cartão BB', null]]);
    expect(f[0].titulo).toContain('Itau BBA: 1 dia com diferença');
  });

  it('retido e sem conta: frase só quando há; o dono manda os dois lados do sem conta em módulo', () => {
    expect(fraseDoRetido({ qtde: 0, valor: 0 })).toBeNull();
    expect(fraseDoRetido({ qtde: 15, valor: 1217.01 })?.texto).toMatch(/^retido no depósito R\$\s1\.217,01 \(15\)$/);
    expect(fraseSemConta(null)).toBeNull();
    expect(fraseSemConta({ qtde: 3, entradas: 100, saidas: 869.29 })?.texto).toMatch(/^lançamentos sem conta \+R\$\s100,00 \/ −R\$\s869,29 \(3\)$/);
  });
});

describe('T8 — "Fechar contas sem movimento" grava o saldo do DONO e não fecha conta com movimento', () => {
  it('grava saldo_final = saldo_sistema e saldo_inicial = o do dono; pula movimento, extrato, ausente e a que já tem saldo', () => {
    const linhas = lerResumo([
      { nivel: 'conta', conta_id: 'parada', saldo_inicial: 300000, saldo_inicial_origem: 'herdado', saldo_sistema: 300000, saldo_extrato: null, entradas: 0, saidas: 0 },
      { nivel: 'conta', conta_id: 'mexeu', saldo_inicial: 54738.55, saldo_inicial_origem: 'informado', saldo_sistema: 26205.97, saldo_extrato: null, entradas: 1132588.6, saidas: -1161121.18 },
      { nivel: 'conta', conta_id: 'extrato', saldo_inicial: 10, saldo_inicial_origem: 'herdado', saldo_sistema: 10, saldo_extrato: null, tem_extrato: true },
      { nivel: 'conta', conta_id: 'ausente', saldo_inicial: null, saldo_inicial_origem: 'ausente', saldo_sistema: 0, saldo_extrato: null },
      { nivel: 'conta', conta_id: 'informada', saldo_inicial: 5, saldo_inicial_origem: 'informado', saldo_sistema: 5, saldo_extrato: 5 },
      { nivel: 'total', conta_id: null, saldo_sistema: 1, saldo_extrato: null },
    ]);
    const r = contasParaFecharSemMovimento(linhas);
    expect(r.fechar).toEqual([{ conta_id: 'parada', saldo_inicial: 300000, saldo_final: 300000 }]);
    expect(r.comMovimento).toBe(2);
    expect(r.semReferencia).toBe(1);
  });
});
