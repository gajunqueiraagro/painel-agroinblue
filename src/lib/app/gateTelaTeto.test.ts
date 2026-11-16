/**
 * GATE-TELA-TETO-01 (OK do Gabriel 16/11) — o relógio do gate de tela: teto de 45 s por medição (estourou = achado "teto", reprova),
 * 8 min por rodada (PARCIAL, saída 4, retomada por --de), fatias por contagem (--fatia k/n), uma linha por medição, cacheDir do worktree.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  lerOpcoesDaRodada, planoDaRodada, comTeto, deveParar, codigoDaRodada, linhaDaMedicao, fraseDoParcial, textoDoTeto, paginasDaMedicao,
  TETO_MEDICAO_MS, TETO_RODADA_MS, ESPERA_PADRAO_MS, ESPERA_NAVEGACAO_MS, SAIDA_PARCIAL,
} from '../../../scripts/ui-cortes/teto.mjs';

const RAIZ = resolve(__dirname, '../../..');
const fonte = (f: string) => readFileSync(resolve(RAIZ, f), 'utf8');
const argv = (...a: string[]) => ['node', 'gate.mjs', ...a];

const CENAS = [
  { nome: 'a', tamanhos: [[1000, 600], [1126, 579]] },
  { nome: 'b', tamanhos: [[1000, 600]] },
  { nome: 'c', tamanhos: [[1000, 600], [1126, 579], [1440, 800]] },
];
const tamanhosDe = (c: { tamanhos: number[][] }) => c.tamanhos;
const chaves = (itens: { chave: string }[]) => itens.map((x) => x.chave);
const TODAS = ['a@1000x600', 'a@1126x579', 'b@1000x600', 'c@1000x600', 'c@1126x579', 'c@1440x800'];

afterEach(() => { vi.useRealTimers(); });

describe('GATE-TELA-TETO-01 — as opções da rodada', () => {
  it('os tetos aprovados: 45 s por medição e 8 min por rodada; esperas de 8 s e 15 s', () => {
    expect(TETO_MEDICAO_MS).toBe(45_000);
    expect(TETO_RODADA_MS).toBe(480_000);
    expect([ESPERA_PADRAO_MS, ESPERA_NAVEGACAO_MS]).toEqual([8_000, 15_000]);
    expect(lerOpcoesDaRodada(argv())).toEqual({ de: null, fatia: null, tetoRodadaMs: 480_000, tetoMedicaoMs: 45_000, log: null });
  });
  it('lê --fatia, --de, --teto-min (vírgula) e --log', () => {
    expect(lerOpcoesDaRodada(argv('--fatia', '2/5', '--de', 'c@1000x600', '--teto-min', '1,5', '--log', '/tmp/x.log')))
      .toEqual({ de: 'c@1000x600', fatia: { k: 2, n: 5 }, tetoRodadaMs: 90_000, tetoMedicaoMs: 45_000, log: '/tmp/x.log' });
  });
  it('valor inválido é erro, nunca "roda tudo"', () => {
    for (const f of ['0/3', '4/3', '2', 'a/b', '1/0']) expect(() => lerOpcoesDaRodada(argv('--fatia', f))).toThrow(/--fatia/);
    for (const m of ['0', '-1', 'x']) expect(() => lerOpcoesDaRodada(argv('--teto-min', m))).toThrow(/--teto-min/);
    expect(() => lerOpcoesDaRodada(argv('--de'))).toThrow(/--de/);
  });
});

describe('GATE-TELA-TETO-01 — o plano: fatias e retomada', () => {
  it('sem opção, todas as medições em ordem (cena × tamanho)', () => {
    expect(chaves(planoDaRodada(CENAS, tamanhosDe))).toEqual(TODAS);
  });
  it('as n fatias cobrem tudo, sem repetir nem pular, em partes iguais', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const partes = Array.from({ length: n }, (_, i) => chaves(planoDaRodada(CENAS, tamanhosDe, { fatia: { k: i + 1, n } })));
      expect(partes.flat()).toEqual(TODAS);
      const tams = partes.map((p) => p.length).filter((t) => t > 0);
      expect(Math.max(...tams) - Math.min(...tams)).toBeLessThanOrEqual(Math.ceil(TODAS.length / n));
    }
    expect(chaves(planoDaRodada(CENAS, tamanhosDe, { fatia: { k: 2, n: 3 } }))).toEqual(['b@1000x600', 'c@1000x600']);
  });
  it('--de retoma NA medição indicada (inclusive), sem repetir a anterior', () => {
    expect(chaves(planoDaRodada(CENAS, tamanhosDe, { de: 'b@1000x600' }))).toEqual(TODAS.slice(2));
  });
  it('--de que não está na rodada (ou fora da fatia) é erro', () => {
    expect(() => planoDaRodada(CENAS, tamanhosDe, { de: 'z@1x1' })).toThrow(/não está/);
    expect(() => planoDaRodada(CENAS, tamanhosDe, { de: 'a@1000x600', fatia: { k: 2, n: 2 } })).toThrow(/não está/);
  });
  it('o PARCIAL diz a próxima medição, e ela retoma o resto', () => {
    const plano = planoDaRodada(CENAS, tamanhosDe); const feitas = 3; const proxima = plano[feitas].chave;
    expect(fraseDoParcial('check-ui-cortes', feitas, plano.length, proxima)).toContain(`--de ${proxima}`);
    expect(chaves(planoDaRodada(CENAS, tamanhosDe, { de: proxima }))).toEqual(TODAS.slice(feitas));
  });
});

describe('GATE-TELA-TETO-01 — o relógio da medição', () => {
  it('corpo que nunca termina ESTOURA e fecha as páginas', async () => {
    const fechar = vi.fn(async () => {});
    const r = await comTeto(30, () => new Promise(() => {}), fechar);
    expect(r).toEqual({ ok: false, estourou: true });
    expect(fechar).toHaveBeenCalledTimes(1);
  });
  it('corpo rápido devolve o valor; erro do corpo vem como erro (não some)', async () => {
    expect(await comTeto(1000, async () => [1, 2], async () => {})).toEqual({ ok: true, valor: [1, 2] });
    const r = await comTeto(1000, async () => { throw new Error('quebrou'); }, async () => {});
    expect(r.ok).toBe(false); expect(String(r.erro)).toContain('quebrou');
  });
  it('o corpo que termina DEPOIS do teto não troca o veredito, e a rejeição tardia é engolida', async () => {
    let soltar: (v: unknown) => void = () => {};
    const r = await comTeto(20, () => new Promise((ok) => { soltar = ok; }), async () => {});
    soltar(['tarde']);
    expect(r).toEqual({ ok: false, estourou: true });
    const r2 = await comTeto(20, () => new Promise((_, nao) => setTimeout(() => nao(new Error('página fechada')), 60)), async () => {});
    expect(r2).toEqual({ ok: false, estourou: true });
    await new Promise((ok) => setTimeout(ok, 80));
  });
  it('fechar que também prende tem limite próprio de 10 s', async () => {
    vi.useFakeTimers();
    let r: unknown = null;
    void comTeto(100, () => new Promise(() => {}), () => new Promise(() => {})).then((x) => { r = x; });
    await vi.advanceTimersByTimeAsync(100); expect(r).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000); expect(r).toEqual({ ok: false, estourou: true });
  });
  it('o achado do teto diz o tempo e o passo', () => {
    expect(textoDoTeto(45_000, 'gesto')).toBe('passou de 45 s (parou em: gesto)');
  });
});

describe('GATE-TELA-TETO-01 — o teto da rodada e a saída', () => {
  it('para antes da medição que passaria de 8 min (gasto + 1,5 × média); a primeira sempre roda', () => {
    const t = TETO_RODADA_MS;
    expect(deveParar({ decorridoMs: 9 * 60_000, feitas: 0, gastoMs: 0, tetoRodadaMs: t })).toBe(false);
    expect(deveParar({ decorridoMs: 7 * 60_000, feitas: 10, gastoMs: 300_000, tetoRodadaMs: t })).toBe(false); // média 30 s: 7:45
    expect(deveParar({ decorridoMs: 7 * 60_000, feitas: 10, gastoMs: 600_000, tetoRodadaMs: t })).toBe(true); // média 60 s: 8:30
  });
  it('achado reprova (1) mesmo no parcial; parcial sem achado é 4, nunca verde; só o completo limpo é 0', () => {
    expect(codigoDaRodada({ achados: 2, parcial: 'x@1x1' })).toBe(1);
    expect(codigoDaRodada({ achados: 0, parcial: 'x@1x1' })).toBe(SAIDA_PARCIAL);
    expect(SAIDA_PARCIAL).toBe(4);
    expect(codigoDaRodada({ achados: 0, parcial: null })).toBe(0);
  });
  it('uma linha por medição: posição, chave, segundos, e TETO ou achados', () => {
    expect(linhaDaMedicao({ i: 3, total: 642, chave: 'nota-pdf-x@1126x579', ms: 3140, achados: 0, teto: false })).toBe('[3/642] nota-pdf-x@1126x579 3,1 s');
    expect(linhaDaMedicao({ i: 4, total: 642, chave: 'n@1x1', ms: 45_200, achados: 1, teto: true })).toBe('[4/642] n@1x1 45,2 s TETO');
    expect(linhaDaMedicao({ i: 5, total: 642, chave: 'n@1x1', ms: 900, achados: 2, teto: false })).toBe('[5/642] n@1x1 0,9 s 2 achado(s)');
  });
});

describe('GATE-TELA-TETO-01 — as páginas da medição', () => {
  const navegadorFalso = () => {
    const fechados: number[] = []; let n = 0;
    const timeouts: number[][] = [];
    return {
      fechados, timeouts,
      async newPage() {
        const id = ++n; const t: number[] = []; timeouts.push(t);
        return { setDefaultTimeout: (ms: number) => t.push(ms), setDefaultNavigationTimeout: (ms: number) => t.push(ms), context: () => ({ close: async () => { fechados.push(id); } }) };
      },
    };
  };
  it('toda página nasce com 8 s / 15 s e o estouro fecha o contexto de todas', async () => {
    const nav = navegadorFalso(); const pg = paginasDaMedicao(nav);
    await pg.nova({}); await pg.nova({});
    expect(nav.timeouts).toEqual([[8_000, 15_000], [8_000, 15_000]]);
    await pg.fecharTodas();
    expect(nav.fechados.sort()).toEqual([1, 2]);
  });
  it('página pedida depois do estouro fecha na hora e o corpo para', async () => {
    const nav = navegadorFalso(); const pg = paginasDaMedicao(nav);
    await pg.fecharTodas();
    await expect(pg.nova({})).rejects.toThrow(/teto/);
    expect(nav.fechados).toEqual([1]);
  });
});

describe('GATE-TELA-TETO-01 — os dois gates usam o relógio (e o teto reprova)', () => {
  for (const [arq, campo] of [['scripts/check-ui-cortes.mjs', 'regra'], ['scripts/check-ui-desloca.mjs', 'estado']]) {
    it(`${arq}: plano, teto por medição, páginas com espera, achado do teto, saída da rodada, uma linha por medição`, () => {
      const s = fonte(arq);
      expect(s).toContain('PLANO = planoDaRodada(ESCOLHIDOS, ');
      expect(s).toContain('for (const [n, { cen, w, h, chave }] of PLANO.entries()) {');
      expect(s).toContain('const r = await comTeto(OPCOES.tetoMedicaoMs, async () => {');
      expect(s).toContain('}, () => paginas.fecharTodas());');
      expect(s).toContain(`${campo}: r.estourou ? 'teto' : 'erro'`);
      expect(s).toContain('todos.push(...meus);');
      expect(s).toContain('codigo = codigoDaRodada({ achados: unicos.length, parcial });');
      expect(s).toContain('registrar(linhaDaMedicao(');
      expect(s).not.toMatch(/navegador\.newPage\(\{ viewport: \{ width: w, height: h \} \}\)/);
      // nada da medição entra em `todos` por fora do relógio
      const laco = s.slice(s.indexOf('for (const [n, { cen, w, h, chave }]'), s.indexOf('const unicos = '));
      expect(laco.match(/todos\.push\(/g)).toEqual(['todos.push(']);
    });
  }
  it('o desloca não deixa o gesto inicial derrubar a corrida', () => {
    expect(fonte('scripts/check-ui-desloca.mjs')).toContain("rastro.passo = 'gesto'; try { if (cen.antes) await cen.antes(p); } catch (e) {");
  });
  it('o cortes prova o teto num laço infinito antes de medir', () => {
    expect(fonte('scripts/check-ui-cortes.mjs')).toContain('AUTO-TESTE DO TETO FALHOU');
  });
  it('a bancada tem cache do Vite do worktree (ignorado no git)', () => {
    expect(fonte('scripts/ui-cortes/vite.config.mts')).toContain("cacheDir: path.join(RAIZ, '.vite-bancada'),");
    expect(fonte('.gitignore')).toMatch(/^\.vite-bancada\/$/m);
  });
});
