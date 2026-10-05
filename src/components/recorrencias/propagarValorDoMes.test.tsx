/**
 * REC-PROPAGAR-VALOR-DO-MES-01 — o Propagar DIZ quantas contas com o valor do mês ajustado ele pula.
 *
 * ⚠ O NÚMERO É DO BANCO (`valor_do_mes[escopo]` da RPC, pelo mesmo predicado do update): a tela só escolhe qual ler.
 * ⚠ OS JSON SÃO OS QUE A RPC NOVA DEVOLVEU no ensaio revertido de 05/10/2026 no NJ (Consórcio Sophia -001: 15 futuros, 1
 *   passado, 1 pulada; Folha de Pagamento do Leandro Deves: 10 futuros, 1 pulada).
 * ⚠ SEM CONTA AJUSTADA, O DIÁLOGO É O DO COMMIT PUBLICADO — foto (md5 + tamanho do HTML) gravada antes da mudança.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const RPC = vi.hoisted(() => ({ resposta: null as unknown, chamadas: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      RPC.chamadas.push(args);
      return Promise.resolve({ data: RPC.resposta, error: null });
    },
  },
}));
const TOAST = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: TOAST }));

import { propagarRecorrencia, frasePuladasValorDoMes } from '@/hooks/useRecorrencias';
import { PropagarRecorrenciaDialog } from './PropagarRecorrenciaDialog';

const competencia = {
  desloc: 0, marca_antes: '2027-12-01', meses_fechados: [],
  futuros: { alteradas: 0, puladas_mes_fechado: 0, lista: [] },
  passados: { alteradas: 0, puladas_mes_fechado: 0, lista: [] },
  projecao: {
    futuros: { alteradas: 0, marca_depois: '2027-12-01', a_gerar: [], duplicidades: [], vagas: [] },
    todos: { alteradas: 0, marca_depois: '2027-12-01', a_gerar: [], duplicidades: [], vagas: [] },
  },
};
const base = (futuros: number, passados: number) => ({ futuros, passados, simulado: true, aplicados_futuros: 0, aplicados_passados: 0, competencia });
/** RPC ANTERIOR ao PR: sem as chaves novas. */
const ANTIGA = base(15, 1);
/** RPC nova, recorrência sem nenhuma ajustada. */
const SEM_AJUSTADA = { ...base(15, 1), puladas_valor_do_mes: 0, valor_do_mes: { futuros: 0, todos: 0 } };
const SOPHIA = { ...base(15, 1), puladas_valor_do_mes: 1, valor_do_mes: { futuros: 1, todos: 1 } };
/** Montado: 3 futuras ajustadas e mais 2 que já foram pagas (passadas) — os dois escopos leem números diferentes. */
const TRES = { ...base(60, 60), puladas_valor_do_mes: 3, valor_do_mes: { futuros: 3, todos: 5 } };

beforeEach(() => { cleanup(); RPC.chamadas = []; TOAST.success.mockReset(); TOAST.error.mockReset(); });

async function abrir(resposta: unknown, aoFechar: () => void = () => {}) {
  RPC.resposta = resposta;
  const r = await propagarRecorrencia('rec-1', 'futuros', true);
  render(<PropagarRecorrenciaDialog recorrenciaId="rec-1" descricao="Consorcio Sophia -001" previa={r.dados} recusa={null} aoFechar={aoFechar} />);
  return r;
}
const linha = () => screen.queryByTestId('propagar-valor-do-mes');

describe('a leitura da RPC', () => {
  it('lê as puladas por escopo; RPC anterior (sem as chaves) vira zero', async () => {
    const r = await abrir(TRES);
    expect(r.dados?.valorDoMes).toEqual({ futuros: 3, todos: 5 });
    expect(r.dados?.puladasValorDoMes).toBe(3);
    RPC.resposta = ANTIGA;
    const antiga = await propagarRecorrencia('x', 'futuros', true);
    expect(antiga.dados?.valorDoMes).toEqual({ futuros: 0, todos: 0 });
    expect(antiga.dados?.puladasValorDoMes).toBe(0);
  });
  it('a frase: singular, plural e nada com zero', () => {
    expect(frasePuladasValorDoMes(1)).toBe('1 conta com o valor do mês ajustado fica como está.');
    expect(frasePuladasValorDoMes(3)).toBe('3 contas com o valor do mês ajustado ficam como estão.');
    expect(frasePuladasValorDoMes(31)).toBe('31 contas com o valor do mês ajustado ficam como estão.');
    expect(frasePuladasValorDoMes(0)).toBeNull();
  });
});

