import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * FORN-SELETOR-PADRAO-01 fatia 2e — Pecuária legado e meta usam o seletor DONO, pelo MESMO encaixe da Lavoura
 * (`CampoDeFornecedor`). Aqui: o "[META]" (só nos modais de meta), o texto legado (lançamento antigo sem id), o inativo,
 * "o id gravado é o escolhido" nos dois modais de meta MONTADOS (o que o Salvar entrega) e a fonte dos cinco pontos.
 */
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));
const casa = vi.hoisted(() => ({ criados: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/fornecedores/cadastroDaCasaBanco', () => ({
  fonteDoCadastroNoBanco: { lerPorNome: async () => [], lerAtivos: async () => [], reativar: async () => {} },
  criarFornecedorDaCasa: async (_c: string, dados: Record<string, unknown>) => {
    casa.criados.push(dados);
    return { id: 'f-novo', nome: String(dados.nome), cpf_cnpj: null, fazenda_id: null, ativo: true };
  },
}));

import { CampoDeFornecedor, textoLegadoVisivel } from '@/components/shared/CampoDeFornecedor';
import { CompraMetaEdicaoModal } from '@/components/compra/CompraMetaEdicaoModal';
import { VendaMetaEdicaoModal } from '@/components/venda/VendaMetaEdicaoModal';
import { CompraDadosZootecnicos } from '@/v2/components/edicao/_blocos/CompraDadosZootecnicos';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import type { Lancamento } from '@/types/cattle';

const FORNS = [
  { id: 'f-a', nome: 'Agropecuária Alfa', ativo: true, cpf_cnpj: '11222333000181' },
  { id: 'f-b', nome: 'Bezerros Beta', ativo: true, cpf_cnpj: null },
  { id: 'f-meta', nome: '[META] Planejamento', ativo: true, cpf_cnpj: null },
  { id: 'f-velho', nome: 'Curral Antigo', ativo: false, cpf_cnpj: '55444333000122' },
];
type Chamada = [string | null, string | null];
const campo = () => screen.getByRole('combobox');
const opcoes = () => screen.getAllByTestId('favorecido-opcao');
const nomes = () => opcoes().map((o) => o.textContent);
const digitar = (q: string) => fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { target: { value: q } });

beforeEach(() => {
  cleanup();
  definirFornecedoresDoLeitor(FORNS);
  casa.criados = [];
  Element.prototype.scrollIntoView = () => {};
});

