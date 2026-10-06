/**
 * ACESSOS-02a — o acesso a tela tem UM dono (`nivelDaTela`): a marca `liberadaClientes` do menu + a matriz perfil × grupo.
 * Aqui: a funcao (marca, matriz, admin, perfil nulo), o MENU (lateral, drawer, barra do celular) consultando o dono, a TELA
 * INICIAL de quem nao tem a Visão Geral, a pagina de sem acesso e a guarda da ROTA — esta lida da FONTE do `V2Index`, que nao se
 * monta em teste (o mesmo metodo do `LancamentosTab`).
 * ⚠ O perfil financeiro nao se prova no navegador com o login do admin: fica provado aqui.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { NAV_GRUPOS, HOME_LIBERADA_CLIENTES, OPERACAO_COMERCIAL_LIBERADA_CLIENTES, TELA_OPERACAO_COMERCIAL, type V2Section } from './navGrupos';
import { MATRIZ_ACESSO, NIVEL_POR_TELA, TELAS_DO_FINANCEIRO, TELA_DE_ENTRADA_PREFERIDA, gruposVisiveis, nivelDaTela, primeiraTelaPermitida, secoesVisiveis } from './acessoTelas';
import { V2Sidebar } from '@/v2/components/V2Sidebar';
import { V2ContextDrawer } from '@/v2/components/V2ContextDrawer';
import { V2MobileNav } from '@/v2/components/V2MobileNav';
import V2SemAcesso from '@/v2/pages/V2SemAcesso';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'financeiro' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'c1', nome: 'Cliente', perfil: quem.perfil } }),
}));
vi.mock('@/components/AlterarSenhaDialog', () => ({ AlterarSenhaDialog: () => null }));
vi.mock('@/assets/logo.png', () => ({ default: 'logo.png' }));

const como = (perfil: string | null, isAdmin = false) => { quem.perfil = perfil; quem.isAdmin = isAdmin; };
beforeEach(() => como('financeiro'));

const PILOTO: V2Section[] = ['financeiro-lanc', 'conciliacao', 'contas-a-pagar-receber'];
const PERFIS = ['gestor_cliente', 'financeiro', 'campo', 'leitura'] as const;
/* ACESSOS-FIN-01 — o que o gestor e o financeiro veem no menu, na ORDEM do menu (ids e rotulos escritos a' mao, de proposito). */
const PRODUCAO_FIN: V2Section[] = ['lancamentos-zoot', 'fechamento', 'conferencia-lancamentos', 'operacoes-comerciais', 'estoque-graos', 'barter-contratos'];
const FINANCEIRO_FIN: V2Section[] = ['financeiro-lanc', 'conciliacao', 'visao-consolidada', 'financiamentos', 'contratos', 'recorrencias',
  'fluxo-caixa', 'contas-a-pagar-receber', 'painel-financiamentos'];
const EXECUTIVO_FIN: V2Section[] = ['painel-consultor', 'valor-rebanho', 'dre'];
const CADASTROS_FIN: V2Section[] = ['contas-bancarias', 'fornecedores'];
const ROTULOS_PRODUCAO_FIN = ['Pecuária', 'Fechamento Área', 'Lançamentos', 'Operações Comerciais', 'Estoque de Grãos', 'Barter'];
const ROTULOS_FINANCEIRO_FIN = ['Lançamentos Financeiros', 'Conciliação Bancária', 'Visão Consolidada', 'Financ. e Parcelamentos', 'Contratos',
  'Recorrências', 'Fluxo Caixa', 'Contas a Pagar/Receber', 'Painel Financiamentos'];
const todosOsItens = NAV_GRUPOS.flatMap((g) => g.drawer.flatMap((s) => s.itens.map((i) => ({ grupo: g.id, item: i }))));

