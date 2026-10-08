/**
 * FORN-SELETOR-PADRAO-01 passo 1b — o DONO do seletor de fornecedor: o que o operador vê.
 * Fornecedores SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { FavorecidoSelect } from './FavorecidoSelect';
import {
  definirFornecedoresDoLeitor, definirSituacaoDoLeitor, pedidosAoLeitor, tentativasDoLeitor,
} from '@/test/leitorDeFornecedoresFake';

interface Forn { id: string; nome: string; cpf_cnpj: string | null; ativo: boolean }
const f = (id: string, nome: string, cpf_cnpj: string | null = null, ativo = true): Forn => ({ id, nome, cpf_cnpj, ativo });

const BASE: Forn[] = [
  f('rep1', 'Fulano Insumos', '11222333000181'),
  f('rep2', 'FULANO  INSUMOS', '12345678909'),
  f('rep3', 'Fulâno Insumos'),
  f('uni', 'Beltrano Comércio de Insumos Agropecuários e Representações Ltda', '99888777000166'),
  f('sem', 'Sicrano Sem Documento'),
  f('torto', 'Documento Torto', '1234567'),
  f('meta', '[META] Planejamento'),
  f('ina', 'Antigo Inativo', '55444333000122', false),
];

function Campo(props: { modo: 'leitor' | 'lista'; lista?: Forn[]; inicial?: string; linha?: boolean; incluirMeta?: boolean; onSelected?: (x: { id: string }) => void }) {
  const [value, setValue] = useState(props.inicial ?? '');
  const [busca, setBusca] = useState('');
  return (
    <FavorecidoSelect
      value={value} onChange={setValue} onSelected={props.onSelected}
      search={busca} onSearchChange={setBusca}
      linhaDoDocumento={props.linha} incluirMeta={props.incluirMeta}
      {...(props.modo === 'leitor' ? { clienteId: 'cli' } : { fornecedores: props.lista ?? BASE })}
    />
  );
}
const abrir = () => fireEvent.click(screen.getByRole('combobox'));
const digitar = (q: string) => fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { target: { value: q } });
const opcoes = () => screen.queryAllByTestId('favorecido-opcao');
const nomes = () => opcoes().map((o) => o.querySelector('span')?.textContent ?? '');
const docDe = (o: HTMLElement) => within(o).getByTestId('favorecido-doc-da-opcao').textContent;

beforeEach(() => { definirFornecedoresDoLeitor(BASE); definirSituacaoDoLeitor({}); pedidosAoLeitor.length = 0; });

describe.each(['leitor', 'lista'] as const)('a opção, a busca e o selo — modo %s', (modo) => {
  it('UMA linha: nome à esquerda (corta, inteiro no title), documento formatado à direita que não corta', () => {
    render(<Campo modo={modo} />);
    abrir();
    const longo = opcoes().find((o) => o.textContent?.includes('Beltrano'));
    expect(longo).toBeTruthy();
    const nome = longo?.querySelector('span');
    expect(nome?.className).toContain('truncate');
    expect(nome?.getAttribute('title')).toBe('Beltrano Comércio de Insumos Agropecuários e Representações Ltda');
    const doc = within(longo as HTMLElement).getByTestId('favorecido-doc-da-opcao');
    expect(doc.textContent).toBe('99.888.777/0001-66');
    expect(doc.className).toContain('shrink-0');
    expect(doc.className).toContain('whitespace-nowrap');
    expect(doc.className).not.toContain('truncate');
  });
  it('sem documento a área fica VAZIA; tamanho inválido aparece como está', () => {
    render(<Campo modo={modo} />);
    abrir();
    expect(docDe(opcoes().find((o) => o.textContent?.includes('Sicrano')) as HTMLElement)).toBe('');
    expect(docDe(opcoes().find((o) => o.textContent?.includes('Torto')) as HTMLElement)).toBe('1234567');
  });
  it('só ativos, e "[META]" fora: o inativo e o de meta não estão na lista (a busca prova que existem na base)', () => {
    render(<Campo modo={modo} />);
    abrir();
    expect(BASE.some((x) => !x.ativo) && BASE.some((x) => x.nome.includes('[META]'))).toBe(true);
    expect(nomes()).toEqual(['Fulano Insumos', 'FULANO  INSUMOS', 'Fulâno Insumos', 'Beltrano Comércio de Insumos Agropecuários e Representações Ltda', 'Sicrano Sem Documento', 'Documento Torto']);
  });
  it('com `incluirMeta` o cadastro de meta entra', () => {
    render(<Campo modo={modo} incluirMeta />);
    abrir();
    expect(nomes()).toContain('[META] Planejamento');
  });
  it('selo "N iguais" no nome repetido (sem acento, sem caixa, espaços duplos); o nome único não leva', () => {
    render(<Campo modo={modo} />);
    abrir();
    const selos = opcoes().map((o) => within(o).queryByTestId('favorecido-iguais')?.textContent ?? '');
    expect(selos).toEqual(['3 iguais', '3 iguais', '3 iguais', '', '', '']);
  });
  it('busca por nome sem acento e por dígitos do documento (com e sem pontuação)', () => {
    render(<Campo modo={modo} />);
    abrir();
    digitar('fulano');
    expect(nomes()).toHaveLength(3);
    digitar('11222333');
    expect(nomes()).toEqual(['Fulano Insumos']);
    digitar('123.456.789-09');
    expect(nomes()).toEqual(['FULANO  INSUMOS']);
    digitar('antigo');
    expect(nomes()).toEqual([]);
    expect(screen.getByText('Nenhum fornecedor encontrado')).toBeInTheDocument();
  });
  it('escolher entrega o objeto e põe o nome no campo, com nome e documento no title', () => {
    const onSelected = vi.fn();
    render(<Campo modo={modo} onSelected={onSelected} linha />);
    abrir();
    fireEvent.click(opcoes()[1]);
    expect(onSelected).toHaveBeenCalledWith(expect.objectContaining({ id: 'rep2' }));
    expect(screen.getByRole('combobox').textContent).toBe('FULANO  INSUMOS');
    expect(screen.getByRole('combobox').getAttribute('title')).toBe('FULANO  INSUMOS · 123.456.789-09');
    expect(screen.getByTestId('favorecido-documento').textContent).toBe('123.456.789-09');
  });
});

describe('a linha fixa do documento sob o campo', () => {
  it('existe SEMPRE com a mesma altura declarada: vazia sem escolha, o documento, ou "sem CNPJ/CPF"', () => {
    render(<Campo modo="leitor" />);
    const linha = () => screen.getByTestId('favorecido-documento');
    expect(linha().textContent).toBe('');
    const classe = linha().className;
    expect(classe).toContain('h-[14px]');
    abrir(); fireEvent.click(opcoes()[0]);
    expect(linha().textContent).toBe('11.222.333/0001-81');
    abrir(); fireEvent.click(opcoes().find((o) => o.textContent?.includes('Sicrano')) as HTMLElement);
    expect(linha().textContent).toBe('sem CNPJ/CPF');
    expect(linha().className).toBe(classe);
  });
  it('LIGADA por padrão no modo do leitor; na lista do hospedeiro (transição) fica desligada até a fatia dele; a prop manda', () => {
    const a = render(<Campo modo="leitor" />);
    expect(screen.queryByTestId('favorecido-documento')).not.toBeNull();
    a.unmount();
    const b = render(<Campo modo="lista" />);
    expect(screen.queryByTestId('favorecido-documento')).toBeNull();
    b.unmount();
    const c = render(<Campo modo="leitor" linha={false} />);
    expect(screen.queryByTestId('favorecido-documento')).toBeNull();
    c.unmount();
    render(<Campo modo="lista" linha />);
    expect(screen.queryByTestId('favorecido-documento')).not.toBeNull();
  });
});

describe('valor gravado inativo', () => {
  it.each(['leitor', 'lista'] as const)('modo %s: o campo NÃO esvazia — mostra o nome com a marca "inativo" e o documento; a lista segue sem ele', (modo) => {
    render(<Campo modo={modo} inicial="ina" linha />);
    expect(screen.getByRole('combobox').textContent).toBe('Antigo Inativoinativo');
    expect(screen.getByTestId('favorecido-inativo').textContent).toBe('inativo');
    expect(screen.getByRole('combobox').getAttribute('title')).toBe('Antigo Inativo · 55.444.333/0001-22 · inativo');
    expect(screen.getByTestId('favorecido-documento').textContent).toBe('55.444.333/0001-22');
    abrir();
    expect(nomes()).not.toContain('Antigo Inativo');
  });
  it('o ativo escolhido não leva a marca', () => {
    render(<Campo modo="leitor" inicial="uni" />);
    expect(screen.queryByTestId('favorecido-inativo')).toBeNull();
  });
});

describe('no máximo 100 opções desenhadas', () => {
  const MUITOS = Array.from({ length: 2594 }, (_v, i) => f(`id${i}`, `Fornecedor ${String(i).padStart(4, '0')}`));
  it('abre com 100 e o rodapé fixo, FORA da rolagem; a busca corre sobre todos', () => {
    definirFornecedoresDoLeitor(MUITOS);
    render(<Campo modo="leitor" />);
    abrir();
    expect(opcoes()).toHaveLength(100);
    const rodape = screen.getByTestId('favorecido-rodape');
    expect(rodape.textContent).toBe('Mostrando 100 de 2.594 — digite para refinar');
    expect(screen.getByTestId('favorecido-lista').contains(rodape)).toBe(false);
    digitar('fornecedor 2500');
    expect(nomes()).toEqual(['Fornecedor 2500']);
    expect(screen.queryByTestId('favorecido-rodape')).toBeNull();
  });
  it('o já escolhido aparece no TOPO mesmo fora dos 100, e Enter ao abrir o mantém', () => {
    definirFornecedoresDoLeitor(MUITOS);
    render(<Campo modo="leitor" inicial="id2400" />);
    abrir();
    expect(nomes()[0]).toBe('Fornecedor 2400');
    expect(opcoes()).toHaveLength(100);
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { key: 'Enter' });
    expect(screen.getByRole('combobox').textContent).toBe('Fornecedor 2400');
  });
  it('cabe tudo: sem rodapé', () => {
    render(<Campo modo="leitor" />);
    abrir();
    expect(screen.queryByTestId('favorecido-rodape')).toBeNull();
  });
});

describe('o leitor único', () => {
  it('sem `fornecedores` o seletor pede a lista ao leitor com o cliente e o valor gravado; com a lista do hospedeiro não pede', () => {
    const a = render(<Campo modo="leitor" inicial="ina" />);
    expect(pedidosAoLeitor).toContain('cli');
    a.unmount();
    pedidosAoLeitor.length = 0;
    render(<Campo modo="lista" />);
    expect(pedidosAoLeitor.every((c) => c === null)).toBe(true);
    expect(pedidosAoLeitor.length).toBeGreaterThan(0);   /* o hook roda sempre (regra dos hooks), só não lê */
  });
  it('falha do leitor: a frase ao lado do campo, com "Tentar de novo" — na linha fixa e dentro da lista', () => {
    definirSituacaoDoLeitor({ erro: 'Não foi possível carregar os fornecedores. (rede fora)' });
    render(<Campo modo="leitor" />);
    const linha = screen.getByTestId('favorecido-documento');
    expect(linha.textContent).toContain('Não foi possível carregar os fornecedores. (rede fora)');
    fireEvent.click(within(linha).getByText('Tentar de novo'));
    expect(tentativasDoLeitor()).toBe(1);
    abrir();
    fireEvent.click(within(screen.getByTestId('favorecido-erro-na-lista')).getByText('Tentar de novo'));
    expect(tentativasDoLeitor()).toBe(2);
    expect(screen.queryByText('Nenhum fornecedor encontrado')).toBeNull();
  });
  it('lendo, com valor gravado: o campo diz "Carregando…", nunca o convite de campo vazio', () => {
    definirSituacaoDoLeitor({ carregando: true });
    render(<Campo modo="leitor" inicial="uni" />);
    expect(screen.getByRole('combobox').textContent).toBe('Carregando…');
  });
});

