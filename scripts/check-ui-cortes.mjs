#!/usr/bin/env node
/**
 * UI-SEM-CORTE-01 — `npm run check:ui-cortes`: as telas reais na bancada (scripts/ui-cortes, banco simulado) a 1000x600, 1126x579 e
 * 1440x800, no Chromium do Playwright. Reprova:
 *   (1) RETICENCIAS — elemento com `text-overflow: ellipsis` (ou `-webkit-line-clamp`) cujo texto nao cabe (scrollWidth > clientWidth,
 *       ou scrollHeight > clientHeight no clamp): nenhum texto com "…" em tela nenhuma; e o CORTE CALADO — texto proprio numa linha so'
 *       (`nowrap`) cortado por `overflow: hidden` sem reticencias;
 *   (2) CABECALHO PRESO COM VAO — num container que rola, rolado ate' a TABELA DELE cruzar o topo (P137, 28/10: varias tabelas empilhadas
 *       no mesmo quadro; antes, o quadro rolado ate' o meio): o cabecalho preso (`position: sticky`) nao encosta no topo
 *       do container (por onde as linhas aparecem ACIMA dele), tem fundo transparente (a linha aparece POR BAIXO dele), ou mora num
 *       container que nao rola dentro de um que rola (sobe com a pagina e nao fica preso);
 *   (2b) DATA OU NUMERO QUEBRADO — celula cujo texto e' so' data, hora ou numero e ocupa mais de uma linha;
 *   (3) DATA INCOMPLETA — celula de coluna de data (cabecalho Data, Venc., Vencimento, Pgto., Pagamento, Emissão) que nao e' dd/mm/aaaa;
 *   (4) ALTURA QUE MUDA (FIN-FILTRO-DOC-01) — o cenario com `alturaFixa` mede o elemento antes e depois do gesto: nada empurra a tela.
 *   (5) CAMPO DE VALOR (UI-CAMPO-MOEDA-01) — todo campo de valor visivel tem de mostrar 999.999.999,99 inteiro ao lado do "R$" (regra `valor`).
 *   (6) FORN-01b (regra de corte do Gabriel, 21/10 07h25 — substitui o "nenhum '…'" do item (1) para NOME/TEXTO EM TABELA): em celula,
 *       o texto pode terminar em "…" se o texto inteiro estiver no `title`; numero, valor, data, CPF/CNPJ e contador nunca cortam (nem com
 *       "…", regra `numero`); CORTE SECO em celula (o texto que passa da caixa sem "…", como o `uma-linha-que-rola`) reprova — o gatilho
 *       de seletor dentro da celula e' campo e fica de fora. Fora de tabela, "…" segue proibido.
 *   (7) ROTULO DE GRAFICO (P100) — o cenario com `rotulosSvg` (seletor dos textos de um grafico SVG): todo rotulo fica dentro do proprio
 *       SVG e nenhum encosta em outro (valor de coluna, valor de ponto, eixo); o texto com `data-cabe-em="N"` nao passa de N px de largura
 *       (o centro do donut no furo).
 *   (8) FOLGA ENTRE CELULAS (P100 item 5) — o cenario com `folgaCelulas` (seletor de tabelas): em cada linha, o texto visivel de uma
 *       celula e o da vizinha ficam a 6 px ou mais um do outro ("R$ 11.252.742,85+257,9%" colado = achado), cabecalho inclusive.
 * Baseline = a lista de EXCECOES abaixo (vazia). Antes de varrer, o detector se prova num fixture com os defeitos: se nao os achar,
 * sai com codigo 2 ("zero achados" so' vale quando a busca provou que sabe achar). `--fotos DIR` grava um print por tela e tamanho.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtroRapido } from './ui-gate-rapido.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXCECOES = [];   // { tela, regra, texto } — vazia por decisao do Gabriel (19/10/2026)
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
/* `--tamanhos 926x579,1000x600` mede outros tamanhos (diagnostico); o gate roda nos tres oficiais */
const TAMANHOS = arg('--tamanhos') ? arg('--tamanhos').split(',').map((t) => t.split('x').map(Number)) : [[1000, 600], [1126, 579], [1440, 800]];
const FOTOS = arg('--fotos');
const SO = arg('--so');
/* P163-2 — as variantes da bancada `nota-pdf` em que a nota JÁ ESTÁ LANÇADA (o modal em abas) */
const NOTA_JA_LANCADA = ['jalancada', 'emparcela', 'cancelados', 'irmas', 'diferenca', 'lr', 'lr2', 'gulart', 'gulartlongo', 'm2'];   // lr/lr2: os parcelados do LR (Gabriel 29/10 08:26)

