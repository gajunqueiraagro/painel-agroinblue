/**
 * OC-CC-ACOES-LINHA-02 — abrir o lancamento de uma OC tem UM dono (`paramsAbrirLancamentoDaOC`), usado pelas DUAS sub-abas do
 * Financeiro em conta corrente: as Despesas (`AbaCompromissosOC`) e o extrato (`AbaFinanceiroOC` -> `AbaContaCorrenteOC`).
 * A volta do drill abre na sub-aba de onde saiu: sem `oc_sub` (Conta corrente) nao vai `returnOcSub`; com 'despesas', vai.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { paramsAbrirLancamentoDaOC } from './abrirLancamentoDaOC';

const OC = '1940de90-0000-0000-0000-000000000000';
const abrir = (search: string, tipoOperacao: string | null = 'venda', ocId: string | null = OC) =>
  paramsAbrirLancamentoDaOC(new URLSearchParams(search), { tituloId: 'L1', ocId, tipoOperacao });

describe('paramsAbrirLancamentoDaOC', () => {
  it('da CONTA CORRENTE (sem oc_sub): vai ao lancamento com o endereco da OC e SEM sub-aba — a volta abre no extrato', () => {
    const q = abrir(`oc_venda=1&oc_id=${OC}&oc_return=operacoes-comerciais&f_de=2026-01`);
    expect(q.get('flancId')).toBe('L1');
    expect(q.get('ocfin')).toBe('1');
    expect(q.get('returnOcId')).toBe(OC);
    expect(q.get('returnOcTipo')).toBe('venda');
    expect(q.has('returnOcSub')).toBe(false);
    /* os parametros que abrem a OC morrem na ida; a origem (`oc_return`) e os filtros da tela ficam */
    for (const k of ['oc_venda', 'oc_compra', 'oc_abate', 'oc_id', 'oc_sub']) expect(q.has(k)).toBe(false);
    expect(q.get('oc_return')).toBe('operacoes-comerciais');
    expect(q.get('f_de')).toBe('2026-01');
  });

  it('das DESPESAS (oc_sub=despesas): o comportamento de antes — a sub-aba volta junto', () => {
    const q = abrir(`oc_venda=1&oc_id=${OC}&oc_sub=despesas`);
    expect(q.get('returnOcSub')).toBe('despesas');
    expect(q.has('oc_sub')).toBe(false);
  });

  it('um returnOcSub velho na URL nao pega carona quando a ida e da conta corrente', () => {
    expect(abrir(`oc_venda=1&oc_id=${OC}&returnOcSub=despesas`).has('returnOcSub')).toBe(false);
  });

  it('os tres tipos; sem operacao nao promete retorno; nao altera a URL recebida', () => {
    expect(abrir('', 'compra').get('returnOcTipo')).toBe('compra');
    expect(abrir('', 'abate').get('returnOcTipo')).toBe('abate');
    expect(abrir('', null).get('returnOcTipo')).toBe('compra');
    const sem = abrir('returnOcId=velho&returnOcTipo=venda&returnOcSub=despesas', 'venda', null);
    expect(sem.get('flancId')).toBe('L1');
    for (const k of ['returnOcId', 'returnOcTipo', 'returnOcSub']) expect(sem.has(k)).toBe(false);
    const entrada = new URLSearchParams(`oc_venda=1&oc_id=${OC}`);
    paramsAbrirLancamentoDaOC(entrada, { tituloId: 'L1', ocId: OC, tipoOperacao: 'venda' });
    expect(entrada.toString()).toBe(`oc_venda=1&oc_id=${OC}`);
  });
});

describe('um dono so (lido da FONTE): as duas sub-abas abrem pelo mesmo caminho', () => {
  const semComentarios = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const despesas = semComentarios('src/components/compra/AbaCompromissosOC.tsx');
  const roteador = semComentarios('src/components/compra/AbaFinanceiroOC.tsx');
  it('AbaCompromissosOC (despesas) e AbaFinanceiroOC (extrato) chamam paramsAbrirLancamentoDaOC', () => {
    expect(despesas).toContain('paramsAbrirLancamentoDaOC(searchParams, { tituloId, ocId: resumoOperacao?.operacaoId ?? null, tipoOperacao })');
    expect(roteador).toContain('paramsAbrirLancamentoDaOC(searchParams, { tituloId: lancamentoId, ocId: operacaoId ?? null, tipoOperacao: api.tipoOperacao })');
    expect(roteador).toContain('onAbrirLancamento={abrirLancamento}');
  });
  it('nenhuma segunda funcao de abrir: so a lib escreve flancId / returnOcSub nesses arquivos', () => {
    for (const fonte of [despesas, roteador, semComentarios('src/components/venda/AbaContaCorrenteOC.tsx')]) {
      expect(fonte).not.toContain("'flancId'");
      expect(fonte).not.toContain("'returnOcSub'");
    }
    /* a busca sabe achar: a lib os escreve */
    const lib = semComentarios('src/lib/oc/abrirLancamentoDaOC.ts');
    expect(lib).toContain("next.set('flancId', tituloId)");
    expect(lib).toContain("next.set('returnOcSub', sub)");
  });
  it('os dois shells descem o "ir para a entrega" pelo roteador', () => {
    expect(semComentarios('src/components/venda/VendaModalShell.tsx')).toContain("onIrParaEntrega={() => setAbaAtiva('entrega')}");
    expect(semComentarios('src/components/compra/CompraModalShell.tsx')).toContain("onIrParaEntrega={() => irParaAba('recebimento')}");
    expect(roteador).toContain('onIrParaEntrega={props.onIrParaEntrega}');
  });
});
