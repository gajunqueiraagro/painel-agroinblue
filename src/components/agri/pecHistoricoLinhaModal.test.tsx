/**
 * O QUE ESTE TESTE TRAVA — a base que o donut escolhe, a cor do Δ contra a meta e o traço da @.
 *
 * ⚠ A BASE DO DONUT É A REGRA DO MODAL, e ela muda com o TIPO da linha: filha contra as irmãs,
 * grupo pela composição das filhas, subtotal contra o VBP. Errar a base não quebra nada — mostra
 * um percentual plausível e errado, que é o pior defeito que uma tela de análise pode ter.
 * ⚠ E A COR DO Δ NÃO SAI DO SINAL DO NÚMERO: "+12%" é boa notícia numa venda e má notícia numa
 * nutrição. É a única regra do modal que um teste de render não pegaria por acidente.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PecHistoricoLinhaModal, baseDoDonut, deltaMeta, type RecorteHistoricoPec,
} from '@/components/agri/PecHistoricoLinhaModal';
import { LINHAS_PEC } from '@/components/agri/drePecRegua';
import type { DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 1000 },
  producao: { ha_medio: 2000, at_produzida: 5000, at_desfrutada: 4000, cab_desfrutada: null,
    at_comprada: 500, cab_comprada: null },
  sem_p0: false, sem_p1: false, centros: [], centros_juros: [], ...o,
});

/* ⚠ OS NÚMEROS SÃO DESIGUAIS DE PROPÓSITO: VBP 10.000, custo variável 4.000 e três centros de
   2.000 / 1.500 / 500. Com valores iguais, um donut lendo a base errada daria o mesmo percentual
   da base certa e o teste passaria verde. */
const LINHAS_NJ = linhas({
  vbp: 10000, custo_variavel: 4000, margem: 6000, vendas: 8000,
  centros: [
    { bloco: 'variavel', centro: 'Nutrição', valor: 2000, a_pagar: 0 },
    { bloco: 'variavel', centro: 'Pastagem', valor: 1500, a_pagar: 0 },
    { bloco: 'variavel', centro: 'Sanidade', valor: 500, a_pagar: 0 },
  ],
});

const def = (chave: string) => LINHAS_PEC.find(d => d.chave === chave) ?? null;
const recorte = (o: Partial<RecorteHistoricoPec>): RecorteHistoricoPec => ({
  chave: 'custo_variavel', centro: null, rotulo: '(−) Custo variável',
  fazendaId: null, fazendaNome: 'Total', ...o,
});

describe('a base do donut — uma por tipo de linha', () => {
  it('filha: ela contra as IRMÃS, e o total é o bloco do pai', () => {
    const b = baseDoDonut(LINHAS_NJ, recorte({ centro: 'Nutrição', rotulo: 'Nutrição' }), def('custo_variavel'));
    expect(b?.total).toBe(4000);          // 2.000 + 1.500 + 500 — o bloco, não o VBP
    expect(b?.valorLinha).toBe(2000);
    expect(b?.destaque).toBe('Nutrição');
    expect(b?.fatias.map(f => f.nome)).toEqual(['Nutrição', 'Pastagem', 'Sanidade']);
    /* ⚠ A PROPORÇÃO DOS ARCOS É A PROPORÇÃO DOS VALORES: é isso que o donut desenha. */
    const soma = (b?.fatias ?? []).reduce((a, f) => a + f.valor, 0);
    expect(soma).toBe(4000);
    expect((b?.fatias[0].valor ?? 0) / soma).toBeCloseTo(0.5, 5);
    expect((b?.fatias[1].valor ?? 0) / soma).toBeCloseTo(0.375, 5);
  });

  it('grupo: o anel é a composição das filhas, e o centro mede o grupo no VBP', () => {
    const b = baseDoDonut(LINHAS_NJ, recorte({}), def('custo_variavel'));
    expect(b?.fatias.map(f => f.nome)).toEqual(['Nutrição', 'Pastagem', 'Sanidade']);
    /* O total é o VBP — o centro diz quanto o custo variável pesa nele (4.000 de 10.000). */
    expect(b?.total).toBe(10000);
    expect(b?.valorLinha).toBe(4000);
    expect(b?.rotuloBase).toBe('= VBP');
  });

  it('subtotal "=": a linha contra o RESTANTE do VBP, em duas fatias', () => {
    const b = baseDoDonut(LINHAS_NJ, recorte({ chave: 'margem', rotulo: '= Margem de contribuição' }), def('margem'));
    expect(b?.total).toBe(10000);
    expect(b?.valorLinha).toBe(6000);
    expect(b?.fatias).toEqual([
      { nome: '= Margem de contribuição', valor: 6000 },
      { nome: 'restante do VBP', valor: 4000 },
    ]);
  });

  /* ⚠ SEM LINHAS NÃO HÁ DONUT: ano sem dado não vira anel vazio nem 0% — vira nada. */
  it('ponto sem dado não monta donut nenhum', () => {
    expect(baseDoDonut(null, recorte({}), def('custo_variavel'))).toBeNull();
  });
});

