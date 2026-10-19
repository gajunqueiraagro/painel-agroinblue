/**
 * FORN-MESCLAR-01 / 02b — o leitor da mesclagem (peça torta = nulo), o dono da comparação (o padrão do "fica", a linha que discorda,
 * o resultado ao vivo, o bloqueio do "Pec.3M-") e o diálogo montado com o banco simulado: a sugestão abre as colunas, quem fica é o
 * padrão (com documento > mais uso > ativo), a escolha de um valor vai em `p_valores`, gravar pede confirmação, a recusa fica ESCRITA,
 * desfazer pede motivo, e depois de mesclar o diálogo volta ao início. Nenhuma conta na tela (lido da fonte).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bloqueioDoRateio, ficaPadrao, lerGruposRepetidos, lerMesclagens, lerPreviaDaMesclagem, linhasDaComparacao, resultadoAoVivo, valoresParaGravar,
  type CadastroComparado, type UsoDoCadastro,
} from '@/lib/fornecedores/mesclarFornecedores';
import { ehRateio } from '@/lib/fornecedores/fornecedorTexto';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));

const LINHAS: Record<string, Record<string, unknown>> = {
  m: { id: 'm', nome: 'Luiz Mesclar da Silva', cpf_cnpj: null, ativo: true, email: null },
  b: { id: 'b', nome: 'LUIZ MESCLAR LTDA', cpf_cnpj: '54.442.418/0001-88', ativo: true, email: 'b@sint.br', inscricao_estadual: '284964700' },
  c: { id: 'c', nome: 'Casa Mesclar', cpf_cnpj: '54442418000188', ativo: true, email: 'c@sint.br' },
  p: { id: 'p', nome: 'Pec.3M-Casa Mesclar', cpf_cnpj: null, ativo: true },
};
const USO: Record<string, number> = { m: 3, b: 6, c: 10, p: 1 };

const banco = vi.hoisted(() => ({ chamadas: [] as Array<[string, Record<string, unknown>]>, recusar: false, gravou: false }));
vi.mock('@/integrations/supabase/client', () => {
  const previa = (simulado: boolean) => ({ simulado, recusa: null, mesclagem_id: simulado ? null : 'log-1', total: 21,
    mantido: { id: 'c', nome: 'Casa Mesclar', cpf_cnpj: '54442418000188', ativo: true },
    absorvidos: [{ id: 'm', nome: 'Luiz Mesclar da Silva', cpf_cnpj: null, ativo: true }, { id: 'b', nome: 'LUIZ MESCLAR LTDA', cpf_cnpj: '54.442.418/0001-88', ativo: true }],
    por_modulo: { Financeiro: 9 }, apelidos: ['Luiz Mesclar da Silva'],
    por_tabela: { 'financeiro_lancamentos_v2.favorecido_id': 9, 'financeiro_recorrencias.favorecido_id': 1, 'financeiro_lancamento_documentos.emitente_id': 2 } });
  const cadeia = (resolver: (estado: { ids: string[] | null; inativos: boolean }) => unknown) => {
    const estado = { ids: null as string[] | null, inativos: false };
    const p: Record<string, unknown> = {};
    for (const k of ['select', 'order', 'limit', 'is', 'range']) p[k] = () => p;
    p.eq = (col: string, val: unknown) => { if (col === 'ativo' && val === false) estado.inativos = true; return p; };
    p.in = (_c: string, ids: string[]) => { estado.ids = ids; return p; };
    p.then = (ok: (v: unknown) => unknown) => { const dados = resolver(estado); return Promise.resolve({ data: dados, error: null, count: Array.isArray(dados) ? dados.length : null }).then(ok); };
    return p;
  };
  return { supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      banco.chamadas.push([fn, args]);
      if (fn === 'fn_fornecedor_repetidos') return Promise.resolve({ data: [{ motivo: 'documento', chave: 'g1', qtd: 3, fornecedores: [
        { id: 'b', nome: 'LUIZ MESCLAR LTDA', cpf_cnpj: '54.442.418/0001-88', ativo: true }, { id: 'c', nome: 'Casa Mesclar', cpf_cnpj: '54442418000188', ativo: true },
        { id: 'm', nome: 'Luiz Mesclar da Silva', cpf_cnpj: null, ativo: true }] }], error: null });
      if (fn === 'fn_fornecedor_uso') return Promise.resolve({ data: { lancamentos: USO[String(args.p_fornecedor)] ?? 0, recorrencias: 0, documentos: 0 }, error: null });
      if (fn === 'fn_fornecedor_mesclar') {
        if (banco.recusar) return Promise.resolve({ data: { simulado: true, recusa: { motivo: 'cnpj_diferente', frase: 'CPF/CNPJ diferentes: X e Y. Fornecedores com documentos diferentes não se mesclam.' } }, error: null });
        if (args.p_simular === false) banco.gravou = true;
        return Promise.resolve({ data: previa(args.p_simular === true), error: null });
      }
      if (fn === 'fn_fornecedor_mesclagem_desfazer') return Promise.resolve({ data: { voltaram: 21, ficaram: 0 }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: (tabela: string) => cadeia((e) => {
      if (tabela === 'financeiro_fornecedores') {
        if (e.inativos) return [{ id: 'i1', nome: 'Lineagro Produtos Agropecuarios AS', cpf_cnpj: null, ativo: false }];
        return (e.ids ?? []).map((id) => LINHAS[id]).filter(Boolean);
      }
      if (tabela === 'financeiro_plano_contas') return [];
      return [
        ...(banco.gravou ? [{ id: 'log-1', mantido_id: 'c', absorvidos: ['m', 'b'], criado_em: '2026-10-19T12:00:00Z', resumo: { total: 21 },
          antes: { absorvidos: [{ nome: 'Luiz Mesclar da Silva' }, { nome: 'LUIZ MESCLAR LTDA' }] }, desfeito_em: null, desfeito_motivo: null }] : []),
        { id: 'log-9', mantido_id: 'c', absorvidos: ['m'], criado_em: '2026-10-17T12:00:00Z', resumo: { total: 3 },
          antes: { absorvidos: [{ nome: 'Luiz Mesclar da Silva' }] }, desfeito_em: null, desfeito_motivo: null }];
    }),
  } };
});
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { MesclarFornecedoresDialog } from './MesclarFornecedoresDialog';

beforeEach(() => {
  banco.chamadas.length = 0; banco.recusar = false; banco.gravou = false;
  definirFornecedoresDoLeitor([{ id: 'c', nome: 'Casa Mesclar', ativo: true }, { id: 'p', nome: 'Pec.3M-Casa Mesclar', ativo: true }]);
});

const cad = (id: string, x: Partial<CadastroComparado> = {}): CadastroComparado => {
  const l = LINHAS[id]; const linha: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(l)) linha[k] = v === null ? null : String(v);
  return { id, nome: String(l.nome), ativo: l.ativo !== false, linha, planoNome: null, planoNoPlano: null, ...x };
};
const uso = (o: Record<string, number>) => new Map(Object.entries(o).map(([id, n]) => [id, { lancamentos: n } as UsoDoCadastro]));

describe('o leitor', () => {
  it('peça torta = nulo; a recusa vem como recusa; módulos na ordem da casa; por_tabela lido', () => {
    expect(lerPreviaDaMesclagem({ simulado: true, recusa: { motivo: 'x' } })).toBeNull();
    expect(lerPreviaDaMesclagem({ simulado: true, recusa: { motivo: 'cnpj_diferente', frase: 'F' } })?.recusa?.frase).toBe('F');
    const p = lerPreviaDaMesclagem({ simulado: true, recusa: null, total: 2, mantido: { id: 'm', nome: 'M' }, absorvidos: [{ id: 'a', nome: 'A' }],
      por_modulo: { Rebanho: 1, Financeiro: 1 }, apelidos: ['A'], por_tabela: { 'financeiro_lancamentos_v2.favorecido_id': 1 } });
    expect(p?.porModulo.map((x) => x.modulo)).toEqual(['Financeiro', 'Rebanho']);
    expect(p?.porTabela['financeiro_lancamentos_v2.favorecido_id']).toBe(1);
    expect(lerGruposRepetidos([{ motivo: 'outro', chave: 'x', fornecedores: [] }])).toBeNull();
    expect(lerMesclagens([{ id: 'l', mantido_id: 'm', absorvidos: ['a'], criado_em: 't', resumo: { total: 3 } }])?.[0].total).toBe(3);
  });
});

describe('FORN-MESCLAR-02b — o dono da comparação', () => {
  it('quem fica por padrão: o COM documento; empate, o de mais uso; empate, o ativo', () => {
    expect(ficaPadrao([cad('m'), cad('b'), cad('c')], uso({ m: 99, b: 6, c: 10 }))).toBe('c');
    expect(ficaPadrao([cad('m'), cad('b'), cad('c')], uso({ m: 99, b: 11, c: 10 }))).toBe('b');
    expect(ficaPadrao([cad('b', { ativo: false }), cad('c')], uso({ b: 5, c: 5 }))).toBe('c');
    expect(ficaPadrao([cad('m'), cad('p')], uso({ m: 1, p: 1 }))).toBe('m');
  });
  it('linha que discorda: amarela, com rádio em cada célula preenchida; a igual (documento pelos dígitos) não; o vazio vem do primeiro preenchido', () => {
    const l = linhasDaComparacao([cad('m'), cad('b'), cad('c')], 'c', {});
    const razao = l.find((x) => x.chave === 'razao_social')!;
    expect(razao.divergente).toBe(true);
    expect(razao.escolhido).toBe('c');
    expect(l.find((x) => x.chave === 'cpf_cnpj')!.divergente).toBe(false);
    const ie = l.find((x) => x.chave === 'inscricao_estadual')!;
    expect(ie.divergente).toBe(false);
    expect(ie.escolhido).toBe('b');
    expect(l.find((x) => x.chave === 'situacao')!.campo).toBeNull();
    expect(l.some((x) => x.chave === 'telefone')).toBe(false);
  });
  it('subcentro fora do plano: aparece, mas nunca é escolhível nem vai no valor', () => {
    const l = linhasDaComparacao([cad('c'), cad('b', { planoNome: 'Velho', planoNoPlano: false, linha: { ...cad('b').linha, plano_padrao_id: 'x' } })], 'c', { plano_padrao: 'b' });
    const pl = l.find((x) => x.chave === 'plano_padrao')!;
    expect(pl.celulas.find((c) => c.id === 'b')).toMatchObject({ texto: 'Velho (fora do plano)', escolhivel: false });
    expect(pl.escolhido).toBeNull();
    expect(valoresParaGravar(l)).not.toHaveProperty('plano_padrao');
  });
  it('o resultado ao vivo segue a escolha', () => {
    const cads = [cad('m'), cad('b'), cad('c')];
    expect(resultadoAoVivo(linhasDaComparacao(cads, 'c', {}))).toBe('Resultado: Casa Mesclar · 54.442.418/0001-88');
    expect(resultadoAoVivo(linhasDaComparacao(cads, 'c', { razao_social: 'b' }))).toBe('Resultado: LUIZ MESCLAR LTDA · 54.442.418/0001-88');
    expect(valoresParaGravar(linhasDaComparacao(cads, 'c', { razao_social: 'b' })).razao_social).toBe('b');
  });
  it('"Pec.3M-" com cadastro sem o prefixo: bloqueio com o motivo; do mesmo lado, nada', () => {
    expect(bloqueioDoRateio([cad('c'), cad('p')], 'c', ehRateio)).toMatch(/não se mesclam: "Pec\.3M-" marca o pagamento por rateio/);
    expect(bloqueioDoRateio([cad('c'), cad('b')], 'c', ehRateio)).toBeNull();
  });
});

describe('o diálogo', () => {
  it('a sugestão abre as 3 colunas; fica o padrão; a escolha vai em p_valores; Mesclar pede confirmação e grava', async () => {
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" />);
    fireEvent.click(await screen.findByTestId('sugestao-de-repetido'));
    await waitFor(() => expect((screen.getByTestId('fica-c') as HTMLInputElement).checked).toBe(true));
    expect(screen.getByTestId('linha-razao_social').getAttribute('data-divergente')).toBe('sim');
    expect(screen.getByTestId('linha-cpf_cnpj').getAttribute('data-divergente')).toBe('nao');
    expect(screen.getByTestId('resultado-ao-vivo').textContent).toBe('Resultado: Casa Mesclar · 54.442.418/0001-88');
    fireEvent.click(screen.getByTestId('valor-razao_social-b'));
    expect(screen.getByTestId('resultado-ao-vivo').textContent).toBe('Resultado: LUIZ MESCLAR LTDA · 54.442.418/0001-88');
    await waitFor(() => expect(screen.getByTestId('recado-da-mesclagem').textContent).toContain('Passam para o que fica: 9 lançamentos · 1 recorrências · 2 documentos.'), { timeout: 2000 });
    const sim = banco.chamadas.filter(([f, a]) => f === 'fn_fornecedor_mesclar' && a.p_simular === true).pop()?.[1];
    expect(sim).toMatchObject({ p_manter: 'c', p_absorver: ['b', 'm'] });
    expect((sim?.p_valores as Record<string, string>).razao_social).toBe('b');
    expect(screen.getByTestId('mesclar').textContent).toBe('Mesclar 3 cadastros');
    fireEvent.click(screen.getByTestId('mesclar'));
    expect(banco.chamadas.some(([f, a]) => f === 'fn_fornecedor_mesclar' && a.p_simular === false)).toBe(false);
    fireEvent.click(screen.getByTestId('confirmar-mesclagem'));
    await waitFor(() => expect(screen.getByTestId('recado-da-mesclagem').textContent).toContain('2 cadastros absorvidos · 21 referências movidas'));
    expect((banco.chamadas.find(([f, a]) => f === 'fn_fornecedor_mesclar' && a.p_simular === false)?.[1].p_valores as Record<string, string>).razao_social).toBe('b');
    /* FORN-MESCLAR-DEPOIS-01 — volta ao início */
    expect(screen.queryByTestId('fica-c')).toBeNull();
    expect((screen.getByTestId('mesclar') as HTMLButtonElement).disabled).toBe(true);
  });
  it('a recusa do banco fica escrita inteira e o Mesclar apagado', async () => {
    banco.recusar = true;
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" />);
    fireEvent.click(await screen.findByTestId('sugestao-de-repetido'));
    const frase = 'CPF/CNPJ diferentes: X e Y. Fornecedores com documentos diferentes não se mesclam.';
    await waitFor(() => expect(screen.getByTestId('recado-da-mesclagem').textContent).toBe(frase), { timeout: 2000 });
    const r = screen.getByTestId('recado-da-mesclagem');
    expect(r.getAttribute('title')).toBe(frase);
    expect(r.className).toMatch(/\bline-clamp-2\b/);
    expect(r.className).not.toMatch(/\btruncate\b/);
    expect(screen.getByTestId('mesclar')).toBeDisabled();
  });
  it('"Pec.3M-" acrescentado à mão: bloqueia com o motivo escrito, sem pedir a prévia', async () => {
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" inicial={{ manter: 'c', absorver: [] }} />);
    await screen.findByTestId('fica-c');
    fireEvent.click(screen.getByText('+ acrescentar cadastro'));
    fireEvent.click(await screen.findByText('Pec.3M-Casa Mesclar'));
    await waitFor(() => expect(screen.getByTestId('recado-da-mesclagem').textContent).toMatch(/não se mesclam: "Pec\.3M-"/));
    expect(screen.getByTestId('mesclar')).toBeDisabled();
    await new Promise((ok) => setTimeout(ok, 400));
    expect(banco.chamadas.some(([f]) => f === 'fn_fornecedor_mesclar')).toBe(false);
  });
  it('o inativo não mesclado pode ser acrescentado', async () => {
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" inicial={{ manter: 'c', absorver: [] }} />);
    await screen.findByTestId('fica-c');
    fireEvent.click(screen.getByText('+ acrescentar cadastro'));
    await waitFor(() => expect(screen.getByText('Lineagro Produtos Agropecuarios AS')).toBeTruthy());
  });
  it('desfazer pede motivo e grava com ele', async () => {
    render(<MesclarFornecedoresDialog aberto aoFechar={vi.fn()} clienteId="cli" />);
    fireEvent.click(await screen.findByTestId('abrir-recentes'));
    fireEvent.click(await screen.findByTestId('desfazer-mesclagem'));
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    expect(screen.getByTestId('recado-da-mesclagem').textContent).toBe('Informe o motivo para desfazer.');
    fireEvent.change(screen.getByTestId('motivo-desfazer'), { target: { value: 'errado' } });
    fireEvent.click(screen.getByTestId('confirmar-desfazer'));
    await waitFor(() => expect(banco.chamadas.find(([f]) => f === 'fn_fornecedor_mesclagem_desfazer')?.[1]).toMatchObject({ p_mesclagem_id: 'log-9', p_motivo: 'errado', p_simular: false }));
  });
  it('fonte: tamanho fixo ~1120 x 420, sugestões somem abaixo de 760px, nenhuma soma, as RPCs', () => {
    const f = readFileSync(resolve(__dirname, 'MesclarFornecedoresDialog.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(f).toMatch(/h-\[min\(420px,calc\(100vh-16px\)\)\] w-\[min\(1120px,calc\(100vw-16px\)\)\]/);
    expect(f).toContain('max-[759px]:hidden');
    expect(f).not.toMatch(/\.reduce\(|\+=/);
    for (const rpc of ['fn_fornecedor_mesclar', 'fn_fornecedor_mesclagem_desfazer', 'fn_fornecedor_repetidos', 'fn_fornecedor_uso']) expect(f).toContain(`'${rpc}'`);
    expect(f).toContain(".eq('ativo', false).is('fundido_em_id', null)");
  });
});

describe('a regra do lado do rateio tem um dono', () => {
  it('ehRateio / mesmoLadoDoRateio', async () => {
    const { mesmoLadoDoRateio } = await import('@/lib/fornecedores/fornecedorTexto');
    expect(ehRateio('Pec.3M-Higino Hernandes Neto')).toBe(true);
    expect(ehRateio('Higino Hernandes Neto')).toBe(false);
    expect(mesmoLadoDoRateio('Pec.3M-X', 'X')).toBe(false);
    expect(mesmoLadoDoRateio('Pec.3M-X', 'Pec.3M-(X)')).toBe(true);
  });
});
