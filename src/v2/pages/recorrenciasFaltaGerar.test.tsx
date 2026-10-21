/**
 * REC-FALTA-GERAR-A-VISTA-01 — a tela de Recorrências (`V2Recorrencias`, lida da FONTE: ela não se monta em teste) mostra o que
 * cada regra ainda tem para gerar e gera pela linha; quem diz o que falta é o banco (`fn_recorrencias_a_gerar`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const TELA = fonte('src/v2/pages/V2Recorrencias.tsx');
const HOOK = fonte('src/hooks/useRecorrencias.ts');
const DONO = fonte('src/lib/financeiro/recorrenciasDoMes.ts');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Conta de meses por conta própria: aritmética ou comparação sobre as datas da regra. */
const CALCULA_VAGA = /(dataInicio|dataFim|ultimoLancamentoGerado|data_inicio|data_fim|ultimo_lancamento_gerado)[^;\n]{0,80}(getMonth|\* 12|slice\(0, 7\)\s*[<>]|localeCompare|generate)/;

describe('a leitura: uma chamada por cliente, e erro não é "tudo em dia"', () => {
  it('o hook chama a RPC do banco com o cliente e a data LOCAL, lê pelo leitor do dono e marca o erro', () => {
    expect(HOOK).toContain("rpc('fn_recorrencias_a_gerar', { p_cliente_id: clienteId, p_hoje: hojeLocal() })");
    expect(HOOK).toContain('const lido = error ? null : lerAGerar(data);');
    expect(HOOK).toContain('setEstado(lido ? { aGerar: lido, erro: false } : { aGerar: SEM_A_GERAR, erro: true });');
    expect(HOOK.match(/fn_recorrencias_a_gerar'/g)).toHaveLength(1);
  });
  it('relê pelo canal de lançamentos, e a tela relê depois de Gerar, salvar e cancelar (o mesmo `recarregarTudo`)', () => {
    expect(HOOK).toContain('inscreverEmLancamentos(clienteId, () => { void carregar(); })');
    expect(TELA).toContain('const recarregarTudo = async () => { await Promise.all([recarregar(), recarregarMes(), recarregarAGerar()]); };');
    expect(TELA.match(/await recarregarTudo\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it('com erro a tela AVISA no rodapé e o cartão mostra "—", nunca zero meses', () => {
    expect(TELA).toContain('{erroAGerar && <span className="ml-2 font-normal text-amber-300" data-testid="rec-aviso-a-gerar">· {AVISO_A_GERAR_NAO_LIDO}</span>}');
    expect(TELA).toContain("{erroAGerar ? '—' : mesesAGerar(faltaGerar.meses)}");
  });
});

describe('a linha: o selo curto, a marca laranja e o Gerar no "⋯" (REC-COLUNAS-01c)', () => {
  const inicio = TELA.indexOf('const falta = faltaGerarDaRegra(aGerar, r.id);');
  const linha = TELA.slice(inicio, TELA.indexOf('</TableRow>', inicio));
  it('o selo vem do dono, no lugar da Situação, que tem a largura das situações comuns (68)', () => {
    expect(linha).toContain('const selo = seloFaltaGerar(falta);');
    expect(linha).toContain('data-testid="rec-lugar-do-selo"');
    expect(linha.slice(linha.indexOf('data-testid="rec-lugar-do-selo"'))).toContain('{selo ? (');
    expect(TELA).toContain("{ campo: 'situacao', rotulo: 'Situação', largura: LARGURA_SITUACAO },");
    expect(TELA).toContain('const LARGURA_SITUACAO = 68;');
    /* o texto do selo é o do dono, sem número montado na tela */
    expect(linha).toContain('>{selo.texto}</span>');
  });
  it('a marca laranja de 3px só na regra com mês a gerar, por sombra interna (não muda largura)', () => {
    expect(TELA).toContain("const MARCA_FALTA_GERAR = '[&>td:first-child]:shadow-[inset_3px_0_0_#d97706]';");
    expect(linha).toContain('const temMesAGerar = (falta?.aGerar ?? 0) > 0;');
    expect(linha).toContain('temMesAGerar && MARCA_FALTA_GERAR)}>');
    expect(linha).toContain("data-falta-gerar={temMesAGerar ? '' : undefined}");
    /* a marca não depende de mais nada (nem de "ativo", nem de mês fechado) */
    expect(linha.match(/MARCA_FALTA_GERAR/g)).toHaveLength(1);
  });
  it('o botão Gerar saiu da linha; é a PRIMEIRA opção do "⋯", habilitada só com mês a gerar (ou sem a leitura)', () => {
    expect(TELA).not.toContain('rec-gerar-na-linha');
    expect(TELA).not.toContain('LARGURA_GERAR');
    const menu = linha.slice(linha.indexOf('<DropdownMenuContent'), linha.indexOf('</DropdownMenuContent>'));
    expect(menu.indexOf('data-testid="rec-menu-gerar"')).toBeLessThan(menu.indexOf('Editar'));
    expect(menu).toContain('disabled={!podeGerar}');
    expect(menu).toContain('onClick={() => { if (podeGerar) setGerando(r); }}');
    expect(linha).toContain('const podeGerar = r.ativo && (temMesAGerar || erroAGerar);');
    expect(linha).toContain("const rotuloDoGerar = falta && temMesAGerar ? rotuloDoGerarNoMenu(falta) : erroAGerar ? 'Gerar lançamentos' : 'Gerar meses que faltam';");
    /* apagado, o motivo fica escrito no item (nunca some) */
    expect(menu).toContain('{!podeGerar && <span className="ml-1 opacity-80">· {motivoSemGerar}</span>}');
    /* abrir o menu não abre a linha */
    expect(TELA.slice(TELA.indexOf("cn(TD, 'px-0 text-right select-none')"), TELA.indexOf('<DropdownMenu>'))).toContain('onClick={e => e.stopPropagation()}');
  });
});

describe('o sexto cartão conta do banco e filtra a lista', () => {
  it('seis cartões; o sexto mostra regras e meses do resumo do dono', () => {
    expect(TELA).toContain('<div className="grid grid-cols-6 gap-1.5" data-testid="rec-cartoes">');
    expect(TELA).toContain('const faltaGerar = useMemo(() => resumoFaltaGerar(aGerar), [aGerar]);');
    expect(TELA).toContain('data-testid="rec-cartao-falta-gerar" aria-pressed={soFaltaGerar} onClick={alternarFaltaGerar}');
  });
  it('clicar filtra para as regras com mês a gerar e liga "Todas as regras"; os outros filtros e o modo saem dele', () => {
    expect(TELA).toContain("if (soFaltaGerar) return recorrencias.filter(r => (faltaGerarDaRegra(aGerar, r.id)?.aGerar ?? 0) > 0 && naBusca(r));");
    expect(TELA).toContain("setModo(soFaltaGerar ? 'mes' : 'regras');");
    expect(TELA.match(/sairDoFaltaGerar\(\);/g)).toHaveLength(5);
    expect(TELA).toContain('onEscolher={m => { setSoFaltaGerar(false); setModo(m); }}');
  });
});

describe('a tela não calcula vaga: quem diz o que falta é o banco', () => {
  it('o detector sabe achar conta de meses sobre as datas da regra', () => {
    expect('const n = (r.dataFim.getMonth() - r.dataInicio.getMonth())').toMatch(CALCULA_VAGA);
    expect('if (r.ultimoLancamentoGerado.slice(0, 7) < mes) faltam++').toMatch(CALCULA_VAGA);
    expect('title={`até ${r.dataFim}`}').not.toMatch(CALCULA_VAGA);
  });
  it('nem a tela nem a leitura do hook fazem conta de meses; o dono do que falta só lê e conta', () => {
    expect(semComentarios(TELA)).not.toMatch(CALCULA_VAGA);
    const leitura = HOOK.slice(HOOK.indexOf('export function useRecorrenciasAGerar'), HOOK.indexOf('export const lerOcorrencia'));
    expect(leitura.length).toBeGreaterThan(200);
    expect(semComentarios(leitura)).not.toMatch(/dataInicio|dataFim|data_inicio|data_fim|ultimo_lancamento_gerado|ultimoLancamentoGerado/);
    const bloco = DONO.slice(DONO.indexOf('O QUE FALTA GERAR — REC-FALTA-GERAR-A-VISTA-01'), DONO.indexOf('/** Por que a competência do mês não tem lançamento.'));
    expect(bloco.length).toBeGreaterThan(500);
    expect(semComentarios(bloco)).not.toMatch(/dataInicio|dataFim|ultimoLancamentoGerado|vencimentoPrevisto|competenciaQueVenceNoMes/);
  });
});

describe('RECORRENCIAS-COLUNAS-01 — a régua', () => {
  it('a soma escrita das fixas é a soma das colunas fixas + ações; Favorecido ~55% do resto; sem a trava de largura', async () => {
    const larg = [...TELA.matchAll(/largura: (\d+)(?:, direita: true)? \}/g)].map((m) => Number(m[1]));
    const n = (nome: string) => Number(TELA.match(new RegExp(`const ${nome} = (\\d+);`))?.[1]);
    expect(larg.reduce((a, b) => a + b, 0) + n('LARGURA_SITUACAO') + n('LARGURA_ACOES')).toBe(n('LARGURA_DAS_FIXAS'));
    /* REC-COLUNAS-01c: a coluna das ações é o "⋯" (20px) + 4 */
    expect(n('LARGURA_ACOES')).toBe(24);
    expect(TELA).toContain('const FATIA_FAVORECIDO = 0.55;');
    expect(TELA).not.toContain('max-w-5xl');
    expect(TELA).not.toMatch(/<h1/);
  });
});
