import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * FORN-SELETOR-PADRAO-01 fatia 2d — a Lavoura usa o seletor DONO de fornecedor, pelo leitor único.
 *
 * O campo dos quatro modais é o `CampoDeFornecedor` (o encaixe do dono na anatomia medida deles). Aqui: o campo montado
 * (id e nome entregues num gesto, esvaziar, inativo gravado, travado, o "+") e a FONTE dos cinco pontos.
 */
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
const casa = vi.hoisted(() => ({ criados: [] as Array<{ clienteId: string; dados: Record<string, unknown> }> }));
vi.mock('@/lib/fornecedores/cadastroDaCasaBanco', () => ({
  fonteDoCadastroNoBanco: { lerPorNome: async () => [], lerAtivos: async () => [], reativar: async () => {} },
  criarFornecedorDaCasa: async (clienteId: string, dados: Record<string, unknown>) => {
    casa.criados.push({ clienteId, dados });
    return { id: 'f-novo', nome: String(dados.nome), cpf_cnpj: null, fazenda_id: null, ativo: true };
  },
}));

import { CampoDeFornecedor } from '@/components/shared/CampoDeFornecedor';
import { definirFornecedoresDoLeitor, pedidosAoLeitor } from '@/test/leitorDeFornecedoresFake';

const FORNS = [
  { id: 'f-coop', nome: 'Cooperativa Alfa', ativo: true, cpf_cnpj: '11222333000181' },
  { id: 'f-ind', nome: 'Indústria Beta de Fécula', ativo: true, cpf_cnpj: null },
  { id: 'f-velho', nome: 'Armazém Antigo', ativo: false, cpf_cnpj: '55444333000122' },
];
type Chamada = [string | null, string | null];
const montar = (p: { value?: string | null; disabled?: boolean } = {}) => {
  const chamadas: Chamada[] = [];
  render(<CampoDeFornecedor clienteId="cli" value={p.value ?? null} disabled={p.disabled}
    placeholder="Escolha" onChange={(id, nome) => chamadas.push([id, nome])} />);
  return chamadas;
};
const campo = () => screen.getByRole('combobox');
const opcoes = () => screen.getAllByTestId('favorecido-opcao');
const digitar = (q: string) => fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { target: { value: q } });

beforeEach(() => {
  cleanup();
  definirFornecedoresDoLeitor(FORNS);
  pedidosAoLeitor.length = 0;
  casa.criados = [];
  Element.prototype.scrollIntoView = () => {};
});

