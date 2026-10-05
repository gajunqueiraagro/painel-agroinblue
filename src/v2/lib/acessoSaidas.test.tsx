/**
 * ACESSOS-02b (M2) — ATALHO PARA TELA SEM ACESSO NAO E' OFERECIDO: ele some, e a informacao da linha fica.
 * O ajudante (`usePodeAbrir`), as duas pecas que se montam em teste (a celula da OC do "sem caixa" e o rodape do modal) e os pontos
 * da lista e do modal, LIDOS DA FONTE — o `FinanceiroV2Tab` nao se monta em teste (o metodo do `finV2HomologFix01.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { usePodeAbrir, TELA_DA_OPERACAO } from '@/v2/hooks/usePodeAbrir';
import { CelulaOC } from '@/components/financeiro-v2/SecaoSemCaixa';
import { RodapeCancelamento } from '@/components/financeiro-v2/RodapeCancelamento';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'financeiro' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'c1', perfil: quem.perfil } }),
}));
const como = (perfil: string | null, isAdmin = false) => { quem.perfil = perfil; quem.isAdmin = isAdmin; };
beforeEach(() => como('financeiro'));

describe('usePodeAbrir — so consulta o dono', () => {
  const pode = (tela: Parameters<typeof usePodeAbrir>[0]) => renderHook(() => usePodeAbrir(tela)).result.current;
  it('financeiro: abre as tres do piloto e, desde o ACESSOS-OC-03a, a lista e a tela da OC; NAO abre a tela do rebanho nem Financiamentos', () => {
    expect(pode('financeiro-lanc')).toBe(true);
    expect(pode('conciliacao')).toBe(true);
    expect(pode('contas-a-pagar-receber')).toBe(true);
    expect(pode('lancamentos-zoot')).toBe(false);
    expect(pode(TELA_DA_OPERACAO)).toBe(true);
    expect(pode('operacoes-comerciais')).toBe(true);
    expect(pode('financiamentos')).toBe(false);
    /* quem segue de fora da OC: leitura e campo */
    for (const p of ['leitura', 'campo']) { como(p); expect(pode(TELA_DA_OPERACAO)).toBe(false); expect(pode('operacoes-comerciais')).toBe(false); }
  });
  it('gestor (ACESSOS-OC-01): abre a lista e a tela propria da OC — os atalhos do 02b voltam para ele; a tela do rebanho segue fechada', () => {
    como('gestor_cliente');
    expect(TELA_DA_OPERACAO).toBe('operacao-comercial');
    expect(pode(TELA_DA_OPERACAO)).toBe(true);
    expect(pode('operacoes-comerciais')).toBe(true);
    expect(pode('lancamentos-zoot')).toBe(false);
    expect(pode('financiamentos')).toBe(false);
  });
  it('admin: abre tudo; perfil nulo: nada', () => {
    como('admin_agroinblue', true);
    expect(pode('lancamentos-zoot')).toBe(true);
    expect(pode('financiamentos')).toBe(true);
    como(null);
    expect(pode('financeiro-lanc')).toBe(false);
  });
});

const OC = { operacaoId: '1940de90-e156-4d42-b5cd-243d112858dc', tipo: 'venda' };
const celula = (onAbrir?: (id: string, tipo?: string | null) => void) =>
  render(<table><tbody><tr><CelulaOC oc={OC as never} onAbrir={onAbrir} /></tr></tbody></table>);

describe('a celula da OC na secao "sem caixa" (SecaoSemCaixa)', () => {
  it('com acesso: o codigo e um botao que abre a OC, como antes', () => {
    const abrir = vi.fn();
    celula(abrir);
    fireEvent.click(screen.getByRole('button'));
    expect(abrir).toHaveBeenCalledWith(OC.operacaoId, 'venda');
  });
  it('sem acesso: o CODIGO da OC continua na linha, sem botao', () => {
    const { container } = celula(undefined);
    expect(screen.queryByRole('button')).toBeNull();
    const codigo = screen.getByTestId('codigo-oc').textContent ?? '';
    expect(codigo.length).toBeGreaterThan(3);
    /* a mesma informacao que o botao mostrava */
    container.remove();
    celula(vi.fn());
    expect(screen.getByRole('button').textContent).toBe(codigo);
  });
});