describe('fatia 2e — o campo: "[META]", texto legado e inativo', () => {
  it('"[META]" só é oferecido com `incluirMeta` (os modais de meta); sem ele fica fora da lista', () => {
    render(<CampoDeFornecedor clienteId="cli" value={null} onChange={() => {}} incluirMeta />);
    fireEvent.click(campo());
    expect(nomes()).toContain('[META] Planejamento');
    cleanup();
    render(<CampoDeFornecedor clienteId="cli" value={null} onChange={() => {}} />);
    fireEvent.click(campo());
    expect(nomes()).toEqual(['Agropecuária Alfa11.222.333/0001-81', 'Bezerros Beta']);
  });

  it('o "[META]" já gravado aparece no campo e é o marcado na lista do modal de meta', () => {
    render(<CampoDeFornecedor clienteId="cli" value="f-meta" onChange={() => {}} incluirMeta />);
    expect(campo().textContent).toBe('[META] Planejamento');
  });

  it('TEXTO LEGADO (sem id): o campo mostra o texto ao abrir, na mesma altura, e NÃO chama onChange', () => {
    const chamadas: Chamada[] = [];
    render(<CampoDeFornecedor clienteId="cli" value={null} textoLegado="Fazenda do Zé" placeholder="Selecione"
      onChange={(id, nome) => chamadas.push([id, nome])} />);
    expect(campo().textContent).toBe('Fazenda do Zé · histórico, não vinculado');
    expect(campo().className).toContain('h-8');
    expect(campo().className).toContain('text-amber-800');
    expect(screen.getByTestId('fornecedor-texto-legado').getAttribute('title')).toContain('"Fazenda do Zé"');
    expect(chamadas).toEqual([]);
  });

  it('texto legado: escolher na lista vincula (id e nome do cadastro), e a partir daí o campo mostra o escolhido', () => {
    const chamadas: Chamada[] = [];
    const { rerender } = render(<CampoDeFornecedor clienteId="cli" value={null} textoLegado="Fazenda do Zé"
      onChange={(id, nome) => chamadas.push([id, nome])} />);
    fireEvent.click(campo());
    digitar('beta');
    fireEvent.click(opcoes()[0]);
    expect(chamadas).toEqual([['f-b', 'Bezerros Beta']]);
    rerender(<CampoDeFornecedor clienteId="cli" value="f-b" textoLegado="Fazenda do Zé" onChange={() => {}} />);
    expect(campo().textContent).toBe('Bezerros Beta');
    expect(screen.queryByTestId('fornecedor-texto-legado')).toBeNull();
  });

  it('texto legado: o "+" abre o cadastro da casa com o texto no nome', async () => {
    render(<CampoDeFornecedor clienteId="cli" value={null} textoLegado="Fazenda do Zé" onChange={() => {}} />);
    fireEvent.click(screen.getByTitle('Cadastrar novo fornecedor'));
    await screen.findByText('Cadastre um novo fornecedor ou frigorífico.');
    expect(screen.getByPlaceholderText('Nome do fornecedor')).toHaveProperty('value', 'Fazenda do Zé');
  });

  it('o sentinela "[nao informado]" e o texto vazio nunca viram texto legado', () => {
    expect(textoLegadoVisivel('[nao informado]')).toBeNull();
    expect(textoLegadoVisivel('   ')).toBeNull();
    expect(textoLegadoVisivel(undefined)).toBeNull();
    expect(textoLegadoVisivel(' Zé ')).toBe('Zé');
    render(<CampoDeFornecedor clienteId="cli" value={null} textoLegado="[nao informado]" placeholder="Selecione" onChange={() => {}} />);
    expect(campo().textContent).toBe('Selecione');
    expect(screen.queryByTestId('fornecedor-texto-legado')).toBeNull();
  });

  it('INATIVO já gravado: aparece com o nome e a marca, e não é oferecido', () => {
    render(<CampoDeFornecedor clienteId="cli" value="f-velho" onChange={() => {}} incluirMeta />);
    expect(campo().textContent).toBe('Curral Antigoinativo');
    fireEvent.click(campo());
    expect(nomes().some((t) => (t ?? '').includes('Curral Antigo'))).toBe(false);
  });
});

/* ── OS DOIS MODAIS DE META, MONTADOS: o que o Salvar entrega ─────────────────────────────────────────────────────────── */
const lanc = (extra: Partial<Lancamento>): Lancamento => ({
  id: 'l1', data: '2026-02-01', tipo: 'compra', quantidade: 10, categoria: 'bois', pesoMedioKg: 300,
  clienteId: 'cli', fazendaId: 'faz', cenario: 'meta', ...extra,
} as Lancamento);

async function salvarEColher(salvo: Array<Record<string, unknown>>) {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvo).toHaveLength(1));
  return salvo[0];
}

