/**
 * ACESSOS-FIN-02 — a META dentro das telas liberadas: quem nao ve^ meta (o financeiro) fica com a opcao Meta APAGADA com o
 * motivo, nunca sumida, e nao recebe linha de meta. O dono e' `podeVerMeta` (`acessoTelas.ts`); a tela so' consulta.
 *
 * ⚠ PC-100, Fluxo Caixa, o DRE e Pecuária › Lançamentos NAO se montam em teste (telas de milhares de linhas, com dezenas de
 *   hooks de dado): os pontos de uso sao LIDOS DA FONTE, um caso por ponto, e o card do DRE (`FaixaVisoesPec`) e' montado em
 *   `src/pages/pecDrePanel.test.tsx`. O perfil nao admin nao se prova no navegador com o login do admin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderHook } from '@testing-library/react';
import { MOTIVO_SEM_META, VE_META, podeVerMeta } from './acessoTelas';
import { usePodeVerMeta } from '@/v2/hooks/usePodeAbrir';

const quem = vi.hoisted(() => ({ isAdmin: false, perfil: 'financeiro' as string | null }));
vi.mock('@/contexts/ClienteContext', () => ({
  useCliente: () => ({ isAdmin: quem.isAdmin, clienteAtual: quem.perfil === null ? null : { id: 'c1', perfil: quem.perfil } }),
}));
const como = (perfil: string | null, isAdmin = false) => { quem.perfil = perfil; quem.isAdmin = isAdmin; };
beforeEach(() => como('financeiro'));

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('o dono: quem vê meta', () => {
  it('a linha inteira: gestor vê; financeiro, campo e leitura, não', () => {
    expect(VE_META).toEqual({ gestor_cliente: true, financeiro: false, campo: false, leitura: false });
    expect(podeVerMeta('gestor_cliente', false)).toBe(true);
    for (const p of ['financeiro', 'campo', 'leitura']) expect(`${p}:${podeVerMeta(p, false)}`).toBe(`${p}:false`);
  });
  it('admin: sempre; perfil nulo, vazio ou desconhecido: não — e "admin_agroinblue" sem isAdmin não é admin', () => {
    expect(podeVerMeta('admin_agroinblue', true)).toBe(true);
    expect(podeVerMeta(null, true)).toBe(true);
    for (const p of [null, undefined, '', 'dono', 'admin_agroinblue']) expect(podeVerMeta(p, false)).toBe(false);
  });
  it('o motivo é um só, escrito no dono', () => {
    expect(MOTIVO_SEM_META).toBe('meta: só para quem tem o Planejamento');
  });
  it('o ajudante só consulta o dono', () => {
    const ve = () => renderHook(() => usePodeVerMeta()).result.current;
    expect(ve()).toBe(false);
    como('gestor_cliente'); expect(ve()).toBe(true);
    como('leitura'); expect(ve()).toBe(false);
    como(null); expect(ve()).toBe(false);
    como('admin_agroinblue', true); expect(ve()).toBe(true);
    const f = fonte('src/v2/hooks/usePodeAbrir.ts');
    expect(f).toContain('export function usePodeVerMeta(): boolean { const { clienteAtual, isAdmin } = useCliente(); return podeVerMeta(clienteAtual?.perfil ?? null, isAdmin); }');
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

describe('nenhum `if` de perfil nos pontos de uso', () => {
  it('as cinco telas tocadas não comparam perfil', () => {
    const PERFIL = /\bperfil\s*[!=]==|[!=]==\s*'(gestor_cliente|leitura|financeiro|campo)'/;
    /* a busca sabe achar: o dono compara perfil */
    expect(PERFIL.test(readFileSync('src/v2/lib/acessoOperacao.ts', 'utf8'))).toBe(true);
    for (const a of ['src/pages/PainelConsultorTab.tsx', 'src/pages/FinanceiroCaixaTab.tsx', 'src/pages/AgriDreLavouraTab.tsx',
      'src/pages/PecDrePanel.tsx', 'src/pages/FinanceiroTab.tsx', 'src/components/operacao-comercial/ReabrirMesNaOC.tsx']) {
      expect(`${a}:${PERFIL.test(fonte(a))}`).toBe(`${a}:false`);
    }
  });
});
