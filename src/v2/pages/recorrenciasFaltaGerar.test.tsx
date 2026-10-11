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

describe('a linha: o selo e o botão Gerar têm lugar reservado', () => {
  it('o selo vem do dono, num lugar de largura reservada que existe em toda linha', () => {
    expect(TELA).toContain('const falta = faltaGerarDaRegra(aGerar, r.id);');
    expect(TELA).toContain('const selo = seloFaltaGerar(falta);');
    expect(TELA).toContain('style={{ width: LARGURA_SELO - 4 }} data-testid="rec-lugar-do-selo"');
    const lugar = TELA.slice(TELA.indexOf('data-testid="rec-lugar-do-selo"'), TELA.indexOf('data-testid="rec-lugar-do-gerar"'));
    expect(lugar).toContain('{selo && (');
    expect(TELA).toContain("{ campo: 'situacao', rotulo: 'Situação', largura: LARGURA_SITUACAO + LARGURA_SELO },");
  });
  it('o botão Gerar fica ANTES do "⋯", num lugar reservado (vazio e `aria-hidden` sem nada a gerar), e abre o mesmo diálogo', () => {
    const acoes = TELA.slice(TELA.indexOf('GERAR NA LINHA'), TELA.indexOf('<DropdownMenuContent'));
    expect(acoes).toContain('style={{ width: LARGURA_GERAR }} data-testid="rec-lugar-do-gerar"');
    expect(acoes).toContain('aria-hidden={falta && falta.aGerar > 0 && r.ativo ? undefined : true}');
    expect(acoes).toContain('{falta && falta.aGerar > 0 && r.ativo && (');
    expect(acoes).toContain('onClick={() => setGerando(r)}');
    expect(acoes).toContain('title={tituloDoGerarNaLinha(falta)}');
    expect(acoes.indexOf('rec-gerar-na-linha')).toBeLessThan(acoes.indexOf('<DropdownMenu>'));
    expect(TELA).toContain('const LARGURA_ACOES = LARGURA_GERAR + 22;');
    /* o clique no botão não abre a linha: o invólucro da célula segura o clique, como no "⋯" */
    expect(TELA.slice(TELA.indexOf("cn(TD, 'px-0 text-right select-none')"), TELA.indexOf('GERAR NA LINHA'))).toContain('onClick={e => e.stopPropagation()}');
    /* o item do "⋯" continua */
    expect(TELA).toContain('<Play className="mr-2 h-3 w-3" /> Gerar lançamentos');
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
