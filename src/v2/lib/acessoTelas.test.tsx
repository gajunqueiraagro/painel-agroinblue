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
import { MATRIZ_ACESSO, NIVEL_POR_TELA, TELA_DE_ENTRADA_PREFERIDA, gruposVisiveis, nivelDaTela, primeiraTelaPermitida, secoesVisiveis } from './acessoTelas';
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
const todosOsItens = NAV_GRUPOS.flatMap((g) => g.drawer.flatMap((s) => s.itens.map((i) => ({ grupo: g.id, item: i }))));

describe('a marca de liberacao (navGrupos)', () => {
  it('as telas liberadas: as tres do piloto (Financeiro) e, desde o ACESSOS-OC-01, a lista de Operações Comerciais; a Visão Geral NAO', () => {
    expect(todosOsItens.filter((x) => x.item.liberadaClientes).map((x) => x.item.id)).toEqual(['operacoes-comerciais', ...PILOTO]);
    expect(todosOsItens.filter((x) => x.item.liberadaClientes && x.grupo !== 'financeiro').map((x) => x.item.id)).toEqual(['operacoes-comerciais']);
    /* a tela propria da operacao nao e' item de menu: a marca dela mora ao lado da da home */
    expect(OPERACAO_COMERCIAL_LIBERADA_CLIENTES).toBe(true);
    expect(todosOsItens.some((x) => x.item.id === TELA_OPERACAO_COMERCIAL)).toBe(false);
    expect(HOME_LIBERADA_CLIENTES).toBe(false);
    /* a busca sabe achar: o menu tem dezenas de itens sem a marca */
    expect(todosOsItens.filter((x) => !x.item.liberadaClientes).length).toBeGreaterThan(40);
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
    expect(Object.keys(NIVEL_POR_TELA).sort()).toEqual([...TELAS_DA_OC].sort());
  });
  it('o resto do grupo `rebanho` continua fechado: a tela de lancamentos do rebanho e as vizinhas seguem "nao" para todo perfil', () => {
    for (const p of PERFIS) for (const t of ['lancamentos-zoot', 'conferencia-lancamentos', 'fechamento', 'mapa-pastos', 'rebanho-home', 'chuvas'] as const) {
      expect(nivelDaTela(p, false, t)).toBe('nao');
    }
  });
  it('a excecao nao libera tela sem a marca (a marca continua sendo a primeira porta)', () => {
    /* a busca sabe achar: a mesma funcao devolve "editar" para a tela liberada do mesmo mapa */
    expect(nivelDaTela('gestor_cliente', false, 'operacoes-comerciais')).toBe('editar');
    expect(nivelDaTela('gestor_cliente', false, 'lancamentos-zoot')).toBe('nao');
  });
});