describe('o rodape do modal do lancamento (RodapeCancelamento)', () => {
  const titulo = { operacaoId: OC.operacaoId, tipo: 'venda' };
  it('com acesso: a frase do bloqueio e o "Abrir OC →"', () => {
    const abrir = vi.fn();
    render(<RodapeCancelamento tituloOC={titulo} bloqueioRebanho={false} onCancelar={vi.fn()} onAbrirOC={abrir} />);
    fireEvent.click(screen.getByText('Abrir OC →'));
    expect(abrir).toHaveBeenCalledWith(OC.operacaoId, 'venda');
  });
  it('sem acesso: a frase do bloqueio FICA (o lancamento e de uma OC), o atalho sai', () => {
    render(<RodapeCancelamento tituloOC={titulo} bloqueioRebanho={false} onCancelar={vi.fn()} />);
    expect(screen.getByTestId('cancelar-titulo-oc').textContent?.length ?? 0).toBeGreaterThan(20);
    expect(screen.queryByText('Abrir OC →')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('a lista de lancamentos (FinanceiroV2Tab, lida da FONTE): um caso por ponto', () => {
  const tela = fonte('src/pages/FinanceiroV2Tab.tsx');
  it('o ajudante e chamado uma vez por tela de destino, no topo — nenhum `if` de perfil nos pontos', () => {
    expect(tela).toContain('const podeAbrirOC = usePodeAbrir(TELA_DA_OPERACAO);');
    expect(tela).toContain("const podeAbrirFinanciamento = usePodeAbrir('financiamentos');");
    expect(tela).not.toMatch(/perfil === '|isAdmin/);
  });
  it('icone do produto: sem acesso vira a MARCA da OC (mesmo icone, mesmo rotulo de origem), sem botao; com acesso, o botao de antes', () => {
    expect(tela).toMatch(/if \(!podeAbrirOC\) return \( <Tooltip> <TooltipTrigger asChild> <span data-testid="marca-oc"[^>]*> <Beef [^>]*\/> <\/span> <\/TooltipTrigger> <TooltipContent>\{rotuloOrigemOC\(oc\)\}<\/TooltipContent> <\/Tooltip> \);/);
    expect(tela).toContain('<button type="button" data-testid="icone-oc" onClick={e => { e.stopPropagation(); abrirOCFinanceiro(oc.operacaoId, oc.tipo); }}');
  });
  it('"Abrir OC" do menu da linha: so com acesso', () => {
    expect(tela).toContain('{podeAbrirOC && lancamentosComOC.get(l.id) && ( <DropdownMenuItem data-testid="menu-abrir-oc"');
  });
  it('"Ver contrato" da parcela de financiamento: so com acesso; o 🏦 da linha nao depende dele', () => {
    expect(tela).toContain('{isParcelaFinanciamento ? ( podeAbrirFinanciamento ? ( <DropdownMenuItem data-testid="menu-ver-contrato" onClick={() => abrirFinanciamentoDaParcela(l)}>');
    expect(tela).toContain('{isParcelaFinanciamento && <span className="mr-1" title="Parcela de financiamento">🏦</span>}');
  });
  it('"Criar OC a partir deste lançamento" (abre a OC criada): so com acesso', () => {
    expect(tela).toContain('{podeAbrirOC && podeCriarOCDoLegado(l, !!lancamentosComOC.get(l.id)) && (');
  });
  it('a secao "sem caixa" recebe o atalho so com acesso', () => {
    expect(tela).toContain('onAbrirOC={podeAbrirOC ? abrirOCFinanceiro : undefined}');
  });
});

describe('o modal do lancamento (LancamentoV2Dialog, lido da FONTE)', () => {
  const modal = fonte('src/components/financeiro-v2/LancamentoV2Dialog.tsx');
  it('"Abrir →" e "corrigir na operação": os dois penduram em `operacaoAbrivel`, que agora exige o acesso', () => {
    /* ACESSOS-02c: a tela da operacao tem um nome so' (`TELA_DA_OPERACAO`), o mesmo do ajudante dos gestos */
    expect(modal).toContain('const podeAbrirOC = usePodeAbrir(TELA_DA_OPERACAO);');
    expect(modal).toContain('const operacaoAbrivel = !!operacaoId && !!operacaoTipo && podeAbrirOC;');
    expect(modal.match(/\{operacaoAbrivel && \(/g)).toHaveLength(2);
    /* o aviso que diz que o lancamento e' de uma operacao nao depende do atalho */
    expect(modal).toContain('Classificação pertence à operação.');
  });
  it('"Abrir OC →" do rodape, criar OC do legado e a porta da OC no modal zootecnico: so com acesso', () => {
    expect(modal).toContain('onAbrirOC={podeAbrirOC ? (opId, tipo) => {');
    expect(modal).toContain('parteOCLida && podeAbrirOC && podeCriarOCDoLegado(lancamento, !!parteOCViva) && (');
    expect(modal).toContain('onAbrirOperacao={!podeAbrirOC ? undefined : (ocId, tipo) => {');
  });
});