describe('fatia 2e — modais de meta: o id gravado é o escolhido, e o cenário não entra no que é gravado', () => {
  it('COMPRA de meta: abre com o gravado; salvar SEM tocar entrega o mesmo id; "[META]" é oferecido', async () => {
    const salvo: Array<Record<string, unknown>> = [];
    render(<CompraMetaEdicaoModal lancamento={lanc({ fornecedorId: 'f-a' })} open onOpenChange={() => {}} nomeFazenda="Faz"
      onSalvar={async (_id, dados) => { salvo.push(dados as Record<string, unknown>); }} />);
    const c = screen.getAllByRole('combobox').find((x) => x.textContent === 'Agropecuária Alfa')!;
    expect(c).toBeTruthy();
    fireEvent.click(c);
    expect(nomes()).toContain('[META] Planejamento');
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { key: 'Escape' });
    const dados = await salvarEColher(salvo);
    expect(dados.fornecedorId).toBe('f-a');
    expect('cenario' in dados).toBe(false);
    expect('statusOperacional' in dados).toBe(false);
    expect('fornecedorNomeSnapshot' in dados).toBe(false);
  });

  it('COMPRA de meta: escolher outro grava o id DELE (busca por CNPJ)', async () => {
    const salvo: Array<Record<string, unknown>> = [];
    render(<CompraMetaEdicaoModal lancamento={lanc({ fornecedorId: 'f-meta' })} open onOpenChange={() => {}} nomeFazenda="Faz"
      onSalvar={async (_id, dados) => { salvo.push(dados as Record<string, unknown>); }} />);
    fireEvent.click(screen.getAllByRole('combobox').find((x) => x.textContent === '[META] Planejamento')!);
    digitar('11222333');
    expect(opcoes()).toHaveLength(1);
    fireEvent.click(opcoes()[0]);
    const dados = await salvarEColher(salvo);
    expect(dados.fornecedorId).toBe('f-a');
    expect('cenario' in dados).toBe(false);
  });

  it('VENDA de meta: abre com o gravado, salvar sem tocar mantém; escolher outro grava o id dele', async () => {
    const salvo: Array<Record<string, unknown>> = [];
    const montar = () => render(<VendaMetaEdicaoModal lancamento={lanc({ tipo: 'venda', fornecedorId: 'f-meta' })} open onOpenChange={() => {}}
      nomeFazenda="Faz" onSalvar={async (_id, dados) => { salvo.push(dados as Record<string, unknown>); }} />);
    montar();
    expect(screen.getAllByRole('combobox').some((x) => x.textContent === '[META] Planejamento')).toBe(true);
    const d1 = await salvarEColher(salvo);
    expect(d1.fornecedorId).toBe('f-meta');
    expect('cenario' in d1).toBe(false);
    cleanup(); salvo.length = 0;
    montar();
    fireEvent.click(screen.getAllByRole('combobox').find((x) => x.textContent === '[META] Planejamento')!);
    digitar('beta');
    fireEvent.click(opcoes()[0]);
    const d2 = await salvarEColher(salvo);
    expect(d2.fornecedorId).toBe('f-b');
  });
});

/* ── O BLOCO DO MODAL ZOOTÉCNICO, MONTADO, COM TEXTO LEGADO ───────────────────────────────────────────────────────────── */
describe('fatia 2e — bloco da compra (modal zootécnico): legado e escolha', () => {
  const montarBloco = (p: { fornecedorId: string | null; textoLegado?: string }) => {
    const chamadas: Chamada[] = [];
    const l = lanc({ cenario: 'realizado' });
    render(<CompraDadosZootecnicos lancamento={l} form={l} onFormChange={() => {}} statusMode="realizado" onStatusModeChange={() => {}}
      canEditMeta={false} nomeFazendaDestino="Faz" fornecedorId={p.fornecedorId} textoLegado={p.textoLegado} clienteId="cli"
      onFornecedorChange={(id, nome) => chamadas.push([id, nome])} />);
    return chamadas;
  };
  const doFornecedor = () => screen.getAllByRole('combobox').find((x) => x.className.includes('h-8'))!;

  it('lançamento antigo só com o TEXTO: o texto aparece ao abrir, nada é chamado, e "[META]" não é oferecido', () => {
    const chamadas = montarBloco({ fornecedorId: null, textoLegado: 'Sítio Histórico' });
    expect(doFornecedor().textContent).toBe('Sítio Histórico · histórico, não vinculado');
    expect(chamadas).toEqual([]);
    fireEvent.click(doFornecedor());
    expect(nomes().some((t) => (t ?? '').includes('[META]'))).toBe(false);
  });

  it('com id gravado: mostra o do id; escolher outro entrega o id e o nome do ESCOLHIDO', () => {
    const chamadas = montarBloco({ fornecedorId: 'f-a' });
    expect(doFornecedor().textContent).toBe('Agropecuária Alfa');
    fireEvent.click(doFornecedor());
    digitar('beta');
    fireEvent.click(opcoes()[0]);
    expect(chamadas).toEqual([['f-b', 'Bezerros Beta']]);
  });
});