describe('fatia 2d — o campo de fornecedor da Lavoura', () => {
  it('escolher entrega, NUM gesto, o id do ESCOLHIDO e o nome do cadastro — busca por nome e por CNPJ, uma linha por opção', () => {
    const chamadas = montar();
    expect(pedidosAoLeitor).toContain('cli');
    fireEvent.click(campo());
    digitar('fecula');
    expect(opcoes().map((o) => o.textContent)).toEqual(['Indústria Beta de Fécula']);
    digitar('11.222.333/0001');
    expect(opcoes()).toHaveLength(1);
    expect(opcoes()[0].textContent).toBe('Cooperativa Alfa11.222.333/0001-81');
    fireEvent.click(opcoes()[0]);
    expect(chamadas).toEqual([['f-coop', 'Cooperativa Alfa']]);
  });

  it('esvaziar (o "— nenhum —" da lista, no lugar do "✕" de antes) entrega (null, null)', () => {
    const chamadas = montar({ value: 'f-coop' });
    expect(campo().textContent).toBe('Cooperativa Alfa');
    expect(campo().getAttribute('title')).toBe('Cooperativa Alfa · 11.222.333/0001-81');
    fireEvent.click(campo());
    fireEvent.click(screen.getByText('— nenhum —'));
    expect(chamadas).toEqual([[null, null]]);
  });

  it('INATIVO já gravado: aparece com o nome e a marca, e não é oferecido para nova escolha', () => {
    montar({ value: 'f-velho' });
    expect(campo().textContent).toBe('Armazém Antigoinativo');
    expect(campo().getAttribute('title')).toBe('Armazém Antigo · 55.444.333/0001-22 · inativo');
    fireEvent.click(campo());
    expect(opcoes().map((o) => o.textContent).some((t) => (t ?? '').includes('Armazém Antigo'))).toBe(false);
    expect(opcoes()).toHaveLength(2);
  });

  it('a anatomia dos modais: 32px, "+" a 6px (4 do dono + 2 daqui), sem rótulo próprio e sem a linha do documento', () => {
    montar();
    expect(campo().className).toContain('h-8');
    expect(campo().className).toContain('mr-0.5');
    expect(campo().className).toContain('text-muted-foreground');
    expect(screen.getByTitle('Cadastrar novo fornecedor').className).toContain('h-8 w-8');
    expect(document.querySelector('label')).toBeNull();
    expect(screen.queryByTestId('favorecido-documento')).toBeNull();
  });

  it('TRAVADO: sem o "+", largura inteira e texto legível; o clique não abre a lista', () => {
    montar({ value: 'f-coop', disabled: true });
    expect(campo()).toHaveProperty('disabled', true);
    expect(campo().className).toContain('disabled:opacity-100');
    expect(campo().className).not.toContain('mr-0.5');
    expect(screen.queryByTitle('Cadastrar novo fornecedor')).toBeNull();
    fireEvent.click(campo());
    expect(screen.queryByTestId('favorecido-lista')).toBeNull();
  });

  it('o "+" abre o CADASTRO DA CASA; o criado volta ESCOLHIDO, com o id e o nome dele', async () => {
    const chamadas = montar();
    fireEvent.click(screen.getByTitle('Cadastrar novo fornecedor'));
    await screen.findByText('Cadastre um novo fornecedor ou frigorífico.');
    fireEvent.change(screen.getByPlaceholderText('Nome do fornecedor'), { target: { value: 'Fecularia Nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Fornecedor' }));
    await waitFor(() => expect(casa.criados).toHaveLength(1));
    expect(casa.criados[0]).toEqual({ clienteId: 'cli', dados: { nome: 'Fecularia Nova', cpfCnpj: undefined } });
    await waitFor(() => expect(chamadas).toEqual([['f-novo', 'Fecularia Nova']]));
  });
});

