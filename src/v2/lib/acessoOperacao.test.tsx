/**
 * ACESSOS-OC-02 — A OPERAÇÃO COMERCIAL TEM TELA PRÓPRIA (`operacao-comercial`): o mesmo hospedeiro (`LancamentosTab`), em modo
 * "somente operação"; a lista cria OC; "Excluir definitivamente" é só do admin e "Reabrir mês…" só de quem tem o fechamento.
 * ⚠ O `V2Index` e o `LancamentosTab` não se montam em teste (o método do ACESSOS-02a): a rota e o modo são lidos da FONTE; as
 *   peças que se montam (a lista, o "Reabrir mês…", os atalhos) são exercitadas. O acesso em si está em `acessoTelas.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'gestor_cliente' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'cli-1', nome: 'Cliente', perfil: quem.perfil } }),
}));
const como = (perfil: string | null, isAdmin = false) => { quem.perfil = perfil; quem.isAdmin = isAdmin; };
beforeEach(() => como('gestor_cliente'));

function construtor() {
  const resposta = { data: [], error: null };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
  b.then = (ok: (v: typeof resposta) => unknown) => Promise.resolve(resposta).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => construtor(), rpc: vi.fn() } }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: '__global__', nome: 'Global' }, isGlobal: true }) }));
vi.mock('@/hooks/useOperacaoComercial', () => ({ useOperacaoComercial: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/operacao-comercial/central/ResumoOperacoesModal', () => ({ ResumoOperacoesModal: () => null }));

import { CentralOperacoesComerciais, MOTIVO_EXCLUIR_SO_ADMIN } from '@/components/operacao-comercial/central/CentralOperacoesComerciais';
import { ReabrirMesNaOC, MOTIVO_REABRIR_SEM_FECHAMENTO } from '@/components/operacao-comercial/ReabrirMesNaOC';
import { OPCOES_ATALHO_PRODUCAO, opcoesDoAtalho, saiDoLancarComOC } from '@/v2/lib/atalhosProducao';
import { nivelDaTela } from '@/v2/lib/acessoTelas';
import { TELA_OPERACAO_COMERCIAL, rotuloDaSecao } from '@/v2/lib/navGrupos';

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('a rota (V2Index, lida da FONTE): toda OC abre na tela própria dela', () => {
  const rota = fonte('src/v2/V2Index.tsx');
  it('a seção tem nome na barra e não é a de lançamentos do rebanho', () => {
    expect(TELA_OPERACAO_COMERCIAL).toBe('operacao-comercial');
    expect(rotuloDaSecao(TELA_OPERACAO_COMERCIAL)).toEqual({ area: 'Produção', secao: 'Operação Comercial' });
  });
  it('abrir uma OC existente (lista, ícone e menu de Lançamentos, modal do lançamento, drill): `abrirOperacaoOC` troca para a tela da operação', () => {
    expect(rota).toMatch(/retorno: retorno \?\? sectionRef\.current \?\? undefined, sub, \}\); setSearchParams\(p, \{ replace: true \}\); setSection\(TELA_OPERACAO_COMERCIAL\); \}, \[setSearchParams\]\);/);
    /* nenhuma abertura de OC troca mais para a tela do rebanho por conta própria */
    expect(rota.match(/setSection\(TELA_OPERACAO_COMERCIAL\)/g)).toHaveLength(1);
  });
  it('a URL `?oc_compra=1` abre nela; `?oc_id` segue pela lista, que abre pela mesma função', () => {
    expect(rota).toContain("if (qs.get('oc_compra') === '1') return TELA_OPERACAO_COMERCIAL;");
    expect(rota).toContain("if (qs.get('oc_id')) return 'operacoes-comerciais';");
    expect(rota).toContain("onAbrirOperacao={(ocId, tipo) => abrirOperacaoOC(ocId, undefined, tipo, 'operacoes-comerciais')}");
  });
  it('a seção monta o MESMO hospedeiro em modo "somente operação", com o fecho que devolve à origem', () => {
    expect(rota).toContain("if (section === TELA_OPERACAO_COMERCIAL) return ( <V2LancamentosWrapper somenteOperacao cenariosPermitidos={['realizado']} onFecharOperacaoOC={fecharOperacaoOC} /> );");
    expect(rota).toContain('somenteOperacao={somenteOperacao}');
    /* o fechar não mudou: origem conhecida, senão a lista */
    expect(rota).toContain("setSection(ehSectionConhecida(retorno) ? retorno : 'operacoes-comerciais');");
  });
  it('OC NOVA: as três funções de sempre; pedida dos cards do rebanho fica lá, pedida da lista vai para a tela da operação', () => {
    expect(rota).toContain("function telaDaOCNova(origem: V2Section): V2Section { return origem === 'lancamentos-zoot' ? 'lancamentos-zoot' : TELA_OPERACAO_COMERCIAL; }");
    expect(rota.match(/setSection\(telaDaOCNova\(origem\)\);/g)).toHaveLength(3);
    expect(rota).toContain('onNovaCompra={abrirNovaCompraOC} onNovaVenda={abrirNovaVendaOC} onNovoAbate={abrirNovoAbateOC}');
  });
  it('em `lancamentos-zoot` nada mudou: o hospedeiro sem o modo, com os três cards ligados às mesmas funções', () => {
    expect(rota).toContain("if (section === 'lancamentos-zoot') return ( <V2LancamentosWrapper abateParaEditar={abateParaEditar}");
    expect(rota).toContain('onNovaCompraOC={abrirNovaCompraOC} onNovaVendaOC={abrirNovaVendaOC} onNovoAbateOC={abrirNovoAbateOC}');
  });
  it('o cabeçalho "Lançar movimentação" e os atalhos de importação por foto não são desenhados no modo', () => {
    expect(rota).toContain("{!somenteOperacao && ( <div className=\"px-4 pt-3 pb-[2px]\">");
    expect(rota).toContain('{mostrarCardsIA && !somenteOperacao && (');
  });
});