describe('o que o menu oferece (gruposVisiveis / secoesVisiveis)', () => {
  it('financeiro: Produção com um item so (Operações Comerciais, ACESSOS-OC-03a) e Financeiro com exatamente as tres telas', () => {
    const grupos = gruposVisiveis('financeiro', false);
    expect(grupos.map((g) => g.id)).toEqual(['rebanho', 'financeiro']);
    expect(secoesVisiveis('financeiro', false, grupos[0]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(['operacoes-comerciais']);
    expect(secoesVisiveis('financeiro', false, grupos[1]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(PILOTO);
  });
  it('leitura ve^ as mesmas tres; o GESTOR ganha Produção com um item so, Operações Comerciais (ACESSOS-OC-01); campo e perfil nulo, nenhuma', () => {
    expect(gruposVisiveis('leitura', false).map((g) => g.id)).toEqual(['financeiro']);
    const doGestor = gruposVisiveis('gestor_cliente', false);
    expect(doGestor.map((g) => g.id)).toEqual(['rebanho', 'financeiro']);
    expect(secoesVisiveis('gestor_cliente', false, doGestor[0]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(['operacoes-comerciais']);
    expect(secoesVisiveis('gestor_cliente', false, doGestor[1]).flatMap((s) => s.itens.map((i) => i.id))).toEqual(PILOTO);
    expect(gruposVisiveis('campo', false)).toEqual([]);
    expect(gruposVisiveis(null, false)).toEqual([]);
  });
  it('admin: todos os grupos e todos os itens, na ordem do NAV_GRUPOS', () => {
    const grupos = gruposVisiveis('admin_agroinblue', true);
    expect(grupos).toEqual(NAV_GRUPOS);
    for (const g of NAV_GRUPOS) expect(secoesVisiveis('admin_agroinblue', true, g)).toEqual(g.drawer);
  });
  it('a tela inicial: financeiro, leitura e o GESTOR caem em Lançamentos Financeiros (a preferida), nao em Operações Comerciais; campo nao tem nenhuma; admin, a Visão Geral', () => {
    expect(TELA_DE_ENTRADA_PREFERIDA).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('financeiro', false)).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('gestor_cliente', false)).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('leitura', false)).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('campo', false)).toBeNull();
    expect(primeiraTelaPermitida(null, false)).toBeNull();
    expect(primeiraTelaPermitida('admin_agroinblue', true)).toBe('home');
  });
  it('sem a tela preferida, vale a primeira permitida na ordem do menu', () => {
    // prova de que a busca sabe achar: o gestor NAO tem 'lancamentos-zoot', e a primeira dele no menu e' a lista de OCs
    expect(nivelDaTela('gestor_cliente', false, 'lancamentos-zoot')).toBe('nao');
    expect(primeiraTelaPermitida('gestor_cliente', false, 'lancamentos-zoot')).toBe('operacoes-comerciais');
    expect(primeiraTelaPermitida('financeiro', false, 'lancamentos-zoot')).toBe('operacoes-comerciais');
    expect(primeiraTelaPermitida('leitura', false, 'lancamentos-zoot')).toBe('financeiro-lanc');
    expect(primeiraTelaPermitida('campo', false, 'lancamentos-zoot')).toBeNull();
    expect(primeiraTelaPermitida('admin_agroinblue', true, 'lancamentos-zoot')).toBe('home');
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
  it('financeiro: Produção (so com Operações Comerciais, ACESSOS-OC-03a) e Financeiro — sem Visão Geral, sem Configurações, sem os outros grupos', () => {
    lateral();
    expect(botoesDaLateral()).toEqual(['Produção', 'Financeiro']);
    expect(itensDoDrawer('rebanho').itens).toEqual(['Operações Comerciais']);
  });
  it('leitura: so o grupo Financeiro', () => {
    como('leitura');
    lateral();
    expect(botoesDaLateral()).toEqual(['Financeiro']);
  });
  it('gestor: Produção (so com Operações Comerciais) e Financeiro — ACESSOS-OC-01', () => {
    como('gestor_cliente');
    lateral();
    expect(botoesDaLateral()).toEqual(['Produção', 'Financeiro']);
    expect(itensDoDrawer('rebanho').itens).toEqual(['Operações Comerciais']);
    expect(itensDoDrawer('financeiro').itens).toEqual(['Lançamentos Financeiros', 'Conciliação Bancária', 'Contas a Pagar/Receber']);
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
  it('financeiro, grupo Financeiro: exatamente as tres telas; a secao continua com o cabecalho dela', () => {
    const d = itensDoDrawer('financeiro');
    expect(d.itens).toEqual(['Lançamentos Financeiros', 'Conciliação Bancária', 'Contas a Pagar/Receber']);
    expect(d.secoes).toEqual(['Operação', 'Gestão']);
  });
  it('financeiro, grupo sem tela liberada (aberto por fora do menu): nenhuma secao, nenhum item', () => {
    for (const g of ['cadastros', 'executivo', 'validar', 'planejamento']) expect(itensDoDrawer(g)).toEqual({ itens: [], secoes: [] });
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
    for (const s of ['home', 'lancamentos-zoot', 'financiamentos', 'fornecedores', 'configuracoes', 'validar-precos'] as const) {
      expect(semAcesso('financeiro', false, s)).toBe(true);
      expect(semAcesso('admin_agroinblue', true, s)).toBe(false);
    }
    for (const s of [...PILOTO, 'operacoes-comerciais', TELA_OPERACAO_COMERCIAL] as const) expect(semAcesso('financeiro', false, s)).toBe(false);
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
    expect(f).toContain("{!semAcesso && ['financeiro-dashboard', 'fluxo-caixa', 'rateio-adm', 'importacao-extratos'].includes(section) && (");
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
