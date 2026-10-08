/**
 * FORN-SELETOR-PADRAO-01 passo 1a — o hook do leitor único: o que a TELA vê.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useFornecedoresDoCliente } from '@/hooks/useFornecedoresDoCliente';
import {
  criarLeitorDeFornecedores, type FonteDeFornecedores, type FornecedorLido,
} from '@/lib/fornecedores/leitorDeFornecedores';

const forn = (id: string, extra: Partial<FornecedorLido> = {}): FornecedorLido => ({
  id, nome: `Fornecedor ${id}`, cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null, pix_tipo_chave: null,
  pix_chave: null, banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null,
  observacao_pagamento: null, ...extra,
});

function montar(dados: Record<string, FornecedorLido[]>) {
  const portas: Record<string, Array<() => void>> = {};
  let segurar: string | null = null;
  let falhar: string | null = null;
  const fonte: FonteDeFornecedores = {
    lerPagina: async (c, de, ate, contar) => {
      if (segurar === c) await new Promise<void>((r) => { (portas[c] ??= []).push(r); });
      if (falhar) throw new Error(falhar);
      const ativos = (dados[c] ?? []).filter((f) => f.ativo);
      return { linhas: ativos.slice(de, ate + 1), total: contar ? ativos.length : null };
    },
    lerPorId: async (c, id) => (dados[c] ?? []).find((f) => f.id === id) ?? null,
  };
  return {
    leitor: criarLeitorDeFornecedores(fonte), dados,
    segurar: (c: string | null) => { segurar = c; },
    soltar: (c: string) => { (portas[c] ?? []).splice(0).forEach((r) => r()); },
    falharCom: (m: string | null) => { falhar = m; },
  };
}

describe('useFornecedoresDoCliente', () => {
  it('lê os ativos do cliente; sem cliente não lê nada', async () => {
    const m = montar({ X: [forn('x1'), forn('x2'), forn('xi', { ativo: false })] });
    const { result, rerender } = renderHook(({ c }: { c: string | null }) => useFornecedoresDoCliente(c, null, m.leitor), { initialProps: { c: null as string | null } });
    expect(result.current.fornecedores).toEqual([]);
    expect(result.current.carregando).toBe(false);
    rerender({ c: 'X' });
    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.fornecedores.map((f) => f.id)).toEqual(['x1', 'x2']));
    expect(result.current.carregando).toBe(false);
  });

  it('TROCAR DE CLIENTE: no mesmo render a lista do anterior some, e a resposta atrasada do anterior não aparece', async () => {
    const m = montar({ X: [forn('x1')], Y: [forn('y1')] });
    const { result, rerender } = renderHook(({ c }: { c: string }) => useFornecedoresDoCliente(c, null, m.leitor), { initialProps: { c: 'X' } });
    await waitFor(() => expect(result.current.fornecedores.map((f) => f.id)).toEqual(['x1']));
    m.segurar('Y');
    rerender({ c: 'Y' });
    /* o render da troca: nada de X na tela, e Y ainda lendo */
    expect(result.current.fornecedores).toEqual([]);
    expect(result.current.carregando).toBe(true);
    m.soltar('Y');
    await waitFor(() => expect(result.current.fornecedores.map((f) => f.id)).toEqual(['y1']));
    /* volta a X: vem do cache de X, na hora, sem nada de Y */
    rerender({ c: 'X' });
    expect(result.current.fornecedores.map((f) => f.id)).toEqual(['x1']);
  });

  it('resposta de X que chega DEPOIS de trocar para Y não é mostrada em Y', async () => {
    const m = montar({ X: [forn('x1')], Y: [forn('y1')] });
    m.segurar('X');
    const { result, rerender } = renderHook(({ c }: { c: string }) => useFornecedoresDoCliente(c, null, m.leitor), { initialProps: { c: 'X' } });
    rerender({ c: 'Y' });
    await waitFor(() => expect(result.current.fornecedores.map((f) => f.id)).toEqual(['y1']));
    await act(async () => { m.soltar('X'); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.fornecedores.map((f) => f.id)).toEqual(['y1']);
  });

  it('o gravado INATIVO vem por id, marcado; o gravado ativo não gera `gravado`', async () => {
    const m = montar({ X: [forn('x1'), forn('xi', { ativo: false, nome: 'Inativo sintético' })] });
    const { result, rerender } = renderHook(({ g }: { g: string | null }) => useFornecedoresDoCliente('X', g, m.leitor), { initialProps: { g: 'xi' as string | null } });
    await waitFor(() => expect(result.current.gravado?.nome).toBe('Inativo sintético'));
    expect(result.current.gravado?.ativo).toBe(false);
    expect(result.current.fornecedores.some((f) => f.id === 'xi')).toBe(false);
    rerender({ g: 'x1' });
    expect(result.current.gravado).toBeNull();
    rerender({ g: null });
    expect(result.current.gravado).toBeNull();
  });

  it('o cadastro mudou: o hook relê sozinho, e a lista antiga fica na tela até a nova chegar (sem piscar vazio)', async () => {
    const m = montar({ X: [forn('x1')] });
    const { result } = renderHook(() => useFornecedoresDoCliente('X', null, m.leitor));
    await waitFor(() => expect(result.current.fornecedores).toHaveLength(1));
    m.dados.X.push(forn('x2'));
    m.segurar('X');
    act(() => { m.leitor.notificarMudou('X'); });
    expect(result.current.fornecedores.map((f) => f.id)).toEqual(['x1']);
    expect(result.current.carregando).toBe(false);
    m.soltar('X');
    await waitFor(() => expect(result.current.fornecedores.map((f) => f.id)).toEqual(['x1', 'x2']));
  });

  it('falha: a frase aparece, e "Tentar de novo" relê e limpa o erro', async () => {
    const m = montar({ X: [forn('x1')] });
    m.falharCom('rede fora');
    const { result } = renderHook(() => useFornecedoresDoCliente('X', null, m.leitor));
    await waitFor(() => expect(result.current.erro).toBe('Não foi possível carregar os fornecedores. (rede fora)'));
    expect(result.current.fornecedores).toEqual([]);
    expect(result.current.carregando).toBe(false);
    m.falharCom(null);
    act(() => { result.current.tentarDeNovo(); });
    await waitFor(() => expect(result.current.fornecedores).toHaveLength(1));
    expect(result.current.erro).toBeNull();
  });

  it('fonte: quem grava no cadastro avisa o leitor — e a busca prova que acha um escritor mudo', () => {
    /* arquivo -> quantos pontos de sucesso gravam nome, documento, ativo ou apagam (medido no passo 1a) */
    const ESCRITORES: Record<string, number> = {
      'src/components/financeiro-v2/FornecedorFormDialog.tsx': 5,
      'src/components/financiamentos/CredorAutocomplete.tsx': 2,
      'src/components/compra/AbaDocumentosOC.tsx': 2,
      'src/components/compra/AbaCompromissosOC.tsx': 1,
      'src/lib/financeiro/nfeConsultas.ts': 1,
      'src/pages/FinV2FornecedoresTab.tsx': 1,
      'src/hooks/useFinanceiroV2.ts': 1,
      'src/pages/LancamentosTab.tsx': 4,
    };
    const avisos = (fonte: string) => (fonte.match(/^\s*notificarFornecedoresMudaram\(/gm) ?? []).length;
    expect(avisos("const x = 1;\n  await gravar();\n")).toBe(0);                       /* o detector vê o mudo */
    expect(avisos("  notificarFornecedoresMudaram(clienteId);\n")).toBe(1);
    for (const [arquivo, esperado] of Object.entries(ESCRITORES)) {
      const fonte = readFileSync(resolve(process.cwd(), arquivo), 'utf8');
      expect(fonte, arquivo).toContain("from '@/hooks/useFornecedoresDoCliente'");
      expect(avisos(fonte), arquivo).toBe(esperado);
    }
  });

  it('fonte: a consulta do banco pede só ativos, o cliente, ordem estável e o documento — e o gravado por id leva o cliente', () => {
    const fonte = readFileSync(resolve(process.cwd(), 'src/hooks/useFornecedoresDoCliente.ts'), 'utf8');
    const pagina = fonte.slice(fonte.indexOf('lerPagina:'), fonte.indexOf('lerPorId:'));
    const porId = fonte.slice(fonte.indexOf('lerPorId:'), fonte.indexOf('export const leitorDeFornecedores'));
    expect(pagina).toContain(".eq('cliente_id', clienteId)");
    expect(pagina).toContain(".eq('ativo', true)");
    expect(pagina).toContain(".order('nome').order('id')");
    expect(pagina).toContain('.range(de, ate)');
    expect(fonte).toMatch(/const COLUNAS = '[^']*\bcpf_cnpj\b/);
    expect(porId).toContain(".eq('cliente_id', clienteId)");
    expect(porId).not.toContain("'ativo'");   /* o gravado vem ativo ou não */
    expect(fonte).not.toMatch(/\bas (any|unknown|FornecedorLido)/);
  });
});