describe('a ação fixa do pé da lista (o "Outro…" do emitente do documento)', () => {
  function ComAcao({ aoAgir }: { aoAgir: () => void }) {
    const [value, setValue] = useState('uni');
    const [busca, setBusca] = useState('');
    return <FavorecidoSelect value={value} onChange={setValue} clienteId="cli" search={busca} onSearchChange={setBusca}
      acaoFinal={{ label: 'Outro (informar nome e CNPJ/CPF)', onSelect: aoAgir }} />;
  }
  it('fica FORA da rolagem, continua com a busca sem resultado, e ao clicar chama o hospedeiro, fecha a lista e NÃO muda o valor', () => {
    const aoAgir = vi.fn();
    render(<ComAcao aoAgir={aoAgir} />);
    abrir();
    const acao = screen.getByTestId('favorecido-acao-final');
    expect(acao.textContent).toBe('Outro (informar nome e CNPJ/CPF)');
    expect(screen.getByTestId('favorecido-lista').contains(acao)).toBe(false);
    digitar('zzzz');
    expect(opcoes()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('favorecido-acao-final'));
    expect(aoAgir).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('favorecido-lista')).toBeNull();
    expect(screen.getByRole('combobox').textContent).toContain('Beltrano');
  });
  it('sem a prop, a ação não existe', () => {
    render(<Campo modo="leitor" />);
    abrir();
    expect(screen.queryByTestId('favorecido-acao-final')).toBeNull();
  });
});

