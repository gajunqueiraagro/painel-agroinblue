/**
 * ATALHOS-PRODUCAO-01 — o atalho da barra de topo entre as tres telas de Producao.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' O DA OC ABERTA: sair de "Lancar movimentacao" com os `oc_*` na
 * URL — pelo atalho OU pelo menu — tem de limpa-los, senao voltar a "Lancar movimentacao" reabre o
 * modal sozinho. A regra e' uma so' para os dois caminhos (`saiDoLancarComOC`) e o limpador e' o do
 * fechar da OC (`semParamsOC`).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('@/v2/hooks/useProfileAtual', () => ({ useProfileAtual: () => ({ nome: 'Gabriel Junqueira' }) }));

import { OPCOES_ATALHO_PRODUCAO, secaoDoAtalho, saiDoLancarComOC } from '@/v2/lib/atalhosProducao';
import { semParamsOC, temParamsOC } from '@/lib/oc/paramsAberturaOC';
import { BarraSecao } from '@/v2/components/BarraSecao';
import { Segmentado } from '@/components/ui/segmentado';

describe('onde o atalho existe', () => {
  it('nas tres telas de Producao, e com a ativa sendo a propria secao', () => {
    expect(secaoDoAtalho('operacoes-comerciais')).toBe('operacoes-comerciais');
    expect(secaoDoAtalho('lancamentos-zoot')).toBe('lancamentos-zoot');
    expect(secaoDoAtalho('conferencia-lancamentos')).toBe('conferencia-lancamentos');
  });

  it('em nenhuma outra — nem nas vizinhas do mesmo menu', () => {
    for (const s of ['financeiro-lanc', 'home', 'fechamento', 'rebanho-home', 'dre'] as const) {
      expect(secaoDoAtalho(s)).toBeNull();
    }
  });

  it('tres opcoes, nesta ordem e com estes rotulos', () => {
    expect(OPCOES_ATALHO_PRODUCAO.map(o => o.rotulo)).toEqual(['Operações Comerciais', 'Lançar movimentação', 'Lançamentos']);
  });
});

describe('a barra com o atalho', () => {
  /* Montada como o V2Index a monta: o Segmentado so' quando a secao e' uma das tres. */
  const montar = (secao: Parameters<typeof secaoDoAtalho>[0], onEscolher = vi.fn()) => {
    const ativa = secaoDoAtalho(secao);
    render(<BarraSecao area="Produção" secao="x" atalho={ativa ? (
      <Segmentado altura={22} valor={ativa} onEscolher={onEscolher} opcoes={OPCOES_ATALHO_PRODUCAO} className="hidden bg-card md:inline-flex" />
    ) : undefined} />);
    return onEscolher;
  };

  it('a opcao ativa e a secao atual, marcada com o navy da casa', () => {
    montar('conferencia-lancamentos');
    expect(screen.getByText('Lançamentos').className).toMatch(/bg-primary/);
    expect(screen.getByText('Operações Comerciais').className).not.toMatch(/bg-primary/);
  });

  it('o clique devolve a secao certa ao V2Index', () => {
    const onEscolher = montar('lancamentos-zoot');
    fireEvent.click(screen.getByText('Operações Comerciais'));
    expect(onEscolher).toHaveBeenCalledWith('operacoes-comerciais');
  });

  it('fora das tres secoes a barra fica como era — so o nome e o Sair', () => {
    montar('financeiro-lanc');
    expect(screen.queryByText('Lançar movimentação')).toBeNull();
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Sair']);
  });
});

describe('sair de Lancar movimentacao com OC aberta limpa os oc_*', () => {
  const URL_COM_OC = '?f_de=2026-01&f_ate=2026-08&oc_venda=1&oc_id=8b211cae&oc_aba=negociacao&oc_return=operacoes-comerciais';

  it('pelo atalho ou pelo menu, a regra e a mesma: de lancamentos-zoot para outra secao', () => {
    expect(saiDoLancarComOC('lancamentos-zoot', 'conferencia-lancamentos', URL_COM_OC)).toBe(true);
    expect(saiDoLancarComOC('lancamentos-zoot', 'financeiro-lanc', URL_COM_OC)).toBe(true);   // menu, fora das tres
    /* ⚠ E NAO LIMPA QUEM ESTA' CHEGANDO: abrir uma OC grava os `oc_*` e troca PARA la'. */
    expect(saiDoLancarComOC('operacoes-comerciais', 'lancamentos-zoot', URL_COM_OC)).toBe(false);
    expect(saiDoLancarComOC('lancamentos-zoot', 'lancamentos-zoot', URL_COM_OC)).toBe(false);
    expect(saiDoLancarComOC('lancamentos-zoot', 'conferencia-lancamentos', '?f_de=2026-01')).toBe(false);
  });

  it('o limpador tira os seis oc_* e deixa o periodo — voltar ao Lancar nao tem o que reabrir', () => {
    const limpa = semParamsOC(URL_COM_OC);
    expect([...limpa.keys()]).toEqual(['f_de', 'f_ate']);
    expect(temParamsOC(limpa.toString())).toBe(false);
    /* A contagem sabe achar: a URL de antes TINHA o que reabrir. */
    expect(temParamsOC(URL_COM_OC)).toBe(true);
  });
});

describe('a Lista perdeu o aviso de OCs em andamento', () => {
  it('o botao "Ver Operacoes Comerciais" e a contagem sairam do FinanceiroTab', () => {
    /* ⚠ LEITURA DA FONTE, e o motivo: montar a Lista inteira exige a pilha do rebanho; o que se afirma
       aqui e' que a segunda porta para a Central deixou de existir, e a fonte e' a prova direta. */
    const fonte = readFileSync(resolve(__dirname, '../../pages/FinanceiroTab.tsx'), 'utf8');
    expect(fonte).not.toMatch(/Ver Operações Comerciais/);
    expect(fonte).not.toMatch(/onVerOperacoes/);
    expect(fonte).not.toMatch(/import .*useOperacoesComerciaisEmAndamento/);
    /* E a busca sabe achar: o mesmo arquivo ainda tem o painel navy de onde o aviso saiu. */
    expect(fonte).toMatch(/Top panel/);
  });
});
