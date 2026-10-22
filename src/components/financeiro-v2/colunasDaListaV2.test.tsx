/**
 * FIN-V2-COLUNAS-02 — Classificação por nível, "Sem caixa" em três posições, coluna "Vínc." com todos os selos, Safra em duas
 * linhas e o liga/desliga das contas no Ampliado. A lógica é pura (`colunasDaListaV2.ts`), as células se montam aqui; a tela
 * (`FinanceiroV2Tab`) não se monta em teste (o hook da lista é a tela inteira): a ligação é lida da FONTE.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHAVE_PREF, MODOS_SEM_CAIXA, NIVEIS_CLASSIFICACAO, caminhoDaClassificacao, gravarPreferencia, lerPreferencia,
  linhasDaGradePorModo, safraNaLista, secaoSemCaixaVisivel, textoDaClassificacao, tituloDoContrato, vinculosDaLinha,
} from '@/lib/financeiro/colunasDaListaV2';
import { totaisDaListaV2 } from '@/lib/financeiro/totaisDaListaV2';
import { CelulaSafra, CelulaVinculos } from './ColunasDaListaV2';

const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

describe('Classificação por nível', () => {
  const l = { macro_custo: 'Custeio Produtivo', centro_custo: 'Manutenção', subcentro: 'Manutenção de máquinas e implementos' };
  it('o texto é o do nível escolhido; o title, o caminho inteiro', () => {
    expect(textoDaClassificacao(l, 'macro')).toBe('Custeio Produtivo');
    expect(textoDaClassificacao(l, 'centro')).toBe('Manutenção');
    expect(textoDaClassificacao(l, 'subcentro')).toBe('Manutenção de máquinas e implementos');
    expect(caminhoDaClassificacao(l)).toBe('Custeio Produtivo › Manutenção › Manutenção de máquinas e implementos');
    expect(textoDaClassificacao({ macro_custo: null }, 'macro')).toBe('-');
    expect(caminhoDaClassificacao({ macro_custo: 'A', centro_custo: '', subcentro: 'C' })).toBe('A › C');
  });
  it('a tela: o cabeçalho e a célula leem o MESMO nível; o title é o caminho; o padrão é Centro', () => {
    expect(tela).toContain('data-testid="th-classificacao" onClick={() => toggleSort(\'centro\')}>{ROTULO_NIVEL[nivelClassif]}');
    expect(tela).toContain('title={caminhoDaClassificacao(l)}>{textoDaClassificacao(l, nivelClassif)}</td>');
    expect(tela).toContain("lerPreferencia(CHAVE_PREF.nivel, null, NIVEIS_CLASSIFICACAO, 'centro')");
    expect(tela).toContain('<Segmentado altura={20} valor={nivelClassif} onEscolher={setNivelClassif}');
    expect(tela).not.toContain('>Macro</th>');
  });
});

describe('Sem caixa em três posições', () => {
  const linhas = [
    { id: 'caixa', valor: 100, tipo_operacao: '1-Entradas', sem_movimentacao_caixa: false, compoe_dre: true },
    { id: 'nulo', valor: 50, tipo_operacao: '2-Saídas', sem_movimentacao_caixa: null, compoe_dre: true },
    { id: 'sc-dre', valor: 70, tipo_operacao: '1-Entradas', sem_movimentacao_caixa: true, compoe_dre: true },
    { id: 'sc-fora', valor: 30, tipo_operacao: '2-Saídas', sem_movimentacao_caixa: true, compoe_dre: false },
  ];
  it('Ocultar e Mostrar: a grade é só caixa (o nulo conta como caixa); Só c/ DRE: só o sem caixa que compõe o DRE', () => {
    expect(linhasDaGradePorModo(linhas, 'ocultar').map(l => l.id)).toEqual(['caixa', 'nulo']);
    expect(linhasDaGradePorModo(linhas, 'mostrar').map(l => l.id)).toEqual(['caixa', 'nulo']);
    expect(linhasDaGradePorModo(linhas, 'so_dre').map(l => l.id)).toEqual(['sc-dre']);
    expect(MODOS_SEM_CAIXA.map(secaoSemCaixaVisivel)).toEqual([false, true, false]);
  });
  it('os totais acompanham: no Só c/ DRE o topo mostra os do sem caixa', () => {
    const t = totaisDaListaV2(linhasDaGradePorModo(linhas, 'so_dre'), null);
    expect([t.entradasSemCaixa, t.saidasSemCaixa]).toEqual([70, 0]);
    expect(tela).toContain("const totalEntradas = modoSemCaixa === 'so_dre' ? totais.entradasSemCaixa : totais.entradas;");
    expect(tela).toContain("const totalSaidas = modoSemCaixa === 'so_dre' ? totais.saidasSemCaixa : totais.saidas;");
    /* ⚠ CONTRATO MUDOU NO FIN-V2-DESEMPENHO-01b: a grade por modo é feita no BANCO (`fn_fin_v2_lista_pagina`, `modo_sem_caixa`);
       a tela manda o modo e lê os totais do recorte inteiro */
    expect(tela).toContain('fornecedor: fornecedorFiltro, modoSemCaixa,');
    expect(tela).toContain('const totais = paginaDaLista?.totais ?? TOTAIS_VAZIOS;');
    expect(tela).not.toContain('Mostrar lançamentos sem caixa (entregas, barter, consumo)');
  });
});