/* ── A FONTE ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const ler = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const semComentario = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const usos = (fonte: string, nome: string): string[] => fonte.match(new RegExp(`<${nome}\\b[\\s\\S]*?\\/>`, 'g')) ?? [];

const PONTOS: Record<string, { meta: boolean; legado: boolean }> = {
  'src/components/edit/EditCompraForm.tsx': { meta: false, legado: true },
  'src/components/compra/CompraMetaModalShell.tsx': { meta: true, legado: false },
  'src/components/venda/VendaMetaModalShell.tsx': { meta: true, legado: false },
  'src/v2/components/edicao/_blocos/VendaDadosZootecnicos.tsx': { meta: false, legado: true },
  'src/v2/components/edicao/_blocos/CompraDadosZootecnicos.tsx': { meta: false, legado: true },
};

describe('fatia 2e — a fonte dos cinco pontos', () => {
  it('AUTO-TESTE: os detectores sabem achar', () => {
    expect(usos('<CampoDeFornecedor\n  incluirMeta\n/>', 'CampoDeFornecedor')).toHaveLength(1);
    expect(/\bincluirMeta\b/.test('<CampoDeFornecedor incluirMeta />')).toBe(true);
    expect(semComentario('a /* <FornecedorSelect /> */ b')).toBe('a  b');
  });

  it('os cinco usam o encaixe único, com o cliente; "[META]" só nos dois modais de meta; o texto legado nos três de edição', () => {
    for (const [arquivo, p] of Object.entries(PONTOS)) {
      const fonte = semComentario(ler(arquivo));
      const us = usos(fonte, 'CampoDeFornecedor');
      expect(us, arquivo).toHaveLength(1);
      expect(/\bclienteId=\{/.test(us[0]) && /\bvalue=\{/.test(us[0]) && /\bonChange=\{/.test(us[0]), arquivo).toBe(true);
      expect(/\bincluirMeta\b/.test(us[0]), arquivo).toBe(p.meta);
      expect(us[0].includes('textoLegado={textoLegado}'), arquivo).toBe(p.legado);
      expect(fonte, arquivo).not.toContain('FornecedorSelect');
      expect(fonte, arquivo).not.toContain("from('financeiro_fornecedores')");
    }
  });

  it('o id que cada ponto entrega ao campo é o gravado, e o que ele devolve vai ao mesmo estado', () => {
    for (const a of ['src/components/edit/EditCompraForm.tsx', 'src/v2/components/edicao/_blocos/VendaDadosZootecnicos.tsx', 'src/v2/components/edicao/_blocos/CompraDadosZootecnicos.tsx']) {
      const u = usos(semComentario(ler(a)), 'CampoDeFornecedor')[0];
      expect(u, a).toContain('value={fornecedorId}');
      expect(u, a).toContain('onChange={onFornecedorChange}');
    }
    const compra = usos(semComentario(ler('src/components/compra/CompraMetaModalShell.tsx')), 'CampoDeFornecedor')[0];
    expect(compra).toContain('value={compraFornecedorId || null}');
    expect(compra).toContain("onChange={(id) => setCompraFornecedorId(id ?? '')}");
    const venda = usos(semComentario(ler('src/components/venda/VendaMetaModalShell.tsx')), 'CampoDeFornecedor')[0];
    expect(venda).toContain('value={compradorId || null}');
    expect(venda).toContain("onChange={(id) => setCompradorId(id ?? '')}");
  });

  it('há UM encaixe só: o da Lavoura é este, e não nasceu um segundo', () => {
    expect(existsSync(resolve(process.cwd(), 'src/components/agri/FornecedorDaLavoura.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/components/shared/FornecedorDaPecuaria.tsx'))).toBe(false);
    const fonte = semComentario(ler('src/components/shared/CampoDeFornecedor.tsx'));
    expect(usos(fonte, 'FavorecidoSelect')).toHaveLength(1);
    /* o campo nunca escreve o texto legado: ele só o lê para mostrar */
    expect(fonte).not.toContain('compradorFornecedor');
  });

  it('o modal zootécnico só entrega o texto legado enquanto NÃO há id, e o texto vem do lançamento (não do campo)', () => {
    const zoo = ler('src/v2/components/edicao/LancamentoZooModal.tsx');
    expect(zoo.split('textoLegado={!fornecedorIdEdit ? (textoLegadoInicial ?? undefined) : undefined}').length - 1).toBe(2);
    expect(zoo).toContain('setTextoLegadoInicial(lancamento.compradorFornecedor ?? null);');
  });
});