describe('a marca de liberacao (navGrupos)', () => {
  it('as telas liberadas: as tres do piloto, a lista de Operações Comerciais (ACESSOS-OC-01) e as 16 do ACESSOS-FIN-01; a Visão Geral NAO', () => {
    expect(todosOsItens.filter((x) => x.item.liberadaClientes).map((x) => x.item.id)).toEqual([...PRODUCAO_FIN, ...FINANCEIRO_FIN, ...EXECUTIVO_FIN, ...CADASTROS_FIN]);
    expect(todosOsItens.filter((x) => x.item.liberadaClientes).length).toBe(3 + 1 + 16);
    /* nenhuma tela de Planejamento, Auditoria ou Validar tem a marca */
    expect(todosOsItens.filter((x) => x.item.liberadaClientes && ['planejamento', 'auditoria', 'validar'].includes(x.grupo))).toEqual([]);
    /* toda tela marcada fora do piloto tem linha propria no mapa por tela (marca sem linha cairia na matriz do grupo) */
    for (const x of todosOsItens.filter((y) => y.item.liberadaClientes && !PILOTO.includes(y.item.id))) expect(Object.keys(NIVEL_POR_TELA)).toContain(x.item.id);
    /* a tela propria da operacao nao e' item de menu: a marca dela mora ao lado da da home */
    expect(OPERACAO_COMERCIAL_LIBERADA_CLIENTES).toBe(true);
    expect(todosOsItens.some((x) => x.item.id === TELA_OPERACAO_COMERCIAL)).toBe(false);
    expect(HOME_LIBERADA_CLIENTES).toBe(false);
    /* a busca sabe achar: o menu tem dezenas de itens sem a marca */
    expect(todosOsItens.filter((x) => !x.item.liberadaClientes).length).toBeGreaterThan(30);
  });
});