describe('a coluna Vínc.', () => {
  it('os vínculos que já existem no dado, na ordem F · R · P · O; parcela de parcelamento não é financiamento', () => {
    expect(vinculosDaLinha({})).toEqual([]);
    expect(vinculosDaLinha({ oc: 'Venda 020' }).map(v => v.tipo)).toEqual(['O']);
    expect(vinculosDaLinha({ financiamentoId: 'f1', parcelaDeParcelamento: '2/8', oc: 'Compra 1' }).map(v => v.tipo)).toEqual(['P', 'O']);
    expect(vinculosDaLinha({ financiamentoId: 'f1', recorrenciaId: 'r1' }).map(v => v.tipo)).toEqual(['F', 'R']);
  });
  it('0, 1 e 2 selos; com gesto é botão que abre e NÃO propaga; sem gesto, só a marca (`marca-oc`)', () => {
    const { container, unmount } = render(<CelulaVinculos vinculos={[]} />);
    expect(container.querySelectorAll('[data-testid^="vinculo-"], [data-testid$="-oc"]').length).toBe(0);
    unmount();
    const abrir = vi.fn(); const linha = vi.fn();
    render(<div onClick={linha}><CelulaVinculos vinculos={vinculosDaLinha({ parcelaDeParcelamento: '2/8', oc: 'Compra 034' })} abrir={{ O: abrir }} /></div>);
    expect(screen.getByTestId('vinculo-P').tagName).toBe('SPAN');
    expect(screen.getByTestId('vinculo-P').getAttribute('title')).toBe('Parcelamento · parcela 2/8');
    fireEvent.click(screen.getByTestId('icone-oc'));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(linha).not.toHaveBeenCalled();
  });
  it('sem acesso à OC: o selo O é marca, sem botão', () => {
    render(<CelulaVinculos vinculos={vinculosDaLinha({ oc: 'Venda 020' })} />);
    expect(screen.getByTestId('marca-oc').tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('a coluna Safra em duas linhas', () => {
  it('período + atividade da safra; embaixo a fase / cultura SÓ quando existe; sem fase só a linha 1; sem safra "—"; nunca "rateio"', () => {
    expect(safraNaLista({ codigo: '25/26-Pec', escopo: 'pecuaria', fase: 'engorda' })).toEqual({ periodo: '25/26', selo: 'PEC', linha2: 'Engorda', titulo: '25/26-Pec · Pecuária · Engorda' });
    expect(safraNaLista({ codigo: '25/26-MAND', escopo: 'agricultura', cultura: 'mandioca' })).toEqual({ periodo: '25/26', selo: 'LAV', linha2: 'Mandioca', titulo: '25/26-MAND · Lavoura · Mandioca' });
    expect(safraNaLista({ codigo: '25/26-Pec', escopo: 'pecuaria' })).toEqual({ periodo: '25/26', selo: 'PEC', linha2: null, titulo: '25/26-Pec · Pecuária' });
    expect(safraNaLista({ codigo: '26/27-Lav', escopo: 'agricultura' })).toEqual({ periodo: '26/27', selo: 'LAV', linha2: null, titulo: '26/27-Lav · Lavoura' });
    /* sem atividade conhecida: o código inteiro, sem selo */
    expect(safraNaLista({ codigo: '25/26-X', escopo: null })).toEqual({ periodo: '25/26-X', selo: null, linha2: null, titulo: '25/26-X' });
    expect(safraNaLista({ codigo: null })).toEqual({ periodo: '—', selo: null, linha2: null, titulo: 'Sem safra' });
    for (const c of [{ codigo: '25/26-Pec', escopo: 'pecuaria' }, { codigo: '26/27-Lav', escopo: 'agricultura' }, { codigo: '25/26-Pec', escopo: 'pecuaria', fase: 'cria' }])
      expect(JSON.stringify(safraNaLista(c))).not.toContain('rateio');
  });
  it('a célula: duas linhas, a segunda com a classe de 7px; sem safra, só o traço', () => {
    const { unmount } = render(<CelulaSafra safra={safraNaLista({ codigo: '26/27-Pec', escopo: 'pecuaria', fase: 'cria' })} />);
    expect(screen.getByTestId('safra-periodo').textContent).toBe('26/27');
    expect(screen.getByTestId('safra-selo').textContent).toBe('PEC');
    expect(screen.getByTestId('safra-selo').className).toContain('safra-selo');
    expect(screen.getByTestId('safra-linha2').className).toContain('safra-atividade');
    unmount();
    render(<CelulaSafra safra={safraNaLista({ codigo: null })} />);
    expect(screen.getByTestId('safra-linha1').textContent).toBe('—');
    expect(screen.queryByTestId('safra-selo')).toBeNull();
    expect(screen.queryByTestId('safra-linha2')).toBeNull();
    expect(css).toMatch(/\.table-financeiro td \.safra-atividade \{\s*font-size: 7px !important;/);
  });
});

/* o jsdom desta suíte não tem `localStorage` (origem opaca): um armazenamento de mentira, e um que lança */
function instalarStorage(lancar = false) {
  const m = new Map<string, string>();
  const st = {
    getItem: (k: string) => { if (lancar) throw new Error('bloqueado'); return m.has(k) ? m.get(k)! : null; },
    setItem: (k: string, v: string) => { if (lancar) throw new Error('bloqueado'); m.set(k, v); },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => st });
}

describe('o Ampliado com e sem as contas, e as preferências', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('o chip liga e desliga as duas contas; desligado, o espaço vai para Produto, Fornecedor e Classificação', () => {
    expect(tela).toContain('data-testid="chip-contas" aria-pressed={contasAmpliado} onClick={alternarContasAmpliado}');
    /* FIN-V2-DESEMPENHO-01b: o Ampliado devolveu às datas dd/mm/aaaa e ao Valor os 24px (140→128, 202→190) */
    expect(tela).toContain('<col style={{ width: modoIntensivo ? (contasAmpliado ? 128 : 190) : 123 }} />');
  });
  it('a escolha é lembrada; valor desconhecido = o padrão', () => {
    instalarStorage();
    gravarPreferencia(CHAVE_PREF.nivel, null, 'subcentro');
    expect(lerPreferencia(CHAVE_PREF.nivel, null, NIVEIS_CLASSIFICACAO, 'centro')).toBe('subcentro');
    window.localStorage.setItem(CHAVE_PREF.nivel, 'lixo');
    expect(lerPreferencia(CHAVE_PREF.nivel, null, NIVEIS_CLASSIFICACAO, 'centro')).toBe('centro');
  });
  it('localStorage indisponível não quebra: lê o padrão e gravar não lança', () => {
    instalarStorage(true);
    expect(lerPreferencia(CHAVE_PREF.semCaixa, null, MODOS_SEM_CAIXA, 'ocultar')).toBe('ocultar');
    expect(() => gravarPreferencia(CHAVE_PREF.semCaixa, null, 'so_dre')).not.toThrow();
  });
});

describe('FIN-LANC-DESCRICAO-CONTRATO-01 — o selo "F" diz o contrato', () => {
  it('nº só com dígito; sem nº e sem descrição, "Financiamento"', () => {
    expect(tituloDoContrato('512-23772900-3', 'RO - Custeio Pecuário 2025')).toBe('512-23772900-3 · RO - Custeio Pecuário 2025');
    expect(tituloDoContrato('Atualizar', ' Recuperação de Solo ')).toBe('Recuperação de Solo');
    expect(tituloDoContrato(null, null)).toBe('Financiamento');
  });
  it('o title do selo F é o do contrato; o selo continua abrindo o contrato', () => {
    const v = vinculosDaLinha({ financiamentoId: 'f1', contrato: 'PR-78.192 · Recuperação de Solo' });
    expect(v).toEqual([{ tipo: 'F', titulo: 'PR-78.192 · Recuperação de Solo' }]);
    const abrir = vi.fn();
    render(<CelulaVinculos vinculos={v} abrir={{ F: abrir }} />);
    const selo = screen.getByTestId('vinculo-F');
    expect(selo.getAttribute('title')).toBe('PR-78.192 · Recuperação de Solo — clique para abrir');
    fireEvent.click(selo);
    expect(abrir).toHaveBeenCalledTimes(1);
  });
  it('a tela passa o nome do contrato ao selo e não monta texto de captação', () => {
    const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
    expect(tela).toMatch(/contrato: contratoId \? contratosDoCliente\?\.get\(contratoId\)/);
    for (const f of ['../../hooks/useFinanciamentoCadastro.ts', '../../pages/FinanciamentoDetalhe.tsx']) {
      expect(readFileSync(resolve(__dirname, f), 'utf8')).not.toMatch(/`Captação: /);
    }
  });
});
