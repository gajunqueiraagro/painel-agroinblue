/**
 * ACESSOS-02b (M2) — ATALHO PARA TELA SEM ACESSO NAO E' OFERECIDO: ele some, e a informacao da linha fica.
 * O ajudante (`usePodeAbrir`), as duas pecas que se montam em teste (a celula da OC do "sem caixa" e o rodape do modal) e os pontos
 * da lista e do modal, LIDOS DA FONTE — o `FinanceiroV2Tab` nao se monta em teste (o metodo do `finV2HomologFix01.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { usePodeAbrir, usePodeAbrirRotaSoAdmin, TELA_DA_OPERACAO } from '@/v2/hooks/usePodeAbrir';
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
  it('financeiro: abre as tres do piloto, a lista e a tela da OC e, desde o ACESSOS-FIN-01, "Lançar › Pecuária" e Financiamentos; NAO abre as vizinhas sem a marca', () => {
    expect(pode('financeiro-lanc')).toBe(true);
    expect(pode('conciliacao')).toBe(true);
    expect(pode('contas-a-pagar-receber')).toBe(true);
    expect(pode('lancamentos-zoot')).toBe(true);
    expect(pode(TELA_DA_OPERACAO)).toBe(true);
    expect(pode('operacoes-comerciais')).toBe(true);
    expect(pode('financiamentos')).toBe(true);
    expect(pode('fechamento')).toBe(true);
    /* os destinos das saidas tratadas no ACESSOS-FIN-01: nenhum e' dele */
    for (const t of ['chuvas-lancamento', 'conferencia-mensal', 'mapa-pastos', 'home', 'financeiro-dashboard', 'rateio-adm', 'importacao-extratos'] as const) {
      expect(`${t}:${pode(t)}`).toBe(`${t}:false`);
    }
    /* quem segue de fora da OC: leitura e campo */
    for (const p of ['leitura', 'campo']) { como(p); expect(pode(TELA_DA_OPERACAO)).toBe(false); expect(pode('operacoes-comerciais')).toBe(false); }
  });
  it('gestor: abre a lista e a tela propria da OC (ACESSOS-OC-01) e, desde o ACESSOS-FIN-01, "Lançar › Pecuária" e Financiamentos; as vizinhas sem a marca seguem fechadas', () => {
    como('gestor_cliente');
    expect(TELA_DA_OPERACAO).toBe('operacao-comercial');
    expect(pode(TELA_DA_OPERACAO)).toBe(true);
    expect(pode('operacoes-comerciais')).toBe(true);
    expect(pode('lancamentos-zoot')).toBe(true);
    expect(pode('financiamentos')).toBe(true);
    for (const t of ['chuvas-lancamento', 'conferencia-mensal', 'mapa-pastos', 'home'] as const) expect(`${t}:${pode(t)}`).toBe(`${t}:false`);
  });
  it('rota fora do V2 (`/caderno-importacao`): so o admin — o espelho declarado do `SoAdmin`', () => {
    const podeRota = () => renderHook(() => usePodeAbrirRotaSoAdmin()).result.current;
    for (const p of ['financeiro', 'gestor_cliente', 'campo', 'leitura', null]) { como(p); expect(`${p}:${podeRota()}`).toBe(`${p}:false`); }
    como('admin_agroinblue', true);
    expect(podeRota()).toBe(true);
    /* a guarda que ele espelha: a mesma condicao, e a rota do caderno dentro dela */
    const rotas = readFileSync('src/AppRouter.tsx', 'utf8');
    expect(rotas).toContain('return isAdmin ? <>{children}</> : <Navigate to="/" replace />;');
    expect(rotas).toContain('<Route path="/caderno-importacao" element={<SoAdmin><CadernoImportTab /></SoAdmin>} />');
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

/* ═══ ACESSOS-FIN-01 — as saidas das telas que passaram a ser do gestor e do financeiro ═══════════════════════════════════ */
describe('ACESSOS-FIN-01 — as saidas das telas liberadas (V2Index, lido da FONTE): um caso por ponto', () => {
  const rota = fonte('src/v2/V2Index.tsx');
  it('o dono e consultado num lugar so, e nenhum `if` de perfil entra na rota', () => {
    expect(rota).toContain("const podeAbrirTela = (s: V2Section): boolean => nivelDaTela(perfilAcesso, isAdmin, s) !== 'nao';");
    expect(rota).not.toMatch(/perfil === '|perfilAcesso ===|=== 'financeiro'|=== 'gestor_cliente'/);
  });
  it('"Lançar movimentação": o cartao "Movimentações por foto" (rota so do admin) so se desenha para quem a abre', () => {
    expect(rota).toContain('const podeAbrirCaderno = usePodeAbrirRotaSoAdmin();');
    expect(rota).toContain(`{podeAbrirCaderno && ( <button type="button" data-testid="atalho-caderno-importacao" onClick={() => navigate('/caderno-importacao', { state: { from: 'v2-lancamentos-zoot' } })}`);
    /* um caminho so' para o caderno nesta tela */
    expect(rota.match(/navigate\('\/caderno-importacao'/g)).toHaveLength(1);
  });
  it('"Lançar movimentação": o cartao Chuvas so recebe o callback com a tela de destino — e sem callback o cartao nao existe (LancamentosTab)', () => {
    expect(rota).toContain("onNavegarChuvas={podeAbrirTela('chuvas-lancamento') ? () => setSection('chuvas-lancamento') : undefined}");
    expect(fonte('src/pages/LancamentosTab.tsx')).toContain(".filter(it => !it.navOnly || (it.value === 'chuvas' && !!onNavegarChuvas))");
  });
  it('"Fechamento Área": "Conferência do GMD" e "Mapa de Pastos" so recebem o callback com a tela de destino — e sem callback o botao nao existe (FechamentoTab)', () => {
    expect(rota).toContain("onNavigateToConferenciaGmd={podeAbrirTela('conferencia-mensal') ? (filtro) => {");
    expect(rota).toContain("onNavigateToMapaPastos={podeAbrirTela('mapa-pastos') ? (filtro) => {");
    const fech = fonte('src/pages/FechamentoTab.tsx');
    expect(fech).toContain('{onNavigateToConferenciaGmd && ( <Button');
    expect(fech).toContain('{onNavigateToMapaPastos && ( <Button');
    /* os outros dois destinos do Fechamento sao telas dele: ficam */
    expect(rota).toContain("onNavigateToValorRebanho={(filtro) => {");
    expect(rota).toContain("onNavigateToReclass={(filtro) => {");
  });
  it('PC-100: a seta de voltar leva a Visão Geral e so existe para quem a tem', () => {
    expect(rota).toContain("onBack={podeAbrirTela('home') ? () => setSection('home') : undefined}");
    const pc = fonte('src/pages/PainelConsultorTab.tsx');
    expect(pc).toContain('onBack?: () => void;');
    expect(pc).toContain('{onBack && ( <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7" data-testid="pc100-voltar">');
  });
});
