/**
 * O que este teste trava — a cascata da pecuária na ordem certa, com os números do NJ.
 *
 * ⚠ ELE NAO PODE CHAMAR A RPC: o papel do MCP de leitura não tem `execute` em
 * `fn_dre_pecuaria`, então os números abaixo são os da HOMOLOGAÇÃO, digitados como fixture. O que
 * o teste prova é o que o front faz com eles — a ordem das linhas, as duas variações separadas,
 * o "—" de quem não tem fechamento e a coluna Total no fim. O casamento com o banco é o item 1
 * da homologação do Gabriel.
 * ⚠ A ORDEM DAS LINHAS É O DRE, e ela mora no front: a RPC devolve um objeto de chaves sem
 * ordem. Se alguém reordenar `LINHAS_PEC`, é aqui que aparece.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PecDrePanel } from '@/pages/PecDrePanel';
import type { DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

const linhas = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0,
  vpb_operacional: 0, reposicao: 0, vbp: 0, custo_variavel: 0, margem: 0,
  custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: 0, resultado_periodo: 0,
  efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0 },
  sem_p0: false, sem_p1: false, ...o,
});

const DRE: DrePecuaria = {
  periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
  rateio_adm: { pool: 720000, bruto: 2880000, criterio: 'cabecas no fim do periodo' },
  fazendas: [
    {
      fazenda_id: 'f1', nome: 'Pureza',
      linhas: linhas({
        vendas: 9000000, vpb_operacional: 844774.72, resultado_periodo: 1500000,
        patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 3000 },
      }),
    },
    /* ⚠ A FAZENDA SEM FECHAMENTO É CASO DE TESTE, não borda rara: sem P0 ou sem P1 as duas
       variações vêm NULAS, e a tela tem de dizer "—" nas duas — nunca 0,00. */
    {
      fazenda_id: 'f2', nome: 'Administrativo',
      linhas: linhas({
        resultado_periodo: -3208702.24, vpb_operacional: null, efeito_mercado: null,
        sem_p0: true, sem_p1: true,
      }),
    },
  ],
  total: linhas({
    vendas: 17869000.08, vpb_operacional: -193238, resultado_periodo: 2994408.81,
    efeito_mercado: 2618562,
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 12000 },
  }),
};

const montar = () => render(
  <PecDrePanel dre={DRE} alturaCartao={null} cartaoRef={{ current: null }} />,
);
const linhasDaTabela = () => [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')];
/* ⚠ O RÓTULO VEM COLADO NA ETIQUETA no `textContent` — "Efeito de mercadoestimado". Comparar por
   igualdade faria as três linhas com etiqueta sumirem do teste, que é o pior resultado: passa
   verde sem olhar justamente as que carregam ressalva. Casa por prefixo. */
const rotulos = () => linhasDaTabela().map(tr => (tr.cells[0]?.textContent ?? '').trim());
const indiceDe = (rot: string) => rotulos().findIndex(r => r.startsWith(rot));
const linhaDe = (rot: string) =>
  linhasDaTabela().find(tr => ((tr.cells[0]?.textContent ?? '').trim()).startsWith(rot));

describe('a cascata do DRE da pecuária', () => {
  it('as dezoito linhas saem na ordem do DRE, com a seção antes do investimento', () => {
    montar();
    const r = rotulos();
    expect(r[0]).toBe('Vendas');
    expect(indiceDe('= Receita líquida')).toBeLessThan(indiceDe('= VBP'));
    expect(indiceDe('= VBP')).toBeLessThan(indiceDe('= Margem de contribuição'));
    expect(indiceDe('= Resultado do período')).toBeLessThan(indiceDe('Efeito de mercado'));
    /* ⚠ INVESTIMENTO FICA ABAIXO DA LINHA, e a faixa que o anuncia vem imediatamente antes. */
    expect(r[indiceDe('Investimento no período') - 1]).toBe('Abaixo da linha de caixa');
  });

  /* ⚠ OS NÚMEROS DA HOMOLOGAÇÃO, na coluna Total: é o que o Gabriel confere primeiro. */
  it('a coluna Total traz os números do NJ', () => {
    montar();
    const total = (rot: string) => {
      const tr = linhaDe(rot);
      /* A penúltima célula é o R$ da coluna Total; a última é o R$/cab. */
      return tr?.cells[(tr?.cells.length ?? 0) - 2]?.textContent ?? '';
    };
    expect(total('Vendas')).toBe('17.869.000,08');
    expect(total('Variação por produção')).toBe('-193.238,00');
    expect(total('= Resultado do período')).toBe('2.994.408,81');
    expect(total('Efeito de mercado')).toBe('2.618.562,00');
  });

  it('fazenda sem fechamento mostra "—" nas duas variações, nunca zero', () => {
    montar();
    const celula = (rot: string) => linhaDe(rot)?.cells[3]?.textContent ?? '';  // R$ da 2a fazenda
    expect(celula('Variação por produção')).toBe('—');
    expect(celula('Efeito de mercado')).toBe('—');
  });

  /* ⚠ A COLUNA "Administrativo" APARECE: ela é lançamento de pecuária sem fazenda produtiva, e
     escondê-la faria o Total não fechar com a soma das colunas sem ninguém saber por quê. */
  it('a coluna Administrativo existe e diz o que é', () => {
    montar();
    expect(screen.getByTitle('lançamentos de pecuária sem fazenda produtiva')).toBeTruthy();
  });
});