describe('o Δ contra a meta', () => {
  /* ⚠ A MESMA VARIAÇÃO, DUAS LEITURAS: gastar 10% a mais é vermelho; faturar 10% a mais é verde. */
  it('custo acima da meta é vermelho; abaixo, verde', () => {
    expect(deltaMeta(1100, 1000, 'custo')?.cor).toBe('text-red-600');
    expect(deltaMeta(900, 1000, 'custo')?.cor).toBe('text-green-700');
  });

  it('receita acima da meta é verde; abaixo, vermelho', () => {
    expect(deltaMeta(1100, 1000, 'receita')?.cor).toBe('text-green-700');
    expect(deltaMeta(900, 1000, 'receita')?.cor).toBe('text-red-600');
  });

  it('a seta acompanha o sinal, e o percentual é sobre a meta', () => {
    expect(deltaMeta(1100, 1000, 'custo')?.texto).toBe('▲ 10,0 %');
    expect(deltaMeta(900, 1000, 'custo')?.texto).toBe('▼ 10,0 %');
  });

  /* ⚠ META AUSENTE NÃO É META ZERADA: sem base, não há percentual — e sem percentual, traço. */
  it('sem meta, ou meta zero, não há delta', () => {
    expect(deltaMeta(1000, null, 'custo')).toBeNull();
    expect(deltaMeta(1000, 0, 'custo')).toBeNull();
    expect(deltaMeta(null, 1000, 'custo')).toBeNull();
  });
});

describe('o modal montado', () => {
  const dre = (l: DrePecLinhas): DrePecuaria => ({
    periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
    rateio_adm: { pool: 0, bruto: 0, criterio: '' },
    fazendas: [], total: l,
  });

  const montar = (meta: DrePecuaria | null) => render(
    <PecHistoricoLinhaModal aberto recorte={recorte({ centro: 'Nutrição', rotulo: 'Nutrição' })}
      atual={dre(LINHAS_NJ)} meta={meta}
      anos={[{ de: '2024-07', ate: '2025-06', dre: dre(LINHAS_NJ), carregando: false }]}
      periodoRotulo="Safra 25/26" clienteNome="NJ Pecuária" unidadeInicial="rs"
      onFechar={() => {}} />,
  );

  /**
   * ⚠ A @ PRODUZIDA DA META VEM NULA DA RPC (medido em 22/09), e emprestar a do realizado faria o
   * custo da meta se ler por uma produção que não é dela. Traço é a resposta honesta — e o rodapé
   * do modal diz por quê, em vez de deixar o operador procurar o número que falta.
   */
  it('meta sem @ produzida: a célula fica em traço e o rodapé explica', () => {
    const semArroba = linhas({
      ...LINHAS_NJ,
      producao: { ...LINHAS_NJ.producao, at_produzida: null },
    });
    montar(dre(semArroba));
    /* ⚠ O `Dialog` VAI PARA UM PORTAL: o `container` do render fica vazio e a busca tem de ser no
       `document`. Procurar no container devolvia `undefined` e a assertiva morria antes de olhar a
       célula — falha certa, pela razão errada. */
    const linhaArroba = [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
      .find(tr => tr.cells[0]?.textContent === 'R$/@');
    expect(linhaArroba).toBeDefined();
    const celulas = [...(linhaArroba?.cells ?? [])].map(c => c.textContent);
    /* 2.000 / 5.000 @ produzidas = 0,40 no realizado; a meta, sem base, é traço. */
    expect(celulas).toContain('0,40');
    expect(celulas[celulas.length - 2]).toBe('—');
  });

  it('o título diz a linha, e o subtítulo diz dentro de quem ela está', () => {
    montar(null);
    expect(screen.getByText('Nutrição · histórico')).toBeDefined();
    expect(screen.getByText(/dentro de/)).toBeDefined();
    expect(screen.getByText(/NJ Pecuária/)).toBeDefined();
  });
});
