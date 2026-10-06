/**
 * ACESSOS-FIN-02 / ACESSOS-FIN-03 — a META dentro das telas liberadas. DUAS perguntas, as duas no dono (`acessoTelas.ts`):
 *   · VER (`podeVerMeta`): admin, gestor e financeiro veem; campo e leitura, nao — para eles a opcao Meta fica APAGADA com o
 *     motivo, nunca sumida, e a linha de meta nao entra na lista;
 *   · EDITAR (`podeEditarMeta`, FIN-03, Gabriel 06/10/2026): SO' o admin. Quem ve^ e nao edita abre em LEITURA, com os gestos de
 *     gravacao apagados e o motivo.
 *
 * ⚠ PC-100, Fluxo Caixa, o DRE e Pecuária › Lançamentos NAO se montam em teste (telas de milhares de linhas, com dezenas de
 *   hooks de dado): os pontos de uso sao LIDOS DA FONTE, um caso por ponto, e o card do DRE (`FaixaVisoesPec`) e' montado em
 *   `src/pages/pecDrePanel.test.tsx`. O perfil nao admin nao se prova no navegador com o login do admin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderHook } from '@testing-library/react';
import { EDITA_META, MOTIVO_META_SO_ADMIN, MOTIVO_SEM_META, VE_META, podeEditarMeta, podeVerMeta } from './acessoTelas';
import { usePodeEditarMeta, usePodeVerMeta } from '@/v2/hooks/usePodeAbrir';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'financeiro' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'c1', perfil: quem.perfil } }),
}));
const como = (perfil: string | null, isAdmin = false) => { quem.perfil = perfil; quem.isAdmin = isAdmin; };
beforeEach(() => como('financeiro'));

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('o dono: quem vê meta', () => {
  it('VER — a linha inteira: gestor e financeiro veem (ACESSOS-FIN-03); campo e leitura, não', () => {
    expect(VE_META).toEqual({ gestor_cliente: true, financeiro: true, campo: false, leitura: false });
    for (const p of ['gestor_cliente', 'financeiro']) expect(`${p}:${podeVerMeta(p, false)}`).toBe(`${p}:true`);
    for (const p of ['campo', 'leitura']) expect(`${p}:${podeVerMeta(p, false)}`).toBe(`${p}:false`);
  });
  it('EDITAR — só o admin: nenhum perfil de cliente edita meta, nem o dono (gestor), nem o financeiro', () => {
    expect(EDITA_META).toEqual({ gestor_cliente: false, financeiro: false, campo: false, leitura: false });
    for (const p of ['gestor_cliente', 'financeiro', 'campo', 'leitura', null, undefined, '', 'dono', 'admin_agroinblue']) {
      expect(`${p}:${podeEditarMeta(p, false)}`).toBe(`${p}:false`);
    }
    expect(podeEditarMeta('admin_agroinblue', true)).toBe(true);
    expect(podeEditarMeta(null, true)).toBe(true);
  });
  it('as duas perguntas são separadas: gestor e financeiro VEEM e NÃO editam', () => {
    for (const p of ['gestor_cliente', 'financeiro']) expect([podeVerMeta(p, false), podeEditarMeta(p, false)]).toEqual([true, false]);
  });
  it('admin: sempre; perfil nulo, vazio ou desconhecido: não — e "admin_agroinblue" sem isAdmin não é admin', () => {
    expect(podeVerMeta('admin_agroinblue', true)).toBe(true);
    expect(podeVerMeta(null, true)).toBe(true);
    for (const p of [null, undefined, '', 'dono', 'admin_agroinblue']) expect(podeVerMeta(p, false)).toBe(false);
  });
  it('os motivos, um para cada pergunta, escritos no dono', () => {
    expect(MOTIVO_SEM_META).toBe('meta: só para quem tem o Planejamento');
    expect(MOTIVO_META_SO_ADMIN).toBe('meta: só o administrador edita');
  });
  it('o ajudante só consulta o dono', () => {
    const ve = () => renderHook(() => usePodeVerMeta()).result.current;
    const edita = () => renderHook(() => usePodeEditarMeta()).result.current;
    expect([ve(), edita()]).toEqual([true, false]);                      // financeiro
    como('gestor_cliente'); expect([ve(), edita()]).toEqual([true, false]);
    como('campo'); expect([ve(), edita()]).toEqual([false, false]);
    como('admin_agroinblue', true); expect([ve(), edita()]).toEqual([true, true]);
    como('gestor_cliente'); expect(ve()).toBe(true);
    como('leitura'); expect(ve()).toBe(false);
    como(null); expect(ve()).toBe(false);
    como('admin_agroinblue', true); expect(ve()).toBe(true);
    const f = fonte('src/v2/hooks/usePodeAbrir.ts');
    expect(f).toContain('export function usePodeVerMeta(): boolean { const { clienteAtual, isAdmin } = useCliente(); return podeVerMeta(clienteAtual?.perfil ?? null, isAdmin); }');
    expect(f).toContain('export function usePodeEditarMeta(): boolean { const { clienteAtual, isAdmin } = useCliente(); return podeEditarMeta(clienteAtual?.perfil ?? null, isAdmin); }');
  });
});

describe('PC-100 (PainelConsultorTab, lido da FONTE): o cenário Realizado | Meta', () => {
  const f = fonte('src/pages/PainelConsultorTab.tsx');
  it('a pergunta é feita ao ajudante, uma vez', () => {
    expect(f.match(/usePodeVerMeta\(\)/g)).toHaveLength(1);
    expect(f).toContain('const veMeta = usePodeVerMeta();');
  });
  it('a opção Meta fica no controle, desabilitada, com o motivo no title — e Realizado nunca é tocado', () => {
    expect(f).toContain("{(['realizado', 'meta'] as Cenario[]).map(c => ( <button key={c} disabled={c === 'meta' && !veMeta} title={c === 'meta' && !veMeta ? MOTIVO_SEM_META : undefined} onClick={() => setCenario(c)}");
    expect(f).toContain("}${c === 'meta' && !veMeta ? ' cursor-not-allowed opacity-50 hover:bg-card' : ''}`}");
  });
  it('a tela nasce em Realizado e o cenário não mora em URL nem em sessionStorage (ninguém chega com "meta" gravado)', () => {
    expect(f).toContain("const [cenario, setCenario] = useState<Cenario>('realizado');");
    expect(f.match(/setCenario\(/g)).toHaveLength(1);
  });
});

describe('Fluxo Caixa (FinanceiroCaixaTab, lido da FONTE): Realizado | META', () => {
  const f = fonte('src/pages/FinanceiroCaixaTab.tsx');
  it('quem não vê meta fica em Realizado mesmo com "meta" pedido — o lado META é a grade do Planejamento', () => {
    expect(f).toContain('const veMeta = usePodeVerMeta();');
    expect(f).toContain("const fluxoCenario: 'realizado' | 'meta' = veMeta ? fluxoCenarioPedido : 'realizado';");
    /* a grade do planejamento só se desenha pelo cenário EFETIVO */
    expect(f).toContain("{fluxoCenario === 'realizado' ? ( <FluxoFinanceiro");
    expect(f).not.toMatch(/fluxoCenarioPedido === /);
  });
  it('a opção META fica no controle, desabilitada, com o motivo no title', () => {
    expect(f).toContain("{(['realizado', 'meta'] as const).map(c => ( <button key={c} disabled={c === 'meta' && !veMeta} title={c === 'meta' && !veMeta ? MOTIVO_SEM_META : undefined} onClick={() => setFluxoCenario(c)}");
  });
});

