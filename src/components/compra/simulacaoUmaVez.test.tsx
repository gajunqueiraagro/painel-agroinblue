/**
 * OC-CC-EXPLICAR-CONGELA-01 item 4 — "Atualizar compromisso" e "Excluir lote" simulam UMA vez por abertura. O efeito dependia
 * do objeto `api`, recriado a cada render: cada render do pai (e os dois que o próprio `simular` provoca) refazia a simulação
 * no banco — `oc_reprogramar_compromisso_do_lote` somava 29.124 chamadas em 12/10/2026. Os HOOKS são os de verdade.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({ chamadas: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: async (nome: string, args: { p_lote_id?: string; p_simular?: boolean }) => {
  banco.chamadas.push(`${nome}:${args.p_lote_id}:${args.p_simular ? 'sim' : 'real'}`);
  await new Promise(r => setTimeout(r, 20));
  return { data: { ok: true, rol: [], bloqueios: [], valor_antigo: 1, valor_novo: 2 }, error: null };
} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { useReprogramarCompromissoLote } from '@/hooks/useReprogramarCompromissoLote';
import { useExcluirLoteOC } from '@/hooks/useExcluirLoteOC';
import { DialogoAtualizarCompromisso } from './DialogoAtualizarCompromisso';
import { DialogoExcluirLoteOC } from './DialogoExcluirLoteOC';

function PaiAtualizar() {
  const [n, setN] = useState(0);
  const [lote, setLote] = useState('l1');
  const api = useReprogramarCompromissoLote('op', 'cli');
  return <>
    <button type="button" onClick={() => setN(x => x + 1)}>render {n}</button>
    <button type="button" onClick={() => setLote('l2')}>outro lote</button>
    <DialogoAtualizarCompromisso api={api} loteId={lote} rotulo="lote" versao={1} onFechar={() => {}} onAtualizado={() => {}} />
  </>;
}
function PaiExcluir() {
  const [n, setN] = useState(0);
  const [lote, setLote] = useState('l1');
  const api = useExcluirLoteOC('op', 'cli');
  return <>
    <button type="button" onClick={() => setN(x => x + 1)}>render {n}</button>
    <button type="button" onClick={() => setLote('l2')}>outro lote</button>
    <DialogoExcluirLoteOC api={api} loteId={lote} rotulo="lote" versao={1} onFechar={() => {}} onExcluido={() => {}} />
  </>;
}
const espera = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
/** os botões do pai ficam fora do diálogo (escondidos da árvore de acessibilidade): pelo texto */
const clicar = (texto: RegExp) => fireEvent.click(screen.getByText(texto));

beforeEach(() => { banco.chamadas = []; });

describe.each([
  ['Atualizar compromisso', PaiAtualizar, 'oc_reprogramar_compromisso_do_lote'],
  ['Excluir lote', PaiExcluir, 'oc_excluir_lote'],
] as const)('%s', (_nome, Pai, rpc) => {
  it('abrir o diálogo: EXATAMENTE 1 simulação (os renders que o próprio simular provoca não a repetem)', async () => {
    render(<Pai />);
    await espera(1000);
    expect(banco.chamadas).toEqual([`${rpc}:l1:sim`]);
  });
  it('re-render do pai (3 vezes): 0 simulações novas', async () => {
    render(<Pai />);
    await espera(300);
    for (let i = 0; i < 3; i++) { clicar(/^render/); await espera(100); }
    expect(banco.chamadas).toEqual([`${rpc}:l1:sim`]);
  });
  it('trocar o lote refaz, uma vez (a busca sabe achar)', async () => {
    render(<Pai />);
    await espera(300);
    clicar(/^outro lote$/);
    await espera(300);
    expect(banco.chamadas).toEqual([`${rpc}:l1:sim`, `${rpc}:l2:sim`]);
  });
});

describe('a ligação (fonte)', () => {
  const fonte = (arq: string) => readFileSync(resolve(__dirname, arq), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  it.each(['./DialogoAtualizarCompromisso.tsx', './DialogoExcluirLoteOC.tsx'])('%s: o efeito depende da função e do lote, nunca do objeto api', (arq) => {
    const f = fonte(arq);
    expect(f).toContain('}, [simular, loteId]);');
    expect(f).not.toMatch(/\}, \[[^\]]*\bapi\b[^\].]*\]\)/);
  });
  it.each(['../../hooks/useReprogramarCompromissoLote.ts', '../../hooks/useExcluirLoteOC.ts'])('%s: simular é useCallback só com a operação e o cliente', (arq) => {
    expect(fonte(arq)).toMatch(/const simular = useCallback\(async [\s\S]*?\}, \[operacaoId, clienteId\]\);/);
  });
});