describe('fatia 2a (Financeiro) — os pontos usam o dono pelo LEITOR, sem lista do hospedeiro', () => {
  const ler = (c: string) => readFileSync(resolve(process.cwd(), c), 'utf8');
  /** os usos de <FavorecidoSelect …/> de um arquivo (do `<` ao `/>`) */
  const usos = (fonte: string) => fonte.match(/<FavorecidoSelect(?:<[A-Za-z]+>)?\s+[a-zA-Z][\s\S]*?\/>/g) ?? [];   /* `<FavorecidoSelect />` em comentário não é uso */
  it('AUTO-TESTE: o leitor de usos acha o uso e vê a lista passada por prop', () => {
    const u = usos('<div><FavorecidoSelect value={a}\n  fornecedores={lista} /></div>');
    expect(u).toHaveLength(1);
    expect(/\bfornecedores=\{/.test(u[0])).toBe(true);
  });
  it.each([
    ['src/components/recorrencias/RecorrenciaDialog.tsx', 1],
    ['src/components/financeiro-v2/ContratoDialog.tsx', 1],
    ['src/components/financeiro-v2/AbaDocumentosLancamento.tsx', 1],
    ['src/components/conciliacao/SemClassificacaoModal.tsx', 1],
    ['src/components/financeiro-v2/LancamentoV2Dialog.tsx', 1],
  ])('%s: %i uso(s), todos com `clienteId` e nenhum com `fornecedores`', (arquivo, quantos) => {
    const u = usos(ler(arquivo));
    expect(u).toHaveLength(quantos);
    for (const uso of u) {
      expect(uso).toMatch(/\bclienteId=\{/);
      expect(uso).not.toMatch(/\bfornecedores=\{/);
    }
  });
  it('o contrato não tem mais seletor próprio de fornecedor (Popover, busca e teclado saíram)', () => {
    const c = ler('src/components/financeiro-v2/ContratoDialog.tsx');
    for (const resto of ['fornecedorOpen', 'filteredFornecedores', 'handleFornecedorKeyDown', 'fornecedorItemRefs', 'Buscar fornecedor...']) expect(c).not.toContain(resto);
    expect(c).toContain('onSelected={aoEscolherFornecedor}');
  });
  it('Sem classificação é CÉLULA DE TABELA: a linha fixa fica desligada (o documento vai no title e na opção)', () => {
    expect(usos(ler('src/components/conciliacao/SemClassificacaoModal.tsx'))[0]).toContain('linhaDoDocumento={false}');
  });
  it('o emitente do documento não usa mais o SearchableSelect, e os quatro lugares de documentos passam o cliente, não a lista', () => {
    const aba = ler('src/components/financeiro-v2/AbaDocumentosLancamento.tsx');
    expect(aba).not.toContain('SearchableSelect');
    expect(aba).not.toMatch(/\bfornecedores\b\s*[:=]/);
    for (const [arquivo, peca] of [
      ['src/components/financeiro-v2/DocumentosPendentes.tsx', '<FormDocumento'],
      ['src/components/financiamentos/DocumentosNaCriacao.tsx', '<DocumentosPendentes'],
      ['src/components/financiamentos/DocumentosDoContrato.tsx', '<AbaDocumentosLancamento'],
      ['src/components/financeiro-v2/LancamentoV2Dialog.tsx', '<AbaDocumentosLancamento'],
      ['src/components/financeiro-v2/LancamentoV2Dialog.tsx', '<DocumentosPendentes'],
    ] as const) {
      const fonte = ler(arquivo);
      const blocos = fonte.split(peca).slice(1).map((b) => b.slice(0, b.indexOf('/>')));
      expect(blocos.length, `${arquivo} ${peca}`).toBeGreaterThan(0);
      for (const b of blocos) {
        expect(b, `${arquivo} ${peca}`).toMatch(/\bclienteId=\{/);
        expect(b, `${arquivo} ${peca}`).not.toMatch(/\bfornecedores=\{/);
        expect(b, `${arquivo} ${peca}`).not.toMatch(/\bclienteId=\{(null|undefined|'')\}/);   /* o cliente de verdade, não um vazio */
      }
    }
  });
});

describe('2a-fix1 — o "+" só existe com um cadastro de verdade atrás dele', () => {
  /** os valores de toda prop `onCriarNovo={…}` de uma fonte (chaves balanceadas) */
  const valoresDeOnCriarNovo = (fonte: string): string[] => {
    const saida: string[] = []; const marca = 'onCriarNovo={';
    for (let i = fonte.indexOf(marca); i >= 0; i = fonte.indexOf(marca, i + 1)) {
      let nivel = 1; let j = i + marca.length;
      for (; j < fonte.length && nivel > 0; j++) { if (fonte[j] === '{') nivel++; else if (fonte[j] === '}') nivel--; }
      saida.push(fonte.slice(i + marca.length, j - 1));
    }
    return saida;
  };
  /** vazio = função cujo corpo não faz nada (só espaço ou comentário) */
  const ehVazio = (valor: string) => {
    const semComentario = valor.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return /^\s*(\(\s*\)|\w+)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*$/.test(semComentario) || /^\s*(noop|undefined|null)\s*$/.test(semComentario);
  };
  const arquivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(resolve(dir, e.name)) : /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [resolve(dir, e.name)] : []);

  it('AUTO-TESTE: o detector acha o handler vazio (com e sem comentário) e deixa passar o de verdade', () => {
    expect(valoresDeOnCriarNovo('<X onCriarNovo={() => { /* cadastro inline */ }} a={1} />').map(ehVazio)).toEqual([true]);
    expect(valoresDeOnCriarNovo('<X onCriarNovo={() => {}} />').map(ehVazio)).toEqual([true]);
    expect(valoresDeOnCriarNovo('<X onCriarNovo={() => setAberto(true)} />').map(ehVazio)).toEqual([false]);
    expect(valoresDeOnCriarNovo('<X onCriarNovo={f ? () => { abrir({ a: 1 }); } : undefined} />').map(ehVazio)).toEqual([false]);
  });
  it('nenhum hospedeiro passa `onCriarNovo` vazio', () => {
    const achados = arquivos(resolve(process.cwd(), 'src')).flatMap((a) => valoresDeOnCriarNovo(readFileSync(a, 'utf8')).map((v) => ({ a, v })));
    expect(achados.length).toBeGreaterThanOrEqual(6);   /* a busca achou os hospedeiros que existem */
    expect(achados.filter((x) => ehVazio(x.v)).map((x) => x.a)).toEqual([]);
  });
  it('sem `onCriarNovo` o "+" não é desenhado; com ele, é e chama o hospedeiro', () => {
    definirFornecedoresDoLeitor([{ id: 'a', nome: 'Alfa' }]);
    const { unmount } = render(<FavorecidoSelect value="" onChange={() => {}} clienteId="c" search="" onSearchChange={() => {}} />);
    expect(screen.queryByTitle('Novo Fornecedor')).toBeNull();
    unmount();
    const criar = vi.fn();
    render(<FavorecidoSelect value="" onChange={() => {}} clienteId="c" search="" onSearchChange={() => {}} onCriarNovo={criar} />);
    fireEvent.click(screen.getByTitle('Novo Fornecedor'));
    expect(criar).toHaveBeenCalledTimes(1);
  });
});

describe('fonte', () => {
  const fonte = readFileSync(resolve(process.cwd(), 'src/components/shared/FavorecidoSelect.tsx'), 'utf8');
  it('nenhum hook depois de return, e as regras puras vêm do dono (sem normalização nem máscara própria no componente)', () => {
    const corpo = fonte.slice(fonte.indexOf('export function FavorecidoSelect'));
    const primeiroReturn = corpo.indexOf('\n  return (');
    expect(primeiroReturn).toBeGreaterThan(0);
    expect(corpo.slice(primeiroReturn)).not.toMatch(/\buse(State|Memo|Effect|Ref|Callback|FornecedoresDoCliente)\(/);
    expect(fonte).toContain("from '@/lib/fornecedores/fornecedorTexto'");
    expect(fonte).not.toMatch(/normalize\('NFD'\)/);
    expect(fonte).not.toMatch(/\.slice\(0, 2\)\}\./);
    expect(fonte).not.toContain("from('financeiro_fornecedores')");
  });
  it('o modal do lançamento usa o dono pelo LEITOR: passa o cliente e não passa a lista', () => {
    const modal = readFileSync(resolve(process.cwd(), 'src/components/financeiro-v2/LancamentoV2Dialog.tsx'), 'utf8');
    const uso = modal.slice(modal.indexOf('<FavorecidoSelect'), modal.indexOf('/>', modal.indexOf('tambem os recusa, entao tela e gravador dizem a mesma coisa.')));
    expect(uso).toContain('clienteId={clienteAtual?.id ?? null}');
    expect(uso).not.toMatch(/^\s*fornecedores=\{/m);
    expect(uso).not.toMatch(/^\s*showCpfCnpj\s*$/m);
  });
});