describe('a matriz perfil × grupo (aprovada em 16/09/2026)', () => {
  it('a matriz inteira, celula por celula', () => {
    expect(MATRIZ_ACESSO).toEqual({
      home:         { gestor_cliente: 'ver',    financeiro: 'ver',    campo: 'ver',    leitura: 'ver' },
      rebanho:      { gestor_cliente: 'editar', financeiro: 'ver',    campo: 'editar', leitura: 'ver' },
      financeiro:   { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao',    leitura: 'ver' },
      planejamento: { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao',    leitura: 'ver' },
      executivo:    { gestor_cliente: 'ver',    financeiro: 'ver',    campo: 'nao',    leitura: 'ver' },
      auditoria:    { gestor_cliente: 'ver',    financeiro: 'ver',    campo: 'nao',    leitura: 'ver' },
      cadastros:    { gestor_cliente: 'editar', financeiro: 'editar', campo: 'nao',    leitura: 'ver' },
      validar:      { gestor_cliente: 'nao',    financeiro: 'nao',    campo: 'nao',    leitura: 'nao' },
    });
  });
  it('todo grupo do menu tem linha na matriz (grupo novo sem linha ficaria invisivel calado)', () => {
    for (const g of NAV_GRUPOS) expect(Object.keys(MATRIZ_ACESSO)).toContain(g.id);
  });
});

describe('nivelDaTela', () => {
  it('admin do AGROinBLUE: editar em TUDO — menu inteiro, Validar, home e telas fora do menu', () => {
    for (const { item } of todosOsItens) expect(nivelDaTela('admin_agroinblue', true, item.id)).toBe('editar');
    for (const t of ['home', 'configuracoes', 'config-clientes', 'validar-precos', 'pastos'] as const) expect(nivelDaTela(null, true, t)).toBe('editar');
  });
  it('nao admin: tela SEM a marca e nao, qualquer que seja o perfil', () => {
    const semMarca = todosOsItens.filter((x) => !x.item.liberadaClientes).map((x) => x.item.id);
    for (const p of PERFIS) for (const t of semMarca) expect(nivelDaTela(p, false, t)).toBe('nao');
    /* fora do menu (rota interna, legado, drill) tambem */
    for (const p of PERFIS) for (const t of ['home', 'configuracoes', 'config-bancario', 'extrato-gerencial', 'importacao-extratos', 'saldos-mensais'] as const) {
      expect(nivelDaTela(p, false, t)).toBe('nao');
    }
  });
  it('tela liberada: o nivel e o da matriz para o grupo dela', () => {
    for (const t of PILOTO) {
      expect(nivelDaTela('gestor_cliente', false, t)).toBe('editar');
      expect(nivelDaTela('financeiro', false, t)).toBe('editar');
      expect(nivelDaTela('campo', false, t)).toBe('nao');
      expect(nivelDaTela('leitura', false, t)).toBe('ver');
    }
  });
  it('perfil desconhecido, vazio ou nulo: nao em tudo — inclusive nas liberadas; "admin_agroinblue" sem isAdmin nao e admin', () => {
    for (const p of [null, undefined, '', 'dono', 'admin_agroinblue']) for (const t of PILOTO) expect(nivelDaTela(p, false, t)).toBe('nao');
  });
});

describe('a excecao por tela (NIVEL_POR_TELA) — ACESSOS-OC-01', () => {
  const TELAS_DA_OC: V2Section[] = ['operacoes-comerciais', TELA_OPERACAO_COMERCIAL];
  it('a lista e a tela da operacao: gestor e financeiro editam (ACESSOS-OC-03a); campo e leitura, nao; admin, editar', () => {
    for (const t of TELAS_DA_OC) {
      expect(nivelDaTela('gestor_cliente', false, t)).toBe('editar');
      expect(nivelDaTela('financeiro', false, t)).toBe('editar');
      expect(nivelDaTela('campo', false, t)).toBe('nao');
      expect(nivelDaTela('leitura', false, t)).toBe('nao');
      expect(nivelDaTela('admin_agroinblue', true, t)).toBe('editar');
      for (const p of [null, undefined, '', 'dono']) expect(nivelDaTela(p, false, t)).toBe('nao');
    }
  });
  it('a excecao VENCE a matriz do grupo: no grupo `rebanho` o financeiro veria e o campo editaria', () => {
    expect(MATRIZ_ACESSO.rebanho).toEqual({ gestor_cliente: 'editar', financeiro: 'ver', campo: 'editar', leitura: 'ver' });
    expect(Object.keys(NIVEL_POR_TELA).sort()).toEqual([...TELAS_DA_OC, ...TELAS_DO_FINANCEIRO].sort());
  });
  it('o resto do grupo `rebanho` continua fechado: as vizinhas sem a marca seguem "nao" para todo perfil', () => {
    for (const p of PERFIS) for (const t of ['mapa-pastos', 'rebanho-home', 'chuvas', 'chuvas-lancamento', 'conferencia-mensal', 'pastos', 'lancamentos-meta-zoo'] as const) {
      expect(nivelDaTela(p, false, t)).toBe('nao');
    }
  });
  it('a excecao nao libera tela sem a marca (a marca continua sendo a primeira porta)', () => {
    /* a busca sabe achar: a mesma funcao devolve "editar" para a tela liberada do mesmo mapa */
    expect(nivelDaTela('gestor_cliente', false, 'operacoes-comerciais')).toBe('editar');
    expect(nivelDaTela('gestor_cliente', false, 'mapa-pastos')).toBe('nao');
  });
});

/* ═══ ACESSOS-FIN-01 — as telas do trabalho do financeiro (Gabriel, 06/10/2026) ═══════════════════════════════════════════ */
describe('ACESSOS-FIN-01 — perfil × tela', () => {
  const AS_16: Array<[rotulo: string, tela: V2Section]> = [
    ['Financ. e Parcelamentos', 'financiamentos'], ['Contratos', 'contratos'], ['Recorrências', 'recorrencias'],
    ['Painel Financiamentos', 'painel-financiamentos'], ['Pecuária', 'lancamentos-zoot'], ['Lançamentos', 'conferencia-lancamentos'],
    ['Fornecedores', 'fornecedores'], ['Contas Bancárias', 'contas-bancarias'], ['Fechamento Área', 'fechamento'],
    ['Evolução Patrimonial', 'valor-rebanho'], ['DRE', 'dre'], ['PC-100', 'painel-consultor'], ['Estoque de Grãos', 'estoque-graos'],
    ['Barter', 'barter-contratos'], ['Visão Consolidada', 'visao-consolidada'], ['Fluxo Caixa', 'fluxo-caixa'],
  ];
  it('a lista do dono sao as 16 do briefing, e cada id e o item de menu com aquele rotulo (um so)', () => {
    expect(AS_16).toHaveLength(16);
    expect([...TELAS_DO_FINANCEIRO].sort()).toEqual(AS_16.map(([, t]) => t).sort());
    for (const [rotulo, tela] of AS_16) {
      const itens = todosOsItens.filter((x) => x.item.id === tela);
      expect(`${tela}:${itens.length}:${itens[0]?.item.label}:${itens[0]?.item.liberadaClientes}`).toBe(`${tela}:1:${rotulo}:true`);
    }
  });
  it('16 telas × 4 perfis: gestor e financeiro editam; campo e leitura, nao; admin edita; perfil nulo ou desconhecido, nao', () => {
    for (const [, t] of AS_16) {
      expect(`${t}:${PERFIS.map((p) => nivelDaTela(p, false, t)).join(',')}`).toBe(`${t}:editar,editar,nao,nao`);
      expect(nivelDaTela('admin_agroinblue', true, t)).toBe('editar');
      for (const p of [null, undefined, '', 'dono', 'admin_agroinblue']) expect(nivelDaTela(p, false, t)).toBe('nao');
    }
  });
  it('a excecao da TELA vence a matriz nos dois sentidos: da "editar" ao financeiro onde o grupo so mostraria, e tira o campo das cinco de Produção', () => {
    /* a matriz NAO mudou: no rebanho o campo editaria e o financeiro so' veria; no executivo o financeiro so' veria */
    expect(MATRIZ_ACESSO.rebanho.campo).toBe('editar');
    expect(MATRIZ_ACESSO.rebanho.financeiro).toBe('ver');
    expect(MATRIZ_ACESSO.executivo.financeiro).toBe('ver');
    for (const t of ['lancamentos-zoot', 'conferencia-lancamentos', 'fechamento', 'estoque-graos', 'barter-contratos'] as const) {
      expect(nivelDaTela('campo', false, t)).toBe('nao');
      expect(nivelDaTela('financeiro', false, t)).toBe('editar');
    }
    for (const t of EXECUTIVO_FIN) expect(nivelDaTela('financeiro', false, t)).toBe('editar');
  });
  it('CONTINUA FECHADO para o financeiro, tela a tela: todo o Planejamento, toda a Auditoria, todo o Validar e os Cadastros fora de Fornecedores e Contas Bancárias', () => {
    const doGrupo = (g: string) => todosOsItens.filter((x) => x.grupo === g).map((x) => x.item.id);
    /* a busca sabe achar: os grupos tem itens */
    expect(doGrupo('planejamento').length).toBeGreaterThan(3);
    expect(doGrupo('auditoria').length).toBeGreaterThan(3);
    expect(doGrupo('validar').length).toBeGreaterThan(2);
    for (const g of ['planejamento', 'auditoria', 'validar']) for (const t of doGrupo(g)) {
      for (const p of PERFIS) expect(`${t}/${p}:${nivelDaTela(p, false, t)}`).toBe(`${t}/${p}:nao`);
    }
    const cadastros = doGrupo('cadastros');
    expect(cadastros.length).toBe(9);
    for (const t of cadastros) expect(`${t}:${nivelDaTela('financeiro', false, t)}`).toBe(`${t}:${CADASTROS_FIN.includes(t) ? 'editar' : 'nao'}`);
    /* as telas de META fora do menu tambem */
    for (const t of ['fluxo-caixa-meta', 'lancamentos-meta-fin', 'lancamentos-meta-zoo', 'meta-cenario', 'meta-precos'] as const) expect(nivelDaTela('financeiro', false, t)).toBe('nao');
  });
  it('o CAMPO nao abre tela NENHUMA — do menu inteiro e das telas fora dele', () => {
    for (const { item } of todosOsItens) expect(`${item.id}:${nivelDaTela('campo', false, item.id)}`).toBe(`${item.id}:nao`);
    for (const t of ['home', 'configuracoes', TELA_OPERACAO_COMERCIAL, 'fluxo-caixa-meta'] as const) expect(nivelDaTela('campo', false, t)).toBe('nao');
    expect(gruposVisiveis('campo', false)).toEqual([]);
    expect(primeiraTelaPermitida('campo', false)).toBeNull();
  });
  it('o LEITURA segue so com as tres do piloto, em "ver" — nenhuma das 16 (o efeito de "ver" ainda nao existe)', () => {
    const doLeitura = todosOsItens.filter((x) => nivelDaTela('leitura', false, x.item.id) !== 'nao').map((x) => x.item.id);
    expect(doLeitura).toEqual(PILOTO);
    for (const t of PILOTO) expect(nivelDaTela('leitura', false, t)).toBe('ver');
  });
  it('MENU, DRAWER e ROTA dizem a mesma coisa: o item aparece no drawer exatamente quando a rota abre a tela', () => {
    for (const p of PERFIS) for (const g of NAV_GRUPOS) {
      const noDrawer = secoesVisiveis(p, false, g).flatMap((s) => s.itens.map((i) => i.id));
      const naRota = g.drawer.flatMap((s) => s.itens.map((i) => i.id)).filter((t) => nivelDaTela(p, false, t) !== 'nao');
      expect(noDrawer).toEqual(naRota);
      expect(gruposVisiveis(p, false).some((x) => x.id === g.id)).toBe(naRota.length > 0);
    }
  });
});

describe('o que o menu oferece (gruposVisiveis / secoesVisiveis)', () => {
  it('financeiro (ACESSOS-FIN-01): Produção, Financeiro, Executivo e Cadastros, com exatamente as telas dele — sem Planejamento, Auditoria e Validar', () => {
    const grupos = gruposVisiveis('financeiro', false);
    expect(grupos.map((g) => g.id)).toEqual(['rebanho', 'financeiro', 'executivo', 'cadastros']);
    const itens = (i: number) => secoesVisiveis('financeiro', false, grupos[i]).flatMap((s) => s.itens.map((x) => x.id));
    expect(itens(0)).toEqual(PRODUCAO_FIN);
    expect(itens(1)).toEqual(FINANCEIRO_FIN);
    expect(itens(2)).toEqual(EXECUTIVO_FIN);
    expect(itens(3)).toEqual(CADASTROS_FIN);
  });
  it('leitura ve^ so as tres do piloto; o GESTOR ve^ o mesmo menu do financeiro; campo e perfil nulo, nenhuma', () => {
    const doLeitura = gruposVisiveis('leitura', false);
    expect(doLeitura.map((g) => g.id)).toEqual(['financeiro']);
    expect(secoesVisiveis('leitura', false, doLeitura[0]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(PILOTO);
    const doGestor = gruposVisiveis('gestor_cliente', false);
    expect(doGestor.map((g) => g.id)).toEqual(['rebanho', 'financeiro', 'executivo', 'cadastros']);
    expect(secoesVisiveis('gestor_cliente', false, doGestor[0]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(PRODUCAO_FIN);
    expect(secoesVisiveis('gestor_cliente', false, doGestor[1]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(FINANCEIRO_FIN);
    expect(gruposVisiveis('campo', false)).toEqual([]);
    expect(gruposVisiveis(null, false)).toEqual([]);
  });
  it('admin: todos os grupos e todos os itens, na ordem do NAV_GRUPOS', () => {
    const grupos = gruposVisiveis('admin_agroinblue', true);
    expect(grupos).toEqual(NAV_GRUPOS);
    for (const g of NAV_GRUPOS) expect(secoesVisiveis('admin_agroinblue', true, g)).toEqual(g.drawer);
  });
  it('a tela inicial NAO MUDOU com o ACESSOS-FIN-01: financeiro, leitura e o GESTOR caem em Lançamentos Financeiros (a preferida), nao na primeira do menu ("Lançar › Pecuária"); campo nao tem nenhuma; admin, a Visão Geral', () => {
    /* a busca sabe achar: a primeira do menu deles e' outra, e so' a preferida os mantem onde estavam */
    expect(PRODUCAO_FIN[0]).toBe('lancamentos-zoot');
    expect(nivelDaTela('financeiro', false, PRODUCAO_FIN[0])).toBe('editar');
    expect(TELA_DE_ENTRADA_PREFERIDA).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('financeiro', false)).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('gestor_cliente', false)).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('leitura', false)).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('campo', false)).toBeNull();
    expect(primeiraTelaPermitida(null, false)).toBeNull();
    expect(primeiraTelaPermitida('admin_agroinblue', true)).toBe('home');
  });
  it('sem a tela preferida, vale a primeira permitida na ordem do menu', () => {
    // prova de que a busca sabe achar: o gestor NAO tem 'mapa-pastos', e a primeira dele no menu e' "Lançar › Pecuária"
    expect(nivelDaTela('gestor_cliente', false, 'mapa-pastos')).toBe('nao');
    expect(primeiraTelaPermitida('gestor_cliente', false, 'mapa-pastos')).toBe('lancamentos-zoot');
    expect(primeiraTelaPermitida('financeiro', false, 'mapa-pastos')).toBe('lancamentos-zoot');
    expect(primeiraTelaPermitida('leitura', false, 'mapa-pastos')).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('campo', false, 'mapa-pastos')).toBeNull();
    expect(primeiraTelaPermitida('admin_agroinblue', true, 'mapa-pastos')).toBe('home');
  });
});

const lateral = () => render(<V2Sidebar activeSection="financeiro-lanc" onNavigate={vi.fn()} onDrawerToggle={vi.fn()} />);
const botoesDaLateral = () => within(screen.getByRole('navigation')).getAllByRole('button').map((b) => b.textContent?.trim());
const itensDoDrawer = (grupo: string) => {
  const { container, unmount } = render(<V2ContextDrawer grupoAtivo={grupo} activeSection="financeiro-lanc" onSelect={vi.fn()} onClose={vi.fn()} />);
  const r = { itens: Array.from(container.querySelectorAll('nav button, nav [aria-disabled="true"]')).map((b) => b.querySelector('span')?.textContent ?? ''),
    secoes: Array.from(container.querySelectorAll('nav [role="group"]')).map((s) => s.getAttribute('aria-label') ?? '') };
  unmount();
  return r;
};

describe('a lateral (V2Sidebar)', () => {
  it('financeiro (ACESSOS-FIN-01): Produção, Financeiro, Executivo e Cadastros — sem Visão Geral, sem Configurações, sem Planejamento, Auditoria e Validar', () => {
    lateral();
    expect(botoesDaLateral()).toEqual(['Produção', 'Financeiro', 'Executivo', 'Cadastros']);
    expect(itensDoDrawer('rebanho').itens).toEqual(ROTULOS_PRODUCAO_FIN);
  });
  it('leitura: so o grupo Financeiro', () => {
    como('leitura');
    lateral();
    expect(botoesDaLateral()).toEqual(['Financeiro']);
  });
  it('gestor: os mesmos quatro grupos e as mesmas telas do financeiro — ACESSOS-FIN-01', () => {
    como('gestor_cliente');
    lateral();
    expect(botoesDaLateral()).toEqual(['Produção', 'Financeiro', 'Executivo', 'Cadastros']);
    expect(itensDoDrawer('rebanho').itens).toEqual(ROTULOS_PRODUCAO_FIN);
    expect(itensDoDrawer('financeiro').itens).toEqual(ROTULOS_FINANCEIRO_FIN);
  });
  it('campo: nenhum item', () => {
    como('campo');
    lateral();
    expect(within(screen.getByRole('navigation')).queryAllByRole('button')).toEqual([]);
  });
  it('admin: tudo como antes — Visão Geral, todos os grupos na ordem, Configurações', () => {
    como('admin_agroinblue', true);
    lateral();
    expect(botoesDaLateral()).toEqual(['Visão Geral', ...NAV_GRUPOS.map((g) => g.label), 'Configurações']);
  });
});

describe('o drawer (V2ContextDrawer)', () => {
  it('financeiro, grupo Financeiro: exatamente as nove telas dele; a secao continua com o cabecalho dela', () => {
    const d = itensDoDrawer('financeiro');
    expect(d.itens).toEqual(ROTULOS_FINANCEIRO_FIN);
    expect(d.secoes).toEqual(['Operação', 'Gestão']);
  });
  it('financeiro, Executivo e Cadastros: so as telas dele', () => {
    expect(itensDoDrawer('executivo').itens).toEqual(['PC-100', 'Evolução Patrimonial', 'DRE']);
    expect(itensDoDrawer('cadastros').itens).toEqual(['Contas Bancárias', 'Fornecedores']);
  });
  it('leitura, grupo Financeiro: as tres do piloto, como antes', () => {
    como('leitura');
    expect(itensDoDrawer('financeiro').itens).toEqual(['Lançamentos Financeiros', 'Conciliação Bancária', 'Contas a Pagar/Receber']);
  });
  it('financeiro, grupo sem tela liberada (aberto por fora do menu): nenhuma secao, nenhum item', () => {
    for (const g of ['validar', 'planejamento', 'auditoria']) expect(itensDoDrawer(g)).toEqual({ itens: [], secoes: [] });
  });
  it('admin: todo grupo com todos os itens, como no NAV_GRUPOS', () => {
    como('admin_agroinblue', true);
    for (const g of NAV_GRUPOS) {
      expect(itensDoDrawer(g.id).itens).toEqual(g.drawer.flatMap((s) => s.itens.map((i) => i.label)));
    }
  });
});

describe('a barra do celular (V2MobileNav)', () => {
  it('nao admin: nenhuma aba dela e de tela liberada — a barra some', () => {
    const { container } = render(<V2MobileNav activeSection="financeiro-lanc" onNavigate={vi.fn()} />);
    expect(container.querySelector('nav')).toBeNull();
  });
  it('admin: as cinco abas de sempre', () => {
    como('admin_agroinblue', true);
    render(<V2MobileNav activeSection="home" onNavigate={vi.fn()} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Home', 'Operação', 'Plan.', 'PC-100', 'Mais']);
  });
});

describe('a pagina de sem acesso (V2SemAcesso)', () => {
  it('com tela permitida: diz que nao ha acesso e leva a primeira permitida', () => {
    const ir = vi.fn();
    render(<V2SemAcesso primeira={{ rotulo: 'Lançamentos Financeiros', ir }} />);
    expect(screen.getByText('Você não tem acesso a esta tela')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para Lançamentos Financeiros' }));
    expect(ir).toHaveBeenCalledTimes(1);
  });
  it('sem nenhuma tela permitida: o texto do administrador, e nenhum botao', () => {
    render(<V2SemAcesso primeira={null} />);
    expect(screen.getByText('Nenhuma tela liberada para o seu perfil. Fale com o administrador.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('a rota (V2Index, lida da FONTE) e a decisao que ela consulta', () => {
  const fonte = readFileSync('src/v2/V2Index.tsx', 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('a decisao: secao nao liberada com perfil financeiro = sem acesso; liberada = a tela', () => {
    const semAcesso = (perfil: string | null, isAdmin: boolean, s: V2Section) => nivelDaTela(perfil, isAdmin, s) === 'nao';
    for (const s of ['home', 'mapa-pastos', 'meta-cenario', 'plano-contas', 'auditoria-anual', 'configuracoes', 'validar-precos', 'fluxo-caixa-meta'] as const) {
      expect(semAcesso('financeiro', false, s)).toBe(true);
      expect(semAcesso('admin_agroinblue', true, s)).toBe(false);
    }
    for (const s of [...PILOTO, 'operacoes-comerciais', TELA_OPERACAO_COMERCIAL, ...TELAS_DO_FINANCEIRO] as const) expect(semAcesso('financeiro', false, s)).toBe(false);
    /* para o campo, toda tela do financeiro segue sem acesso */
    for (const s of [...PILOTO, ...TELAS_DO_FINANCEIRO] as const) expect(semAcesso('campo', false, s)).toBe(true);
    for (const s of ['operacoes-comerciais', TELA_OPERACAO_COMERCIAL] as const) expect(semAcesso('leitura', false, s)).toBe(true);
  });
  it('um ponto so de decisao: `renderContent()` e chamada UMA vez, e so no ramo de quem tem acesso', () => {
    expect(fonte.match(/renderContent\(\)/g)).toHaveLength(2);          // a declaracao e a UNICA chamada
    expect(fonte).toContain("const semAcesso = nivelDaTela(perfilAcesso, isAdmin, section) === 'nao';");
    expect(fonte.replace(/\s+/g, ' ')).toMatch(/\{semAcesso \? \( <V2SemAcesso primeira=\{primeiraPermitida \? \{ rotulo: rotuloDaSecao\(primeiraPermitida\)\.secao, ir: \(\) => navegarPeloMenu\(primeiraPermitida\) \} : null\} \/> \) : renderContent\(\)\}/);
  });
  it('a tela inicial: o efeito leva a primeira permitida quem esta na home (e so quem esta nela), e nao mexe com o admin', () => {
    const f = fonte.replace(/\s+/g, ' ');
    expect(f).toContain("if (isAdmin || !primeiraPermitida || primeiraPermitida === 'home') return;");
    expect(f).toContain("if (sectionRef.current === 'home') setSection(primeiraPermitida);");
    expect(f).toContain('}, [clienteAtual?.id, perfilAcesso, isAdmin, primeiraPermitida]);');
  });
  it('sem acesso, a barra nao oferece o atalho nem a sub-navegacao do Financeiro', () => {
    const f = fonte.replace(/\s+/g, ' ');
    expect(f).toContain('if (semAcesso) return undefined;');
    /* ACESSOS-FIN-01 — a faixa so' oferece as telas que a pessoa abre, e some se sobrar so' a propria */
    expect(f).toContain('{!semAcesso && SUBNAV_FINANCEIRO.some((o) => o.id === section) && SUBNAV_FINANCEIRO.filter((o) => podeAbrirTela(o.id)).length > 1 && (');
    expect(f).toContain('{SUBNAV_FINANCEIRO.filter((o) => podeAbrirTela(o.id)).map(({ id, label }) => (');
    expect(f).toContain("const podeAbrirTela = (s: V2Section): boolean => nivelDaTela(perfilAcesso, isAdmin, s) !== 'nao';");
    /* das quatro da faixa o financeiro so' tem o Fluxo Caixa: para ele a faixa some; para o admin, as quatro */
    const DA_FAIXA = ['financeiro-dashboard', 'fluxo-caixa', 'rateio-adm', 'importacao-extratos'] as const;
    for (const id of DA_FAIXA) expect(f).toContain(`{ id: '${id}',`);
    expect(DA_FAIXA.filter((s) => nivelDaTela('financeiro', false, s) !== 'nao')).toEqual(['fluxo-caixa']);
    expect(DA_FAIXA.filter((s) => nivelDaTela(null, true, s) !== 'nao')).toHaveLength(4);
  });
  it('nenhum componente decide por conta propria: menu e rota so importam o dono', () => {
    for (const arq of ['src/v2/components/V2Sidebar.tsx', 'src/v2/components/V2ContextDrawer.tsx', 'src/v2/components/V2MobileNav.tsx', 'src/v2/V2Index.tsx']) {
      /* sem os comentarios: eles NOMEIAM a marca e a matriz para dizer de quem sao */
      const src = readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src).toContain("from '@/v2/lib/acessoTelas'");
      expect(src).not.toContain('liberadaClientes');
      expect(src).not.toContain('MATRIZ_ACESSO');
    }
  });
});