describe('DRE (AgriDreLavouraTab, lido da FONTE): a referência "Meta"', () => {
  const f = fonte('src/pages/AgriDreLavouraTab.tsx');
  it('quem chega com `f_visao=meta` na URL e não vê meta cai na comparação por anos', () => {
    expect(f).toContain('const veMeta = usePodeVerMeta();');
    expect(f).toContain("const visaoUrl: VisaoUrlPec = !veMeta && visaoUrlLida === 'meta' ? 'comparacao' : visaoUrlLida;");
    /* a referência (e com ela a coluna da meta na grade) sai do valor EFETIVO, nunca do lido */
    expect(f).toContain("const referenciaPec: ReferenciaPec = visaoUrl === 'meta' ? 'meta' : nAnosPec;");
    expect(f.match(/visaoUrlLida/g)).toHaveLength(3);
  });
  it('o card recebe o motivo só para quem não vê meta', () => {
    expect(f).toContain('motivoSemMeta={veMeta ? null : MOTIVO_SEM_META}');
  });
});

describe('Pecuária › Lançamentos (FinanceiroTab e a rota, lidos da FONTE): o filtro Meta e as linhas de meta', () => {
  const f = fonte('src/pages/FinanceiroTab.tsx');
  it('a rota entrega o motivo pelo dono — a lista recebe os lançamentos de todos os cenários', () => {
    const rota = fonte('src/v2/V2Index.tsx');
    expect(rota).toContain('lancamentos={lancamentosTodosCenarios}');
    expect(rota).toContain('motivoSemMeta={podeVerMeta(perfilAcesso, isAdmin) ? null : MOTIVO_SEM_META}');
  });
  it('sem meta, a linha de meta não entra em lista nenhuma (o "todos" as misturava) — filtrada DEPOIS de normalizar', () => {
    expect(f).toContain("() => lancamentos.map(normalizeZooLancamento).filter(l => !motivoSemMeta || l.cenario !== 'meta'),");
    expect(f).toContain('motivoSemMeta = null }: Props) {');
  });
  it('os DOIS controles de status: Meta desabilitado com o motivo no title', () => {
    expect(f.match(/disabled=\{s\.value === 'meta' && !!motivoSemMeta\}/g)).toHaveLength(2);
    expect(f.match(/title=\{s\.value === 'meta' && motivoSemMeta \? motivoSemMeta : undefined\}/g)).toHaveLength(2);
    /* a busca sabe achar: são dois controles de status na tela */
    expect(f.match(/label: 'Meta', activeClass/g)).toHaveLength(2);
  });
  it('quem chega com o filtro em Meta e não vê meta cai em Realizado', () => {
    expect(f).toContain("const statusFiltro: StatusFiltro = motivoSemMeta && statusFiltroPedido === 'meta' ? 'realizado' : statusFiltroPedido;");
  });
});