describe('o modo "somente operação" (LancamentosTab, lido da FONTE): montar e esconder', () => {
  const tab = fonte('src/pages/LancamentosTab.tsx');
  it('os cards de lançamento, o banner do master lock, o aviso de fazenda sem pecuária e o voltar da conciliação não são desenhados', () => {
    expect(tab).toContain('{!somenteOperacao && renderTipoCards()}');
    expect(tab).toContain('{!somenteOperacao && data && <MasterLockBanner');
    expect(tab).toContain("if ( !somenteOperacao && isAdministrativo && (aba === 'entrada' || aba === 'saida' || aba === 'reclassificacao') ) {");
    expect(tab).toContain("{!somenteOperacao && onBackToConciliacao && aba !== 'reclassificacao' && (");
    /* a busca sabe achar: os cards continuam sendo desenhados no retorno bloqueado da tela do rebanho */
    expect(tab.match(/renderTipoCards\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('os três modais são os de sempre, no mesmo arquivo — nada foi extraído', () => {
    for (const m of ['<AbateModalShell', '<VendaModalShell', '<CompraModalShell {...compraFormApi} />']) expect(tab).toContain(m);
    expect(tab).toContain('somenteOperacao = false }: Props) {');
  });
  it('OC nova: UMA função para os três cards e para a abertura pela URL — nenhuma lógica duplicada', () => {
    expect(tab).toContain("const abrirOCNova = useCallback((tipoDaOC: 'compra' | 'venda' | 'abate') => { resetContextoOC(); setTipo(tipoDaOC); setLancModalOpen(true); }, [resetContextoOC]);");
    for (const t of ['venda', 'abate', 'compra']) expect(tab).toContain(`abrirOCNova('${t}'); return;`);
    expect(tab.match(/resetContextoOC\(\); setTipo\(/g)).toHaveLength(1);
    expect(tab).toContain('if (!somenteOperacao || !tipoDaOCNaUrl || ocIdParam || ocNovaAbertaRef.current) return; ocNovaAbertaRef.current = true; abrirOCNova(tipoDaOCNaUrl);');
  });
  it('a tela nunca fica vazia: sem OC na URL ao montar, ou com a OC recusada na hidratação, o fecho devolve o usuário', () => {
    expect(tab).toContain('const semOCNaMontagemRef = useRef(somenteOperacao && !tipoDaOCNaUrl);');
    expect(tab).toContain('if (semOCNaMontagemRef.current) { semOCNaMontagemRef.current = false; onFecharOperacaoOC?.(); }');
    expect(tab).toContain('if (somenteOperacao && onFecharOperacaoOC) { ocHidratadoRef.current = null; ocHidratandoRef.current = false; onFecharOperacaoOC(); return; }');
    expect(tab).toContain('{somenteOperacao && !lancModalOpen && ( <div className="flex items-center gap-3 py-6 text-[12px] text-muted-foreground" data-testid="operacao-abrindo">');
  });
});

describe('a faixa de atalhos de Produção (M7): atalho para tela sem acesso não é oferecido', () => {
  const pode = (perfil: string | null, isAdmin: boolean) => opcoesDoAtalho((s) => nivelDaTela(perfil, isAdmin, s) !== 'nao').map((o) => o.valor);
  it('admin: as três de sempre, na ordem', () => {
    expect(pode('admin_agroinblue', true)).toEqual(OPCOES_ATALHO_PRODUCAO.map((o) => o.valor));
  });
  it('gestor e financeiro: só a própria lista — e com uma opção só a faixa some (a rota exige mais de uma)', () => {
    expect(pode('gestor_cliente', false)).toEqual(['operacoes-comerciais']);
    expect(pode('financeiro', false)).toEqual(['operacoes-comerciais']);
    expect(fonte('src/v2/V2Index.tsx')).toContain("const opcoes = opcoesDoAtalho((s) => nivelDaTela(perfilAcesso, isAdmin, s) !== 'nao'); return ativa && opcoes.length > 1 ? (");
  });
  it('sair da tela da operação com uma OC na URL limpa os `oc_*`, como já era em "Lançar movimentação"', () => {
    expect(saiDoLancarComOC(TELA_OPERACAO_COMERCIAL, 'financeiro-lanc', '?oc_venda=1&oc_id=x')).toBe(true);
    expect(saiDoLancarComOC('lancamentos-zoot', 'operacoes-comerciais', '?oc_compra=1')).toBe(true);
    expect(saiDoLancarComOC(TELA_OPERACAO_COMERCIAL, TELA_OPERACAO_COMERCIAL, '?oc_venda=1')).toBe(false);
    expect(saiDoLancarComOC('operacoes-comerciais', TELA_OPERACAO_COMERCIAL, '?oc_venda=1&oc_id=x')).toBe(false);
    expect(saiDoLancarComOC(TELA_OPERACAO_COMERCIAL, 'financeiro-lanc', '?fano=2026')).toBe(false);
  });
});

describe('a lista de Operações Comerciais: criar OC e excluir', () => {
  const montar = (props: Parameters<typeof CentralOperacoesComerciais>[0] = {}) => {
    window.history.replaceState(null, '', '/');
    return render(<BrowserRouter><CentralOperacoesComerciais {...props} /></BrowserRouter>);
  };
  it('M6 — "Nova compra", "Nova venda" e "Novo abate": cada botão chama a função do seu tipo, uma vez', async () => {
    const [compra, venda, abate] = [vi.fn(), vi.fn(), vi.fn()];
    montar({ onNovaCompra: compra, onNovaVenda: venda, onNovoAbate: abate });
    await waitFor(() => expect(screen.getByTestId('nova-compra')).toBeInTheDocument());
    expect(['nova-compra', 'nova-venda', 'novo-abate'].map((t) => screen.getByTestId(t).textContent?.trim())).toEqual(['Nova compra', 'Nova venda', 'Novo abate']);
    fireEvent.click(screen.getByTestId('nova-venda'));
    expect([compra.mock.calls.length, venda.mock.calls.length, abate.mock.calls.length]).toEqual([0, 1, 0]);
    fireEvent.click(screen.getByTestId('nova-compra'));
    fireEvent.click(screen.getByTestId('novo-abate'));
    expect([compra.mock.calls.length, venda.mock.calls.length, abate.mock.calls.length]).toEqual([1, 1, 1]);
  });
  it('ACESSOS-OC-03a — financeiro: cria compra e venda; "Novo abate" apagado com o motivo escrito, e o clique nao dispara', async () => {
    como('financeiro');
    const [compra, venda, abate] = [vi.fn(), vi.fn(), vi.fn()];
    montar({ onNovaCompra: compra, onNovaVenda: venda, onNovoAbate: abate });
    await waitFor(() => expect(screen.getByTestId('nova-compra')).toBeInTheDocument());
    expect(screen.getByTestId('nova-compra').hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('nova-venda').hasAttribute('disabled')).toBe(false);
    const b = screen.getByTestId('novo-abate');
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(b.getAttribute('title')).toBe('Abate e boitel: edição pelo financeiro chega na próxima etapa.');
    expect(screen.getByTestId('motivo-nova-oc').textContent).toBe('Abate e boitel: edição pelo financeiro chega na próxima etapa.');
    fireEvent.click(b);
    fireEvent.click(screen.getByTestId('nova-compra'));
    expect([compra.mock.calls.length, venda.mock.calls.length, abate.mock.calls.length]).toEqual([1, 0, 0]);
  });
  it('ACESSOS-OC-03a — gestor e admin: os tres habilitados e nenhum motivo escrito', async () => {
    for (const [p, adm] of [['gestor_cliente', false], ['admin_agroinblue', true]] as const) {
      como(p, adm);
      const r = montar({ onNovaCompra: vi.fn(), onNovaVenda: vi.fn(), onNovoAbate: vi.fn() });
      await waitFor(() => expect(screen.getByTestId('novo-abate')).toBeInTheDocument());
      for (const t of ['nova-compra', 'nova-venda', 'novo-abate']) expect(screen.getByTestId(t).hasAttribute('disabled')).toBe(false);
      expect(screen.queryByTestId('motivo-nova-oc')).toBeNull();
      r.unmount();
    }
  });
  it('sem as funções (quem monta a lista sem criar), os botões não existem', async () => {
    montar();
    await waitFor(() => expect(screen.getByText('Operações Comerciais')).toBeInTheDocument());
    for (const t of ['nova-compra', 'nova-venda', 'novo-abate']) expect(screen.queryByTestId(t)).toBeNull();
  });
  it('M8 — "Excluir definitivamente": habilitado só para o admin; para os demais, apagado com o motivo exato (fonte)', () => {
    const lista = fonte('src/components/operacao-comercial/central/CentralOperacoesComerciais.tsx');
    expect(MOTIVO_EXCLUIR_SO_ADMIN).toBe('só o administrador exclui definitivamente');
    expect(lista).toContain("{r.status_comercial === 'cancelada' && (acessoOC.excluir_definitivo ? ( <DropdownMenuItem className=\"text-destructive focus:text-destructive\" data-testid=\"excluir-definitivamente\" onSelect={() => { setExcluirMotivo(''); setExcluirEtapa(1); setExcluirAlvo(r); }}>");
    expect(lista).toContain(') : ( <ItemDeMenuOC testid="excluir-definitivamente" texto="Excluir definitivamente" motivo={MOTIVO_EXCLUIR_SO_ADMIN} /> ))}');
    /* o único caminho que arma a exclusão é o do admin */
    expect(lista.match(/setExcluirAlvo\(r\)/g)).toHaveLength(1);
  });
});

describe('M9 — "Reabrir mês…" de dentro da OC', () => {
  for (const forma of ['botao', 'link'] as const) {
    it(`${forma} · admin (tem o fechamento): habilitado, sem motivo, e o clique abre`, () => {
      como('admin_agroinblue', true);
      const abrir = vi.fn();
      render(<ReabrirMesNaOC forma={forma} onAbrir={abrir} />);
      const b = screen.getByTestId('reabrir-mes');
      expect(b).toHaveProperty('disabled', false);
      expect(b.getAttribute('title')).toBeNull();
      expect(screen.queryByTestId('reabrir-mes-motivo')).toBeNull();
      fireEvent.click(b);
      expect(abrir).toHaveBeenCalledTimes(1);
    });
    it(`${forma} · gestor (não tem a tela do fechamento): apagado com o motivo exato, e o clique não abre`, () => {
      como('gestor_cliente');
      expect(nivelDaTela('gestor_cliente', false, 'fechamento')).toBe('nao');
      const abrir = vi.fn();
      render(<ReabrirMesNaOC forma={forma} onAbrir={abrir} />);
      const b = screen.getByTestId('reabrir-mes');
      expect(b).toHaveProperty('disabled', true);
      expect(b.getAttribute('title')).toBe('só quem fecha o mês pode reabrir');
      expect(screen.getByTestId('reabrir-mes-motivo').textContent).toContain(MOTIVO_REABRIR_SEM_FECHAMENTO);
      fireEvent.click(b);
      expect(abrir).not.toHaveBeenCalled();
    });
  }
  it('os três modais usam a mesma peça, e é ela quem arma o diálogo', () => {
    expect(fonte('src/components/abate/AbateModalShell.tsx')).toContain('<ReabrirMesNaOC forma="botao" onAbrir={() => setReabrirP1Aberto(true)} />');
    for (const f of ['src/components/venda/VendaModalShell.tsx', 'src/components/compra/CompraModalShell.tsx']) {
      const s = fonte(f);
      expect(s).toContain('<ReabrirMesNaOC forma="link" onAbrir={() => setReabrirP1Aberto(true)} />');
      expect(s.match(/setReabrirP1Aberto\(true\)/g)).toHaveLength(1);
    }
  });
});