describe('o diálogo diz quantas pula', () => {
  it('3 ajustadas: UMA linha, na mesma linha da contagem, com a frase inteira no title', async () => {
    await abrir(TRES);
    const l = linha();
    expect(l).not.toBeNull();
    expect(l?.textContent).toBe('3contas com o valor do mês ajustado ficam como estão.');
    expect(l?.getAttribute('title')).toBe('3 contas com o valor do mês ajustado ficam como estão.');
    /* mesma linha: a contagem e a frase são filhas da MESMA caixa flex, e nada foi acrescentado abaixo */
    const caixa = l?.parentElement as HTMLElement;
    expect(caixa.className).toContain('flex');
    expect(caixa.children.length).toBe(2);
    expect(caixa.children[0].textContent).toBe('60 futuros · 60 passados');
    expect(caixa.children[0].className).toContain('shrink-0');             // a contagem nunca cede
    expect(l?.children[0].className).toContain('shrink-0');                // o N da frase nunca cede
    expect(l?.children[1].className).toContain('truncate');                // quem cede é o texto
    /* o bloco do resumo continua com os mesmos dois filhos: a linha da contagem e a explicação */
    expect((caixa.parentElement as HTMLElement).children.length).toBe(2);
  });
  it('o número é o do escopo ESCOLHIDO: "Futuros e passados" lê o outro; "Não propagar" não mostra nada', async () => {
    await abrir(TRES);
    expect(linha()?.getAttribute('title')).toBe('3 contas com o valor do mês ajustado ficam como estão.');
    fireEvent.click(screen.getByLabelText(/Futuros e passados/));
    expect(linha()?.getAttribute('title')).toBe('5 contas com o valor do mês ajustado ficam como estão.');
    fireEvent.click(screen.getByLabelText(/Não propagar/));
    expect(linha()).toBeNull();
  });
  it('uma só (o caso do NJ): singular', async () => {
    await abrir(SOPHIA);
    expect(linha()?.getAttribute('title')).toBe('1 conta com o valor do mês ajustado fica como está.');
  });
  it('zero (RPC nova ou anterior): a linha não existe', async () => {
    await abrir(SEM_AJUSTADA);
    expect(linha()).toBeNull();
    expect(screen.queryByText(/valor do mês ajustado/)).toBeNull();
    cleanup();
    await abrir(ANTIGA);
    expect(linha()).toBeNull();
  });
  it('ao propagar, o aviso de sucesso diz quantas ficaram de fora — o número da EXECUÇÃO', async () => {
    const aoFechar = vi.fn();
    await abrir(TRES, aoFechar);
    RPC.resposta = { futuros: 60, passados: 60, simulado: false, aplicados_futuros: 57, aplicados_passados: 0, competencia: { ...competencia, aplicadas: 0 },
      puladas_valor_do_mes: 3, valor_do_mes: { futuros: 3, todos: 5 } };
    fireEvent.click(screen.getByRole('button', { name: /Propagar/ }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(RPC.chamadas.at(-1)).toEqual({ p_recorrencia_id: 'rec-1', p_escopo: 'futuros', p_simular: false });
    expect(TOAST.success).toHaveBeenCalledWith('57 lançamentos atualizados. 3 contas com o valor do mês ajustado ficam como estão.');
  });
  it('sem ajustada, o aviso de sucesso é o de sempre', async () => {
    const aoFechar = vi.fn();
    await abrir(SEM_AJUSTADA, aoFechar);
    RPC.resposta = { ...SEM_AJUSTADA, simulado: false, aplicados_futuros: 15 };
    fireEvent.click(screen.getByRole('button', { name: /Propagar/ }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(TOAST.success).toHaveBeenCalledWith('15 lançamentos atualizados.');
  });
});

/* ── SEM CONTA AJUSTADA, O HTML É O DO COMMIT PUBLICADO ──────────────────────────────────────────────────────────────────
   `PROPAGAR_FOTO=gravar` escreve (rodado com o diálogo e o hook do commit publicado); sem a variável, compara. */
const ARQ = resolve(__dirname, 'propagarValorDoMes.fotos.json');
const limpar = (html: string) => html.replace(/radix-:r[0-9a-z]+:/g, 'radix-ID').replace(/:r[0-9a-z]+:/g, ':ID:');
function foto(nome: string) {
  const html = limpar(document.body.innerHTML);
  const f = { md5: createHash('md5').update(Buffer.from(html, 'utf8')).digest('hex'), bytes: Buffer.byteLength(html, 'utf8') };
  const todas: Record<string, { md5: string; bytes: number }> = existsSync(ARQ) ? JSON.parse(readFileSync(ARQ, 'utf8')) : {};
  if (process.env.PROPAGAR_FOTO === 'gravar') { todas[nome] = f; writeFileSync(ARQ, JSON.stringify(todas, null, 1)); return; }
  expect(f.bytes).toBeGreaterThan(1500);
  expect(f).toEqual(todas[nome]);
}
describe('com zero puladas, o diálogo é o do commit publicado', () => {
  for (const [nome, resposta] of [['rpc-antiga', ANTIGA], ['rpc-nova-sem-ajustada', SEM_AJUSTADA]] as const) {
    it(`${nome}: futuros, futuros e passados, não propagar`, async () => {
      await abrir(resposta);
      foto(`${nome}-futuros`);
      fireEvent.click(screen.getByLabelText(/Futuros e passados/)); foto(`${nome}-todos`);
      fireEvent.click(screen.getByLabelText(/Não propagar/)); foto(`${nome}-nenhum`);
    });
  }
  it('e a RPC nova sem ajustada desenha o MESMO que a anterior', () => {
    const todas: Record<string, { md5: string }> = JSON.parse(readFileSync(ARQ, 'utf8'));
    for (const e of ['futuros', 'todos', 'nenhum']) expect(todas[`rpc-nova-sem-ajustada-${e}`].md5).toBe(todas[`rpc-antiga-${e}`].md5);
  });
});