/* ═══ ACESSOS-FIN-03 — ONDE A META SE EDITA (lido da FONTE: nenhuma das duas telas se monta em teste) ═══════════════════ */
describe('a grade META do Fluxo Caixa (PlanejamentoFinanceiroTab, lida da FONTE): leitura para quem não edita meta', () => {
  const f = fonte('src/pages/PlanejamentoFinanceiroTab.tsx');
  it('a pergunta é feita ao ajudante, uma vez, e vira UMA condição dos pontos de escrita', () => {
    expect(f.match(/usePodeEditarMeta\(\)/g)).toHaveLength(1);
    expect(f).toContain('const editaMeta = usePodeEditarMeta(); const semEdicao = isGlobal || !editaMeta; const motivoSemEdicao = editaMeta ? undefined : MOTIVO_META_SO_ADMIN;');
  });
  it('as DUAS células editáveis da grade só existem fora de `semEdicao` — quem não edita vê texto, sem campo', () => {
    /* a busca sabe achar: a grade tem dois pontos com célula editável */
    expect(f.match(/<EditableCell value=\{v\}/g)).toHaveLength(2);
    expect(f).toContain('{semEdicao || bloqueio.bloqueado || isProjeto ? ( <span');
    expect(f).toContain('{semEdicao || bloqueio.bloqueado ? ( <span');
    /* nenhuma célula editável decidida só pelo Global */
    expect(f).not.toMatch(/\{isGlobal \|\| bloqueio\.bloqueado/);
  });
  it('importar subcentro: o ícone que abre a confirmação só existe para quem edita', () => {
    expect(f).toContain('{!semEdicao && !bloqueio.bloqueado && ( <Download');
    /* a confirmação só se abre por esse ícone */
    expect(f.match(/setImportConfirm\(\{/g)).toHaveLength(1);
  });
  it('os gestos de gravação ficam APAGADOS com o motivo: Salvar, Projetos, Aprovar, Parâmetros, Criar Snapshot e Restaurar', () => {
    expect(f).toContain('<Button size="sm" onClick={handleSave} disabled={saving || semEdicao || !dirty} title={motivoSemEdicao}>');
    expect(f).toContain("<Button size=\"sm\" variant=\"outline\" onClick={() => setProjetosOpen(true)} disabled={!editaMeta} title={motivoSemEdicao ?? 'Projetos de Investimento'}>");
    expect(f).toContain("disabled={semEdicao} title={motivoSemEdicao ?? 'Resumo Executivo para Aprovação'}");
    expect(f).toContain("onClick={() => setNutricaoModalOpen(true)} disabled={!editaMeta} title={motivoSemEdicao ?? 'Parâmetros de Nutrição'}>");
    expect(f).toContain('disabled={snapshotSaving || semEdicao} title={motivoSemEdicao}');
    expect(f).toContain('className="h-6 text-[10px] shrink-0" disabled={!editaMeta} title={motivoSemEdicao} onClick={async () => { await restaurarVersao(v.id);');
  });
  it('o motivo fica ESCRITO na barra da grade para quem não edita', () => {
    expect(f).toContain('{!editaMeta && ( <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground" data-testid="meta-so-admin">');
  });
  it('para o admin nada muda: `semEdicao` é o Global de sempre e os `title` são os de antes', () => {
    /* editaMeta = true -> semEdicao === isGlobal, motivoSemEdicao === undefined -> os `??` devolvem o título de antes */
    expect(f).toContain('const semEdicao = isGlobal || !editaMeta;');
    for (const t of ['Projetos de Investimento', 'Resumo Executivo para Aprovação', 'Parâmetros de Nutrição']) expect(f).toContain(`motivoSemEdicao ?? '${t}'`);
  });
});

describe('a linha de meta em Pecuária › Lançamentos (LancamentoDetalhe, lido da FONTE)', () => {
  const f = fonte('src/components/LancamentoDetalhe.tsx');
  it('a trava de meta, que estava adormecida, lê o dono', () => {
    expect(f).toContain('const editaMeta = usePodeEditarMeta(); const metaLocked = lancamentoIsMeta && !editaMeta;');
    expect(f).not.toContain('const metaLocked = lancamentoIsMeta && !canEditMeta;');
  });
  it('Editar e Apagar ficam APAGADOS com o motivo (não somem), e o clique não dispara', () => {
    expect(f).toContain('onClick={metaLocked ? undefined : handleEditClick} disabled={metaLocked} title={metaLocked ? MOTIVO_META_SO_ADMIN : undefined}>');
    expect(f).toContain('onClick={metaLocked ? undefined : handleRemoverClick} disabled={checkingVinculos || effectiveP1Oficial || metaLocked} title={metaLocked ? MOTIVO_META_SO_ADMIN : undefined}>');
    expect(f).not.toContain('{!isTransferenciaEntrada && !metaLocked && (');
  });
  it('o motivo fica escrito no aviso da linha de meta', () => {
    expect(f).toContain('{metaLocked && (');
    expect(f).toContain('🔒 Registro META — {MOTIVO_META_SO_ADMIN}.');
  });
});

describe('"Lançar › Pecuária" continua sem oferecer o cenário Meta (lido da FONTE)', () => {
  it('a rota entrega só o cenário realizado, e o seletor de status apaga o que não é permitido', () => {
    const rota = fonte('src/v2/V2Index.tsx');
    const i = rota.indexOf("if (section === 'lancamentos-zoot') return (");
    expect(i).toBeGreaterThan(0);
    expect(rota.slice(i, i + 260)).toContain("cenariosPermitidos={['realizado']}");
    const tela = fonte('src/pages/LancamentosTab.tsx');
    expect(tela).toContain('const blockedByCenarios = cenariosPermitidos ? !cenariosPermitidos.includes(s.value) : false;');
    expect(tela).toContain("const blockedByPermission = s.value === 'meta' && !canEditMeta;");
  });
  it('nenhuma tela de Planejamento ganhou a marca: seguem fechadas a todo não admin', () => {
    const nav = readFileSync('src/v2/lib/navGrupos.ts', 'utf8');
    for (const id of ['meta-gmd', 'meta-precos', 'areas-meta', 'lancamentos-meta-zoo', 'lancamentos-meta-fin', 'planejamento-home']) {
      const linha = nav.split('\n').find((l) => l.includes(`{ id: '${id}',`)) ?? '';
      expect(`${id}:${linha.length > 0}:${linha.includes('liberadaClientes')}`).toBe(`${id}:true:false`);
    }
  });
});

describe('nenhum `if` de perfil nos pontos de uso', () => {
  it('as cinco telas tocadas não comparam perfil', () => {
    const PERFIL = /\bperfil\s*[!=]==|[!=]==\s*'(gestor_cliente|leitura|financeiro|campo)'/;
    /* a busca sabe achar: o dono compara perfil */
    expect(PERFIL.test(readFileSync('src/v2/lib/acessoOperacao.ts', 'utf8'))).toBe(true);
    for (const a of ['src/pages/PainelConsultorTab.tsx', 'src/pages/FinanceiroCaixaTab.tsx', 'src/pages/AgriDreLavouraTab.tsx',
      'src/pages/PecDrePanel.tsx', 'src/pages/FinanceiroTab.tsx', 'src/components/operacao-comercial/ReabrirMesNaOC.tsx',
      'src/pages/PlanejamentoFinanceiroTab.tsx', 'src/components/LancamentoDetalhe.tsx']) {
      expect(`${a}:${PERFIL.test(fonte(a))}`).toBe(`${a}:false`);
    }
  });
});