/* ── A FONTE ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const ler = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const semComentario = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const usos = (fonte: string, nome: string): string[] => fonte.match(new RegExp(`<${nome}\\b[\\s\\S]*?\\/>`, 'g')) ?? [];
const consultas = (fonte: string): number => (fonte.match(/\.from\(\s*['"`]financeiro_fornecedores['"`]\s*\)/g) ?? []).length;
const PONTOS: Record<string, number> = {
  'src/components/agri/CargaMandiocaModal.tsx': 2,   // comprador (indústria) e prestador de cada serviço
  'src/components/agri/LocalEstoqueModal.tsx': 1,
  'src/components/agri/VendaGraosModal.tsx': 1,
  'src/pages/AgriBarterTab.tsx': 1,
};

describe('fatia 2d — a fonte dos cinco pontos', () => {
  it('AUTO-TESTE: os detectores sabem achar', () => {
    expect(usos('<CampoDeFornecedor\n  value={a}\n/>\n<FornecedorSelect x />', 'CampoDeFornecedor')).toHaveLength(1);
    expect(usos('<FornecedorSelect\n fornecedorId={a}\n/>', 'FornecedorSelect')).toHaveLength(1);
    expect(consultas("db.from('financeiro_fornecedores').select('id')")).toBe(1);
    expect(consultas('x\n .from(\n "financeiro_fornecedores"\n )')).toBe(1);
    expect(semComentario('a /* <FornecedorSelect /> */ b')).toBe('a  b');
  });

  it('os cinco pontos usam o campo da Lavoura, com o cliente; nenhum usa mais o seletor antigo nem lê o cadastro para montar lista', () => {
    for (const [arquivo, quantos] of Object.entries(PONTOS)) {
      const fonte = semComentario(ler(arquivo));
      const us = usos(fonte, 'CampoDeFornecedor');
      expect(us, arquivo).toHaveLength(quantos);
      for (const u of us) {
        expect(/\bclienteId=\{/.test(u), arquivo).toBe(true);
        expect(/\bvalue=\{/.test(u) && /\bonChange=\{/.test(u), arquivo).toBe(true);
      }
      expect(fonte, arquivo).not.toContain('FornecedorSelect');
      expect(consultas(fonte), arquivo).toBe(0);
    }
  });

  it('o campo da Lavoura é o DONO pelo leitor único: com o cliente, sem lista do hospedeiro, e o "+" com o cadastro da casa atrás', () => {
    const fonte = semComentario(ler('src/components/shared/CampoDeFornecedor.tsx'));
    const dono = usos(fonte, 'FavorecidoSelect');
    expect(dono).toHaveLength(1);
    expect(dono[0]).toContain('clienteId={clienteId}');
    expect(/\bfornecedores=\{/.test(dono[0])).toBe(false);
    expect(dono[0]).toContain('onSelected={(f) => onChange(f.id, f.nome)}');
    expect(dono[0]).toContain('linhaDoDocumento={false}');
    expect(fonte).toContain('<NovoFornecedorDialog');
    expect(fonte).toContain('criarFornecedorDaCasa(clienteId, { nome, cpfCnpj })');
    /* o que já existia (mesmo nome, reativado, dono do documento) também volta escolhido, com id e nome */
    expect(fonte).toContain('onSelecionar={(f) => onChange(f.id, f.nome)}');
    expect(consultas(fonte)).toBe(0);
    expect(fonte).not.toContain("from '@/integrations/supabase/client'");
  });

  it('o nome do parceiro do barter é o entregue pelo seletor, no mesmo gesto do id — nenhuma segunda leitura', () => {
    const fonte = semComentario(ler('src/pages/AgriBarterTab.tsx'));
    expect(fonte).toContain("onChange={(id, n) => { setParceiroId(id ?? ''); setParceiroNome(n ?? ''); }}");
    expect(fonte.match(/setParceiroNome\(/g)).toHaveLength(4);   // o seletor, os dois limpar (abrir e fechar) e o "Editar contrato" (da lista)
    expect(consultas(fonte)).toBe(0);
    /* a carga: id e nome da indústria no mesmo objeto, do mesmo gesto */
    const carga = semComentario(ler('src/components/agri/CargaMandiocaModal.tsx'));
    expect(carga).toContain('onChange({ ...form, industriaId: id, industriaNome: nome, valorBruto: null })');
  });

  it('o id que cada modal guarda é o que o campo entrega (o do escolhido), sem troca no caminho', () => {
    const carga = semComentario(ler('src/components/agri/CargaMandiocaModal.tsx'));
    expect(carga).toContain('value={form.industriaId}');
    expect(carga).toContain('value={s.fornecedor_id}');
    expect(carga).toContain('onChange={id => mudarServico(tipo, { fornecedor_id: id })}');
    const local = semComentario(ler('src/components/agri/LocalEstoqueModal.tsx'));
    expect(local).toContain("<CampoDeFornecedor value={fornecedorId || null}");
    expect(local).toContain("onChange={id => setFornecedorId(id ?? '')}");
    expect(local).toContain("fornecedor_id: tipo === 'terceiro' ? (fornecedorId || null) : null,");
    const venda = semComentario(ler('src/components/agri/VendaGraosModal.tsx'));
    expect(venda).toContain("<CampoDeFornecedor value={compradorId || null}");
    expect(venda).toContain("onChange={id => setCompradorId(id ?? '')}");
    expect(venda).toContain('comprador_id: compradorId,');
    const barter = semComentario(ler('src/pages/AgriBarterTab.tsx'));
    expect(barter).toContain('value={parceiroId || null}');
    expect(barter).toContain('await abrir(parceiroId, nome.trim(), fazendaContratoId,');
  });

  it('o arquivo do seletor antigo ainda existe, mas ninguém mais o importa (fatia 2e)', () => {
    const varrer = (dir: string, achados: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const c = join(dir, e.name);
        if (e.isDirectory()) varrer(c, achados);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) achados.push(c);
      }
      return achados;
    };
    const quemImporta = varrer(resolve(process.cwd(), 'src'))
      .filter((c) => /from '@\/components\/shared\/FornecedorSelect'/.test(readFileSync(c, 'utf8')))
      .map((c) => c.split('/src/')[1]).sort();
    /* fatia 2e: os cinco de Pecuária legado e meta também saíram — ninguém mais importa o seletor antigo (ele sai no passo 4) */
    expect(quemImporta).toEqual([]);
  });
});