const TAMANHOS_DO_CONTRATO = [[750, 483], [750, 530], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
/* P104 — os 9 tamanhos do gate e o do print do Gabriel (1750×1000) */
const TAMANHOS_DO_P104 = [[750, 483], [750, 530], [814, 530], [1000, 600], [1126, 579], [1130, 580], [1300, 704], [1440, 800], [1440, 860], [1750, 1000]];
const TAMANHOS_DA_VG = [[1000, 600], [1126, 579], [1130, 580], [1440, 800], [1440, 860]];
/* P141 (Gabriel 28/10, decisão a) — a Conciliação (3 cards lado a lado) só de 1000px para cima: abaixo disso ela nunca coube, nem no código
   antigo — dívida declarada CONC-ESTREITA (docs/DIVIDAS-ABERTAS.md); empilhar os cards é item próprio, com mock */
const TAMANHOS_DA_CONCILIACAO = [[1000, 600], [1024, 600], [1126, 579], [1130, 580], [1300, 704], [1366, 768], [1440, 800], [1440, 860], [1750, 1000]];
const TAMANHOS_DO_CONSORCIO = [[750, 520], [750, 600], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
/* P121 — nos cenários dos Itens da nota o `semRolagem` deixa de fora a tabela dos itens (rola por dentro) e o RESUMO do lançamento: os
   blocos dele têm altura fixa e escondem o que passa DE PROPÓSITO (o nome em até 2 linhas com `line-clamp`, o texto longo com "…", os dois
   com o inteiro no `title`) — quem os julga é a regra de corte da varredura principal (que os mede aqui também), e o "nada rola" do resumo
   é o cenário `lancamento-resumo-longo` e o teste `resumoDoLancamento.test.tsx`. */
const EXCETO_ITENS = '[data-testid="itens-rolagem"], [data-testid="resumo-lancamento"]';
/* P92 — os nove tamanhos do Negociar lote (os sete do consórcio + 750x483 e 900x600) e o 1024x600, a fronteira em que o resumo de 400px aparece */
const TAMANHOS_DO_P92 = [[750, 483], [750, 520], [750, 600], [814, 530], [900, 600], [1000, 600], [1024, 600], [1126, 579], [1300, 704], [1440, 800]];
/* FIN-CONSORCIO-04 — no consórcio rolam por dentro só a lista de parcelas e a tabela das faixas (cabeçalho e Total presos nelas) */
const EXCETO_CONSORCIO = '[data-testid="lista-parcelas-consorcio"], [data-testid="lista-faixas-consorcio"]';
const clicar = (sel) => async (p) => { await p.locator(sel).first().click(); await p.waitForTimeout(500); };
const clicarRotulo = (re) => async (p) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(500); };
const clicarTexto = (txt) => async (p) => { await p.getByText(txt, { exact: true }).first().click(); await p.waitForTimeout(500); };
/* P74 — a nota no cartão em 4 (a prévia) e o "Parcelar este lançamento" em 4 (o Editar) */
/* P102 — o Editar obrigação: o "Editar" do detalhe do contrato */
const abrirEditarObrigacao = async (p) => {
  await p.locator('[data-testid="botoes-do-contrato"] button', { hasText: 'Editar' }).first().click();
  await p.locator('[role="dialog"]').first().waitFor(); await p.waitForTimeout(900);
};
/* P101 — os tamanhos em que a prévia da nota tem abas (abaixo de 1000px) */
const TAMANHOS_ESTREITOS_DA_NOTA = [[750, 483], [750, 530], [750, 600], [814, 530], [900, 600]];
const abaDoLancamentoSeHouver = async (p) => {
  const t = p.locator('[data-testid="nota-abas"] button', { hasText: 'Parcelas e lançamento' });
  if (await t.count()) { await t.first().click(); await p.waitForTimeout(300); }
};
const cartaoEm4 = async (p) => {
  await abaDoLancamentoSeHouver(p);
  await p.locator('[data-testid="nota-como-foi-pago"]').click(); await p.waitForTimeout(300);
  await p.locator('[data-testid="nota-como-cartao"]').click(); await p.waitForTimeout(300);
  await p.locator('[data-testid="nota-cartao"] button', { hasText: 'Selecione o cartão' }).first().click(); await p.waitForTimeout(300);
  await p.getByText('Cartão Elo Exemplo', { exact: true }).last().click(); await p.waitForTimeout(300);
  await p.locator('[data-testid="nota-cartao-parcelas"]').fill('4'); await p.waitForTimeout(600);
};
const parcelarEm4 = async (p) => {
  await clicarTexto('Pagamento')(p);
  await p.locator('[data-testid="parcelar-este-abrir"]').click(); await p.waitForTimeout(300);
  await p.locator('[data-testid="parcelar-este-n"]').fill('4'); await p.waitForTimeout(600);
};
const CENARIOS = [
  { nome: 'mesclar-vazio', url: 'tela=mesclar&vazio=1' },
  { nome: 'mesclar-comparar', url: 'tela=mesclar' },
  { nome: 'mesclar-uso', url: 'tela=mesclar', antes: clicarTexto('Uso') },
  { nome: 'mesclar-recentes', url: 'tela=mesclar', antes: clicar('[data-testid="abrir-recentes"]') },
  /* FORN-LISTA-01 — a lista nos tamanhos do contrato; os filtros pelo rótulo que começa com a situação (o número vem depois) */
  /* FORN-01b — a lista com a barra REAL do topo (32px) e 2.356 cadastros, como no app; a régua dela é a de Recorrências (abaixo) */
  { nome: 'fornecedores-lista', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'fornecedores-mesclados', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarRotulo(/^Mesclados /) },
  { nome: 'fornecedores-sem-documento', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicar('[data-testid="filtro-sem-documento"]') },
  /* FORN-SEM-CADASTRO-01 — a aba "Sem cadastro" (substitui a "Pendentes") nos tamanhos do mock, fechada e com uma linha aberta */
  { nome: 'fornecedores-sem-cadastro', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicar('[data-testid="aba-sem-cadastro"]') },
  { nome: 'fornecedores-sem-cadastro-aberta', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: async (p) => { await clicar('[data-testid="aba-sem-cadastro"]')(p); await clicar('[data-testid="sem-cadastro-linha"] td')(p); } },
  { nome: 'fornecedores-inativos', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarRotulo(/^Inativos /) },
  { nome: 'fornecedores-todos', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarRotulo(/^Todos /) },
  { nome: 'fornecedores-por-pagina-200', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarRotulo(/^200$/) },
  { nome: 'fornecedores-ultima-pagina', url: 'tela=fornecedores&barra=32&n=2356', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: async (p) => { for (let i = 0; i < 3; i++) await clicarRotulo(/^Próxima/)(p); } },
  /* FORN-BUSCA-UNICA-01 — SO' OS FILTROS do Financeiro V2 (decisao do Gabriel, 19/10): a TABELA tem 60 achados (reticencias em Produto,
     Fornecedor e Centro; datas dd/mm/aa; cabecalho) e e' a frente FIN-V2-SEM-CORTE-01. Tirar a `regiao` mede a tela inteira. */
  { nome: 'financeiro-filtros', url: 'tela=financeiro', regiao: '[data-testid="filtros-da-lista"]' },
  /* P94 — os avisos da conferência e os chips do que veio da OC, na faixa dos totais: rolam no lugar reservado, sem "…"; e os seletores da
     barra com o valor fora das opções ("valor inexistente (limpar)", vermelho) na largura da barra */
  { nome: 'financeiro-fantasma', url: 'tela=financeiro&fantasma=1', regiao: '[data-testid="faixa-totais"]' },
  { nome: 'valor-inexistente', url: 'tela=valor-inexistente', regiao: '[data-testid="barra-inexistente"]' },
  /* FORN-BUSCA-UNICA-01 — o filtro de fornecedor com um nome longo escolhido: o chip mostra o nome inteiro. FIN-FILTRO-DOC-01 —
     `alturaFixa`: a fileira de filtros tem de ter a MESMA altura antes e depois de escolher o nome longo (nada empurra a tela) */
  { nome: 'financeiro-filtro-fornecedor', url: 'tela=financeiro', regiao: '[data-testid="filtros-da-lista"]', alturaFixa: '[data-testid="filtros-da-lista"]', antes: async (p) => {
    await p.locator('label:text-is("Fornecedor") + div [role="combobox"]').first().click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="favorecido-opcao"]').filter({ hasText: 'Cooperativa' }).first().click(); await p.waitForTimeout(500); } },
  /* FORN-CAMPO-01 — a lista aberta do Fornecedor do filtro: cada opção em DUAS linhas (o nome, "…" + `title`; embaixo "CNPJ · Cidade/UF"
     ou "—", que nunca cortam), o painel com a largura do campo (315px) */
  { nome: 'financeiro-filtro-fornecedor-lista', url: 'tela=financeiro', regiao: '[data-testid="favorecido-lista"]', antes: async (p) => {
    await p.locator('[data-testid="filtro-fornecedor-largo"] [role="combobox"]').first().click(); await p.waitForTimeout(400); } },
  ...['Dados gerais', 'Endereço e contato', 'Pagamento', 'Padrões', 'Uso'].map((aba) => ({ nome: `fornecedor-cadastro-${aba}`, url: 'tela=fornecedor-cadastro', antes: clicarTexto(aba) })),
  /* FIN-CONTRATO-TELA-FONTE-01 — a tela do contrato nos sete tamanhos: o crédito em cada aba, o título de 120 caracteres, a compra parcelada
     com a conta longa nas parcelas e o consórcio */
  ...['Cronograma', 'Liberações', 'Pagamentos', 'Histórico', 'Documentos', 'A resolver'].map((aba) => ({ nome: `contrato-v4-${aba}`, url: 'tela=contrato', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: aba === 'Cronograma' ? undefined : async (p) => { await p.getByRole('button', { name: new RegExp(`^${aba}`) }).first().click(); await p.waitForTimeout(500); } })),
  { nome: 'contrato-titulo-longo', url: 'tela=contrato&v=titulo', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contrato-parcelamento', url: 'tela=contrato&v=parcelamento', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contrato-consorcio', url: 'tela=contrato&v=consorcio', tamanhos: TAMANHOS_DO_CONTRATO },
  /* PARC-DOCS-TABELA-01 — Editar obrigação › Documentos da compra parcelada com 2 (o caso real), 18 e 36 parcelas e uma nota: a tabela das
     Parcelas vai até o fim do modal, cabeçalho e Total inteiros, só o corpo rola; as 2 nunca rolam; as 18 não rolam a 1440x800 (abaixo,
     o bloco dos documentos da compra deixa menos que as 18 linhas compactas: o corpo rola com cabeçalho e Total presos) */
  ...[[2], [18], [36], [18, 'sem-rolar']].map(([np, sufixo]) => ({ nome: `parcelamento-documentos-${np}${sufixo ? `-${sufixo}` : ''}`, url: `tela=contrato&v=parcelamento&np=${np}&docs=1`, tamanhos: sufixo ? [[1440, 800]] : TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]',
    /* abaixo de lg o Resumo desce para baixo da aba e o corpo do modal rola inteiro (em todas as abas, desde o OBRIGACAO-UI): só ele e o
       corpo da tabela das parcelas podem rolar */
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="corpo-das-parcelas"], [data-testid="corpo-da-obrigacao"]' },
    tabelaMinima: { sel: '[data-testid="quadro-das-parcelas"]', linhas: Math.min(np, 3) },
    ...(np === 2 || sufixo ? { semRolarVertical: '[data-testid="corpo-das-parcelas"]' } : {}),
    antes: async (p) => { await p.locator('button[title="Nota fiscal e boletos das parcelas"]').click(); await p.locator('[data-testid="parcelas-da-compra"]').waitFor(); await p.waitForTimeout(500); } })),
  /* P102 — o Editar obrigação da compra parcelada (o "Editar" do detalhe) com 18 parcelas e a nota ligada: cada aba; o "Voltar para à vista"
     pronto (rodapé) e apagado com a frase (a parcela 2 paga); a confirmação antes → depois. O modal fixo não rola (só as listas dele). */
  ...[0, 1, 2, 3].map((i) => ({ nome: `obrigacao-editar-aba${i}`, url: 'tela=contrato&v=parcelamento&np=18&docs=1', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]',
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="lista-de-parcelas"], [data-testid="corpo-das-parcelas"], [data-testid="corpo-da-obrigacao"]' },
    antes: async (p) => { await abrirEditarObrigacao(p); const t = p.locator('[role="dialog"] [role="tab"]').nth(i); if (await t.count()) { await t.click(); await p.waitForTimeout(500); } } })),
  { nome: 'obrigacao-editar-volta-paga', url: 'tela=contrato&v=parcelamento&np=18&docs=1&volta=paga', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]', antes: (p) => abrirEditarObrigacao(p) },
  { nome: 'obrigacao-editar-volta-confirmar', url: 'tela=contrato&v=parcelamento&np=18&docs=1', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await abrirEditarObrigacao(p); await p.locator('[data-testid="voltar-a-vista-botao"]').click(); await p.waitForTimeout(500); } },
  /* PARC-DETALHE-FONTE-01 — o detalhe da compra parcelada com 2, 18 e 36 parcelas */
  ...[2, 18, 36].map((np) => ({ nome: `contrato-parcelamento-${np}`, url: `tela=contrato&v=parcelamento&np=${np}&docs=1`, tamanhos: TAMANHOS_DO_CONTRATO })),
  ...['Geral', 'Pagamento', 'Documentos'].flatMap((aba) => ['novo', 'editar'].map((m) => ({ nome: `lancamento-${m}-${aba}`, url: `tela=lancamento&m=${m}`, antes: clicarTexto(aba) }))),
  /* DOC-NOTA-XML-PDF-01 — a aba Documentos com a nota em PDF + XML numa linha (selos), a nota so' em XML e um boleto */
  { nome: 'lancamento-editar-Documentos-nota', url: 'tela=lancamento&m=editar&docs=nota', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarTexto('Documentos') },
  /* FIN-CLASSIF-DIVIDIDA-01b/01c — a classificação dividida: a Geral com as partes, a aba Itens na vista "Contas" (18 itens), a lista com
     a parte "de R$ total" e os selos */
  { nome: 'lancamento-dividido-Geral', url: 'tela=lancamento&m=editar&v=sal&div=1', tamanhos: TAMANHOS_DO_CONTRATO },
  /* P121 — o Resumo do lançamento com os nomes longos do mock (favorecido, fazenda, conta, centro, subcentro; valor de 7 dígitos): nada
     corta seco, nada rola, e as alturas são as do MESMO lançamento com nomes curtos (`alturasComo`) */
  /* P121b — a NF da compra de 11 dígitos na linha "Nota" do Resumo: o número inteiro, o selo "da compra" cede */
  { nome: 'lancamento-editar-nota-11', url: 'tela=lancamento&m=editar&v=salparcela&nota=11' },
  { nome: 'lancamento-resumo-longo', url: 'tela=lancamento&m=editar&v=sal&resumo=longo', alturasComo: 'tela=lancamento&m=editar&v=sal' },
  { nome: 'lancamento-dividido-Itens', url: 'tela=lancamento&m=editar&v=sal&div=1', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: async (p) => { await p.getByRole('tab', { name: /Itens da nota/ }).first().click(); await p.waitForTimeout(400);
      await p.getByRole('button', { name: 'Contas', exact: true }).first().click(); await p.waitForTimeout(500); } },
  /* P165 — a conta de um item mudada e o Salvar: a confirmação do Dividir com "Salvar sem dividir" (Cancelar · Salvar sem dividir · Salvar e
     dividir no rodapé de 480px; a explicação e a prévia do banco inteiras) */
  { nome: 'lancamento-dividido-salvar-contas', url: 'tela=lancamento&m=editar&v=sal&div=1', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[data-testid="divisao-motivo"]',
    antes: async (p) => {
      await p.getByRole('tab', { name: /Itens da nota/ }).first().click(); await p.waitForTimeout(400);
      await p.getByRole('button', { name: 'Contas', exact: true }).first().click(); await p.waitForTimeout(500);
      await p.locator('[data-testid="conta-do-item-1"] [role="combobox"]').first().click(); await p.waitForTimeout(400);
      await p.locator('[data-testid="conta-barra-atividade"] button', { hasText: 'Lavoura' }).first().click(); await p.waitForTimeout(300);
      await p.locator('[data-testid="conta-lista"] button', { hasText: 'Insumos Lavoura Milho' }).first().click(); await p.waitForTimeout(300);
      await p.locator('button[tabindex="17"]').first().click(); await p.waitForTimeout(800); } },
  { nome: 'financeiro-dividido', url: 'tela=financeiro&div=1', regiao: '[data-testid="quadro-lancamentos"]', tamanhos: TAMANHOS_DO_CONTRATO },
  /* UI-TEXTO-LONGO-01 — a descrição de 300 caracteres: a tela é varrida (nenhum "…") e as alturas do modal, do resumo lateral e da lista
     de parcelas têm de ser as da MESMA tela com a descrição curta (`alturasComo`). O parcelado do XML traz a grade de parcelas. */
  ...['Geral', 'Pagamento', 'Documentos'].flatMap((aba) => ['novo', 'editar'].map((m) => ({ nome: `lancamento-${m}-${aba}-longo`, url: `tela=lancamento&m=${m}&desc=longo`,
    alturasComo: `tela=lancamento&m=${m}&desc=curto`, antes: clicarTexto(aba) }))),
  /* FIN-POS-FIXADO-01a — a CPR com o selo "estimado" das duas origens, nos sete tamanhos. ⚠ SO' O QUE ESTE PR TOCA (`regiao`): o
     selo da linha e os dois totais do Ampliado. A CPR inteira nunca esteve no gate e tem cortes antigos (descricao, subcentro,
     cabecalho do dia em janela estreita) — frente CPR-SEM-CORTE-01. Tirar a `regiao` mede a tela inteira. */
  /* CPR-SEM-CORTE-01 (CPR-AJUSTES-20-10) — a CPR INTEIRA, lista e Ampliado, nos sete tamanhos: nada de "…" */
  { nome: 'cpr-lista', url: 'tela=cpr', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* REC-COLUNAS-01 — Financeiro › Recorrências, a lista do mês com o pior texto de cada coluna curta, nos sete tamanhos. Descrição,
     Favorecido e a Conta acima da régua cortam com "…" e o inteiro no `title` (regra do Gabriel de 21/10, 07h25): a regra
     `reticencias` fica fora; corte calado, vazamento, número partido, quebra, sobreposição e cabeçalho valem.
     ⚠ SÓ DE 1000px PARA CIMA: em 750 e 814 os cartões se sobrepõem e o "Gerar" sai da tabela (anterior ao REC-COLUNAS-01) — divida
     REC-COLUNAS-01b no CLAUDE.md; quando fechar, este cenário passa a TAMANHOS_DO_CONSORCIO. */
  { nome: 'recorrencias', url: 'tela=recorrencias', tamanhos: [[1000, 600], [1126, 579], [1300, 704], [1440, 800]],
    soRegras: ['corte', 'quebra', 'numero', 'sobreposicao', 'italico', 'cabecalho', 'data', 'valor', 'altura', 'rolagem', 'tabela'] },
  /* P172 — Cadastros › Plano de Contas nos dez tamanhos do P92: o admin (com as ações), os inativos ligados, o cliente (só leitura), a
     busca para 4/1/0 contas (o quadro tem a mesma altura) e os diálogos do subcentro do cliente (o nome; a prévia do renomear) */
  { nome: 'plano-contas', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92 },
  { nome: 'plano-contas-inativos', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: clicar('[data-testid="mostrar-inativos"]') },
  { nome: 'plano-contas-cliente', url: 'tela=plano-contas&perfil=cliente', tamanhos: TAMANHOS_DO_P92 },
  { nome: 'plano-contas-busca-4', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: async (p) => { await p.locator('[data-testid="busca-plano"]').fill('Outras Saídas'); await p.waitForTimeout(500); } },
  { nome: 'plano-contas-busca-1', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: async (p) => { await p.locator('[data-testid="busca-plano"]').fill('Pagamento Estornado'); await p.waitForTimeout(500); } },
  { nome: 'plano-contas-busca-0', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: async (p) => { await p.locator('[data-testid="busca-plano"]').fill('zzzz nada'); await p.waitForTimeout(500); } },
  { nome: 'plano-contas-novo', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]', antes: clicar('[data-testid="novo-subcentro"]') },
  { nome: 'plano-contas-renomear-previa', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]', antes: async (p) => {
    await p.locator('[data-testid="renomear-subcentro"]').first().click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="nome-subcentro"]').fill('Animais de terceiros'); await p.locator('[data-testid="conferir-subcentro"]').click(); await p.waitForTimeout(500); } },
  /* P106 — a tela abre em "Mês atual": o período futuro é o botão "Mês futuro" */
  { nome: 'cpr-futuro', url: 'tela=cpr&v=futuro', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Mês futuro') },
  /* CAD-CONTAS-BANCARIAS-01 — Financeiro › Contas bancárias nos sete tamanhos: a lista do mock, o pior caso (nome, banco e gerente longos,
     saldo de 999.999.999,99), com as inativas, e o modal (780x500) em cada aba, editando e criando */
  /* FIN-VISAO-GERAL-01 PR 3 — a Visão Geral nos três tamanhos do gate + os dois do mock (1130x580 e 1440x860), nos três modos, com 24
     meses (R$ mil) e com o filtro de atividade; `semRolagem`: a PÁGINA não rola — só a grade e a lista do card rolam por dentro */
  ...[['flx', ''], ['sai', ''], ['ent', ''], ['flx', '&faixa=per&de=2025-01&ate=2026-12'], ['sai', '&faixa=66']].map(([m, extra]) => ({
    nome: `visao-geral-${m}${extra ? extra.replace(/[&=]/g, '-') : ''}`, url: `tela=visao-geral&barra=0&modo=${m}${extra}`, tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' } })),
  { nome: 'visao-geral-agricultura', url: 'tela=visao-geral&barra=0', tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' },
    /* abaixo de 768px os filtros da barra somem (`hidden md:flex`): ali o gesto não existe e é pulado */
    antes: async (p) => { if (!(await p.locator('[data-testid="vg-atividade"]').isVisible())) return; await clicar('[data-testid="vg-atividade"]')(p); await clicar('[data-testid="vg-atividade-agricultura"]')(p); } },
  /* P83 — o "ampliar" de cada bloco: o modal mostra o bloco inteiro, sem rolagem dentro dele */
  ...['card', 'grafico', 'grade'].map((b) => ({ nome: `visao-geral-ampliado-${b}`, url: 'tela=visao-geral&barra=0', tamanhos: TAMANHOS_DA_VG, regiao: '[role="dialog"]',
    semRolagem: { dentro: '[role="dialog"]' },
    antes: async (p) => { await p.locator(`[data-testid="ampliar-${b}"]`).click(); await p.locator(`[data-testid="modal-ampliado-${b}"]`).waitFor(); await p.waitForTimeout(600); } })),
  /* PR 4 — o MODAL DE ANÁLISE (banco sintético com nomes maiores que os reais e valores em milhões): aberto pela grade (aba Custeio),
     pelo card (aba da raiz) e no nível mais fundo (Custeio › Pecuária em R$/cab, um SUBCENTRO no gráfico — o caminho com a cadeia
     inteira). Rolam por dentro só as duas listas, as abas e o caminho (linhas que rolam de lado). P100: a tabela da direita lista os
     SUBCENTROS do item (Custeio · total: 48 — a lista longa rola por dentro). */
  ...[['custeio', async (p) => { await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); }],
      ['raiz', async (p) => { await p.locator('[data-testid="card-total-saida"]').dispatchEvent('click'); }],
      /* P100 v4 — a esquerda desce (Pecuária → "Centros · Pecuária") e um centro fica selecionado (a direita sem a coluna Centro) */
      ['nivel', async (p) => {
        await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(500);
        await p.locator('[data-testid="analise-tabela-linha-0"]').click(); await p.waitForTimeout(400);
        await p.locator('[data-testid="analise-tabela-linha-1"]').click(); }],
      /* P100 — um subcentro da tabela da direita no gráfico (o caminho com a cadeia inteira) */
      ['subcentro', async (p) => {
        await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(500);
        await p.locator('[data-testid="analise-foco-linha-3"]').dispatchEvent('click'); }],
      ['fundo', async (p) => {
        await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(500);
        await p.locator('[data-testid="analise-tabela-linha-0"]').click(); await p.waitForTimeout(400);
        await p.locator('[data-testid="analise-unidade"]').click(); await p.locator('[data-testid="analise-unidade-rs_cab"]').click(); await p.waitForTimeout(400);
        await p.locator('[data-testid="analise-foco-linha-1"]').click(); }]].map(([n, abrir]) => ({
    nome: `visao-geral-analise-${n}`, url: 'tela=visao-geral&barra=0', tamanhos: TAMANHOS_DA_VG, regiao: '[data-testid="modal-analise"]',
    /* P100 — os rótulos do gráfico (colunas, média, meta e eixo) e o centro do donut; a folga entre as células das duas tabelas */
    rotulosSvg: '[data-testid="analise-grafico-svg"] text, [data-testid="analise-donut-centro"]',
    folgaCelulas: '[data-testid="analise-tabela-lista"] table, [data-testid="analise-foco-lista"] table',
    semRolagem: { dentro: '[data-testid="modal-analise"]', exceto: '[data-testid="analise-tabela-lista"], [data-testid="analise-foco-lista"], [data-testid="analise-abas"], [data-testid="analise-caminho"]' },
    antes: async (p) => { await abrir(p); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(700); } })),
  /* P100 item 5 — o PIOR CASO de largura das tabelas do modal ("NJ Saídas · Acumulado 12 meses"): `&vg_grande=1` (valores na casa
     de dezenas de milhões, % perto de +999,9%, 5 dígitos de lançamentos), dez/26 (12 meses), aba da raiz, Acum.: nada corta, nada cola
     (folga >= 6 px), o centro do donut cabe no furo */
  { nome: 'visao-geral-analise-grande', url: 'tela=visao-geral&barra=0&vg_grande=1&mes=2026-12', tamanhos: TAMANHOS_DA_VG, regiao: '[data-testid="modal-analise"]',
    rotulosSvg: '[data-testid="analise-grafico-svg"] text, [data-testid="analise-donut-centro"]',
    folgaCelulas: '[data-testid="analise-tabela-lista"] table, [data-testid="analise-foco-lista"] table',
    semRolagem: { dentro: '[data-testid="modal-analise"]', exceto: '[data-testid="analise-tabela-lista"], [data-testid="analise-foco-lista"], [data-testid="analise-abas"], [data-testid="analise-caminho"]' },
    antes: async (p) => { await p.locator('[data-testid="card-total-saida"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(600);
      await p.locator('[data-testid="analise-tabela"]').getByText('Acum.', { exact: true }).dispatchEvent('click'); await p.waitForTimeout(700); } },
  /* P103 — a RÉGUA "vs meta" nos dois lados, com a marca na faixa do fim ("crítico"): ENTRADAS (Receitas operacionais, meta a 125% →
     razão 0,8) e SAÍDAS no pior caso (`&vg_grande=1`, Custeio: razão ≈ 11, a marca na ponta). Os rótulos das faixas cabem (sem "…",
     sem corte); a marca é desenhada FORA da faixa. E o gráfico no ACUMULADO (colunas e meta acumuladas, sem a média): os rótulos */
  ...[['regua-entradas', '', '[data-testid^="grade-linha-entrada:grupo:Receitas operacionais"]', false],
      ['regua-saidas', '&vg_grande=1', '[data-testid^="grade-linha-saida:grupo:Custeio"]', false],
      ['acumulado', '', '[data-testid^="grade-linha-saida:grupo:Custeio"]', true]].map(([n, extra, linha, acum]) => ({
    nome: `visao-geral-analise-${n}`, url: `tela=visao-geral&barra=0${extra}`, tamanhos: TAMANHOS_DA_VG, regiao: '[data-testid="modal-analise"]',
    rotulosSvg: '[data-testid="analise-grafico-svg"] text, [data-testid="analise-donut-centro"]',
    folgaCelulas: '[data-testid="analise-tabela-lista"] table, [data-testid="analise-foco-lista"] table',
    semRolagem: { dentro: '[data-testid="modal-analise"]', exceto: '[data-testid="analise-tabela-lista"], [data-testid="analise-foco-lista"], [data-testid="analise-abas"], [data-testid="analise-caminho"]' },
    antes: async (p) => { await p.locator(linha).first().dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(600);
      if (acum) { await p.locator('[data-testid="analise-tabela"]').getByText('Acum.', { exact: true }).dispatchEvent('click'); await p.waitForTimeout(700); } } })),
  /* P100 item 6 — o mês escolhido é o fim do período: Ano com AGO (8 meses), Últ. 12 (set/25–ago/26), 6 + 6 (inalterado) e Ano com
     DEZ (12, nov e dez previstos) — o gráfico e a grade no mesmo quadro */
  /* P100 item 7 — a grade rolada até o FIM: o cabeçalho e as duas linhas do rodapé (Resultado, Saldo final) à vista, nada cortado */
  { nome: 'visao-geral-grade-rolada', url: 'tela=visao-geral&barra=0', tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' },
    antes: async (p) => { await p.locator('[data-testid="grade-vg-rolagem"]').evaluate((e) => { e.scrollTop = e.scrollHeight; }); await p.waitForTimeout(300); } },
  /* P100 item 8 — o card com 8 grupos de saída (ago, `&vg_grupos=varia`) */
  { nome: 'visao-geral-card-8-grupos', url: 'tela=visao-geral&barra=0&vg_grupos=varia&mes=2026-08', tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' } },
  ...[['ano-ago', '&mes=2026-08'], ['u12-ago', '&faixa=u12&mes=2026-08'], ['66-ago', '&faixa=66&mes=2026-08'], ['ano-dez', '&mes=2026-12']].map(([n, extra]) => ({
    nome: `visao-geral-periodo-${n}`, url: `tela=visao-geral&barra=0${extra}`, tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' } })),
  /* PR 5 — a GAVETA de lançamentos (banco sintético): nos filhos do Custeio; no subcentro de 523 lançamentos (paginado); no de texto
     longo (favorecido de 60 letras, descrição longa, conta longa e a parte 2/2 da divisão); e no nó VAZIO (a frase dentro do quadro).
     Rolam por dentro só a lista, o caminho, o contexto e os atalhos dos irmãos (e as do modal, por baixo). O AVISO do rodapé: "523"
     (vencidos), "longo" (a frase mais longa, transferências), "vazio" (nenhuma) e "contas" (duas contas escolhidas: `&contas=2`). PR 5b:
     "virada" — período nov/25–out/26 no ACUMULADO do modal: a frase da virada do ano, com os meses do caso; "fatura" (`&fatura=1`): a 5ª
     frase, o pagamento da fatura do cartão — a mais longa das cinco. */
  ...[['filhos', []], ['523', [0, 0, 0]], ['longo', [0, 0, 1]], ['vazio', [0, 0, 3]], ['contas', [0, 0, 3], '&contas=2'],
      ['virada', [0, 0, 3], '&faixa=per&de=2025-11&ate=2026-10', true], ['fatura', [0, 0, 3], '&fatura=1'],
      /* P119 — a lista ORDENADA (a seta no cabeçalho): "longo" por Valor decrescente (o R$ 99.999.999,99 em cima, a seta ▼ no "VALOR"
         alinhado à direita) e o "523" por Favorecido crescente (▲) */
      ['longo-ordem', [0, 0, 1], '', false, ['valor', 'valor']], ['523-ordem', [0, 0, 0], '', false, ['favorecido']]].map(([n, descer, extra = '', acum = false, ordenar = []]) => ({
    nome: `visao-geral-gaveta-${n}`, url: `tela=visao-geral&barra=0${extra}`, tamanhos: TAMANHOS_DA_VG, regiao: '[data-testid="modal-analise"]',
    /* P103 — as 8 colunas do subcentro ("longo": favorecido de 60 letras, R$ 99.999.999,99, todos os status): cada texto a 6px do vizinho */
    folgaCelulas: '[data-testid="gaveta-lista"] table, table[data-testid="gaveta-total-fixo"]',
    semRolagem: { dentro: '[data-testid="modal-analise"]', exceto: '[data-testid="analise-tabela-lista"], [data-testid="analise-foco-lista"], [data-testid="analise-abas"], [data-testid="analise-caminho"], [data-testid="gaveta-lista"], [data-testid="gaveta-caminho"], [data-testid="gaveta-contexto"], [data-testid="gaveta-irmaos"], [data-testid="gaveta-resumo"]' },
    antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(600);
      if (acum) { await p.locator('[data-testid="analise-tabela"]').getByText('Acum.', { exact: true }).dispatchEvent('click'); await p.waitForTimeout(600); }
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await p.waitForTimeout(400);
      for (const i of descer) { await p.locator(`[data-testid="gaveta-linha-${i}"]`).dispatchEvent('click'); await p.waitForTimeout(350); }
      for (const c of ordenar) { await p.locator(`[data-testid="gaveta-ordem-${c}"]`).dispatchEvent('click'); await p.waitForTimeout(350); }
      await p.waitForTimeout(400); } })),
  /* P71 — o seletor de Fazenda com o nome MAIS LONGO (43 letras; o maior real tem 18): largura fixa, o nome termina em "…" com o title
     inteiro, e a barra não cresce */
  { nome: 'visao-geral-fazenda-longa', url: 'tela=visao-geral&barra=0', tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' },
    antes: async (p) => { if (!(await p.locator('[data-testid="vg-fazenda"]').isVisible())) return;
      await p.locator('[data-testid="vg-fazenda"] button').first().click(); await p.waitForTimeout(300);
      await p.getByText('Fazenda Exemplo Nome Muito Longo Retiro Sul', { exact: true }).last().click(); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(300); } },
  /* P79 — os chips de status: nenhum status e vencidos desligado (o aviso mais longo), aberto pela URL (`vg_status=`, `vg_venc=0`) */
  { nome: 'visao-geral-sem-status', url: 'tela=visao-geral&barra=0&vg_status=&vg_venc=0', tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' } },
  /* P109 — as 4 telas que leem a meta da `fn_meta_linhas`, com o caso real do NJ 2026 (só os números) e os valores ×400 (`&v=grande`).
     Cada uma TEM o rótulo do regime à vista, com o texto certo: sem ele o gesto falha e o gate acusa. No PC-100 a meta é a dividida
     (DRE em competência, caixa em caixa): o gesto passa para Meta (no Realizado o rótulo tem o lugar reservado, escondido) e abre o
     Financeiro (caixa). SÓ EM VOLTA DO RÓTULO (`regiao`: a faixa que o contém, Gabriel 27/10): os 164 cortes antigos do resto destas
     telas são o P137 (lista no histórico); tirar a `regiao` mede a tela inteira. */
  ...[['fluxo', 'Meta em regime de caixa'], ['pc100', 'Meta: DRE em competência · caixa em regime de caixa'], ['vgplan', 'Meta em regime de caixa'],
      ['fech', 'Meta em regime de caixa']].flatMap(([t, rotulo]) => ['', '&v=grande'].map((extra) => ({
    nome: `meta-${t}${extra ? '-grande' : ''}`, url: `tela=meta&t=${t}${extra}`, tamanhos: TAMANHOS_DA_VG,
    regiao: '*:has(> [data-testid="meta-regime"])',
    antes: async (p) => {
      if (t === 'pc100') { await p.getByRole('button', { name: 'Meta', exact: true }).first().click(); await p.waitForTimeout(800); }
      const r = p.locator('[data-testid="meta-regime"]').first();
      await r.waitFor({ state: 'visible', timeout: 8000 });
      const lido = ((await r.textContent()) ?? '').trim();
      if (lido !== rotulo) throw new Error(`rotulo do regime "${lido}" (esperado "${rotulo}")`);
      if (t === 'pc100') { await p.getByText(/^financeiro \(caixa\)$/i).first().click(); await p.waitForTimeout(800); }
      await p.waitForTimeout(500); } }))),
  { nome: 'contas-lista', url: 'tela=contas&barra=32', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contas-lista-longo', url: 'tela=contas&barra=32&n=longo', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contas-inativas', url: 'tela=contas&barra=32&n=longo', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicar('[data-testid="mostrar-inativas"]') },
  ...['dados', 'gerente', 'saldo', 'importacao'].map((aba) => ({ nome: `contas-editar-${aba}`, url: `tela=contas&barra=32&v=editar&aba=${aba}`,
    tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[data-testid="modal-conta-bancaria"]' })),
  ...['dados', 'saldo', 'importacao'].map((aba) => ({ nome: `contas-nova-${aba}`, url: `tela=contas&barra=32&v=nova&aba=${aba}`,
    tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[data-testid="modal-conta-bancaria"]' })),
  /* UI-SIDEBAR-ESTREITA-01 — a barra lateral de verdade (V2Sidebar, `LARGURA_DA_LATERAL`) com o grupo Financeiro aberto. Com nomes que
     cabem, TODAS as regras (item do menu, logo ou seletor cortado reprova). Com nomes maiores que os reais (o segundo), SEM `reticencias`,
     por decisao do Gabriel (21/10): nome de cliente ou fazenda maior que o seletor corta com "…" e o nome inteiro no `title`. */
  { nome: 'barra-lateral', url: 'tela=recorrencias&lateral=1&submenu=financeiro&cli=Cliente%20Exemplo&faz=Faz.%20Exemplo%20Sul',
    regiao: '[data-testid="barra-lateral"]', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'barra-lateral-nome-longo', url: 'tela=recorrencias&lateral=1&submenu=financeiro', regiao: '[data-testid="barra-lateral"]', tamanhos: TAMANHOS_DO_CONTRATO,
    soRegras: ['corte', 'quebra', 'numero', 'sobreposicao', 'italico', 'cabecalho', 'data', 'valor', 'altura', 'tabela'] },
  /* CPR-AJUSTES-20-10c — período encerrado: o grupo "Saem hoje · fora do saldo do período" DEPOIS do Fim do período (rolado até ele) */
  /* P106 — o período encerrado é o botão "Mês anterior" (os dois vencidos do bancada caem nele) */
  { nome: 'cpr-encerrado', url: 'tela=cpr&v=encerrado', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Mês anterior') },
  { nome: 'cpr-encerrado-saem-hoje', url: 'tela=cpr&v=encerrado', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="cpr-grupo-saem_hoje"]',
    antes: async (p) => { await clicarTexto('Mês anterior')(p);
      await p.locator('[data-testid="cpr-grupo-saem_hoje"]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(400); } },
  { nome: 'cpr-ampliado', url: 'tela=cpr', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicar('[data-testid="cpr-ampliar"]') },
  { nome: 'cpr-selo-estimado', url: 'tela=cpr', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="cpr-selo-estimado"]' },
  { nome: 'cpr-ampliado-totais', url: 'tela=cpr', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="cpr-confirmado-estimado"]', antes: clicar('[data-testid="cpr-ampliar"]') },
  /* ACESSOS-PERFIL-01 — Acessos (lista + Novo, com as mensagens dos campos, + Editar) nos sete tamanhos, e a aba Auditoria do lançamento */
  { nome: 'acessos-lista', url: 'tela=acessos', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'acessos-novo-falta', url: 'tela=acessos', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicar('[data-testid="acesso-criar"]') },
  { nome: 'acessos-editar', url: 'tela=acessos&v=editar', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'acessos-editar-login', url: 'tela=acessos&v=editar', tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: async (p) => { await p.locator('[data-testid="acesso-email"]').fill('novo.login.da.pessoa@exemplo.com.br'); await clicar('[data-testid="acesso-salvar"]')(p); } },
  ...['editar'].map((m) => ({ nome: `lancamento-${m}-Auditoria`, url: `tela=lancamento&m=${m}`, tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Auditoria') })),
  /* P116 — a aba Auditoria com UMA pessoa só: a coluna do autor (62px) aparece e o nome não corta */
  { nome: 'lancamento-editar-Auditoria-um', url: 'tela=lancamento&m=editar&aud=um', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Auditoria') },
  /* CRIAR-DO-EXTRATO-01 — a faixa da referência em UMA linha (extrato e planilha), com o histórico de 300 caracteres: varrida (nenhum
     "…") e com a MESMA altura da faixa curta (`alturasComo`), e a Geral sem rolagem dentro do modal; o vencimento faltando ao salvar */
  ...['extrato', 'planilha'].flatMap((o) => [
    { nome: `criar-do-${o}-Geral`, url: `tela=lancamento&m=novo&v=${o}`, tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]' } },
    { nome: `criar-do-${o}-Geral-longo`, url: `tela=lancamento&m=novo&v=${o}&ref=longo`, alturasComo: `tela=lancamento&m=novo&v=${o}`, tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]' } },
    { nome: `criar-do-${o}-Pagamento-longo`, url: `tela=lancamento&m=novo&v=${o}&ref=longo`, tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Pagamento') }]),
  { nome: 'lancamento-novo-Geral-7', url: 'tela=lancamento&m=novo', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* P138 — editar um lançamento gravado sem safra: "Sem safra" e a linha "sugestão: <safra> · Usar" (a da competência, do banco) */
  { nome: 'lancamento-safra-sugestao', url: 'tela=lancamento&m=editar&safra=sem' },
  { nome: 'lancamento-vencimento-falta', url: 'tela=lancamento&m=editar&v=semvenc', tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: async (p) => { await p.locator('button[tabindex="17"]').first().click(); await p.waitForTimeout(500); } },
  /* OC-DESFAZER-PREVISTO-01b — os tres estados do "Desfazer"/"Atualizar compromisso" (mock de 20/10 19h16), 460x344 fixo e sem
     rolagem, nos sete tamanhos: bloqueio por realizado/conciliado, agendado com confirmacao, Atualizar com data ja passada (e o
     desfazer pronto, o rol de sempre). */
  ...['bloqueio', 'agendado', 'pronto', 'atualizar'].map((e) => ({ nome: `oc-dialogo-${e}`, url: `tela=oc-dialogo&v=${e}`,
    tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]' } })),
  /* FIN-NOTA-PDF-01 — "Novo lançamento · da nota fiscal" (o mock aprovado), o PDF SINTETICO lido de verdade, nos sete tamanhos: o modal
     fixo nao rola (so' as duas tabelas rolam dentro do quadro delas, no pior caso de 12 parcelas e 14 itens), nada passa da caixa. */
  /* P95 — `pelachave` (a previa da chave digitada: o chip, emissao e valor em ambar) e `irmas` (a nota em 4 parcelas soltas, "k/4") */
  ...['', 'cadastrado', 'registrada', 'diverge', 'longo', 'lavoura', 'semdup', 'jalancada', 'avulsa', 'emparcela', 'cancelados', 'socancelados', 'pelachave', 'irmas', 'diferenca', 'lr', 'lr2', 'gulart', 'gulartlongo', 'm2'].map((v) => ({ nome: `nota-pdf${v ? `-${v}` : ''}`, url: `tela=nota-pdf&v=${v}`, tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-parcelas-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="nota-ja-lancada-rolagem"], [data-testid="nota-hoje-rolagem"]' },
  })),
  /* P101 — abaixo de 1000px a prévia tem três abas: as outras duas (Parcelas e lançamento; Arquivo) em todas as variantes, nos estreitos. P163-2: a
     nota JÁ LANÇADA tem as abas dela (abaixo, `nota-pdf-ja-*`) */
  ...['', 'cadastrado', 'registrada', 'diverge', 'longo', 'lavoura', 'semdup', 'jalancada', 'avulsa', 'emparcela', 'cancelados', 'socancelados', 'pelachave', 'irmas', 'diferenca']
    .filter((v) => !NOTA_JA_LANCADA.includes(v))
    .flatMap((v) => [['lancamento', 'Parcelas e lançamento'], ['arquivo', 'Arquivo']].map(([a, rotulo]) => ({ nome: `nota-pdf-aba-${a}${v ? `-${v}` : ''}`,
      url: `tela=nota-pdf&v=${v}`, tamanhos: TAMANHOS_ESTREITOS_DA_NOTA,
      semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-parcelas-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="nota-ja-lancada-rolagem"], [data-testid="nota-hoje-rolagem"]' },
      ...(v === 'irmas' && a === 'lancamento' ? { semRolarNoLugar: '[data-testid="nota-nf-digitada"]' } : {}),
      antes: async (p) => { await p.locator('[data-testid="nota-abas"] button', { hasText: rotulo }).first().click(); await p.waitForTimeout(400); } }))),
  /* P95 — "Novo a partir da nota": a nota lida, a da chave digitada, as recusadas com o campo da chave (nome comprido) e o aviso do repetido */
  /* P101 — em TODOS os tamanhos: abaixo de 1000px a tabela perde a coluna CNPJ (no `title` do Emitente) e estreita (antes vazava 155px a 750) */
  { nome: 'nota-novo-da-nota', url: 'tela=novo-da-nota', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* P74 — "Como foi pago?" › Cartão em N× na nota sem duplicata: o cartão, 4 parcelas, a 1ª fatura sugerida em âmbar e a grade (Igual todo
     mês e Parcelas livres); o modal fixo não rola (só a lista da grade) */
  /* P101 — em TODOS os tamanhos: abaixo de 1000px a prévia vira três abas e o cartão mora na "Parcelas e lançamento" */
  ...[['', null], ['-livres', 'Parcelas livres']].map(([s, livres]) => ({ nome: `nota-pdf-cartao${s}`, url: 'tela=nota-pdf&v=semdup', tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolarNoLugar: '[data-testid="nota-cartao"] > div:first-child',
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-itens-rolagem"], [data-testid="nota-parcelas-rolagem"], [data-testid="lista-de-parcelas"]' },
    antes: async (p) => { await cartaoEm4(p); if (livres) await clicarTexto(livres)(p); } })),
  /* P74 B — "Parcelar este lançamento" (aba Pagamento do Editar): fechado, aberto com 4 no cartão (a sugestão em âmbar, a Situação) e a
     confirmação antes → depois; e o pago (o botão apagado com a frase) */
  { nome: 'lancamento-parcelar-fechado', url: 'tela=lancamento&m=editar&v=salcartao', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarTexto('Pagamento') },
  /* P104 — o bloco aberto SEM parcelas (a frase do que falta, a sugestão do 1º vencimento) e COM 4, e a parcela solta "6/6": nos 9 tamanhos e
     no do print (1750×1000), e nada rola escondido no lugar no bloco (`semRolarNoLugar`: o gate do P74 aceitava o `uma-linha-que-rola`
     fora de tabela, e o estado sem parcelas não tinha cenário) */
  { nome: 'lancamento-parcelar-aberto', url: 'tela=lancamento&m=editar&v=salcartao', tamanhos: TAMANHOS_DO_P104, antes: parcelarEm4, semRolarNoLugar: '[data-testid="parcelar-este"]' },
  { nome: 'lancamento-parcelar-aberto-vazio', url: 'tela=lancamento&m=editar&v=salcartao', tamanhos: TAMANHOS_DO_P104, semRolarNoLugar: '[data-testid="parcelar-este"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcelar-este-abrir"]').click(); await p.waitForTimeout(800); } },
  { nome: 'lancamento-parcela-solta', url: 'tela=lancamento&m=editar&v=salsolta', tamanhos: TAMANHOS_DO_P104, semRolarNoLugar: '[data-testid="parcela-solta"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcela-solta-frase"]').waitFor(); await p.waitForTimeout(600); } },
  { nome: 'lancamento-parcelar-pago', url: 'tela=lancamento&m=editar&v=salpago', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarTexto('Pagamento') },
  /* P74b — a parcela no Editar: o bloco "Parcelamento" com "Voltar para à vista" (pronto e apagado com a frase) e a confirmação antes → depois */
  /* P163-2 (NOTA-ABAS-PREVIA-01) — a nota JÁ LANÇADA em abas, cada aba nos sete tamanhos (a "No sistema hoje" é a que abre: `nota-pdf-<v>` acima);
     abaixo de 1000px também a aba "Arquivo" (ver a nota). Só rolam por dentro as tabelas (a do sistema, a da prévia, a dos itens). */
  /* mock da nota já lançada (29/10): Nota e Fornecedor fixos em cima; as abas Parcelas × sistema (a que abre) · Como vai ficar · Itens · Lançamento */
  ...NOTA_JA_LANCADA.flatMap((v) => [['hoje', 'No sistema hoje', TAMANHOS_DO_CONSORCIO], ['parcelas', 'Parcelas × sistema', TAMANHOS_DO_CONSORCIO], ['ficar', 'Como vai ficar', TAMANHOS_DO_CONSORCIO],
    ['itens', 'Itens (', TAMANHOS_DO_CONSORCIO], ['lancamento', 'Lançamento', TAMANHOS_DO_CONSORCIO], ['arquivo', 'Arquivo', TAMANHOS_ESTREITOS_DA_NOTA]].map(([a, rotulo, tamanhos]) => ({
    nome: `nota-pdf-ja-${a}-${v}`, url: `tela=nota-pdf&v=${v}`, tamanhos: a === 'arquivo' ? tamanhos : [...tamanhos, [1366, 768]], titulosDeBloco: true,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-ja-lancada-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="previa-rolagem"], [data-testid="nota-hoje-rolagem"], [data-testid="itens-rolagem"]' },
    antes: async (p) => {
      await p.locator('[data-testid="nota-abas-ja"]').waitFor({ timeout: 8000 });
      await p.locator('[data-testid="nota-abas-ja"] button', { hasText: rotulo }).first().click(); await p.waitForTimeout(500);
    } }))),
  { nome: 'lancamento-voltar-a-vista', url: 'tela=lancamento&m=editar&v=salparcela', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarTexto('Pagamento') },
  { nome: 'lancamento-voltar-a-vista-paga', url: 'tela=lancamento&m=editar&v=salparcelapaga', tamanhos: TAMANHOS_DO_CONTRATO, antes: clicarTexto('Pagamento') },
  { nome: 'lancamento-voltar-a-vista-confirmar', url: 'tela=lancamento&m=editar&v=salparcela', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="voltar-a-vista-botao"]').click(); await p.waitForTimeout(500); } },
  /* P143 — as parcelas da compra no bloco: 14 (a lista rola dentro do bloco, o resto fica), a prévia do "Juntar" das 6 soltas e a forma gravada
     fora da lista no gatilho (o "valor atual"). Dados SINTÉTICOS. */
  { nome: 'lancamento-parcelas-14', url: 'tela=lancamento&m=editar&v=salparcela&pp=14', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcelas-no-pagamento"]').waitFor(); await p.waitForTimeout(500); } },
  /* P143 (Gabriel 29/10 15:03) — a solta PELA NOTA ("Parcela 3 - None" da NF 4964, sintético): as 3 da nota e o "Juntar"; e a prévia */
  { nome: 'lancamento-parcela-nota', url: 'tela=lancamento&m=editar&v=salnota', tamanhos: TAMANHOS_DO_P104, semRolarNoLugar: '[data-testid="parcela-solta"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcela-solta-juntar"]:not([disabled])').waitFor(); await p.waitForTimeout(600); } },
  { nome: 'lancamento-parcela-nota-juntar', url: 'tela=lancamento&m=editar&v=salnota', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcela-solta-juntar"]:not([disabled])').waitFor();
      await p.locator('[data-testid="parcela-solta-juntar"]').click(); await p.locator('[data-testid="parcela-solta-juntar-lista"]').waitFor(); await p.waitForTimeout(400); } },
  { nome: 'lancamento-parcela-solta-juntar', url: 'tela=lancamento&m=editar&v=salsolta', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcela-solta-juntar"]:not([disabled])').waitFor();
      await p.locator('[data-testid="parcela-solta-juntar"]').click(); await p.locator('[data-testid="parcela-solta-juntar-lista"]').waitFor(); await p.waitForTimeout(400); } },
  { nome: 'lancamento-forma-valor-atual', url: 'tela=lancamento&m=editar&v=salparcela&forma=Cart%C3%A3o%20de%20Cr%C3%A9dito', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcelas-no-pagamento"]').waitFor(); await p.waitForTimeout(500); } },
  { nome: 'lancamento-parcelar-confirmar', url: 'tela=lancamento&m=editar&v=salcartao', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await parcelarEm4(p); await p.locator('[data-testid="parcelar-este-confirmar"]').click(); await p.waitForTimeout(500); } },
  /* P128a — os TRÊS CAMINHOS com o "Criar um lançamento novo" escolhido (o aviso vermelho "duplica", o botão "Criar novo (duplica)") */
  { nome: 'nota-pdf-caminho-criar', url: 'tela=nota-pdf&v=diferenca', tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-parcelas-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="nota-ja-lancada-rolagem"], [data-testid="nota-hoje-rolagem"]' },
    antes: async (p) => {
      const t = p.locator('[data-testid="nota-abas"] button', { hasText: 'Parcelas e lançamento' });
      if (await t.count()) { await t.first().click(); await p.waitForTimeout(400); }
      /* P163-2 — os 3 cartões saíram: "Criar um lançamento novo (duplica)" mora no ⋯ do rodapé */
      await p.locator('[data-testid="nota-mais"]').click(); await p.locator('[data-testid="nota-mais-criar-novo"]').click(); await p.waitForTimeout(400);
    } },
  /* P127 + P128c — o Novo documento que LÊ A NOTA: lida (com as três divergências lado a lado e o "Ver o que a nota muda") e a que não se
     lê (PDF sem texto: a frase "itens não gravados"). O arquivo entra pelo MESMO input da área (o XML sintético exposto pela bancada). */
  /* P128b — a prévia campo a campo (5 parcelas, nomes compridos): juntar; o caminho 2 (Venc./Valor); a recusa do banco no rodapé */
  /* P163 v4 — `difere`: uma parcela noutra fazenda (a coluna opcional Fazenda aparece, as outras não) */
  ...[['juntar', ''], ['atualizar', '&cam=2'], ['recusa', '&v=recusa'], ['difere', '&v=difere']].map(([v, u]) => ({ nome: `previa-completar-${v}`, url: `tela=previa-completar${u}`,
    tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]', semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="previa-rolagem"]' },
    antes: async (p) => { await p.locator(v === 'recusa' ? '[data-testid="previa-recusa"]' : '[data-testid="previa-dre"]').waitFor({ timeout: 8000 }); await p.waitForTimeout(400); } })),
  /* P164 — `confere`: a faixa da nota com "ao registrar, o lançamento fica com nº …, tipo Nota Fiscal, competência …" (a prévia do banco) */
  ...[['lida', 'nota.xml'], ['nao-lida', 'escaneado.pdf'], ['confere', 'nota.xml']].map(([v, nome]) => ({ nome: `documento-nota-${v}`,
    url: v === 'confere' ? 'tela=documento-nota&v=confere' : 'tela=documento-nota',
    tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]',
    antes: async (p) => {
      const conteudo = nome.endsWith('.xml') ? await p.evaluate(() => globalThis.__xmlDaBancada) : '%PDF-1.4 sem texto';
      await p.locator('[data-testid="doc-arquivo"]').setInputFiles({ name: nome, mimeType: nome.endsWith('.xml') ? 'application/xml' : 'application/pdf', buffer: Buffer.from(conteudo) });
      await p.locator(nome.endsWith('.xml') ? '[data-testid="nota-lida"]' : '[data-testid="nota-nao-lida"]').waitFor({ timeout: 8000 });
      if (v === 'confere') await p.locator('[data-testid="nota-lancamento-fica"]').waitFor({ timeout: 8000 });
      await p.waitForTimeout(400);
    } })),
  /* P167 — o modal do documento: a confirmação do cancelamento da nota NO RODAPÉ (à vista; o Salvar some) e a faixa da NF repetida */
  { nome: 'documento-nota-cancelar', url: 'tela=documento-nota&v=cancelar', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]',
    antes: async (p) => { await p.locator('[data-testid="abrir-cancelar-nota"]').click(); await p.locator('[data-testid="confirmar-cancelar-nota"]').waitFor({ state: 'visible', timeout: 4000 }); await p.waitForTimeout(300); } },
  { nome: 'documento-nota-repetida', url: 'tela=documento-nota&v=repetida', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[role="dialog"]',
    antes: async (p) => {
      const conteudo = await p.evaluate(() => globalThis.__xmlDaBancada);
      await p.locator('[data-testid="doc-arquivo"]').setInputFiles({ name: 'nota.xml', mimeType: 'application/xml', buffer: Buffer.from(conteudo) });
      await p.locator('[data-testid="nota-repetida"]').waitFor({ timeout: 8000 }); await p.waitForTimeout(400);
    } },
  /* P96a — a confirmação do "Usar a nota lida". (A do "Juntar as 4 e anexar" saiu com o P128b: o juntar é a prévia campo a campo,
     medida em `previa-completar-juntar`.) */
  /* a frase da NF digitada (2 linhas reservadas) nos largos — nos estreitos ela mora na aba "Parcelas e lançamento" (nota-pdf-aba-lancamento-irmas) */
  { nome: 'nota-pdf-nf-digitada', url: 'tela=nota-pdf&v=irmas', tamanhos: TAMANHOS_DO_CONSORCIO.filter(([l]) => l >= 1000),
    semRolarNoLugar: '[data-testid="nota-nf-digitada"]' },
  { nome: 'nota-pdf-nota-lida-confirmar', url: 'tela=nota-pdf&v=irmas', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[role="alertdialog"]',
    antes: async (p) => {
      /* P163-2 — a nota já lançada abre em abas (`nota-abas-ja`, em todo tamanho): o "Usar a nota lida" mora em "No sistema hoje" */
      const ja = p.locator('[data-testid="nota-abas-ja"]');
      if (await ja.count()) { await ja.locator('button', { hasText: 'Parcelas × sistema' }).first().click(); await p.waitForTimeout(400); }
      else if (p.viewportSize().width < 1000) { await p.locator('[data-testid="nota-abas"] button', { hasText: 'Parcelas e lançamento' }).first().click(); await p.waitForTimeout(400); }
      await p.locator('[data-testid="nota-usar-nota-lida"]').first().click(); await p.waitForTimeout(600);
    } },
  /* FIN-NOTA-PDF-01b — a confirmacao do "Atualizar e parcelar" (o texto que diz que o existente vira 1/4) */
  { nome: 'nota-pdf-parcelar-confirmar', url: 'tela=nota-pdf&v=parcelar', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await p.locator('[data-testid="nota-atualizar-este"]').first().click(); await p.waitForTimeout(600); } },
  /* ITENS-NOTA-01 — a aba "Itens da nota (N)" do Novo lançamento pela nota (Valores e Fiscal), o diálogo da OC no pior caso (40 itens,
     descrição de 120 caracteres, razão social longa) e o backfill antes e depois do Simular: o modal fixo nao rola, so' o corpo da tabela */
  ...[['', null], ['-fiscal', 'Fiscal']].flatMap(([s, f]) => [
    { nome: `lancamento-xml-Itens${s}`, url: 'tela=lancamento&m=novo&v=xml', tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_ITENS },
      antes: async (p) => { await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); if (f) await clicarTexto(f)(p); } },
    { nome: `itens-nota-oc${s}`, url: 'tela=itens-nota', tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_ITENS }, antes: f ? clicarTexto(f) : undefined }]),
  /* NOTA-CONTAS-NA-CRIACAO-01 A — o NOVO pela nota: a vista Contas dos itens ("Dividir em N contas ao salvar") e, depois de dividir (o item 1
     para uma conta de Lavoura, pela barra de atividade), a Geral com as partes PENDENTES ("dividida em 2 contas ao salvar") */
  { nome: 'lancamento-xml-Itens-contas', url: 'tela=lancamento&m=novo&v=xml', tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="contas-quadro"] .overflow-y-auto, [data-testid="resumo-lancamento"]' },
    antes: async (p) => { await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); await clicarTexto('Contas')(p); } },
  { nome: 'lancamento-xml-Geral-dividida', url: 'tela=lancamento&m=novo&v=xml', tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: async (p) => {
      await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); await clicarTexto('Contas')(p);
      await p.locator('[data-testid="conta-do-item-1"] [role="combobox"]').first().click(); await p.waitForTimeout(400);
      await p.locator('[data-testid="conta-barra-atividade"] button', { hasText: 'Lavoura' }).first().click(); await p.waitForTimeout(300);
      await p.locator('[data-testid="conta-lista"] button', { hasText: 'Insumos Lavoura Milho' }).first().click(); await p.waitForTimeout(300);
      await p.locator('[data-testid="contas-dividir"]').first().click(); await p.waitForTimeout(300);
      await p.getByRole('tab', { name: /^Geral/ }).first().click(); await p.waitForTimeout(500); } },
  /* ITENS-NOTA-FONTE-01 — ate' 18 itens SEM rolar a partir de 1126x579 (a tabela tambem, so' o corpo poderia); nos menores, nada corta */
  ...['xml18', 'xml14'].flatMap((x) => [
    { nome: `lancamento-${x}-Itens`, url: `tela=lancamento&m=novo&v=${x}`, tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_ITENS },
      antes: async (p) => { await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); } },
    { nome: `lancamento-${x}-Itens-sem-rolar`, url: `tela=lancamento&m=novo&v=${x}`, tamanhos: [[1126, 579], [1300, 704], [1440, 800]],
      semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_ITENS }, semRolarVertical: '[data-testid="itens-rolagem"]',
      antes: async (p) => { await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); } }]),
  /* FORN-TROCAR-LOTE-01 — o modal (40 origens de nome longo, os avisos) e a barra da selecao na lista com o "…" */
  { nome: 'trocar-fornecedor', url: 'tela=trocar-fornecedor', tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="trocar-origens"]' } },
  { nome: 'financeiro-barra-lote', url: 'tela=financeiro', tamanhos: TAMANHOS_DO_CONTRATO, regiao: '[data-testid="barra-lote"]',
    antes: async (p) => { await p.locator('tbody button[role="checkbox"]').first().click(); await p.waitForTimeout(500); } },
  /* NOTA-FORNECEDOR-COMPARAR-01 — o comparar antes de atualizar o cadastro, normal e "nao parece o certo"; e o "Confirmar" */
  ...['', 'errado'].map((x) => ({ nome: `comparar-cadastro${x ? `-${x}` : ''}`, url: `tela=comparar-cadastro&v=${x}`, tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="comparar-corpo"]' } })),
  { nome: 'comparar-cadastro-confirmar', url: 'tela=comparar-cadastro', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="comparar-corpo"]' },
    antes: clicar('[data-testid="comparar-atualizar"]') },
  { nome: 'itens-nota-guardadas', url: 'tela=itens-nota&v=guardadas', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]' } },
  { nome: 'itens-nota-guardadas-simulado', url: 'tela=itens-nota&v=guardadas', tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="itens-guardadas"] .overflow-y-auto' },
    antes: async (p) => { await p.locator('[data-testid="itens-guardadas-simular"]').click(); await p.waitForFunction(() => document.querySelectorAll('[data-testid="itens-guardadas-linha"]').length === 30); await p.waitForTimeout(300); } },
  { nome: 'lancamento-xml-Pagamento-longo', url: 'tela=lancamento&m=novo&v=xml&desc=longo', alturasComo: 'tela=lancamento&m=novo&v=xml&desc=curto', antes: clicarTexto('Pagamento') },
  /* FIN-CONSORCIO-02 — o cadastro do consórcio, aba a aba, nos sete tamanhos do mock: nada rola dentro do modal além da lista de
     parcelas (`semRolagem`: a lista é a única exceção) e nada passa da caixa dele */
  ...[['consorcio', ''], ['custos', 'Custos e parcelas'], ['parcelas', /^Parcelas/], ['documentos', /^Documentos/]].map(([n, aba]) => ({
    nome: `consorcio-${n}`, url: 'tela=consorcio', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    antes: aba ? async (p) => { await p.getByRole('button', { name: aba }).first().click(); await p.waitForTimeout(500); } : undefined })),
  /* FIN-CONTRATO-SALVAR-01 — o cadastro de contrato de crédito, Novo e Editar, todas as abas, nos sete tamanhos; e o "Falta:" do Salvar */
  ...['novo', 'editar'].flatMap((m) => ['Contrato', 'Liberações', 'Condições e cronograma', 'Destinação', 'Documentos'].map((aba) => ({
    nome: `cadastro-contrato-${m}-${aba}`, url: `tela=cadastro-contrato&m=${m}`, tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: async (p) => { await p.getByRole('button', { name: aba, exact: true }).first().click(); await p.waitForTimeout(500); } }))),
  { nome: 'cadastro-contrato-novo-falta', url: 'tela=cadastro-contrato&m=novo', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicar('[data-testid="salvar-cadastro"]') },
  /* FIN-CONTRATO-CRONOGRAMA-01 — a aba Condições e cronograma: os dois casos do relato (SINTÉTICOS), o novo SAC 60 mensais, a prévia do
     regerar no lugar da tabela, 120 parcelas e a descrição de 120 caracteres; `tabelaMinima`: cabeçalho, 3 linhas e o Total inteiros */
  ...[['sr', 'editar&v=sr'], ['rrcc', 'editar&v=rrcc'], ['sac60', 'novo&v=sac60'], ['120', 'editar&v=120'], ['desc', 'editar&v=desc'], ['regerar', 'editar&v=regerar']].map(([n, q]) => ({
    nome: `cadastro-contrato-cronograma-${n}`, url: `tela=cadastro-contrato&m=${q}`, tamanhos: [[750, 483], ...TAMANHOS_DO_CONSORCIO],
    tabelaMinima: { sel: n === 'regerar' ? '[data-testid="antes-depois"]' : '[data-testid="tabela-da-aba-condicoes"]', linhas: 3 },
    antes: async (p) => {
      await p.getByRole('button', { name: 'Condições e cronograma', exact: true }).first().click(); await p.waitForTimeout(500);
      if (n === 'regerar') { await p.locator('[data-testid="abrir-regerar"]').click(); await p.waitForTimeout(400);
        await p.getByRole('button', { name: 'Recalcular todas' }).first().click(); await p.waitForTimeout(500); }
    } })),
  ...[['novo-consorcio', ''], ['novo-custos', 'Custos e parcelas']].map(([n, aba]) => ({
    nome: `consorcio-${n}`, url: 'tela=consorcio&novo=1', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    antes: aba ? async (p) => { await p.getByRole('button', { name: aba }).first().click(); await p.waitForTimeout(500); } : undefined })),
  /* P87 — o Negociar lote (dado sintético do caso de 23/10), aba a aba: a regra `valor` põe 999.999.999,99 em cada campo de valor
     (os seis da aba dos bônus inclusive) e o número não pode cortar. Antes do P87 os bônus tinham 99px e pediam 121. */
  ...[['desempenho', null], ['preco', 'Preço'], ['bonus', 'Bônus, descontos e impostos']].map(([n, aba]) => ({
    nome: `negociar-lote-${n}`, url: 'tela=negociar-lote', tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: aba ? async (p) => { await p.getByRole('button', { name: aba, exact: true }).first().click(); await p.waitForTimeout(400); } : undefined })),
  /* P92 — o "Resultado do lote" (colunas de largura fixa, 400px de 1024 para cima): o caso real (R$ 976.224,00), R$ 99.999.999,99, o teto
     (R$ 999.999.999,99 em toda linha) e acima do teto (dez dígitos: a fonte do número desce até caber). Numero que passa da celula =
     corte seco (regra 6); a folga entre o rotulo e o numero, >= 6px (regra 8). */
  ...[['real', ''], ['99mi', '&v=99mi'], ['teto', '&v=teto'], ['acima', '&v=acima']].map(([n, q]) => ({
    nome: `negociar-lote-resumo-${n}`, url: `tela=negociar-lote${q}`, tamanhos: TAMANHOS_DO_P92, folgaCelulas: '[data-testid="resultado-do-lote"]' })),
  /* UI-CAMPO-MOEDA-01 — os campos de valor de largura fixa dos modais fora da bancada (a regra `valor` os mede com 999.999.999,99) */
  { nome: 'campos-moeda', url: 'tela=campos-moeda', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* CONC-BLOCO-SINAL-MISTO-01 — o bloco da Conferência com saída + reembolso: o que fecha e a recusa, nos sete tamanhos */
  { nome: 'casar-bloco-misto', url: 'tela=casar-bloco', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'casar-bloco-recusa', url: 'tela=casar-bloco&v=recusa', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* FIN-CONSORCIO-03 — o fundo comum do termo (% por parcela) na aba Custos e prazos, e o "Falta:" do rodapé depois do Salvar no novo
     (o modal tem a mesma caixa: `alturasComo` contra a aba de sempre) */
  { nome: 'consorcio-custos-fc-pct', url: 'tela=consorcio&fc=pct', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    alturasComo: 'tela=consorcio',
    antes: async (p) => { await p.getByRole('button', { name: 'Custos e parcelas' }).first().click(); await p.waitForTimeout(500); } },
  { nome: 'consorcio-novo-falta', url: 'tela=consorcio&novo=1', tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    antes: clicar('[data-testid="salvar-consorcio"]') },
  /* FIN-CONSORCIO-04 — "Custos e parcelas" nos dois modos: o 002122 pelas faixas do termo (editável) e pelas regras; 200 parcelas em 6 faixas
     nos dois modos. Só a tabela das faixas rola; `tabelaMinima`: a tabela mostra o cabeçalho, 3 linhas e o Total inteiros */
  ...[['faixas', 'tela=consorcio&modo=faixas'], ['regras', 'tela=consorcio&fc=pct'], ['200-faixas', 'tela=consorcio&n=200'], ['200-regras', 'tela=consorcio&n=200&r=1']].map(([n, url]) => ({
    nome: `consorcio-custos-${n}`, url, tamanhos: [[750, 483], ...TAMANHOS_DO_CONSORCIO],
    semRolagem: { dentro: '[role="dialog"]', exceto: EXCETO_CONSORCIO },
    tabelaMinima: { sel: '[data-testid="lista-faixas-consorcio"]', linhas: 3 },
    antes: async (p) => { await p.getByRole('button', { name: 'Custos e parcelas' }).first().click(); await p.waitForTimeout(500);
      if (url.includes('&r=1')) { await p.locator('[data-campo="montarPor"] button', { hasText: 'Regras (%)' }).first().click(); await p.waitForTimeout(300);
        const ok = p.locator('[data-testid="confirmar-passar-regras"]'); if (await ok.count()) { await ok.click(); await p.waitForTimeout(500); } } } })),
  /* UI-SEM-CORTE-02 — os tres modais da OC, TODAS as abas (dados sinteticos; o mes FECHADO no P1, com o "Reabrir mês" no rodape), nos
     tres tamanhos do gate: o modal da OC e' limitado a 1024 e nao tem desenho abaixo de 1000. A compra so' abre na Auditoria pelo
     clique (o shell nao a aceita como aba inicial). */
  ...[['venda', ['venda', 'negociacao', 'entrega', 'documentos', 'financeiro', 'auditoria']], ['abate', ['abate', 'negociacao', 'entrega', 'documentos', 'financeiro', 'auditoria']],
    ['compra', ['compra', 'negociacao', 'recebimento', 'documentos', 'financeiro', 'auditoria']]].flatMap(([v, abas]) => abas.map((aba) => ({
    nome: `oc-${v}-${aba}`, url: `tela=oc&v=${v}&aba=${aba === 'auditoria' && v === 'compra' ? '' : aba}`,
    antes: aba === 'auditoria' && v === 'compra' ? clicarTexto('Auditoria') : undefined }))),
  /* OC-DOC-VENDA-01 — a aba Documentos COM documentos, ABATE x VENDA (o mesmo componente): a lista em blocos, o Novo documento (250px)
     e, na venda, a nota repetida (chave digitada; o rotulo longo na faixa com o link). No modal real, nos tamanhos da OC.
     ⚠ SEM A REGRA "data": a tabela do abate escreve dd/mm/aa (`dataCurta`) — a mesma divida do oc-cc (OC-CC-DATA-INTEIRA). */
  ...['abate', 'venda'].flatMap(t => [
    { nome: `oc-docs-${t}-lista`, url: `tela=oc&v=${t}&aba=documentos&docs=1` },
    { nome: `oc-docs-${t}-novo`, url: `tela=oc&v=${t}&aba=documentos&docs=1`, antes: clicarRotulo(/Novo documento/) },
  ]).concat([{ nome: 'oc-docs-venda-repetida', url: 'tela=oc&v=venda&aba=documentos&docs=1',
    antes: async (p) => { await clicarRotulo(/Novo documento/)(p); await p.locator('[data-campo="chaveAcesso"] input').fill('50261002935843000105558900094447901000000017'); await p.waitForTimeout(500); } }])
    .map(c => ({ ...c, soRegras: ['corte', 'quebra', 'numero', 'sobreposicao', 'italico', 'cabecalho', 'valor', 'altura', 'rolagem', 'tabela'] })),
  /* OC-RECEB-PARCIAL-01 — a conta corrente da venda com o recebimento parcial dividido (Receb. 1/2 + 2/2, a faixa do que falta) e o
     "Buscar recebimento no Financeiro" com os dois grupos e o nome longo numa linha */
  /* ⚠ SEM A REGRA "data": a conta corrente escreve dd/mm/aa DE PROPOSITO (`dataCurta`, coluna Data de 53px na `REGUA_EXTRATO`
     medida no modal de 1024); dd/mm/aaaa pede outra regua da tabela inteira — divida registrada no CLAUDE.md (OC-CC-DATA-INTEIRA). */
  { nome: 'oc-cc-recebimento-parcial', url: 'tela=oc-cc', tamanhos: TAMANHOS_DO_CONSORCIO,
    soRegras: ['corte', 'quebra', 'numero', 'sobreposicao', 'italico', 'cabecalho', 'valor', 'altura', 'rolagem', 'tabela'] },
  /* OC-CORRECOES-01 C3 — o Buscar com as tres datas INTEIRAS (dd/mm/aaaa): este entra com a regra "data", medido SO' no modal (a conta
     corrente escondida atras dele e' a de cima, com dd/mm/aa) */
  { nome: 'oc-cc-buscar-recebimento', url: 'tela=oc-cc&v=buscar', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="dialogo-buscar-recebimento"]' },
  /* OC-CC-BOTAO-BUSCAR-DESLOCA-01 — a faixa das sub-abas da conta corrente DENTRO do modal da OC (venda e abate), com o principal ja'
     programado: o motivo no meio com "…" e os dois botoes inteiros a' direita. Os tamanhos em que o modal da OC tem desenho. */
  ...['venda', 'abate'].map((v) => ({ nome: `oc-cc-faixa-${v}`, url: `tela=oc&v=${v}&aba=financeiro&cc=1`,
    tamanhos: [[1000, 600], [1126, 579], [1300, 704], [1440, 800]], botoesDentro: '[data-testid="faixa-subabas"]',
    soRegras: ['corte', 'quebra', 'numero', 'sobreposicao', 'italico', 'cabecalho', 'valor', 'altura', 'rolagem', 'tabela', 'botao'] })),
  /* UI-SEM-CORTE-02 — o consultor: o ⚑ aberto (Pendências do cliente), a Nova pendência e o Resumo dos clientes */
  { nome: 'pendencias-do-cliente', url: 'tela=pendencias', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'pendencias-nova', url: 'tela=pendencias&v=nova', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'pendencias-resumo', url: 'tela=pendencias&v=resumo', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* UI-SEM-CORTE-02 — o Casar com o banco 1:1 (Acessos: os cenarios do ACESSOS-PERFIL-01, acima) */
  { nome: 'casar-1x1-vazio', url: 'tela=casar-1x1', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'conciliar-sobra', url: 'tela=conciliar&v=sobra', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="modal-conciliar"]' },
  { nome: 'conciliar-falta', url: 'tela=conciliar&v=falta', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="modal-conciliar"]' },
  { nome: 'conciliar-igual', url: 'tela=conciliar&v=igual', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="modal-conciliar"]' },
  { nome: 'conciliar-teto', url: 'tela=conciliar&v=teto', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="modal-conciliar"]' },
  { nome: 'casar-1x1-levado', url: 'tela=casar-1x1&v=levado', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* FIN-POS-FIXADO-01b — o 1:1 da parcela pós-fixada (a linha do juro real) e a frase do bloco */
  { nome: 'casar-1x1-pos', url: 'tela=casar-1x1&v=pos', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* CONC-VALOR-CERTO-ACEITA-01 — a pergunta do valor do extrato no rodapé, com o botão "Ligar com o valor do extrato" */
  { nome: 'casar-1x1-certo', url: 'tela=casar-1x1&v=certo', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* P139 — criar transferencia pela linha do extrato (um espelho escolhido, empate, gemea, ja' lancada) e o lote de 6; valores no teto */
  ...['espelho', 'empate', 'gemea', 'existente'].map((v) => ({ nome: `criar-transferencia-${v}`, url: `tela=criar-transferencia&v=${v}`,
    tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="modal-criar-transferencia"]' })),
  { nome: 'criar-transferencias-lote', url: 'tela=criar-transferencia&v=lote', tamanhos: TAMANHOS_DO_CONSORCIO,
    regiao: '[data-testid="modal-criar-transferencias-lote"]' },
  { nome: 'casar-bloco-pos', url: 'tela=casar-bloco&v=pos', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* P154 — a prévia dos previstos fora da vigência (encurtada e cancelar), vazia, carregando e com a recusa; valores no teto */
  ...['encurtada', 'cancelar', 'vazia', 'carregando', 'erro'].map((v) => ({ nome: `fora-da-vigencia-${v}`, url: `tela=fora-da-vigencia&v=${v}`,
    tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="modal-fora-da-vigencia"]' })),
  /* P124 — a Conciliação do mês com o lote (de 1000px para cima: CONC-ESTREITA); antes e depois de buscar as sugestões, com o resumo do
     lote aberto e com a recusa do banco na linha */
  { nome: 'palco-do-mes', url: 'tela=palco-do-mes', tamanhos: TAMANHOS_DA_CONCILIACAO, regiao: '[data-testid="palco-do-mes"]',
    antes: async (p) => { await p.locator('[data-testid="linha-palco"]').first().waitFor(); await p.waitForTimeout(400); } },
  { nome: 'palco-do-mes-sugestoes', url: 'tela=palco-do-mes', tamanhos: TAMANHOS_DA_CONCILIACAO, regiao: '[data-testid="palco-do-mes"]',
    antes: async (p) => { await p.locator('[data-testid="buscar-sugestoes"]').click(); await p.locator('[data-testid="chip-sugestao-exata"]:not([disabled])').waitFor(); await p.waitForTimeout(400); } },
  { nome: 'palco-do-mes-previa', url: 'tela=palco-do-mes', tamanhos: TAMANHOS_DA_CONCILIACAO, regiao: '[data-testid="palco-do-mes"]',
    antes: async (p) => { await p.locator('[data-testid="buscar-sugestoes"]').click(); await p.locator('[data-testid="chip-sugestao-exata"]:not([disabled])').waitFor();
      await p.locator('[data-testid="conciliar-selecionados"]').click(); await p.waitForTimeout(400); } },
  { nome: 'palco-do-mes-recusa', url: 'tela=palco-do-mes&v=recusa', tamanhos: TAMANHOS_DA_CONCILIACAO, regiao: '[data-testid="palco-do-mes"]',
    antes: async (p) => { await p.locator('[data-testid="buscar-sugestoes"]').click(); await p.locator('[data-testid="chip-sugestao-exata"]:not([disabled])').waitFor();
      await p.locator('[data-testid="conciliar-selecionados"]').click(); await p.locator('[data-testid="confirmar-lote"]').click();
      await p.locator('[data-testid="resultado-par"]').first().waitFor(); await p.waitForTimeout(400); } },
  /* P141 (CONC-LAYOUT-01) — a aba Conciliação (Saldos | Resumo | Status; a régua nova de Saldos com Data, OFX/PDF, a Diferença estreita e
     o ↗) e o "Extrato do sistema" do ↗, de 1000px para cima (CONC-ESTREITA), com o pior caso (`dados/conciliacao.ts`) */
  { nome: 'conciliacao-saldos', url: 'tela=conciliacao', tamanhos: TAMANHOS_DA_CONCILIACAO,
    antes: async (p) => { await p.locator('[data-testid="linha-saldo-conta"]').first().waitFor(); await p.waitForTimeout(500); } },
  { nome: 'conciliacao-saldos-sem-arquivos', url: 'tela=conciliacao&v=sem', tamanhos: TAMANHOS_DA_CONCILIACAO,
    antes: async (p) => { await p.locator('[data-testid="linha-saldo-conta"]').first().waitFor(); await p.waitForTimeout(500); } },
  { nome: 'conciliacao-conta-escolhida', url: 'tela=conciliacao', tamanhos: TAMANHOS_DA_CONCILIACAO,
    antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p); } },
  /* P166 (CONC-TELA-02) — a FAIXA do status nos outros três casos (verde, âmbar com "corrigir ›", cinza com as frases do dono) e os nomes
     no TAMANHO REAL: de 1024px para cima o nome da conta não pode cortar (o gesto mede cada nome e recusa o que não cabe inteiro) */
  ...['ok', 'pendencia', 'pendente'].map((v) => ({ nome: `conciliacao-faixa-${v}`, url: `tela=conciliacao&v=${v}`, tamanhos: TAMANHOS_DA_CONCILIACAO,
    antes: async (p) => { await p.locator('[data-testid="faixa-status"]').waitFor(); await p.waitForTimeout(500); } })),
  { nome: 'conciliacao-nomes-inteiros', url: 'tela=conciliacao&v=nj', tamanhos: TAMANHOS_DA_CONCILIACAO,
    antes: async (p) => {
      await p.locator('[data-testid="linha-saldo-conta"]').first().waitFor(); await p.waitForTimeout(500);
      if (p.viewportSize().width < 1024) return;
      const cortados = await p.$$eval('[data-testid="nome-conta"]', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
      if (cortados.length > 0) throw new Error(`nome de conta cortado a ${p.viewportSize().width}px: ${cortados.join(' | ')}`);
    } },
  { nome: 'conciliacao-extrato-do-sistema', url: 'tela=extrato-do-sistema', tamanhos: TAMANHOS_DA_CONCILIACAO, regiao: '[data-testid="modal-extrato-sistema"]',
    antes: async (p) => { await p.locator('[data-testid="sistema-saldo-final"]').waitFor(); await p.waitForTimeout(500); } },
  { nome: 'conciliacao-extrato-do-sistema-carregando', url: 'tela=extrato-do-sistema&v=carregando', tamanhos: TAMANHOS_DA_CONCILIACAO,
    regiao: '[data-testid="modal-extrato-sistema"]' },
  /* P159a (CONC-TELAS-01) — o Casar lançamentos: a barra de UMA linha (sem conta: "Escolha a conta"), o Extrato (banco) por dia de 1000px
     para cima (a página da Conciliação, CONC-ESTREITA) e a Conferência (modal quase tela cheia) nos 10 tamanhos, no pior caso
     (`dados/espelho.ts`): com os vencidos abertos e no mês curto (a lista não enche a tela) */
  { nome: 'casar-barra-sem-conta', url: 'tela=conciliacao', tamanhos: TAMANHOS_DA_CONCILIACAO,
    antes: async (p) => { await p.locator('[data-testid="linha-saldo-conta"]').first().waitFor(); await clicarRotulo(/^Casar lançamentos$/)(p);
      await p.locator('[data-testid="barra-casar"]').waitFor(); } },
  ...[['casar-extrato', 'tela=conciliacao'], ['casar-extrato-poucos', 'tela=conciliacao&v=poucos']].map(([nome, url]) => ({ nome, url,
    tamanhos: TAMANHOS_DA_CONCILIACAO, antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
      await clicarRotulo(/^Casar lançamentos$/)(p); await p.locator('[data-testid="extrato-saldo-final"]').waitFor(); await p.waitForTimeout(500); } })),
  ...[['conferencia', null], ['conferencia-vencidos', 'chip-vencidos'], ['conferencia-sem-par', 'chip-sem_par'], ['conferencia-poucos', null]].map(([nome, chip]) => ({
    nome, url: nome === 'conferencia-poucos' ? 'tela=conciliacao&v=poucos' : 'tela=conciliacao', tamanhos: [...TAMANHOS_DO_P92, [1366, 768]],
    regiao: '[data-testid="modal-conferencia"]',
    /* P159e (Gabriel 29/10): o nome do extrato INTEIRO de 1366px para cima; abaixo, "…" + o title (a regra de corte de sempre) */
    inteiroDe: { sel: '[data-testid="modal-conferencia"] [data-testid="conf-historico"]', de: 1366 },
    antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
      await clicarRotulo(/^Casar lançamentos$/)(p); await p.locator('[data-testid="barra-casar"]').getByRole('button', { name: 'Conferência' }).click();
      await p.locator('[data-testid="mesa-conferencia"]').waitFor(); await p.waitForTimeout(500);
      if (chip) await clicar(`[data-testid="${chip}"]`)(p); } })),
  /* P159c — "Sugestões para casar" nos 10 tamanhos: o movimento do banco é a 1ª linha da mesma tabela (data sob data, valor sob valor);
     a data inteira (dd/mm/aaaa) nunca corta nem quebra; texto em uma linha com "…" + title */
  ...[['casar-sugestoes', 'tela=sugestoes-casar'], ['casar-sugestoes-vazio', 'tela=sugestoes-casar&v=vazio']].map(([nome, url]) => ({ nome, url,
    tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]' })),
  /* P153 — o "Procurar no histórico" depois de procurar (8 achados, o quadro de 6 rola, a faixa amarela), no modal e na estação; e a
     estação com o banco SEM nome (D1: o campo vazio e a frase) */
  { nome: 'casar-sugestoes-procurado', url: 'tela=sugestoes-casar', tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); } },
  { nome: 'casar-estacao-procurado', url: 'tela=estacao', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); } },
  { nome: 'casar-estacao-sem-nome', url: 'tela=estacao&v=semnome', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]' },
  /* P159b (CONC-TELAS-02) — as abas Sistema e Evolução do saldo do Casar (de 1000px para cima, a página da Conciliação); a Evolução também
     com os dias sem movimento à vista. O modal "Extrato do sistema" (o ↗, D5) já tem os cenários `conciliacao-extrato-do-sistema*`. */
  ...[['casar-sistema', 'Sistema', null], ['casar-evolucao', 'Evolução do saldo', null], ['casar-evolucao-com-vazios', 'Evolução do saldo', 'evolucao-mostrar-vazios']]
    .map(([nome, aba, marcar]) => ({ nome, url: 'tela=conciliacao', tamanhos: TAMANHOS_DA_CONCILIACAO,
      antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
        await clicarRotulo(/^Casar lançamentos$/)(p); await p.locator('[data-testid="extrato-saldo-final"]').waitFor();
        await p.locator('[data-testid="barra-casar"]').getByRole('button', { name: aba, exact: true }).click(); await p.waitForTimeout(600);
        if (marcar) await clicar(`[data-testid="${marcar}"]`)(p); } })),
  /* UI-SEM-CORTE-02 — a TABELA do Financeiro V2 segue fora (FIN-V2-SEM-CORTE-01, suspensa), mas entra pelo texto inclinado e pela
     sobreposicao: a ultima letra do fornecedor ("Maderat") sumia pela linha em italico */
  { nome: 'financeiro-tabela-italico', url: 'tela=financeiro', soRegras: ['italico', 'sobreposicao'] },
  /* FIN-V2-DESEMPENHO-01b / FIN-V2-SEM-CORTE-01 — a TABELA inteira do Financeiro V2 entra nas regras (nome longo = uma linha com "…" e
     o texto no `title`; numero, valor, data nunca cortam), com o rodape da pagina dentro do quadro, nos sete tamanhos */
  { nome: 'financeiro-tabela', url: 'tela=financeiro', regiao: '[data-testid="quadro-lancamentos"]', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'financeiro-tabela-pagina-2', url: 'tela=financeiro&v=volume&n=450', regiao: '[data-testid="quadro-lancamentos"]', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: clicar('[data-testid="pagina-proxima"]') },
  /* o item 2 do 01b: a faixa de totais + controles nunca fica por cima do que vem embaixo — dez trocas de filtro e o "sobreposicao" */
  { nome: 'financeiro-faixa-totais', url: 'tela=financeiro', regiao: '[data-testid="faixa-totais"]', tamanhos: TAMANHOS_DO_CONTRATO,
    botoesDentro: '[data-testid="faixa-totais"]',
    antes: async (p) => { for (let i = 0; i < 10; i++) await clicarRotulo([/^Macro$/, /^Subcentro$/, /^Centro$/, /^Mostrar$/, /^Ocultar$/][i % 5])(p); } },
];
/* UI-TEXTO-LONGO-01 — o que tem de ter a mesma altura com texto curto e longo (o que não existe na tela é pulado nos dois lados) */
const ALTURAS_DO_MODAL = ['[role="dialog"]', '[role="dialog"] aside', '[data-testid="grade-de-parcelas"]'];
/* a altura da caixa E a do conteúdo dela (o resumo tem rolagem própria: crescer por dentro também conta) */
const alturasDe = (p) => p.evaluate((sels) => sels.map((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const rolante = [e, ...e.querySelectorAll('*')].find((x) => /(auto|scroll)/.test(getComputedStyle(x).overflowY));
  return { caixa: Math.round(e.getBoundingClientRect().height * 2) / 2, conteudo: rolante ? rolante.scrollHeight : null };
}), ALTURAS_DO_MODAL);

/* FIN-FILTRO-DOC-01 — a altura de um elemento, antes e depois do gesto do cenario: mudou mais que meio pixel = achado */
const alturaDe = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().height : null; }, sel);
const achadoDaAltura = (sel, antes, depois) => (antes === null || depois === null)
  ? { regra: 'altura', texto: `${sel} nao achado para medir a altura` }
  : Math.abs(depois - antes) > 0.5 ? { regra: 'altura', texto: `${sel} mudou de altura: ${antes}px -> ${depois}px` } : null;

/* P104 (print do Gabriel, 25/10: "1º vencimento · sugeric…", "Infor…") — roda NA PAGINA: dentro de `sel`, rótulo e frase NÃO rolam escondidos
   no lugar (`uma-linha-que-rola` fora de tabela, que a regra geral aceita para CAMPOS) nem passam da altura reservada. Os campos (botão,
   seletor, input) ficam de fora: neles rolar no lugar é a regra. */
/* P159e (Gabriel 29/10) — `inteiroDe: { sel, de }`: de `de` px de largura de janela para cima, o texto de `sel` cabe INTEIRO (o "…" com
   o title, que a regra de corte aceita, aqui reprova — o nome do extrato da Conferência de 1366 para cima) */
function medirInteiro(sel) {
  const achados = [];
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect(); if (r.width < 1) continue;
    if (e.scrollWidth > e.clientWidth + 0.5) achados.push({ regra: 'inteiro', texto: `nao cabe inteiro: ${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70)} (pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
  }
  return achados;
}
/* P159e — ALINHAMENTO SOBERANO: todo número marcado `data-alinha-coluna="K"` (o saldo inicial, o do fim do dia, o do rodapé) tem a
   borda direita da célula na MESMA borda do `th[data-coluna="K"]` visível (0,5px), e o número dentro dela */
function medirAlinhamento(regiao) {
  const raiz = regiao ? document.querySelector(regiao) : document.body; if (!raiz) return [];
  const achados = [];
  for (const e of raiz.querySelectorAll('[data-alinha-coluna]')) {
    const r = e.getBoundingClientRect(); if (r.width < 1) continue;
    const k = e.getAttribute('data-alinha-coluna');
    const ths = [...raiz.querySelectorAll(`th[data-coluna="${k}"]`)].filter((t) => t.getBoundingClientRect().width > 1);
    if (!ths.length) { achados.push({ regra: 'alinhamento', texto: `coluna "${k}" sem cabecalho para ${(e.textContent ?? '').trim()}` }); continue; }
    const th = ths.reduce((m, t) => (Math.abs(t.getBoundingClientRect().right - r.right) < Math.abs(m.getBoundingClientRect().right - r.right) ? t : m));
    const dif = Math.abs(th.getBoundingClientRect().right - r.right);
    const rg = document.createRange(); rg.selectNodeContents(e); const txt = rg.getBoundingClientRect();
    if (dif > 0.5) achados.push({ regra: 'alinhamento', texto: `"${(e.textContent ?? '').trim()}" fora da coluna ${k} (borda a ${Math.round(dif * 10) / 10}px)` });
    else if (txt.width > 0 && txt.right > r.right + 0.5) achados.push({ regra: 'alinhamento', texto: `"${(e.textContent ?? '').trim()}" passa da coluna ${k}` });
  }
  return achados;
}
function medirSemRolarNoLugar(sel) {
  const achados = [];
  const raiz = document.querySelector(sel); if (!raiz) return [{ regra: 'corte', texto: `${sel} nao achado` }];
  for (const e of raiz.querySelectorAll('*')) {
    if (e.closest('button, [role="combobox"], input, textarea, select, td, th')) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const t = (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
    if (cs.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 2) achados.push({ regra: 'corte', texto: `rola no lugar: ${t} (pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
    else if (cs.overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 2) achados.push({ regra: 'corte', texto: `passa da altura reservada: ${t} (pede ${e.scrollHeight}px, tem ${e.clientHeight})` });
  }
  return achados;
}

/* FIN-CONSORCIO-02 — roda NA PAGINA: dentro de `dentro`, nenhum elemento com conteúdo maior que a caixa na vertical (rolando ou
   cortado), fora `exceto` e o que mora nele; e o próprio `dentro` cabe na janela */
function medirRolagem({ dentro, exceto }) {
  const achados = [];
  const raiz = document.querySelector(dentro); if (!raiz) return [{ regra: 'rolagem', texto: `${dentro} nao achado` }];
  const livres = exceto ? [...document.querySelectorAll(exceto)] : [];
  const rr = raiz.getBoundingClientRect();
  if (rr.bottom > innerHeight + 0.5 || rr.right > innerWidth + 0.5) achados.push({ regra: 'rolagem', texto: `${dentro} passa da janela (${Math.round(rr.width)}x${Math.round(rr.height)})` });
  for (const e of [raiz, ...raiz.querySelectorAll('*')]) {
    if (livres.some((l) => e === l || l.contains(e))) continue;
    const cs = getComputedStyle(e);
    if (cs.overflowY === 'visible' || cs.display === 'none') continue;
    if (e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 2)
      achados.push({ regra: 'rolagem', texto: `${(e.getAttribute('data-testid') || e.tagName.toLowerCase())} pede ${e.scrollHeight}px, tem ${e.clientHeight} (${cs.overflowY})` });
  }
  /* e na horizontal: caixa que esconde o que passa dela (o segmentado espremido numa célula) — a que ROLA de propósito (`auto`) fica.
     FIN-NOTA-PDF-01: `exceto` vale aqui tambem (o comentario da funcao ja' o dizia): a tabela que rola por dentro tem nome com "…" e o
     inteiro no `title` (regra de corte de 21/10), e quem a julga e' a regra de corte da varredura principal, nao esta. */
  for (const e of raiz.querySelectorAll('*')) {
    if (livres.some((l) => e === l || l.contains(e))) continue;
    /* a exceção DECLARADA (`data-reticencias-com-title`, P71; a razão social da nota já lançada, ajuste 2): quem a julga é a regra de reticências da
       varredura principal (o title tem de levar o texto inteiro), não esta */
    if (e.closest('[data-reticencias-com-title]')) continue;
    const cs = getComputedStyle(e);
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 2)
      achados.push({ regra: 'corte', texto: `${(e.getAttribute('data-testid') || (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40))} pede ${e.scrollWidth}px, tem ${e.clientWidth}` });
  }
  return achados;
}
/* FIN-CONSORCIO-04 — a tabela que rola por dentro mostra, sem rolar, o cabeçalho, N linhas e o Total inteiros (roda NA PAGINA) */
/* OC-CC-BOTAO-BUSCAR-DESLOCA-01 — `botoesDentro` (opcional, por cenario): todo botao da faixa cabe INTEIRO nela (nao sai pela borda
   nem corta o proprio texto). O "+ Buscar recebimento" saia da faixa por cima do resumo lateral, sem ser irmao dele: a sobreposicao nao via. */
function medirBotoesDentro(sel) {
  const caixas = [...document.querySelectorAll(sel)]; if (!caixas.length) return [{ regra: 'botao', texto: `${sel} nao achado` }];
  const achados = [];
  for (const caixa of caixas) {
    const c = caixa.getBoundingClientRect();
    for (const b of caixa.querySelectorAll('button')) {
      const r = b.getBoundingClientRect(); if (r.width < 2) continue;
      const nome = b.textContent.trim().slice(0, 40);
      if (r.right > c.right + 0.5 || r.left < c.left - 0.5) achados.push({ regra: 'botao', texto: `botao "${nome}" sai da faixa (${Math.round(r.right - c.right)}px)` });
      /* FIN-V2-DESEMPENHO-01b — e pela ALTURA: a faixa de altura fixa que quebra em duas linhas joga a segunda por baixo dela, por
         cima do que vem embaixo (a barra "Classificação · Sem caixa" coberta pelo cabeçalho da tabela) */
      if (r.bottom > c.bottom + 0.5 || r.top < c.top - 0.5) achados.push({ regra: 'botao', texto: `botao "${nome}" sai da faixa por ${r.bottom > c.bottom ? 'baixo' : 'cima'} (${Math.round(r.bottom > c.bottom ? r.bottom - c.bottom : c.top - r.top)}px)` });
      if (b.scrollWidth > b.clientWidth + 1) achados.push({ regra: 'botao', texto: `botao "${nome}" corta o texto` });
    }
  }
  return achados;
}
/* Ajuste 29/10 14:02 (item 1) — `titulosDeBloco` (opcional, por cenário): o CABEÇALHO de todo bloco (`[data-titulo-do-bloco]`) cabe numa linha e
   dentro do bloco — o nome, a dica e o selo inteiros (o "PDF com texto · leitura direta" quebrava/cortava na coluna estreita e o gate não via) */
function medirTitulosDeBloco() {
  const achados = [];
  for (const t of document.querySelectorAll('[role="dialog"] [data-titulo-do-bloco]')) {
    const r = t.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const bloco = t.parentElement?.getBoundingClientRect();
    const nome = (t.querySelector('h3')?.textContent ?? '').trim().slice(0, 30);
    if (r.height > 20) achados.push({ regra: 'titulo-do-bloco', texto: `"${nome}": o cabeçalho quebra em mais de uma linha (${Math.round(r.height)}px)` });
    if (t.scrollWidth > t.clientWidth + 1) achados.push({ regra: 'titulo-do-bloco', texto: `"${nome}": o cabeçalho passa da largura (${t.scrollWidth - t.clientWidth}px)` });
    if (bloco && r.right > bloco.right + 0.5) achados.push({ regra: 'titulo-do-bloco', texto: `"${nome}": o cabeçalho sai do bloco (${Math.round(r.right - bloco.right)}px)` });
    for (const el of t.querySelectorAll('h3, span, button')) {
      const e = el.getBoundingClientRect(); if (e.width < 2) continue;
      const txt = (el.textContent ?? '').trim().slice(0, 40);
      if (e.right > r.right + 0.5 || e.left < r.left - 0.5) achados.push({ regra: 'titulo-do-bloco', texto: `"${nome}": "${txt}" sai do cabeçalho (${Math.round(e.right - r.right)}px)` });
      else if (el.scrollWidth > el.clientWidth + 1 && !el.classList.contains('uma-linha-que-rola')) achados.push({ regra: 'titulo-do-bloco', texto: `"${nome}": "${txt}" corta o texto` });
    }
  }
  return achados;
}
function medirTabelaMinima({ sel, linhas }) {
  const caixa = document.querySelector(sel); if (!caixa) return [{ regra: 'tabela', texto: `${sel} nao achado` }];
  const cb = caixa.getBoundingClientRect();
  const th = caixa.querySelector('thead')?.getBoundingClientRect(); const tf = caixa.querySelector('tfoot td')?.getBoundingClientRect(); /* a célula (sticky), não o tfoot (fica no fim natural da tabela) */
  if (!th || !tf) return [{ regra: 'tabela', texto: `${sel} sem cabecalho ou sem Total` }];
  const fundo = Math.min(cb.bottom, tf.top);
  const inteiras = [...caixa.querySelectorAll('tbody tr')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= th.bottom - 0.5 && b.bottom <= fundo + 0.5; }).length;
  const totalInteiro = tf.bottom <= cb.bottom + 0.5 && tf.top >= th.bottom - 0.5;
  return inteiras >= linhas && totalInteiro ? [] : [{ regra: 'tabela', texto: `${caixa.getAttribute('data-testid') || sel}: ${inteiras} linhas inteiras (pede ${linhas})${totalInteiro ? '' : ', Total fora'} em ${Math.round(cb.height)}px` }];
}
/* ITENS-NOTA-FONTE-01 — `semRolarVertical` (opcional): a caixa (o corpo de uma tabela que PODERIA rolar) mostra tudo sem rolar na
   vertical — o corte na horizontal (descricao com "…" e `title`) continua com a regra de corte da varredura principal (roda NA PAGINA) */
/* P100 — `rotulosSvg` (opcional): os textos do grafico ficam dentro do proprio SVG e nao encostam um no outro (roda NA PAGINA) */
function medirRotulosSvg(sel) {
  const ts = [...document.querySelectorAll(sel)].filter((t) => (t.textContent ?? '').trim());
  if (!ts.length) return [{ regra: 'rotulo', texto: `${sel} nao achado` }];
  const achados = [];
  const cx = ts.map((t) => ({ t, r: t.getBoundingClientRect(), s: t.closest('svg').getBoundingClientRect(), x: (t.textContent ?? '').trim() }));
  for (const a of cx) if (a.r.left < a.s.left - 0.5 || a.r.right > a.s.right + 0.5 || a.r.top < a.s.top - 0.5 || a.r.bottom > a.s.bottom + 0.5)
    achados.push({ regra: 'rotulo', texto: `"${a.x}" sai do grafico` });
  for (const a of cx) { const max = Number(a.t.getAttribute('data-cabe-em')); if (max && a.r.width > max + 0.5) achados.push({ regra: 'rotulo', texto: `"${a.x}" nao cabe em ${max}px (${Math.round(a.r.width)}px)` }); }
  for (let i = 0; i < cx.length; i += 1) for (let j = i + 1; j < cx.length; j += 1) {
    const a = cx[i].r, b = cx[j].r;
    if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)
      achados.push({ regra: 'rotulo', texto: `"${cx[i].x}" encosta em "${cx[j].x}"` });
  }
  return achados;
}
/* P100 item 5 — `folgaCelulas` (opcional): o texto visivel de uma celula e o da vizinha a >= 6 px (roda NA PAGINA). O que passa da
   caixa da celula (o nome com "…") conta so' ate' a borda de conteudo dela. */
function medirFolgaCelulas(sel) {
  const tabs = [...document.querySelectorAll(sel)]; if (!tabs.length) return [{ regra: 'folga', texto: `${sel} nao achado` }];
  const achados = [];
  const extensao = (c) => {
    const rg = document.createRange(); rg.selectNodeContents(c);
    const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5); if (!rs.length) return null;
    const cr = c.getBoundingClientRect(), cs = getComputedStyle(c);
    const l0 = cr.left + parseFloat(cs.paddingLeft), r0 = cr.right - parseFloat(cs.paddingRight);
    return { l: Math.max(l0, Math.min(...rs.map((r) => r.left))), r: Math.min(r0, Math.max(...rs.map((r) => r.right))), t: (c.textContent ?? '').trim().slice(0, 30) };
  };
  /* P92 — NUMERO QUE VAZA PARA QUALQUER LADO: o numero alinhado a' direita que nao cabe vaza para a ESQUERDA (sobre a coluna vizinha), e o
     `scrollWidth` so' ve^ o vazamento para a direita — a regra de corte nao o via. Numero cujo texto sai da caixa da propria celula = achado. */
  const EH_NUM = (t) => /^[▲▼+\-−]?\s*(R\$\s?)?[\d.,/:\-–]+%?$/.test(t);
  for (const t of tabs) for (const c of t.querySelectorAll('td, th')) {
    const txt = (c.textContent ?? '').replace(/\s+/g, ' ').trim(); if (!txt || !EH_NUM(txt)) continue;
    const rg = document.createRange(); rg.selectNodeContents(c);
    const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5); if (!rs.length) continue;
    /* contra a caixa de CONTEUDO: o numero que come o recuo da celula encosta no vizinho (a folga abaixo nao ve^: ela corta na borda) */
    const cr = c.getBoundingClientRect(), cs = getComputedStyle(c);
    const l0 = cr.left + parseFloat(cs.paddingLeft), r0 = cr.right - parseFloat(cs.paddingRight);
    const l = Math.min(...rs.map((r) => r.left)), r = Math.max(...rs.map((r) => r.right));
    if (l < l0 - 0.5 || r > r0 + 0.5) achados.push({ regra: 'numero-vaza', texto: `"${txt.slice(0, 30)}" sai da celula (${(l0 - l).toFixed(1)}px a' esquerda, ${(r - r0).toFixed(1)}px a' direita)` });
  }
  /* e a TABELA mais larga que a caixa onde mora (ela rola de lado, escondida — o resumo de 330px com colunas soltas) */
  for (const t of tabs) {
    const pai = t.parentElement; if (!pai) continue;
    if (t.getBoundingClientRect().width > pai.clientWidth + 0.5) achados.push({ regra: 'numero-vaza', texto: `tabela de ${t.getBoundingClientRect().width.toFixed(1)}px numa caixa de ${pai.clientWidth}px` });
  }
  for (const t of tabs) for (const tr of t.querySelectorAll('tr')) {
    const es = [...tr.children].map(extensao);
    for (let i = 0; i + 1 < es.length; i += 1) {
      const a = es[i]; if (!a) continue;
      const j = es.slice(i + 1).findIndex(Boolean); if (j < 0) continue;
      const b = es[i + 1 + j];
      if (b.l - a.r < 6 - 0.01) achados.push({ regra: 'folga', texto: `"${a.t}" e "${b.t}": folga ${(b.l - a.r).toFixed(1)}px` });
    }
  }
  return achados;
}
function medirSemRolarVertical(sel) {
  const caixas = [...document.querySelectorAll(sel)]; if (!caixas.length) return [{ regra: 'rolagem', texto: `${sel} nao achado` }];
  return caixas.filter((e) => e.scrollHeight > e.clientHeight + 1)
    .map((e) => ({ regra: 'rolagem', texto: `${e.getAttribute('data-testid') || sel} rola: pede ${e.scrollHeight}px, tem ${e.clientHeight}` }));
}
/* roda NA PAGINA: devolve os achados [{regra, texto}] */
function medir(regiao) {
  const achados = [];
  /* FORN-01b — o que nunca corta: numero, valor, data, hora, CPF/CNPJ, nota, contador (so' digitos e pontuacao de numero) */
  const EH_NUMERO = (t) => /^[▲▼+\-−]?\s*(R\$\s?)?[\d.,/:\-–]+%?$/.test(t);
  const raiz = (regiao && document.querySelector(regiao)) || document.body;
  const texto = (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  /* UI-CAMPO-MOEDA-01 — todo campo de valor visível tem de mostrar 999.999.999,99 inteiro ao lado do "R$": o texto é posto no input SEM
     evento (o React não fica sabendo), medido e devolvido como estava */
  for (const c of raiz.querySelectorAll('[data-testid="campo-moeda"]')) {
    const inp = c.querySelector('input'); if (!inp) continue;
    const rc = inp.getBoundingClientRect(); if (rc.width <= 2 || rc.height <= 2 || getComputedStyle(inp).visibility === 'hidden') continue;
    const antes = inp.value; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(inp, '999.999.999,99');
    if (inp.scrollWidth > inp.clientWidth + 0.5) {
      const rot = (c.closest('[data-campo]') || c.parentElement)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) || 'campo';
      achados.push({ regra: 'valor', texto: `campo de valor "${rot}": 999.999.999,99 pede ${inp.scrollWidth}px, tem ${inp.clientWidth}` });
    }
    set.call(inp, antes);
  }
  for (const e of raiz.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !e.textContent.trim()) continue;
    const r = e.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;   /* sr-only (so' para leitor de tela) fica de fora */
    /* FORN-01b (regra de corte do Gabriel, 21/10 07h25): NOME/TEXTO em celula de tabela pode terminar em "…" se a celula leva o texto
       inteiro no `title`; numero, valor, data, CPF/CNPJ e contador nunca cortam (nem com "…"); fora de tabela, "…" segue proibido */
    const naCelula = e.closest('td, th');
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 0.5) {
      const t = texto(e); const inteiro = (e.textContent ?? '').replace(/\s+/g, ' ').trim();
      const dono = e.closest('[title]');
      const comTitle = !!(naCelula && dono && (dono === naCelula || naCelula.contains(dono) || dono.contains(naCelula))
        && (dono.getAttribute('title') ?? '').replace(/\s+/g, ' ').includes(inteiro))
        /* P71 (Gabriel 23/10) — a exceção DECLARADA fora de tabela: o seletor de largura fixa marcado `data-reticencias-com-title` (hoje só o
           de Fazenda da Visão Geral) pode terminar em "…" se o title dele leva o texto inteiro */
        || !!((() => { const m = e.closest('[data-reticencias-com-title]'); return m && (m.getAttribute('title') ?? '').replace(/\s+/g, ' ').includes(inteiro); })());
      if (naCelula && EH_NUMERO(inteiro)) achados.push({ regra: 'numero', texto: `numero/data/documento com "…": ${t}` });
      else if (!comTitle) achados.push({ regra: 'reticencias', texto: naCelula ? `${t} (sem o texto inteiro no title)` : t });
    }
    /* P121 (mock do Resumo aprovado 27/10; esta regra do detector: OK do Gabriel 28/10) — o corte em N linhas (`line-clamp`) DENTRO de célula de tabela com o
       texto inteiro no `title` da célula vale como o "…" de uma linha (a mesma regra FORN-01b); fora de célula, segue proibido */
    else if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 0.5
      && !(naCelula && (naCelula.getAttribute('title') ?? '').replace(/\s+/g, ' ').includes((e.textContent ?? '').replace(/\s+/g, ' ').trim()))) achados.push({ regra: 'reticencias', texto: texto(e) });
    /* vazamento: celula de tabela cujo conteudo passa da largura dela (invade a vizinha) */
    else if ((e.tagName === 'TD' || e.tagName === 'TH') && cs.overflowX === 'visible' && e.scrollWidth > e.clientWidth + 1) achados.push({ regra: 'corte', texto: `${texto(e)} (vaza: pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
    /* corte calado: texto proprio cortado por overflow escondido numa linha so' (sem "…", mas cortado do mesmo jeito) */
    else if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.whiteSpace.startsWith('nowrap') && e.scrollWidth > e.clientWidth + 1
      && (e.tagName === 'TD' || e.tagName === 'TH' || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) achados.push({ regra: 'corte', texto: `${texto(e)} (pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
    /* FORN-01b — CORTE SECO em celula: o texto que passa da caixa sem "…" (o `uma-linha-que-rola`, que rola escondido: "ALVORADA PRODUTOS A") */
    /* (o gatilho de um seletor dentro da celula e' CAMPO: rola como o input, fica de fora) */
    else if (naCelula && !e.closest('button, [role="combobox"]') && (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && cs.whiteSpace.startsWith('nowrap') && e.scrollWidth > e.clientWidth + 1
      && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) achados.push({ regra: 'corte', texto: `corte seco: ${texto(e)} (pede ${e.scrollWidth}px, tem ${e.clientWidth})` });
  }
  /* data, hora e numero NUNCA quebram a linha: o texto da celula numa linha so' */
  for (const td of raiz.querySelectorAll('td, th')) {
    const t = (td.textContent ?? '').trim();
    if (!/^(\d{2}\/\d{2}\/\d{2,4}|\d{2}:\d{2}|[-−]?(R\$\s?)?[\d.]+(,\d+)?%?)$/.test(t)) continue;
    const topos = new Set();
    const andar = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0) topos.add(Math.round(r.top));
    }
    if (topos.size > 1) achados.push({ regra: 'quebra', texto: `"${t}" em ${topos.size} linhas` });
  }
  const ehData = (t) => /^(data|venc\.?|vencimento|pgto\.?|pagamento|emissão|data de emissão)$/i.test(t.replace(/[▲▼↑↓*]/g, '').trim());
  for (const tb of raiz.querySelectorAll('table')) {
    const ths = [...tb.querySelectorAll('thead tr:last-child th')];
    ths.forEach((th, i) => {
      if (!ehData(th.textContent ?? '')) return;
      for (const tr of tb.querySelectorAll('tbody tr')) {
        const td = tr.children[i]; if (!td || td.colSpan > 1) continue;
        /* FIN-CONSORCIO-02 — a celula que DECLARA nao ter data (`data-sem-data`: a parcela adiada vence "contemplação") nao e' data incompleta */
        if (td.hasAttribute('data-sem-data')) continue;
        const t = (td.textContent ?? '').trim();
        /* P159a (Gabriel 28/10, D7 — a EXCEÇÃO DECLARADA): a lista do mês por dia (`ListaDoMesPorDia`, marcada `data-dia-mes`: o Extrato
           (banco) e o Extrato do sistema) escreve dd/mm SEM o ano — o mês está no cabeçalho da tela e a data só na 1ª linha do dia. Ali,
           e só ali, dd/mm passa; qualquer outra forma segue acusada. */
        const diaMes = tb.hasAttribute('data-dia-mes') && /^\d{2}\/\d{2}$/.test(t);
        if (t && t !== '—' && t !== '-' && !diaMes && !/^\d{2}\/\d{2}\/\d{4}$/.test(t)) achados.push({ regra: 'data', texto: `${th.textContent.trim()}: ${t}` });
      }
    });
  }
  return achados;
}
/* UI-SEM-CORTE-02 (item 7) — roda NA PAGINA: o que a regra das reticencias nao ve.
   (a) SOBREPOSICAO — dois irmaos visiveis em fluxo (nem absolute/fixed/sticky) cujos retangulos se cruzam (> 1,5px nos dois
       eixos), e botao x conteudo: um botao visivel sobre um texto que nao e' dele nem o contem, com o texto VISIVEL ali (o
       retangulo do texto recortado pelos ancestrais que cortam). E' o caso do modal de Pendencias com os botoes sobre o rodape.
   (b) TEXTO ALEM DA CAIXA — o texto (medido por Range) passa da borda que o corta; texto INCLINADO (italic/oblique) conta a
       inclinacao do glifo (0,21 x o tamanho da letra): a ultima letra inclinada encostada na borda some ("Maderat").
   (c) NUMERO ESCONDIDO — numero, valor ou data recortado na horizontal por um ancestral que rola ou corta. */
function medirSobreposicao(regiao) {
  const achados = [];
  const raiz = (regiao && document.querySelector(regiao)) || document.body;
  const texto = (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const visivel = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  /* o retangulo que se ve: recortado por todo ancestral que corta (overflow != visible) */
  /* `comSiMesmo`: o texto (Range) e' recortado tambem pelo PROPRIO elemento quando e' ele que rola ou corta (`uma-linha-que-rola`,
     o texto do seletor); a caixa do elemento, so' pelos ancestrais */
  const recorte = (e, r0, comSiMesmo = false) => { let r = { l: r0.left, t: r0.top, rr: r0.right, b: r0.bottom };
    for (let a = comSiMesmo ? e : e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const ra = a.getBoundingClientRect(); const l = ra.left + a.clientLeft, t = ra.top + a.clientTop;
      if (cs.overflowX !== 'visible') { r.l = Math.max(r.l, l); r.rr = Math.min(r.rr, l + a.clientWidth); }
      if (cs.overflowY !== 'visible') { r.t = Math.max(r.t, t); r.b = Math.min(r.b, t + a.clientHeight); }
    }
    return r; };
  const cruza = (a, b, tol) => Math.min(a.rr, b.rr) - Math.max(a.l, b.l) > tol && Math.min(a.b, b.b) - Math.max(a.t, b.t) > tol;
  const emFluxo = (e) => { const p = getComputedStyle(e).position; return p === 'static' || p === 'relative'; };
  const todos = [...raiz.querySelectorAll('*')];
  /* (a) irmaos */
  for (const pai of [raiz, ...todos]) {
    /* `inline` fica de fora: o retangulo dele e' a uniao das linhas, e dois pedacos de uma frase que quebra "se cruzam" sem se tocar */
    const filhos = [...pai.children].filter((c) => visivel(c) && emFluxo(c) && getComputedStyle(c).float === 'none' && getComputedStyle(c).display !== 'inline');
    if (filhos.length < 2 || /^(TR|TBODY|THEAD|TFOOT|TABLE|COLGROUP|svg|g)$/i.test(pai.tagName)) continue;
    for (let i = 0; i < filhos.length; i++) for (let j = i + 1; j < filhos.length; j++) {
      const a = recorte(filhos[i], filhos[i].getBoundingClientRect()), b = recorte(filhos[j], filhos[j].getBoundingClientRect());
      if (a.rr - a.l < 1 || b.rr - b.l < 1 || a.b - a.t < 1 || b.b - b.t < 1) continue;
      if (cruza(a, b, 1.5)) achados.push({ regra: 'sobreposicao', texto: `"${texto(filhos[i]) || filhos[i].tagName}" x "${texto(filhos[j]) || filhos[j].tagName}"` });
    }
  }
  /* (a) botao x conteudo */
  const botoes = todos.filter((e) => (e.tagName === 'BUTTON' || e.getAttribute('role') === 'button') && visivel(e));
  const comTexto = todos.filter((e) => visivel(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  for (const bt of botoes) {
    const rb = recorte(bt, bt.getBoundingClientRect());
    for (const t of comTexto) {
      if (t === bt || bt.contains(t) || t.contains(bt)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      /* cada LINHA do texto por si (o retangulo da uniao de um texto que quebra cobre o vao ao lado da ultima linha) */
      const linhasT = [...rg.getClientRects()].map((q) => recorte(t, q, true)).filter((q) => q.rr - q.l >= 1 && q.b - q.t >= 1);
      const rt = linhasT.find((q) => cruza(rb, q, 1.5));
      if (!rt) continue;
      /* so' conta quando os dois se veem ali: o ponto do meio do cruzamento e' de um deles ou de um ancestral comum */
      const x = (Math.max(rb.l, rt.l) + Math.min(rb.rr, rt.rr)) / 2, y = (Math.max(rb.t, rt.t) + Math.min(rb.b, rt.b)) / 2;
      const topo = document.elementFromPoint(x, y); if (!topo) continue;
      /* o texto que ROLOU para baixo de um cabecalho preso (sticky) esta' coberto pelo cabecalho, nao pelo botao que mora nele */
      const preso = (() => { for (let a = bt.parentElement; a; a = a.parentElement) if (getComputedStyle(a).position === 'sticky') return a; return null; })();
      if (preso && !preso.contains(t)) continue;
      /* PR 5 — a exceção DECLARADA: o painel que fica POR CIMA de propósito (`data-painel-por-cima`: hoje só a gaveta de lançamentos do
         modal de análise, como no mock) cobre o que está embaixo — o texto embaixo dele está coberto pelo painel, não pelo botão */
      const painel = bt.closest('[data-painel-por-cima]');
      if (painel && !painel.contains(t)) continue;
      if (bt.contains(topo) && !t.contains(topo)) achados.push({ regra: 'sobreposicao', texto: `botão "${texto(bt)}" sobre "${texto(t)}"` });
    }
  }
  /* (b) texto alem da caixa (com a inclinacao) e (c) numero escondido */
  const ehNumero = (s) => /^[-−▲▼]?\s*(R\$\s?)?[-−]?[\d.]+(,\d+)?%?$|^\d{2}\/\d{2}(\/\d{2,4})?$/.test(s);
  for (const e of comTexto) {
    const cs = getComputedStyle(e);
    const rg = document.createRange(); rg.selectNodeContents(e); const rt = rg.getBoundingClientRect();
    if (rt.width < 1) continue;
    let corta = null;
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const ca = getComputedStyle(a); if (ca.overflowX === 'visible') continue;
      const ra = a.getBoundingClientRect(); corta = { el: a, l: ra.left + a.clientLeft, r: ra.left + a.clientLeft + a.clientWidth, rola: /(auto|scroll)/.test(ca.overflowX) }; break;
    }
    if (!corta) continue;
    const inclinado = /italic|oblique/.test(cs.fontStyle);
    const folga = inclinado ? 0.21 * parseFloat(cs.fontSize) : 0;
    const t = texto(e);
    /* com "…" o texto ja' e' achado da regra das reticencias; o INCLINADO conta sempre (o span que encolhe ao texto corta a ultima letra) */
    /* FORN-01b — o texto dentro de uma CELULA com "…" (o `truncate` no `td`, o texto num `span` filho) e' a regra das reticencias que julga */
    /* FORN-CAMPO-01 — e fora de tabela, no "…" da exceção DECLARADA (`data-reticencias-com-title`, P71): o pedaço filho (a "· Fantasia" do nome na
       lista de fornecedor) é cortado pelo "…" do pai, e quem julga é a regra das reticências, que confere o texto inteiro no `title` */
    const reticenciasNoCorte = getComputedStyle(corta.el).textOverflow === 'ellipsis' && !!corta.el.closest('td, th, [data-reticencias-com-title]');
    if (!corta.rola && (inclinado || (cs.textOverflow !== 'ellipsis' && !reticenciasNoCorte)) && rt.right + folga > corta.r + 0.5)
      achados.push({ regra: inclinado ? 'italico' : 'corte', texto: `"${t}" passa ${(rt.right + folga - corta.r).toFixed(1)}px da caixa${inclinado ? ' (texto inclinado)' : ''}` });
    /* so' o numero PARTIDO (parte a' vista, parte escondida); o que rola inteiro para fora da vista e o que mora numa tabela que rola
       por inteiro (a coluna segue inteira, a tabela e' que rola) nao contam. CPR-AJUSTES-20-10: a tabela feita de `div` (a lista da
       CPR) se declara com `data-tabela-que-rola` no conteudo que rola inteiro — vale o mesmo que `<table>` */
    const aVista = Math.min(rt.right, corta.r) - Math.max(rt.left, corta.l);
    if (ehNumero(t) && aVista > 0.5 && aVista < rt.width - 0.5 && !e.closest('table, [data-tabela-que-rola]')) {
      const ry = recorte(e, rt); if (ry.b - ry.t > 1) achados.push({ regra: 'numero', texto: `"${t}" escondido pela rolagem/corte (${Math.round(Math.min(rt.right, corta.r) - Math.max(rt.left, corta.l))} de ${Math.round(rt.width)}px)` });
    }
  }
  return achados;
}
/* roda NA PAGINA: rola cada container ate' o meio e confere o cabecalho preso */
function medirCabecalho(regiao) {
  const achados = [];
  const raiz = (regiao && document.querySelector(regiao)) || document.body;
  /* o scrollport de um elemento: o ancestral mais próximo com overflow */
  const scrollport = (x) => { for (let a = x.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') return a; } return null; };
  for (const c of raiz.querySelectorAll('*')) {
    const cs = getComputedStyle(c);
    if (!/(auto|scroll)/.test(cs.overflowY) || c.scrollHeight <= c.clientHeight + 4) continue;
    const presos = [...c.querySelectorAll('*')].filter((x) => getComputedStyle(x).position === 'sticky' && getComputedStyle(x).top !== 'auto' && parseFloat(getComputedStyle(x).top) < 1
      && scrollport(x) === c && getComputedStyle(x.parentElement ?? x).position !== 'sticky');
    /* o cabeçalho que mora num scrollport que NÃO rola, dentro deste que rola: ele sobe com a página e não fica preso */
    for (const x of c.querySelectorAll('*')) {
      const cx = getComputedStyle(x); if (cx.position !== 'sticky') continue;
      const sp = scrollport(x); if (!sp || sp === c || !c.contains(sp) || sp.scrollHeight > sp.clientHeight + 4) continue;
      achados.push({ regra: 'cabecalho', texto: `cabeçalho não fica preso (o container dele não rola; quem rola é o de fora) "${(x.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"` });
    }
    if (!presos.length) continue;
    const rc = c.getBoundingClientRect(); const topo = rc.top + c.clientTop;
    for (const h of presos) {
      if (h.getBoundingClientRect().height === 0) continue;
      /* P137 (Gabriel 28/10 09:21) — cada cabeçalho preso se mede com a TABELA DELE cruzando o topo do quadro, e não com o quadro no meio:
         com várias tabelas empilhadas no mesmo quadro (o PC-100), no meio da rolagem a de baixo ainda não chegou ao topo e o cabeçalho dela
         está no lugar natural — isso não é vão. Rola até o meio do trecho em que a tabela cruza o topo; se o quadro não rola o bastante
         para ela cruzar, o cabeçalho nunca precisa prender e não se mede. Numa tabela só por quadro, dá o mesmo de antes. */
      const caixa = h.closest('table') ?? h.parentElement ?? h;
      c.scrollTop = 0;
      const rt0 = caixa.getBoundingClientRect(); const alto = h.getBoundingClientRect().height;
      const inicio = rt0.top - topo; const fim = rt0.bottom - topo - alto;
      if (fim - inicio < 2) continue;
      c.scrollTop = Math.max(0, Math.round(inicio + (fim - inicio) / 2));
      if (c.scrollTop < inicio + 1) continue;
      const rh = h.getBoundingClientRect();
      const nome = (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (rh.top - topo > 0.5) achados.push({ regra: 'cabecalho', texto: `vão de ${(rh.top - topo).toFixed(1)}px acima de "${nome}"` });
      /* fundo opaco: o cabeçalho (ou as células dele) tapa a linha que passa por baixo */
      const opaco = (x) => { const m = getComputedStyle(x).backgroundColor.match(/rgba?\(([^)]+)\)/); if (!m) return false; const v = m[1].split(',').map(Number); return v.length < 4 || v[3] >= 0.99; };
      if (![h, ...h.querySelectorAll('th')].some(opaco)) achados.push({ regra: 'cabecalho', texto: `cabeçalho transparente "${nome}"` });
    }
  }
  return achados;
}

/* UI-GATE-RAPIDO-01 — `--rapido`: so' as telas cuja arvore de imports alcanca o diff contra o origin/proto (`scripts/ui-gate-rapido.mjs`);
   mudanca compartilhada sai com 3 ("rode o completo"); diff sem tela, com 0. */
const RAPIDO = process.argv.includes('--rapido');
const naRapida = RAPIDO ? filtroRapido('check-ui-cortes') : () => true;
/* o modo rapido mede cada cenario nos MESMOS tamanhos do completo (o veredito de um cenario nao depende do modo): forcar os 7 do contrato
   reprovava o modal da OC a 750/814, largura em que ele nao tem desenho e que o completo nao mede (57 achados na prova de 21/10) */
const tamanhosDe = (c) => (c.tamanhos && !arg('--tamanhos') ? c.tamanhos : TAMANHOS);
const ESCOLHIDOS = CENARIOS.filter((c) => (!SO || (SO.endsWith('$') ? c.nome === SO.slice(0, -1) : c.nome.startsWith(SO))) && naRapida(c));
const servidor = await createServer({ configFile: path.join(AQUI, 'ui-cortes/vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.config.server.port === 0 ? servidor.httpServer.address().port : servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
let codigo = 0;
try {
  /* AUTO-TESTE: o fixture tem os tres defeitos; o detector tem de achar os tres */
  const p0 = await navegador.newPage({ viewport: { width: 800, height: 400 } });
  await p0.setContent(`<div data-testid="campo-moeda" style="position:relative"><span>R$</span><input style="width:50px;padding-left:24px"></div>
<div style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Nome muito comprido demais para caber</div>
    <table style="width:120px;table-layout:fixed"><tbody><tr><td title="Nome aceito com reticencias e title inteiro" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Nome aceito com reticencias e title inteiro</td></tr>
    <tr><td><span style="display:block;overflow-x:auto;white-space:nowrap">Nome cortado seco rolando escondido</span></td></tr>
    <tr><td title="12.345.678/0001-90" style="width:40px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">12.345.678/0001-90</td></tr>
    <tr><td title="Clamp aceito em duas linhas com o nome inteiro no title da celula"><div style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Clamp aceito em duas linhas com o nome inteiro no title da celula</div></td></tr></tbody></table>
    <div style="width:80px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Clamp recusado fora de tabela com o texto comprido demais</div>
    <div style="width:80px;overflow:hidden;white-space:nowrap">Outro nome comprido demais para caber</div>
    <table style="width:40px;table-layout:fixed"><tbody><tr><td style="word-break:break-all">19/10/2026</td></tr></tbody></table>
    <div style="height:120px;overflow:auto;padding-top:8px"><table><thead><tr><th style="position:sticky;top:0;background:rgba(255,255,255,.5)">Data</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, () => '<tr><td>10/09/26</td></tr>').join('')}</tbody></table></div>
    <div style="height:120px;overflow:auto"><div style="overflow-x:auto"><table><thead style="position:sticky;top:0;background:#fff"><tr><th>Nome</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, () => '<tr><td>x</td></tr>').join('')}</tbody></table></div></div>
    <table data-dia-mes=""><thead><tr><th>Data</th></tr></thead><tbody><tr><td>01/10</td></tr><tr><td>01/10/26</td></tr></tbody></table>
    <table><thead><tr><th>Data</th></tr></thead><tbody><tr><td>02/10</td></tr></tbody></table>
    <div style="height:300px;overflow:auto"><div style="height:200px">bloco de cima</div>${['Empilhada A', 'Empilhada B'].map((n) => `<table><thead style="position:sticky;top:0;background:#fff"><tr><th>${n}</th></tr></thead>
    <tbody>${Array.from({ length: 6 }, () => '<tr><td>y</td></tr>').join('')}</tbody></table>`).join('')}</div>`);
  /* e a rolagem (FIN-CONSORCIO-02): um modal com conteudo mais alto que a caixa tem de ser acusado */
  await p0.evaluate(() => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.style.cssText = 'height:40px;overflow:hidden';
    d.innerHTML = '<div style="height:120px">alto</div>'; document.body.appendChild(d); });
  const daRolagem0 = await p0.evaluate(medirRolagem, { dentro: '[role="dialog"]', exceto: null });
  /* e a altura: um bloco que cresce com o texto novo tem de ser acusado; o que nao muda, nao */
  await p0.evaluate(() => { const d = document.createElement('div'); d.id = 'cresce'; d.style.width = '60px'; d.textContent = 'curto'; document.body.appendChild(d); });
  const h0 = await alturaDe(p0, '#cresce');
  const semMudar = achadoDaAltura('#cresce', h0, await alturaDe(p0, '#cresce'));
  await p0.evaluate(() => { document.getElementById('cresce').textContent = 'um nome longo que quebra em varias linhas'; });
  const comMudanca = achadoDaAltura('#cresce', h0, await alturaDe(p0, '#cresce'));
  await p0.evaluate(() => {
    const d = document.createElement('div'); d.id = 'tabela-curta'; d.style.cssText = 'height:70px;overflow:auto;width:200px';
    d.innerHTML = '<table><thead style="position:sticky;top:0"><tr style="height:20px"><th>a</th></tr></thead><tbody>'
      + '<tr style="height:20px"><td>1</td></tr>'.repeat(5) + '</tbody><tfoot style="position:sticky;bottom:0"><tr style="height:20px"><td>t</td></tr></tfoot></table>';
    document.body.appendChild(d);
  });
  const daTabela0 = await p0.evaluate(medirTabelaMinima, { sel: '#tabela-curta', linhas: 3 });
  const daPagina0 = [...(await p0.evaluate(medir)), ...(await p0.evaluate(medirCabecalho))];
  /* UI-SEM-CORTE-02 — o detector novo se prova: irmaos que se cruzam, botao sobre o rodape, texto inclinado na borda, numero escondido */
  await p0.setContent(`<div id="sobre" style="width:300px"><div style="height:30px">primeiro bloco</div><div style="height:30px;margin-top:-20px">segundo bloco</div></div>
    <div style="position:relative;height:60px;width:300px"><div style="height:60px">rodape da tabela com texto</div><button style="position:absolute;top:2px;left:10px">Fechar</button></div>
    <div style="display:inline-block;overflow:hidden;white-space:nowrap;font-style:italic;font-size:12px">Maderat</div>
    <div style="width:40px;overflow-x:auto;white-space:nowrap"><span>1.234.567,89</span></div>`);
  const daSobre0 = await p0.evaluate(medirSobreposicao, null);
  /* P100 — o detector de rotulo se prova: dois textos um sobre o outro e um fora do SVG */
  await p0.setContent(`<svg id="g" width="200" height="60"><text x="10" y="20" font-size="10">38,4k</text><text x="14" y="22" font-size="10">40,1k</text>
    <text x="190" y="40" font-size="10">99,9k</text><text x="80" y="50" font-size="10">ok</text></svg>`);
  const daRotulo0 = await p0.evaluate(medirRotulosSvg, '#g text');
  /* P100 item 5 — o detector de folga se prova: "R$ 11.252.742,85" colado em "+257,9%" (achado) e um par com folga (nao) */
  await p0.setContent(`<table id="f" style="table-layout:fixed;width:140px;font-size:10px;border-collapse:collapse"><tr><td style="width:100px;text-align:right;padding:0">R$ 11.252.742,85</td>
    <td style="text-align:right;padding:0;width:40px">+257,9%</td></tr><tr><td style="text-align:right;padding:0 20px 0 0">ok</td><td style="text-align:left;padding:0 0 0 4px">bem</td></tr></table>`);
  const daFolga0 = await p0.evaluate(medirFolgaCelulas, '#f');
  if (!daFolga0.some((a) => a.texto.includes('+257,9%')) || daFolga0.some((a) => a.texto.includes('"ok"'))) {
    console.error(`check-ui-cortes: AUTO-TESTE DA FOLGA FALHOU (${daFolga0.map((a) => a.texto).join(' | ') || 'nada'})`); process.exit(2);
  }
  /* P92 — o numero que vaza para a ESQUERDA (alinhado a' direita, numa celula estreita) e' achado; o que cabe, nao */
  await p0.setContent(`<table id="fv" style="table-layout:fixed;width:160px;font-size:10px;border-collapse:collapse"><tr><td style="width:100px">Rotulo</td>
    <td style="width:30px;text-align:right;white-space:nowrap;padding:0">R$ 999.999,99</td><td style="width:30px;text-align:right;padding:0">1,5</td></tr></table>`);
  const daVaza0 = (await p0.evaluate(medirFolgaCelulas, '#fv')).filter((a) => a.regra === 'numero-vaza');
  if (daVaza0.length !== 1 || !daVaza0[0].texto.includes('R$ 999.999,99')) {
    console.error(`check-ui-cortes: AUTO-TESTE DO NUMERO QUE VAZA FALHOU (${daVaza0.map((a) => a.texto).join(' | ') || 'nada'})`); process.exit(2);
  }
  if (!daRotulo0.some((a) => a.texto.includes('encosta')) || !daRotulo0.some((a) => a.texto.includes('sai do grafico')) || daRotulo0.some((a) => a.texto.includes('"ok"'))) {
    console.error(`check-ui-cortes: AUTO-TESTE DO ROTULO DE GRAFICO FALHOU (${daRotulo0.map((a) => a.texto).join(' | ') || 'nada'})`); process.exit(2);
  }
  const prova = [...daRolagem0, ...daTabela0, ...daPagina0, ...daSobre0, ...(comMudanca && !semMudar ? [comMudanca] : [])].map((a) => a.regra);
  /* FORN-01b — o detector se prova na regra nova: o nome com "…" e title passa; o corte seco e o documento com "…" sao achados */
  const aceitoErrado = daPagina0.some((a) => a.texto.startsWith('Nome aceito'));
  /* P137 — tabelas empilhadas no mesmo quadro: cabeçalho de quem ainda não chegou ao topo não é vão */
  const empilhadaAcusada = daPagina0.filter((a) => a.regra === 'cabecalho' && a.texto.includes('Empilhada'));
  if (empilhadaAcusada.length) { console.error(`check-ui-cortes: AUTO-TESTE DO CABEÇALHO EMPILHADO FALHOU (${empilhadaAcusada.map((a) => a.texto).join(' | ')})`); process.exit(2); }
  const seco0 = daPagina0.some((a) => a.texto.startsWith('corte seco: Nome cortado seco'));
  const doc0 = daPagina0.some((a) => a.regra === 'numero' && a.texto.includes('12.345.678/0001-90'));
  /* P159a (D7) — a exceção declarada se prova: dd/mm passa SÓ na tabela `data-dia-mes`; lá, dd/mm/aa segue acusado; fora dela, dd/mm também */
  const diaMesAceitoErrado = daPagina0.some((a) => a.regra === 'data' && a.texto === 'Data: 01/10');
  const diaMesCurto0 = daPagina0.some((a) => a.regra === 'data' && a.texto === 'Data: 01/10/26');
  const diaMesFora0 = daPagina0.some((a) => a.regra === 'data' && a.texto === 'Data: 02/10');
  /* P121 — o clamp em N linhas dentro de célula com o texto inteiro no title passa; fora de tabela segue acusado */
  const clampAceitoErrado = daPagina0.some((a) => a.texto.includes('Clamp aceito'));
  const clampFora0 = daPagina0.some((a) => a.regra === 'reticencias' && a.texto.includes('Clamp recusado'));
  /* P104 — o detector novo se prova: o rótulo que rola no lugar e a frase que passa da altura reservada são achados; o campo, não */
  await p0.setContent(`<div id="sem-rolar"><span class="r1" style="display:block;width:60px;overflow-x:auto;white-space:nowrap">1º vencimento · sugerido (Elo, dia 10)</span>
    <p style="height:13px;width:60px;overflow:hidden;font-size:10px;line-height:13px">Informe o nº de parcelas (2 a 24).</p>
    <button style="width:40px"><span style="display:block;overflow-x:auto;white-space:nowrap">Campo de seletor comprido</span></button></div>`);
  const daSemRolar0 = await p0.evaluate(medirSemRolarNoLugar, '#sem-rolar');
  const semRolar0 = daSemRolar0.some((a) => a.texto.startsWith('rola no lugar: 1º vencimento')) && daSemRolar0.some((a) => a.texto.startsWith('passa da altura reservada: Informe'))
    && !daSemRolar0.some((a) => a.texto.includes('Campo de seletor'));
  if (!semRolar0) { console.error(`check-ui-cortes: AUTO-TESTE DO SEM-ROLAR-NO-LUGAR FALHOU (${JSON.stringify(daSemRolar0)})`); process.exit(2); }
  /* P159e — as duas regras novas se provam: o texto que corta é achado (o que cabe, não); o saldo fora da coluna é achado (o alinhado, não) */
  await p0.setContent(`<div id="int"><span class="i" style="display:block;width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">PAGAMENTO PIX-PIX_DEB 23366162</span>
    <span class="i" style="display:block;width:300px;overflow:hidden;white-space:nowrap">curto</span></div>
    <div id="al"><table style="table-layout:fixed;width:300px;border-collapse:collapse"><colgroup><col><col style="width:100px"></colgroup>
    <thead><tr><th>Nome</th><th data-coluna="saldo">Saldo</th></tr></thead><tbody><tr><td>a</td><td data-alinha-coluna="saldo" style="text-align:right">1,00</td></tr></tbody></table>
    <table style="table-layout:fixed;width:280px;border-collapse:collapse"><colgroup><col><col style="width:100px"></colgroup>
    <tbody><tr><td>Saldo final solto</td><td data-alinha-coluna="saldo" style="text-align:right">9,99</td></tr></tbody></table></div>`);
  const daInteiro0 = await p0.evaluate(medirInteiro, '#int .i');
  const daAlinha0 = await p0.evaluate(medirAlinhamento, '#al');
  if (daInteiro0.length !== 1 || !daInteiro0[0].texto.includes('PIX_DEB') || daAlinha0.length !== 1 || !daAlinha0[0].texto.includes('9,99')) {
    console.error(`check-ui-cortes: AUTO-TESTE DO INTEIRO/ALINHAMENTO FALHOU (${JSON.stringify([daInteiro0, daAlinha0])})`); process.exit(2);
  }
  if (aceitoErrado || !seco0 || !doc0 || clampAceitoErrado || !clampFora0) { console.error(`check-ui-cortes: AUTO-TESTE DA REGRA DE CORTE FALHOU (aceito acusado: ${aceitoErrado}, corte seco: ${seco0}, documento: ${doc0}, clamp na célula acusado: ${clampAceitoErrado}, clamp fora achado: ${clampFora0})`); process.exit(2); }
  if (diaMesAceitoErrado || !diaMesCurto0 || !diaMesFora0) { console.error(`check-ui-cortes: AUTO-TESTE DA DATA dd/mm FALHOU (aceito acusado: ${diaMesAceitoErrado}, dd/mm/aa na lista: ${diaMesCurto0}, dd/mm fora da lista: ${diaMesFora0})`); process.exit(2); }
  await p0.close();
  if (!['reticencias', 'corte', 'quebra', 'data', 'cabecalho', 'altura', 'rolagem', 'valor', 'tabela', 'sobreposicao', 'italico', 'numero'].every((r) => prova.includes(r))
    || prova.filter((r) => r === 'cabecalho').length < 3 || daSobre0.filter((a) => a.regra === 'sobreposicao').length < 2) { console.error(`check-ui-cortes: AUTO-TESTE FALHOU (achou ${prova.join(',') || 'nada'})`); process.exit(2); }

  const todos = [];
  for (const cen of ESCOLHIDOS) for (const [w, h] of tamanhosDe(cen)) {
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    const erros = []; p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
    await p.goto(`${base}/index.html?${cen.url}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1300);
    const alturaAntes = cen.alturaFixa ? await alturaDe(p, cen.alturaFixa) : null;
    try { if (cen.antes) await cen.antes(p); } catch (e) { erros.push(`gesto: ${String(e).slice(0, 100)}`); }
    const daAltura = cen.alturaFixa ? achadoDaAltura(cen.alturaFixa, alturaAntes, await alturaDe(p, cen.alturaFixa)) : null;
    const dasAlturas = [];
    if (cen.alturasComo) {
      const pc = await navegador.newPage({ viewport: { width: w, height: h } });
      await pc.goto(`${base}/index.html?${cen.alturasComo}`); await pc.evaluate(() => document.fonts.ready); await pc.waitForTimeout(1300);
      try { if (cen.antes) await cen.antes(pc); } catch (e) { erros.push(`gesto (curto): ${String(e).slice(0, 100)}`); }
      const curto = await alturasDe(pc); await pc.close();
      const longo = await alturasDe(p);
      ALTURAS_DO_MODAL.forEach((s, i) => {
        const a = curto[i], b = longo[i];
        if (!a && !b) return;
        if (!a || !b) { dasAlturas.push({ regra: 'altura', texto: `${s} existe so' com o texto ${a ? 'curto' : 'longo'}` }); return; }
        if (a.caixa !== b.caixa || a.conteudo !== b.conteudo)
          dasAlturas.push({ regra: 'altura', texto: `${s} curto x longo: caixa ${a.caixa} x ${b.caixa}, conteudo ${a.conteudo} x ${b.conteudo}` });
      });
    }
    if (FOTOS) { fs.mkdirSync(FOTOS, { recursive: true }); await p.screenshot({ path: path.join(FOTOS, `${cen.nome}_${w}x${h}.png`) }); }
    /* FORN-BUSCA-UNICA-01 — `regiao` (opcional): o cenário varre só o que o seletor pega (a tela inteira sem ele) */
    if (cen.regiao && !(await p.$(cen.regiao))) erros.push(`regiao ${cen.regiao} nao achada`);
    const daRolagem = cen.semRolagem ? await p.evaluate(medirRolagem, cen.semRolagem) : [];
    if (cen.tabelaMinima) daRolagem.push(...(await p.evaluate(medirTabelaMinima, cen.tabelaMinima)));
    if (cen.semRolarVertical) daRolagem.push(...(await p.evaluate(medirSemRolarVertical, cen.semRolarVertical)));
    if (cen.rotulosSvg) daRolagem.push(...(await p.evaluate(medirRotulosSvg, cen.rotulosSvg)));
    if (cen.folgaCelulas) daRolagem.push(...(await p.evaluate(medirFolgaCelulas, cen.folgaCelulas)));
    if (cen.botoesDentro) daRolagem.push(...(await p.evaluate(medirBotoesDentro, cen.botoesDentro)));
    if (cen.titulosDeBloco) daRolagem.push(...(await p.evaluate(medirTitulosDeBloco)));
    if (cen.semRolarNoLugar) daRolagem.push(...(await p.evaluate(medirSemRolarNoLugar, cen.semRolarNoLugar)));
    if (cen.inteiroDe && w >= cen.inteiroDe.de) daRolagem.push(...(await p.evaluate(medirInteiro, cen.inteiroDe.sel)));
    /* P159e — o ALINHAMENTO SOBERANO vale em toda tela que marca os números (`data-alinha-coluna`) */
    daRolagem.push(...(await p.evaluate(medirAlinhamento, cen.regiao ?? null)));
    const achadosTodos = [...daRolagem, ...(await p.evaluate(medir, cen.regiao ?? null)), ...(await p.evaluate(medirCabecalho, cen.regiao ?? null)),
      ...(await p.evaluate(medirSobreposicao, cen.regiao ?? null)), ...(daAltura ? [daAltura] : []), ...dasAlturas, ...erros.map((e) => ({ regra: 'erro', texto: e }))];
    /* `soRegras` (UI-SEM-CORTE-02): o cenario conta so' estas regras — a tabela do Financeiro V2, suspensa (FIN-V2-SEM-CORTE-01), entra
       so' pelo texto inclinado e pela sobreposicao. Erro de pagina conta sempre. */
    const achados = cen.soRegras ? achadosTodos.filter((a) => a.regra === 'erro' || cen.soRegras.includes(a.regra)) : achadosTodos;
    for (const a of achados) if (!EXCECOES.some((x) => x.tela === cen.nome && x.regra === a.regra && x.texto === a.texto)) todos.push({ tela: cen.nome, tamanho: `${w}x${h}`, ...a });
    await p.close();
  }
  const unicos = [...new Map(todos.map((a) => [`${a.tela}|${a.regra}|${a.texto}`, a])).values()];
  if (unicos.length) {
    codigo = 1;
    console.error(`check-ui-cortes: ${unicos.length} achado(s) (baseline: ${EXCECOES.length} excecoes):`);
    for (const a of unicos) console.error(`  ${a.tela} [${todos.filter((x) => x.tela === a.tela && x.regra === a.regra && x.texto === a.texto).map((x) => x.tamanho).join(' ')}] ${a.regra}: ${a.texto}`);
  } else console.log(`check-ui-cortes: ${ESCOLHIDOS.length} telas, ${ESCOLHIDOS.reduce((n, c) => n + tamanhosDe(c).length, 0)} medicoes, sem reticencias, sem vao no cabecalho preso e com data dd/mm/aaaa (baseline: ${EXCECOES.length} excecoes).`);
} finally { await navegador.close(); await servidor.close(); }
process.exit(codigo);
