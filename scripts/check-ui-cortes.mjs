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
const NOTA_JA_LANCADA = ['jalancada', 'emparcela', 'cancelados', 'irmas', 'diferenca', 'lr', 'lr2', 'gulart', 'gulartlongo', 'm2', 'avista'];   // lr/lr2: os parcelados do LR (Gabriel 29/10 08:26)

const TAMANHOS_DO_CONTRATO = [[750, 483], [750, 530], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
/* P104 — os 9 tamanhos do gate e o do print do Gabriel (1750×1000) */
const TAMANHOS_DO_P104 = [[750, 483], [750, 530], [814, 530], [1000, 600], [1126, 579], [1130, 580], [1300, 704], [1440, 800], [1440, 860], [1750, 1000]];
const TAMANHOS_DA_VG = [[1000, 600], [1126, 579], [1130, 580], [1440, 800], [1440, 860]];
/* LOTES-03 F1 — os três oficiais + 1240×800 e 1024×600 + o zoom de 135% de 1280×800 (948×593) e de 1440×900 (1067×667) */
const TAMANHOS_DO_LOTES = [[1000, 600], [1126, 579], [1440, 800], [1240, 800], [1024, 600], [948, 593], [1067, 667]];
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
/* CONC-CRIAR-COM-NOTA-01 — o "Criar lançamento" da estação, a aba Documentos e (com `ler`) a NF SINTÉTICA da bancada solta no "Ler a NF" */
const criarComNota = (ler) => async (p) => {
  await clicarRotulo(/^Criar lançamento$/)(p);
  await p.getByRole('tab', { name: 'Documentos' }).click(); await p.waitForTimeout(400);
  if (!ler) return;
  const xml = await p.evaluate(() => globalThis.__nfBancada);
  await p.locator('[data-testid="doc-ler-nf-input"]').setInputFiles({ name: 'NFe-000012345.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await p.waitForTimeout(1500);
};
/* P74 — a nota no cartão em 4 (a prévia) e o "Parcelar este lançamento" em 4 (o Editar) */
/* P102 — o Editar obrigação: o "Editar" do detalhe do contrato */
const abrirEditarObrigacao = async (p) => {
  await p.locator('[data-testid="botoes-do-contrato"] button', { hasText: 'Editar' }).first().click();
  await p.locator('[role="dialog"]').first().waitFor(); await p.waitForTimeout(900);
};
/* P101 — os tamanhos em que a prévia da nota tem abas (abaixo de 1000px) */
const TAMANHOS_ESTREITOS_DA_NOTA = [[750, 483], [750, 530], [750, 600], [814, 530], [900, 600]];
const parcelarEm4 = async (p) => {
  await clicarTexto('Pagamento')(p);
  await p.locator('[data-testid="parcelar-este-abrir"]').click(); await p.waitForTimeout(300);
  await p.locator('[data-testid="parcelar-este-n"]').fill('4'); await p.waitForTimeout(600);
};
/* MAPA-02a — os gestos do mapa de pastos em tela cheia (`tela=mapa-geo`): camada pelo menu, mês pelo seletor, pasto pela busca */
const mapaCamada = (nome) => async (p) => {
  await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Camadas' }).first().click(); await p.waitForTimeout(250);
  await p.getByRole('menuitem', { name: nome, exact: true }).first().click(); await p.waitForTimeout(500);
};
const mapaMes = (rotulo) => async (p) => {
  await p.locator('[data-testid="mapa-mes"]').first().click(); await p.waitForTimeout(250);
  await p.getByRole('option', { name: rotulo, exact: true }).first().click(); await p.waitForTimeout(700);
};
const mapaPasto = (nome) => async (p) => {
  /* fix1: a busca de pasto (antes o 1º combobox da barra, que era o seletor de ANO: o painel nunca abria) */
  await p.locator('[data-testid="mapa-busca"] button').first().click(); await p.waitForTimeout(250);
  await p.keyboard.type(nome); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  await p.locator('[data-testid="mapa-painel"]').waitFor({ timeout: 4000 }); // o painel abriu de verdade (senão o cenário falha)
};
const MAPA_TAMANHOS = [[1126, 579], [1300, 704], [1366, 768], [1440, 800]];
const CENARIOS = [
  /* ACESSO-CONVITE-01 PR 1 — a entrada (e o "Esqueci minha senha"), a página do link do e-mail (convite; o Enviar vazio mostra os erros
     nos campos, no lugar reservado) e o "Trocar senha" (aberto; e com os três erros) */
  { nome: 'entrada', url: 'tela=entrada' },
  { nome: 'entrada-esqueci', url: 'tela=entrada', antes: clicar('[data-testid="entrada-trocar-modo"]') },
  { nome: 'definir-senha-convite', url: 'tela=definir-senha&token_hash=bancada&type=invite' },
  { nome: 'definir-senha-erros', url: 'tela=definir-senha&token_hash=bancada&type=invite', antes: clicar('[data-testid="definir-senha"] button[type="submit"]') },
  { nome: 'definir-senha-sem-link', url: 'tela=definir-senha' },
  { nome: 'trocar-senha', url: 'tela=trocar-senha', antes: clicarTexto('Trocar senha') },
  { nome: 'trocar-senha-erros', url: 'tela=trocar-senha', antes: async (p) => {
    await clicarTexto('Trocar senha')(p); await clicar('[data-testid="trocar-senha"] button[type="submit"]')(p); } },
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
  /* MAPA-02a — o mapa de pastos em tela cheia (só de 1126 para cima: a barra do mock não tem desenho abaixo). O mapa inteiro com filtros e
     legenda; o painel de um pasto (categorias, histórico, observação); a camada Atividade; o pasto SEM fechamento no mês; o mês de agosto */
  { nome: 'mapa-geo', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS },
  { nome: 'mapa-geo-painel', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaPasto('P_01') },
  /* MAPA-02a-fix1 (5) — o "+ Adicionar" na estrutura do mock, com o submenu Infraestrutura aberto (tudo "em breve" menos Importar) */
  { nome: 'mapa-geo-menu-adicionar', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('menuitem', { name: /Infraestrutura/ }).first().hover(); await p.waitForTimeout(500);
    await p.getByRole('menuitem', { name: 'Galpão' }).first().waitFor({ timeout: 3000 }); } },
  /* MAPA-02a-fix1 B — sem o rodapé do vínculo, o painel do pasto (histórico + categorias com o total + observações) não rola a 1366×768 */
  { nome: 'mapa-geo-painel-sem-rolar', url: 'tela=mapa-geo', tamanhos: [[1366, 768], [1440, 800]], antes: mapaPasto('P_01'),
    semRolagem: { dentro: '[data-testid="mapa-painel"]' } },
  { nome: 'mapa-geo-painel-nome-longo', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaPasto('Retiro') },
  { nome: 'mapa-geo-sem-fechamento', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaPasto('P_03') },
  /* MAPA-ATIVIDADE-LAVOURA-01: o pasto de LAVOURA (cultura/safra/área plantada, sem cabeças nem lotação) e a RESERVA pelo cadastro (D1) */
  { nome: 'mapa-geo-painel-lavoura', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaPasto('P5A') },
  { nome: 'mapa-geo-painel-reserva', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaPasto('P5B') },
  { nome: 'mapa-geo-atividade', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaCamada('Atividade') },
  /* MAPA-ROTULO-POR-CAMADA-01: o rótulo de cada camada (Situação já é o `mapa-geo`), a camada nova "Área (ha)" e "Mostrar área no rótulo";
     a regra `medirRotulosDoMapa` mede rótulo sobreposto a outro e rótulo saindo do mapa em toda tela do mapa */
  { nome: 'mapa-geo-camada-lotacao', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaCamada('Lotação (kg/ha)') },
  { nome: 'mapa-geo-camada-cabecas', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaCamada('Cabeças') },
  { nome: 'mapa-geo-camada-tipo-area', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaCamada('Tipo de área') },
  { nome: 'mapa-geo-camada-area', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaCamada('Área (ha)') },
  { nome: 'mapa-geo-rotulo-com-area', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await p.locator('[data-testid="mapa-filtros"] label', { hasText: 'Mostrar área no rótulo' }).first().click(); await p.waitForTimeout(500); } },
  { nome: 'mapa-geo-agosto', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => { await mapaMes('Ago')(p); await mapaPasto('P_01')(p); } },
  /* MAPA-02b — o fundo (neutro na bancada: nenhum tile do Google nem do OSM) e os créditos no canto, logo abaixo do zoom: em satélite com o
     copyright do tamanho dos reais (e com o painel aberto, junto do zoom), no Mapa, na queda sem satélite (o aviso) e na Operação, que nasce
     pelo mesmo hook. A Validação fica de fora: já reprova na base (rótulos e "Area Total" cortados) → pendência MAPA-VALIDACAO-CORTES */
  { nome: 'mapa-geo-fundo-mapa', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: mapaCamada('Mapa') },
  { nome: 'mapa-geo-sem-satelite', url: 'tela=mapa-geo&fundo=sem-satelite', tamanhos: MAPA_TAMANHOS },
  { nome: 'mapa-geo-sem-satelite-painel', url: 'tela=mapa-geo&fundo=sem-satelite', tamanhos: MAPA_TAMANHOS, antes: mapaPasto('P_01') },
  /* MAPA-IMPRESSAO-01 — o diálogo "Imprimir mapa" aberto pelo botão da barra do Gestor (sem a chave Esri na bancada: o satélite desabilitado com o motivo) */
  { nome: 'mapa-imprimir', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], regiao: '[role="dialog"]', antes: async (p) => {
    await p.locator('[data-testid="mapa-imprimir"]').click(); await p.locator('[data-testid="imprimir-baixar"]').waitFor(); await p.waitForTimeout(400); } },
  { nome: 'mapa-geo-operacao', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: clicar('button:has-text("Operação")') },
  /* MAPA-02f-b — a infraestrutura como PONTOS (dados sintéticos: cocho, 2 bebedouros, sede com nome longo, energia): o ícone clicado abre o
     painel de leitura; Editar; o Adicionar › Infraestrutura › Cocho entra no modo de colocar (o aviso) e o clique no mapa abre o formulário;
     o filtro "Infraestruturas" aparece no card Filtros em todas as telas do mapa */
  { nome: 'mapa-geo-infra-ver', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await p.locator('.mapa-infra-icone').first().click(); await p.waitForTimeout(500);
    await p.locator('[data-testid="mapa-painel-infra"]').waitFor({ timeout: 3000 }); } },
  { nome: 'mapa-geo-infra-editar', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('.mapa-infra-icone').first().click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="mapa-painel-infra"] button', { hasText: 'Editar' }).first().click(); await p.waitForTimeout(400); } },
  /* INFRA-FICHAS-PATR-01: o bebedouro sem bem (a ficha com material "Outro…") e o Criar bem no Patrimônio com a prévia na tela */
  { nome: 'mapa-geo-infra-ficha-sem-bem', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await p.locator('.mapa-infra-icone').nth(1).click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="infra-sem-bem"]').waitFor({ timeout: 3000 }); } },
  { nome: 'mapa-geo-infra-criar-bem', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await p.locator('.mapa-infra-icone').nth(1).click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="infra-sem-bem"] button', { hasText: 'Criar bem no Patrimônio' }).click(); await p.waitForTimeout(300);
    const data = p.locator('[data-testid="infra-criar-bem"] input[placeholder="dd/mm/aaaa"]');
    await data.fill('15/03/2024'); await data.press('Tab'); await p.waitForTimeout(200);
    await p.locator('[data-testid="mapa-painel-infra"] button', { hasText: 'Ver prévia' }).click(); await p.waitForTimeout(400); } },
  { nome: 'mapa-geo-infra-editar-ficha-outro', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('.mapa-infra-icone').nth(1).click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="mapa-painel-infra"] button', { hasText: 'Editar' }).first().click(); await p.waitForTimeout(400); } },
  { nome: 'mapa-geo-infra-colocar', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
    await p.getByRole('menuitem', { name: 'Infraestrutura' }).first().hover(); await p.waitForTimeout(300);
    await p.locator('[data-testid="infra-colocar-cocho"]').first().click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="infra-modo-colocar"]').waitFor({ timeout: 3000 }); } },
  { nome: 'mapa-geo-infra-formulario', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
    await p.getByRole('menuitem', { name: 'Infraestrutura' }).first().hover(); await p.waitForTimeout(300);
    await p.locator('[data-testid="infra-colocar-cocho"]').first().click(); await p.waitForTimeout(400);
    const caixa = await p.locator('[data-testid="mapa-gestor-mapa"]').boundingBox();
    await p.mouse.click(caixa.x + caixa.width * 0.55, caixa.y + caixa.height * 0.5); await p.waitForTimeout(500);
    await p.locator('[data-testid="infra-formulario"]').waitFor({ timeout: 3000 }); } },
  /* MAPA-AREA-TIPO-01 — o painel do polígono da Validação com "Classificar" aberto, e o Adicionar › Área › Curral levando à Validação
     (o aviso "Escolha o polígono…" e o painel já em "É área: Curral" com a prévia). Mede SÓ o painel (o resto da Validação reprova na base:
     pendência MAPA-VALIDACAO-CORTES do Code 3) */
  /* MAPA-ZOOM-E-PAINEL-01: o "Classificar" é um POPOVER no ícone da barra do polígono (a barra tem 1 linha); a região medida é o popover */
  { nome: 'mapa-geo-validacao-classificar', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], regiao: '[data-testid="validacao-popover"]',
    antes: async (p) => {
      await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(600);
      await p.locator('button[title="Classificar (pasto ou área)"]').first().click();
      await p.locator('[data-testid="validacao-popover"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(500); } },
  /* MAPA-PIQUETES-02 — `&piquetes=1` (dois polígonos sem classificação, o 1º com o nome mais longo): o painel do polígono com "É piquete de…"
     em espera, a espera no rodapé da lista com "Concluir piquetes de" e o diálogo com a prévia (área na casa dos milhares). Mede só as
     regiões novas (o resto da Validação reprova na base: pendência MAPA-VALIDACAO-CORTES do Code 3). */
  ...(() => {
    const URL_PQ = 'tela=mapa-geo&piquetes=1';
    const T = [[1126, 579], [1366, 768]];
    const LONGO = 'P_04 Retiro do Córrego Comprido – Divisão A';
    const validacao = async (p) => { await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(600); };
    const marcar = (nome) => async (p) => {
      await p.getByText(nome, { exact: true }).first().click(); await p.waitForTimeout(400);
      await p.locator('[data-testid="validacao-piquete-de"]').click(); await p.waitForTimeout(300); // MAPA-ZOOM-E-PAINEL-01: o "É piquete de…" é um popover da barra
      await p.locator('[data-testid="marcar-piquete"] button').first().click(); await p.waitForTimeout(300);
      // "P_01" também é rótulo do mapa e linha da lista: escolhe pela busca do seletor (Enter pega o 1º da busca)
      await p.getByPlaceholder('escolha o pasto…').fill('P_01'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(300); };
    const osDois = async (p) => { await validacao(p); await marcar(LONGO)(p); await marcar('P_04B')(p); };
    return [
      { nome: 'mapa-geo-validacao-piquete', url: URL_PQ, tamanhos: T, regiao: '[data-testid="validacao-popover"]',
        antes: async (p) => { await validacao(p); await marcar(LONGO)(p); } },
      { nome: 'mapa-geo-validacao-piquetes-espera', url: URL_PQ, tamanhos: T, regiao: '[data-testid="piquetes-em-espera"]', antes: osDois },
      { nome: 'mapa-geo-validacao-piquetes-previa', url: URL_PQ, tamanhos: T, regiao: '[data-testid="concluir-piquetes"]',
        antes: async (p) => { await osDois(p); await p.getByRole('button', { name: 'Concluir piquetes de P_01' }).first().click();
          await p.locator('tr[data-linha="soma"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(300); } },
    ];
  })(),
  /* MAPA-PIQUETES-03 — `&unidade=1`: o pasto-pai que virou grupo aparece como UMA unidade (o contorno do pai, a lotação Σ dos piquetes) com as
     divisões em linha fina; o painel com "2 divisões: P_09A 21,4 · P_09B 19,2 = 40,6 ha". */
  { nome: 'mapa-geo-unidade-painel', url: 'tela=mapa-geo&unidade=1', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await mapaPasto('P_09 Retiro')(p); await p.locator('[data-testid="mapa-painel-divisoes"]').waitFor({ timeout: 3000 }); } },
  /* -03: o mês do PAI (ago/26): a unidade é o pasto inteiro, sem linhas nem a linha das divisões (se ela aparecer, o cenário falha) */
  { nome: 'mapa-geo-unidade-mes-do-pai', url: 'tela=mapa-geo&unidade=1', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await mapaMes('Ago')(p); await mapaPasto('P_09 Retiro')(p);
    if (await p.locator('[data-testid="mapa-painel-divisoes"]').count()) throw new Error('mês do pai com a linha das divisões'); } },
  /* -03 caso P6: o contorno furado (a manga) e as divisões SEM polígono — "2 divisões sem desenho: P_10A, P_10B" */
  { nome: 'mapa-geo-unidade-sem-desenho', url: 'tela=mapa-geo&unidade=1', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await mapaPasto('P_10 Manga')(p); await p.locator('[data-testid="mapa-painel-divisoes"]', { hasText: '2 divisões sem desenho: P_10A, P_10B' }).waitFor({ timeout: 3000 }); } },
  /* -03: a Operação com as unidades (rótulo = nome do pasto; as divisões em linha fina) */
  { nome: 'mapa-geo-unidade-operacao', url: 'tela=mapa-geo&unidade=1', tamanhos: MAPA_TAMANHOS, antes: clicar('button:has-text("Operação")') },
  /* MAPA-AREA-TIPOS-02: o seletor de tipos ABERTO (agrupado por família, com busca), o bloco Patrimônio da estrutura com valor (a prévia
     do banco) e o submenu Adicionar › Área com os 20 tipos do catálogo (a menor tela, para ver se cabe) */
  { nome: 'mapa-geo-validacao-tipos-abertos', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(600);
    await p.locator('button[title="Classificar (pasto ou área)"]').first().click(); await p.waitForTimeout(400);
    await p.locator('[data-testid="classificar-poligono"] button', { hasText: 'É área' }).first().click(); await p.waitForTimeout(250);
    await p.locator('[data-testid="classificar-poligono-seletor"] button').first().click(); await p.waitForTimeout(400); },
    /* lista aberta por cima do painel: mede só o menu (como os outros cenários de menu aberto) */
    soRegras: ['menu-por-cima'] },
  { nome: 'mapa-geo-validacao-estrutura', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], regiao: '[data-testid="validacao-popover"]',
    antes: async (p) => {
      await p.locator('button', { hasText: 'Validação' }).first().click(); await p.waitForTimeout(600);
      await p.locator('[data-testid="validacao-lista"]').getByText('Sede do P_01', { exact: true }).first().click(); await p.waitForTimeout(400);
      /* MAPA-ZOOM-E-PAINEL-01 (Code 3): os gestos do polígono são ícones com popover — o "Patrimônio" é um deles */
      await p.locator('[data-testid="validacao-patrimonio"]').click(); await p.waitForTimeout(300);
      await p.locator('[data-testid="estrutura-da-area"] button', { hasText: 'Criar a estrutura' }).click(); await p.waitForTimeout(400); } },
  { nome: 'mapa-geo-adicionar-area-submenu', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
    await p.getByRole('menuitem', { name: 'Área' }).first().hover(); await p.waitForTimeout(400); } },
  /* MAPA-CARTOES-LARGURA-01: os cartões com o caso Ursa Maior e com o pior caso fictício (nas 3 larguras pedidas) */
  { nome: 'mapa-geo-cartoes-ursa', url: 'tela=mapa-geo&cartoes=ursa', tamanhos: [[1126, 579], [1366, 768], [1440, 800]] },
  { nome: 'mapa-geo-cartoes-pior', url: 'tela=mapa-geo&cartoes=pior', tamanhos: [[1126, 579], [1366, 768], [1440, 800]] },
  /* MAPA-AREA-TIPOS-02 (Gabriel 02/11 15:54): Adicionar › Área › Manga abre o pedido com "Desenhar nova" (padrão) | "Escolher existente";
     Desenhar nova entra no desenho do Code 3 já com o nome "Manga" (dois cliques no mapa = desenho em curso); Escolher existente + clique
     num polígono abre o Classificar já em Manga. A gravação do desenho classificando é provada no `validacaoPedidoDesenhar.test.tsx` (a
     bancada não guarda o polígono novo). E Adicionar › Infraestrutura › Curral oferece "Escolher área existente". */
  ...(() => {
    const pedirManga = async (p) => {
      await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
      await p.getByRole('menuitem', { name: 'Área' }).first().hover(); await p.waitForTimeout(300);
      await p.getByRole('menuitem', { name: 'Manga', exact: true }).first().click(); await p.waitForTimeout(700);
      await p.locator('[data-testid="validacao-tipo-pedido"]').waitFor({ timeout: 3000 });
    };
    const noMapaEm = async (p, pontos) => {
      const b = await p.locator('.leaflet-container').last().boundingBox();
      for (const [x, y] of pontos) { await p.mouse.click(b.x + b.width * x, b.y + b.height * y); await p.waitForTimeout(150); }
    };
    return [
      { nome: 'mapa-geo-adicionar-manga', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768], [1440, 800]], regiao: '[data-testid="validacao-tipo-pedido"]',
        botoesDentro: '[data-testid="validacao-tipo-pedido"]', antes: pedirManga },
      { nome: 'mapa-geo-adicionar-manga-desenhar', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], regiao: '[data-testid="barra-edicao-poligono"]',
        antes: async (p) => {
          await pedirManga(p);
          await p.locator('[data-testid="validacao-tipo-pedido-desenhar"]').click();
          await p.locator('[data-testid="barra-edicao-poligono"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(600);
          await noMapaEm(p, [[0.3, 0.5], [0.5, 0.45]]); } },
      { nome: 'mapa-geo-adicionar-manga-escolher', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], regiao: '[data-testid="validacao-popover"]',
        antes: async (p) => {
          await pedirManga(p);
          await p.locator('[data-testid="validacao-tipo-pedido-escolher"]').click(); await p.waitForTimeout(250);
          await p.getByText('P_02', { exact: true }).first().click();
          await p.locator('[data-testid="validacao-popover"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(500); } },
      { nome: 'mapa-geo-infra-escolher-area', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
        await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
        await p.getByRole('menuitem', { name: 'Infraestrutura' }).first().hover(); await p.waitForTimeout(300);
        await p.locator('[data-testid="infra-colocar-curral"]').first().click(); await p.waitForTimeout(400);
        await p.locator('[data-testid="infra-escolher-area-existente"]').waitFor({ timeout: 3000 }); } },
    ];
  })(),
  /* MAPA-PIQUETES-04: o selo "Pasto sem desenho: P_11 Sem Mapa" no Gestor (o cenário falha se ele não disser o pasto) */
  { nome: 'mapa-geo-unidade-sem-desenho-selo', url: 'tela=mapa-geo&unidade=1', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await p.locator('[data-testid="mapa-sem-desenho"]', { hasText: 'P_11 Sem Mapa' }).waitFor({ timeout: 4000 }); } },
  /* MAPA-PIQUETES-04 (Gabriel 02/11 10:40, Sta. Rita 20A-1): na Validação o contorno do pai só pega o clique na BORDA; o miolo de cada divisão
     abre a DIVISÃO. Prova no próprio cenário (falha se não abrir o certo): centro de P_09A e de P_09B → o painel diz a divisão; a borda de
     fora do pai (1 px para dentro da caixa dele, sobre a linha) → o painel diz o pai. */
  { nome: 'mapa-geo-unidade-validacao-clique', url: 'tela=mapa-geo&unidade=1', tamanhos: [[1126, 579], [1366, 768]],
    regiao: '[data-testid="validacao-painel-poligono"]', antes: async (p) => {
      await p.locator('button', { hasText: 'Validação' }).first().click();
      await p.locator('path[data-geo-id="gu-c"]').waitFor({ timeout: 4000 }); await p.waitForTimeout(500);
      const nomeNoPainel = async () => (await p.locator('[data-testid="validacao-painel-nome"]').first().innerText()).split(' · ')[0].trim();
      const clicarEm = async (x, y, espera) => {
        await p.mouse.click(x, y); await p.locator('[data-testid="validacao-painel-poligono"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(250);
        const nome = await nomeNoPainel();
        if (nome !== espera) throw new Error(`clique em (${Math.round(x)}, ${Math.round(y)}) abriu "${nome}", esperava "${espera}"`);
      };
      for (const [id, nome] of [['gu-a', 'P_09A'], ['gu-b', 'P_09B']]) {
        const c = await p.locator(`path[data-geo-id="${id}"]`).boundingBox();
        if (!c) throw new Error(`a divisão ${nome} não foi desenhada`);
        await clicarEm(c.x + c.width / 2, c.y + c.height * 0.75, nome);   // o miolo (abaixo do rótulo do pai)
      }
      const pai = await p.locator('path[data-geo-id="gu-c"]').boundingBox();
      if (!pai) throw new Error('o contorno do pai não foi desenhado');
      await clicarEm(pai.x + 1, pai.y + pai.height / 2, 'P_09 Retiro de Cima');
    } },
  { nome: 'mapa-geo-adicionar-area', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], regiao: '[data-testid="validacao-popover"]',
    antes: async (p) => {
      await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
      await p.getByRole('menuitem', { name: 'Área' }).first().hover(); await p.waitForTimeout(300);
      await p.getByRole('menuitem', { name: 'Curral', exact: true }).first().click(); await p.waitForTimeout(700);
      await p.locator('[data-testid="validacao-tipo-pedido"]').waitFor({ timeout: 3000 });
      await p.getByText('P_01', { exact: true }).first().click();
      await p.locator('[data-testid="validacao-popover"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(500); } },
  /* MAPA-CROMO-01 (Gabriel 02/11 07:46) — Adicionar › Área › Sede / benfeitorias: o aviso é UMA BARRA na zona de cima (2 linhas, Cancelar fixo à
     direita), os botões do topo saem, nada cortado nem por baixo de outro (`cromoDoMapa`, medido em todo cenário `mapa-geo-*`/`mapa-validacao-*`);
     com a lista aberta e recolhida, em 1126/1366/1440 */
  ...[['', false], ['-recolhida', true]].map(([sufixo, recolher]) => ({ nome: `mapa-geo-adicionar-sede${sufixo}`, url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768], [1440, 800]],
    regiao: '[data-testid="validacao-tipo-pedido"]',
    antes: async (p) => {
      await p.locator('[data-testid="mapa-barra"] button', { hasText: 'Adicionar' }).first().click(); await p.waitForTimeout(250);
      await p.getByRole('menuitem', { name: 'Área' }).first().hover(); await p.waitForTimeout(300);
      await p.getByRole('menuitem', { name: 'Sede / benfeitorias', exact: true }).first().click(); await p.waitForTimeout(700);
      await p.locator('[data-testid="validacao-tipo-pedido"]').waitFor({ timeout: 3000 });
      if (recolher) { await p.locator('[data-testid="validacao-recolher-lista"]').click(); await p.waitForTimeout(500); } } })),
  /* MAPA-EDITAR-POLIGONO-02 (a lacuna do -01: a Validação não tinha cenário) — a lista estreita (280 px, nome inteiro) e a barra de
     edição compacta (2 linhas, 9,5 px) em Vértices e em Desenhar. Mede SÓ a lista e a barra (o resto da Validação: MAPA-VALIDACAO-CORTES) */
  ...(() => {
    const T = [[1126, 579], [1300, 704], [1366, 768], [1440, 800]];
    const validacao = async (p) => { await p.locator('button', { hasText: 'Validação' }).first().click(); await p.locator('[data-testid="validacao-lista"]').waitFor(); await p.waitForTimeout(500); };
    return [
      { nome: 'mapa-validacao-lista', url: 'tela=mapa-geo', tamanhos: T, regiao: '[data-testid="validacao-lista"]', antes: validacao },
      /* -02b: a lista recolhida FORA da edição (faixa de 24 px; o mapa ganha a largura) */
      { nome: 'mapa-validacao-lista-recolhida', url: 'tela=mapa-geo', tamanhos: T, regiao: '[data-testid="validacao-lista-recolhida"]', antes: async (p) => {
        await validacao(p); await p.locator('[data-testid="validacao-recolher-lista"]').click();
        await p.locator('[data-testid="validacao-lista-recolhida"]').waitFor(); await p.waitForTimeout(500); } },
      /* MAPA-EDITAR-POLIGONO-09 (UI-ESPACO-RESERVADO, Gabriel 01/11 17:52: "está empurrando para a direita e sumindo o salvar") — a barra de
         edição em TODOS os modos, com a lista recolhida (o padrão na edição) e aberta: "Prévia e gravar" e "Cancelar" INTEIROS na tela e na
         barra, sem nada por cima (`visivelNaTela`), nenhum botão cortado na zona que se acomoda nem na barra (`botoesDentro`) e a barra
         sempre com a mesma altura (2 linhas) */
      ...(() => {
        const abrir = (modo, url = '') => async (p) => {
          await validacao(p); await p.locator('[data-testid="validacao-nome"]', { hasText: 'P_01' }).first().click(); await p.waitForTimeout(400);
          await p.locator(`[data-testid="editar-poligono"] button[aria-label="${modo}"]`).click();
          await p.locator('[data-testid="barra-edicao-poligono"]').waitFor(); await p.waitForTimeout(700); };
        const noMapa = async (p, pontos, duplo = false) => {
          const c = await p.locator('.leaflet-container').first().boundingBox();
          for (let k = 0; k < pontos.length; k++) {
            const [fx, fy] = pontos[k]; const x = c.x + c.width * fx, y = c.y + c.height * fy;
            if (duplo && k === pontos.length - 1) await p.mouse.dblclick(x, y); else await p.mouse.click(x, y);
            await p.waitForTimeout(250);
          } };
        /* o botão pode estar na linha ou no "Mais ▾" (é o que a barra decide) */
        const acao = async (p, testid) => {
          const b = p.locator(`[data-testid="barra-edicao-poligono"] [data-testid="${testid}"]`);
          if (await b.count()) await b.first().click();
          else { await p.locator('[data-testid="edicao-mais"]').click(); await p.waitForTimeout(200); await p.locator(`[role="menuitem"][data-testid="${testid}"]`).click(); }
          await p.waitForTimeout(500); };
        const modos = [
          ['vertices-amontoado', 'tela=mapa-geo&amontoado=1', async (p) => { await abrir('Vértices')(p); await p.locator('[data-testid="edicao-corrigir"]').waitFor(); }],
          ['corrigir', 'tela=mapa-geo&laco=1', async (p) => { await abrir('Vértices')(p); await p.locator('[data-testid="edicao-corrigir"]').waitFor(); }],
          ['redesenhar', 'tela=mapa-geo', abrir('Redesenhar')],
          /* risca de lado a lado pelo MEIO do P_01: a caixa dele sai dos rótulos dos lados (no meio de cada lado) */
          ['dividir', 'tela=mapa-geo', async (p) => {
            await abrir('Dividir')(p);
            const r = await p.evaluate(() => { const bs = [...document.querySelectorAll('.lado-do-poligono span')].map(e => e.getBoundingClientRect());
              return { x0: Math.min(...bs.map(b => b.left)), x1: Math.max(...bs.map(b => b.right)), y: (Math.min(...bs.map(b => b.top)) + Math.max(...bs.map(b => b.bottom))) / 2 }; });
            await p.mouse.click(r.x0 - 25, r.y + 3); await p.waitForTimeout(250); await p.mouse.dblclick(r.x1 + 25, r.y - 3); await p.waitForTimeout(800);
            await p.locator('[data-testid="edicao-nome-novo"]').waitFor({ timeout: 3000 }); }],
          ['unir', 'tela=mapa-geo', async (p) => {
            await validacao(p); const caixas = p.locator('[data-testid="validacao-lista"] button[role="checkbox"]');
            await caixas.nth(1).click(); await caixas.nth(2).click(); await p.locator('[data-testid="unir-selecionados"]').click();
            await p.locator('[data-testid="barra-edicao-poligono"]').waitFor(); await p.waitForTimeout(700); }],
          ['desenhar', 'tela=mapa-geo', async (p) => {
            await validacao(p); await p.locator('[data-testid="edicao-desenhar-novo"]').click();
            await p.locator('[data-testid="barra-edicao-poligono"]').waitFor(); await p.waitForTimeout(700); await noMapa(p, [[0.3, 0.5], [0.5, 0.45]]); }],
          ['rascunho', 'tela=mapa-geo', async (p) => {
            await validacao(p); await p.locator('[data-testid="edicao-desenhar-novo"]').click();
            await p.locator('[data-testid="barra-edicao-poligono"]').waitFor(); await p.waitForTimeout(700);
            await noMapa(p, [[0.3, 0.5], [0.5, 0.42], [0.55, 0.7]]); await acao(p, 'edicao-fechar-ajustar'); }],
        ];
        const medicao = { visivelNaTela: { sels: ['[data-testid="edicao-previa"]', '[data-testid="edicao-cancelar"]'], dentro: '[data-testid="barra-edicao-poligono"]', altura: 50,
          inteirosEm: ['[data-testid="edicao-zona"]', '[data-testid="edicao-linha-2"]', '[data-testid="barra-edicao-poligono"]'] },
          botoesDentro: '[data-testid="edicao-zona"], [data-testid="edicao-fixos"], [data-testid="barra-edicao-poligono"]' };
        return modos.flatMap(([nome, url, antes]) => [
          { nome: `mapa-validacao-${nome}`, url, tamanhos: T, regiao: '[data-testid="barra-edicao-poligono"]', antes, ...medicao },
          { nome: `mapa-validacao-${nome}-lista`, url, tamanhos: T, regiao: '[data-testid="barra-edicao-poligono"]', ...medicao, antes: async (p) => {
            await antes(p); await p.locator('[data-testid="validacao-reabrir-lista"]').click(); await p.waitForTimeout(700); } },
        ]);
      })(),
      /* MAPA-ZOOM-E-PAINEL-01 (Gabriel 02/11 07:40: "este modal está muito grande, tirando a visão do mapa"; "clique no polígono = pasto inteiro"):
         (1) a BARRA do polígono (1 linha, ícones) tem ≤ 44 px e fica INTEIRA dentro do mapa, sem rolar nem pisar nos botões do topo (`barraCompacta`);
         (2) selecionar enquadra o polígono INTEIRO na área visível — descontando a barra e a lista — e ele ocupa ≥ 50% do lado limitante,
         senão qualquer zoom amplo "cabia" (`pastoInteiro`); (3) em Vértices o clique no mapa, o clique de novo no MESMO polígono na lista e o ✕ não
         mexem no `data-enquadramento` (`semReenquadrar`). A barra antiga (painel de ~600×250) reprova em (1) pela altura. */
      ...(() => {
        const T3 = [[1126, 579], [1366, 768], [1440, 800]];
        const selecionarP01 = async (p) => { await validacao(p); await p.locator('[data-testid="validacao-nome"]', { hasText: 'P_01' }).first().click();
          await p.locator('[data-testid="validacao-painel-poligono"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(1200); };
        return [
          { nome: 'mapa-validacao-barra-poligono', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-painel-poligono"]', antes: selecionarP01,
            barraCompacta: { sel: '[data-testid="validacao-painel-poligono"]', alturaMax: 44, mapa: '.leaflet-container', vizinho: '[data-testid="validacao-botoes-topo"]', area: { cadastro: true } } },
          { nome: 'mapa-validacao-barra-poligono-recolhida', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-painel-poligono"]',
            antes: async (p) => { await selecionarP01(p); await p.locator('[data-testid="validacao-recolher-lista"]').click(); await p.waitForTimeout(500);
              await p.locator('[data-testid="validacao-reabrir-lista"]').waitFor(); await p.waitForTimeout(500); },
            barraCompacta: { sel: '[data-testid="validacao-painel-poligono"]', alturaMax: 44, mapa: '.leaflet-container', vizinho: '[data-testid="validacao-botoes-topo"]', area: { cadastro: true } } },
          /* MAPA-DICAS-01 (área; Gabriel 02/11 12:26, "quando eu crio um pasto, preciso ver a área dele em hectares"): (1) a coluna "ha" da lista, com a
             lista aberta, em todas as linhas: "N,NN", à direita, inteira (`colunaHa`); (2) o rótulo do P_01 no mapa mostra a área com o zoom aproximado
             ("+" 2×) e a linha SOME com o zoom afastado ("−" 3×) (`rotuloDeArea`) */
          { nome: 'mapa-validacao-lista-area', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-lista"]', antes: validacao, colunaHa: true },
          { nome: 'mapa-validacao-rotulo-area', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-topo"]', antes: validacao, rotuloDeArea: { nome: 'P_01' } },
          { nome: 'mapa-validacao-pasto-inteiro', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-topo"]', antes: selecionarP01,
            pastoInteiro: { poligono: 'path.poligono-selecionado', mapa: '.leaflet-container', lista: '[data-testid="validacao-lista"]', minimo: 0.5 } },
          { nome: 'mapa-validacao-vertices-sem-reenquadrar', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-topo"]', antes: selecionarP01, semReenquadrar: true },
          /* MAPA-LISTA-SEM-PULO-01 (Gabriel 02/11, RRCC › Ursa Maior, busca "5"): marcar a caixa de um polígono NÃO desloca a lista — a faixa de ações
             (Selecionar todos · Unir · Apagar · Apagar sem classificação) e o selo "N selecionados" têm lugar e altura fixos, sempre presentes
             (`listaSemPulo`: `top` da 1ª linha e da faixa iguais com 0, 1, N e 0 marcados; o mapa não reenquadra; nenhum botão some) */
          { nome: 'mapa-validacao-lista-sem-pulo', url: 'tela=mapa-geo', tamanhos: T3, regiao: '[data-testid="validacao-lista"]', antes: validacao, listaSemPulo: true },
          /* MAPA-DICAS-01 (Gabriel 02/11 11:18: "ficou bom, mas o cliente não entende; tem que explicar bem ao passar o mouse"): para CADA ícone da
             barra do polígono e dos botões do canto, o hover mostra a dica em até 600 ms, inteira (nunca cortada), dentro da janela, com ≤ 260 px e
             sem cobrir a barra de onde saiu (`dicasDoMapa`); com `--fotos`, um print por dica (`<cenario>_<tamanho>_dica-<nome>.png`) */
          { nome: 'mapa-validacao-dicas', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768], [1440, 800]], regiao: '[data-testid="validacao-painel-poligono"]', antes: selecionarP01,
            dicasDoMapa: { barras: ['[data-testid="validacao-painel-poligono"]', '[data-testid="validacao-botoes-topo"]'] } },
        ];
      })(),
      /* MAPA-CRIAR-PIQUETES-01 (fatia 2b, o caminho de volta) — `&unidade=1` (o pai P_09 Retiro de Cima com as divisões P_09A e P_09B, grupo `gu`;
         as duas são metades vizinhas): (1) a barra do polígono da DIVISÃO (Mover linha · Juntar com…) e do PAI (Desfazer piquetes) segue de
         1 linha (`barraCompacta`: os 2 ícones novos cabem); (2) o popover do "Juntar com…"; (3) os três diálogos de prévia com o mini-mapa
         (a frase `volta-frase` lida do banco); (4) o "Mover linha" na barra de edição: o gesto de arrastar a divisa abre o diálogo, e o
         gesto fora da divisa trava a prévia com a frase em vermelho. A prévia é a RPC sintética (`telas.tsx`, `fn_piquetes_*`). */
      ...(() => {
        const T3 = [[1126, 579], [1366, 768], [1440, 800]];
        const URL_U = 'tela=mapa-geo&unidade=1';
        const barra = { barraCompacta: { sel: '[data-testid="validacao-painel-poligono"]', alturaMax: 44, mapa: '.leaflet-container', vizinho: '[data-testid="validacao-botoes-topo"]', area: { cadastro: true } } };
        const escolher = (texto) => async (p) => { await validacao(p);
          await p.locator('[data-testid="validacao-nome"]', { hasText: texto }).first().click();
          await p.locator('[data-testid="validacao-painel-poligono"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(1200); };
        const divisao = escolher('P_09A'), pai = escolher('P_09 Retiro');
        const comFrase = async (p) => { await p.waitForFunction(() => !!document.querySelector('[data-testid="volta-frase"]')?.textContent?.trim(), null, { timeout: 5000 }); await p.waitForTimeout(500); };
        const juntar = async (p) => { await divisao(p); await p.locator('[data-testid="editar-juntar"]').click();
          await p.locator('[data-testid="juntar-escolher"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(300); };
        /* arrasta UM vértice do polígono editado (o marcador do Geoman, sem os do meio da linha): `canto` = 'divisa' (o de cima na divisa com a
           P_09B: à direita, em cima) ou 'fora' (o de cima à esquerda, na borda do pasto); 30 px para dentro do polígono */
        const arrastarVertice = (canto) => async (p) => {
          const alvo = await p.evaluate((canto) => {
            const ms = [...document.querySelectorAll('.leaflet-marker-icon.marker-icon:not(.marker-icon-middle)')].map(e => e.getBoundingClientRect())
              .map(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }));
            if (!ms.length) return null;
            const xs = ms.map(m => m.x), ys = ms.map(m => m.y);
            const x = canto === 'divisa' ? Math.max(...xs) : Math.min(...xs);
            return { ...ms.filter(m => Math.abs(m.x - x) < 3).sort((a, b) => a.y - b.y)[0], dir: canto === 'divisa' ? -1 : 1, n: ms.length, ys };
          }, canto);
          if (!alvo) throw new Error('nenhum vértice do Geoman na tela (.marker-icon)');
          await p.mouse.move(alvo.x, alvo.y); await p.mouse.down();
          await p.mouse.move(alvo.x + alvo.dir * 15, alvo.y + 15, { steps: 6 }); await p.mouse.move(alvo.x + alvo.dir * 30, alvo.y + 30, { steps: 6 });
          await p.mouse.up(); await p.waitForTimeout(700); };
        const moverLinha = (canto) => async (p) => { await divisao(p); await p.locator('[data-testid="editar-mover-linha"]').click();
          await p.locator('[data-testid="barra-edicao-poligono"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(900); await arrastarVertice(canto)(p); };
        const medirBarra = { visivelNaTela: { sels: ['[data-testid="edicao-previa"]', '[data-testid="edicao-cancelar"]'], dentro: '[data-testid="barra-edicao-poligono"]', altura: 50,
            inteirosEm: ['[data-testid="barra-edicao-poligono"]'] }, botoesDentro: '[data-testid="barra-edicao-poligono"]' };
        return [
          { nome: 'mapa-validacao-volta-painel-divisao', url: URL_U, tamanhos: T3, regiao: '[data-testid="validacao-painel-poligono"]', antes: async (p) => { await divisao(p);
              for (const t of ['editar-mover-linha', 'editar-juntar']) if (!(await p.locator(`[data-testid="${t}"]`).count())) throw new Error(`falta o ícone ${t} na divisão`); }, ...barra },
          { nome: 'mapa-validacao-volta-painel-pai', url: URL_U, tamanhos: T3, regiao: '[data-testid="validacao-painel-poligono"]', antes: async (p) => { await pai(p);
              if (!(await p.locator('[data-testid="editar-desfazer-piquetes"]').count())) throw new Error('falta o ícone editar-desfazer-piquetes no pai'); }, ...barra },
          { nome: 'mapa-validacao-volta-juntar-popover', url: URL_U, tamanhos: T3, regiao: '[data-testid="validacao-popover"]', antes: juntar },
          { nome: 'mapa-validacao-volta-mover-linha-dialogo', url: URL_U, tamanhos: T3, regiao: '[data-testid="mover-linha-dialogo"]', antes: async (p) => {
              await moverLinha('divisa')(p); await p.locator('[data-testid="edicao-previa"]').click();
              await p.locator('[data-testid="mover-linha-dialogo"]').waitFor({ timeout: 3000 }); await comFrase(p); } },
          { nome: 'mapa-validacao-volta-juntar-dialogo', url: URL_U, tamanhos: T3, regiao: '[data-testid="juntar-dialogo"]', antes: async (p) => {
              await juntar(p); await p.locator('[data-testid="juntar-escolher"] [data-juntar-com="P_09B"]').click();
              await p.locator('[data-testid="juntar-dialogo"]').waitFor({ timeout: 3000 }); await comFrase(p); } },
          { nome: 'mapa-validacao-volta-desfazer-dialogo', url: URL_U, tamanhos: T3, regiao: '[data-testid="desfazer-dialogo"]', antes: async (p) => {
              await pai(p); await p.locator('[data-testid="editar-desfazer-piquetes"]').click();
              await p.locator('[data-testid="desfazer-dialogo"]').waitFor({ timeout: 3000 }); await comFrase(p); } },
          /* o gesto fora da divisa (o vértice do canto de cima à esquerda, que não é comum às duas): a prévia trava e a frase vermelha fica na barra */
          { nome: 'mapa-validacao-volta-barra-mover-linha-travada', url: URL_U, tamanhos: T3, regiao: '[data-testid="barra-edicao-poligono"]', antes: async (p) => {
              await moverLinha('fora')(p);
              await p.waitForFunction(() => /divisa|divisões/.test(document.querySelector('[data-testid="barra-edicao-poligono"]')?.textContent ?? ''), null, { timeout: 4000 }); await p.waitForTimeout(300); }, ...medirBarra },
        ];
      })(),
      /* MAPA-CRIAR-PIQUETES-01 (fatia 1) — o "Criar piquetes" do P_01: a barra (2 linhas fixas, "Prévia e gravar" e "Cancelar" inteiros na
         tela), a lista das divisões (grade 2 × 4 = 8; o grupo que já existe com `&grupo=1`: "é a divisão do cadastro"), com a lista lateral
         recolhida e aberta, e a prévia (o diálogo) */
      ...(() => {
        const abrirPiquetes = (url) => async (p) => {
          await validacao(p); await p.locator('[data-testid="validacao-nome"]', { hasText: 'P_01' }).first().click(); await p.waitForTimeout(400);
          await p.locator('[data-testid="editar-piquetes"]').click();
          await p.locator('[data-testid="barra-piquetes"]').waitFor(); await p.waitForTimeout(900); };
        const medir = { visivelNaTela: { sels: ['[data-testid="piquetes-previa"]', '[data-testid="piquetes-cancelar"]'], dentro: '[data-testid="barra-piquetes"]', altura: 50,
            inteirosEm: ['[data-testid="piquetes-zona"]', '[data-testid="piquetes-linha-2"]', '[data-testid="barra-piquetes"]', '[data-testid="piquetes-lista"]'] },
          botoesDentro: '[data-testid="piquetes-zona"], [data-testid="piquetes-fixos"], [data-testid="barra-piquetes"]' };
        const casos = [['piquetes', 'tela=mapa-geo'], ['piquetes-grupo', 'tela=mapa-geo&grupo=1']];
        return [
          ...casos.flatMap(([nome, url]) => [
            { nome: `mapa-validacao-${nome}`, url, tamanhos: T, regiao: '[data-testid="piquetes-tela"]', antes: abrirPiquetes(url), ...medir },
            { nome: `mapa-validacao-${nome}-lista`, url, tamanhos: T, regiao: '[data-testid="piquetes-tela"]', ...medir, antes: async (p) => {
              await abrirPiquetes(url)(p); await p.locator('[data-testid="validacao-reabrir-lista"]').click(); await p.waitForTimeout(800); } },
          ]),
          ...casos.map(([nome, url]) => ({ nome: `mapa-validacao-${nome}-previa`, url, tamanhos: T, regiao: '[role="dialog"]', antes: async (p) => {
            await abrirPiquetes(url)(p);
            /* PIQUETE-POLIGONO-01: o "+ Piquete" abre desenhando; a prévia pede 2 piquetes — a metade oeste do P_01, fechando no 1º ponto */
            const c = await p.locator('path[data-geo-id="g1"]').first().boundingBox();
            const em = (fx, fy) => [c.x + fx * c.width, c.y + fy * c.height];
            const piquete = async (cantos) => { for (const [fx, fy] of [...cantos, cantos[0]]) { const [x, y] = em(fx, fy); await p.mouse.click(x, y); await p.waitForTimeout(120); } };
            await piquete([[0.02, 0.02], [0.5, 0.02], [0.5, 0.95], [0.02, 0.95]]);
            /* PIQUETE-PRO-01: a prévia só com o pasto 100% em piquetes — o resto (a leste e a faixa da borda que os cliques deixam) vira o
               2º piquete pelo "Restante" (com a divisão do cadastro, `&grupo=1`, o P_01 aceita no máximo 2 partes: desenhar as duas metades
               e ainda o Restante daria 3) */
            await p.locator('[data-testid="piquetes-restante"]').click();
            await p.waitForTimeout(300);
            await p.locator('[data-testid="piquetes-previa"]').click();
            await p.locator('[data-testid="piquetes-dialogo-previa"]').waitFor({ timeout: 3000 }); await p.waitForTimeout(400); } })),
          /* PIQUETE-PRO-01: o "+ Área interna" ligado (o seletor Praça | Corredor | Benfeitoria na barra) e a lista com piquetes desenhados
             (Editar pontos · Renomear · Apagar e o rodapé dos 100%, com o SEM PIQUETE vermelho) */
          { nome: 'mapa-validacao-piquetes-area-interna', url: 'tela=mapa-geo', tamanhos: T, regiao: '[data-testid="piquetes-tela"]', ...medir, antes: async (p) => {
            await abrirPiquetes('tela=mapa-geo')(p);
            await p.locator('[data-testid="piquetes-mais-area"]').click(); await p.waitForTimeout(400); } },
          { nome: 'mapa-validacao-piquetes-lista-pro', url: 'tela=mapa-geo', tamanhos: T, regiao: '[data-testid="piquetes-lista"]', antes: async (p) => {
            await abrirPiquetes('tela=mapa-geo')(p);
            const c = await p.locator('path[data-geo-id="g1"]').first().boundingBox();
            for (const [fx, fy] of [[0.02, 0.02], [0.5, 0.02], [0.5, 0.95], [0.02, 0.95], [0.02, 0.02]]) { await p.mouse.click(c.x + fx * c.width, c.y + fy * c.height); await p.waitForTimeout(120); }
            await p.locator('[data-testid="piquetes-editar"]').first().click(); await p.waitForTimeout(400); } },
        ];
      })(),
    ];
  })(),
  /* MAPA-CONTROLES-01 — abrir o pasto e FECHAR o painel: o zoom e os créditos voltam à borda direita (o espaço do painel não fica
     reservado); com os Filtros ocultos, o mesmo. O canto se mede sozinho em toda tela do Gestor (`medirCantoDoMapa`) */
  { nome: 'mapa-geo-painel-fechado', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await mapaPasto('P_01')(p); await p.locator('[data-testid="mapa-painel"] button[aria-label="Fechar"]').first().click(); await p.waitForTimeout(400); } },
  /* MAPA-ZOOM-ENTRE-VISOES-01 — com zoom dado, trocar de visão, de mês e de camada NÃO muda o enquadramento (`mesmoEnquadramento`) */
  { nome: 'mapa-geo-enquadramento', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], mesmoEnquadramento: true },
  /* MAPA-ZOOM-E-PAINEL-01 (Gabriel 02/11 08:27: "o zoom ficou muito devagar") — 1 clique no "+" = 1 nível inteiro; 1 giro padrão da roda
     (100 px) sobe ≥ 0,5 nível — o DOBRO do de antes (medido: +0,25 com 120 px/nível) — e ≤ 2 */
  { nome: 'mapa-geo-zoom-sensibilidade', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], zoomSensibilidade: true },
  /* fix1 (5): a Validação só pelo menu por cima (o resto dela reprova na base: pendência MAPA-VALIDACAO-CORTES) */
  { nome: 'mapa-geo-validacao-menu', url: 'tela=mapa-geo', tamanhos: [[1126, 579], [1366, 768]], antes: clicar('button:has-text("Validação")'), soRegras: ['menu-por-cima'] },
  { nome: 'mapa-geo-sem-filtros', url: 'tela=mapa-geo', tamanhos: MAPA_TAMANHOS, antes: async (p) => {
    await p.locator('[data-testid="mapa-filtros"] button', { hasText: 'Ocultar' }).first().click(); await p.waitForTimeout(400); } },
  /* MAPA-GLOBAL-01 — Geo Pastos em Global (dados sintéticos `dados/mapaGlobal.ts`): 2 fazendas; 5 com o nome mais longo, uma sem fechamento
     no mês e uma sem mapa; a visão Pastos com o filtro "Carga alta"; as abas Área por situação e Atividade do gráfico */
  { nome: 'mapa-global-2', url: 'tela=mapa-global&n=2', tamanhos: MAPA_TAMANHOS, cabecalhoInteiro: true },
  /* CHUVAS-LANCAR-01 — a planilha de Chuvas (uma fazenda; o Global = a escolha da estação) · PEC-ABAS-01 — a barra com as 4 abas e a volta */
  { nome: 'chuvas-lancar', url: 'tela=chuvas-lancar', cabecalhoInteiro: true },
  { nome: 'chuvas-lancar-global', url: 'tela=chuvas-lancar&global=1' },
  { nome: 'barra-pecuaria', url: 'tela=barra-pecuaria&aba=lancamentos-zoot' },
  { nome: 'barra-pecuaria-volta', url: 'tela=barra-pecuaria&aba=conferencia-mensal&de=lancamentos-zoot' },
  /* UI-PERIODO-01 — o componente único de período aberto (popup com os atalhos e os dois calendários; os modos mês e ano; a CPR) */
  ...[['periodo-datas', 'modo=datas&ativ=pec'], ['periodo-duas-atividades', 'modo=datas&ativ=duas'], ['periodo-mes', 'modo=mes'],
    ['periodo-ano', 'modo=ano'], ['periodo-cpr', 'modo=datas&cpr=1']].map(([nome, q]) => ({ nome, url: `tela=periodo&abrir=1&${q}`,
    antes: async (p) => { await p.locator('[data-testid="seletor-de-periodo-popup"]').waitFor(); await p.waitForTimeout(300); } })),
  { nome: 'painel-periodo', url: 'tela=painel-periodo' },
  { nome: 'painel-periodo-aberto', url: 'tela=painel-periodo&abrir=1', antes: async (p) => { await p.locator('[data-testid="painel-periodo-popup"]').waitFor(); await p.waitForTimeout(300); } },
  { nome: 'periodo-selecionar-ano', url: 'tela=periodo&abrir=1&modo=datas&ativ=duas', antes: async (p) => {
    await p.locator('[data-testid="seletor-de-periodo-popup"]').waitFor(); await p.locator('[data-atalho="selecionar-ano"]').click(); await p.waitForTimeout(300); } },
  { nome: 'mapa-global-5', url: 'tela=mapa-global&n=5', tamanhos: MAPA_TAMANHOS, cabecalhoInteiro: true },
  /* fix1 (1): o hover do cabeçalho que ordena, nas duas tabelas da visão Fazendas */
  { nome: 'mapa-global-hover-fazendas', url: 'tela=mapa-global&n=5', tamanhos: [[1126, 579], [1366, 768]], hoverCabecalho: '[data-testid="global-card-fazendas"]' },
  { nome: 'mapa-global-hover-atencao', url: 'tela=mapa-global&n=5', tamanhos: [[1126, 579], [1366, 768]], hoverCabecalho: '[data-testid="global-card-atencao"]' },
  { nome: 'mapa-global-pastos', url: 'tela=mapa-global&n=5', tamanhos: MAPA_TAMANHOS, cabecalhoInteiro: true, hoverCabecalho: '[data-testid="global-card-pastos"]', antes: async (p) => {
    await p.locator('[data-testid="global-barra"] button', { hasText: 'Pastos' }).first().click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="global-chips"] button', { hasText: 'Carga alta' }).first().click(); await p.waitForTimeout(400); } },
  { nome: 'mapa-global-grafico-area', url: 'tela=mapa-global&n=5', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('[data-testid="global-grafico"] button', { hasText: 'Área por situação' }).first().click(); await p.waitForTimeout(300); } },
  { nome: 'mapa-global-grafico-atividade', url: 'tela=mapa-global&n=5', tamanhos: [[1126, 579], [1366, 768]], antes: async (p) => {
    await p.locator('[data-testid="global-grafico"] button', { hasText: 'Atividade' }).first().click(); await p.waitForTimeout(300); } },
  { nome: 'recorrencias', url: 'tela=recorrencias', tamanhos: [[1000, 600], [1126, 579], [1300, 704], [1440, 800]],
    soRegras: ['corte', 'quebra', 'numero', 'sobreposicao', 'italico', 'cabecalho', 'data', 'valor', 'altura', 'rolagem', 'tabela'] },
  /* P172 — Cadastros › Plano de Contas nos dez tamanhos do P92: o admin (com as ações), os inativos ligados, o cliente (só leitura), a
     busca para 4/1/0 contas (o quadro tem a mesma altura) e os diálogos do subcentro do cliente (o nome; a prévia do renomear) */
  { nome: 'plano-contas', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92 },
  /* PROD-EVOLUCAO-01a — Produção › Evolução no Ano (nível 1), pior caso de largura (`mocks/evolucao.ts`): NENHUM número cortado a 1126 e a 1366,
     nas três unidades, uma fazenda e sem meta (Gabriel 30/10 17:16) */
  /* PROD-EVOLUCAO-01b-fix1 (Gabriel 31/10): o período é Mês | Ano (o Acum. saiu; abre no Ano) e os rótulos curtos cabem INTEIROS (`data-inteiro`) */
  { nome: 'evolucao-ano', url: 'tela=evolucao-ano&barra=32', tamanhos: [[1126, 579], [1366, 768]], inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  { nome: 'evolucao-ano-arroba', url: 'tela=evolucao-ano&barra=32', tamanhos: [[1126, 579], [1366, 768]], antes: clicarRotulo(/^@$/), inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  { nome: 'evolucao-ano-t', url: 'tela=evolucao-ano&barra=32', tamanhos: [[1126, 579], [1366, 768]], antes: clicarRotulo(/^t$/) },
  { nome: 'evolucao-ano-mes', url: 'tela=evolucao-ano&barra=32', tamanhos: [[1126, 579], [1366, 768]], antes: clicarRotulo(/^Mês/), inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  { nome: 'evolucao-ano-fazenda', url: 'tela=evolucao-ano&barra=32&faz=1', tamanhos: [[1126, 579], [1366, 768]], inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  { nome: 'evolucao-ano-fazenda-arroba', url: 'tela=evolucao-ano&barra=32&faz=1', tamanhos: [[1126, 579], [1366, 768]], antes: clicarRotulo(/^@$/), inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  /* DRE-LEVE-01 — Executivo › DRE (`dados/dre.ts`): nenhum número cortado no Resumido e no Detalhado (Custo variável aberto / tudo aberto),
     com 1, 2 e 3 anos, a Meta com o Δ, Por fazenda, só R$/ha e o rateio nos grupos (a grade oferece R$ e R$/ha), e na Lavoura; `v=grande` = todo valor ×10. */
  ...[['', ''], ['-grande', '&v=grande']].flatMap(([suf, par]) => {
    const URL_DRE = `tela=dre&barra=32&f_de=2026-01&f_ate=2026-09${par}`;
    const T = [[1126, 579], [1366, 768]];
    const det = async (p) => { await clicarRotulo(/^Detalhado$/)(p); };
    const tudo = async (p) => { await clicarRotulo(/^abrir tudo$/)(p); };
    const mais = (item) => async (p) => { await clicar('[data-testid="dre-mais"]')(p); await p.getByRole('menuitemcheckbox', { name: item }).first().click();
      await p.keyboard.press('Escape'); await p.waitForTimeout(400); };
    const chip = (rot) => async (p) => { await p.getByRole('button', { name: rot, exact: true }).first().click(); await p.waitForTimeout(400); };
    return [
      { nome: `dre-pec-resumido${suf}`, url: URL_DRE, tamanhos: T },
      { nome: `dre-pec-resumido-aberto${suf}`, url: URL_DRE, tamanhos: T, antes: tudo },
      { nome: `dre-pec-detalhado-cv${suf}`, url: URL_DRE, tamanhos: T, antes: async (p) => { await det(p); await clicarTexto('(−) Custo variável')(p); } },
      { nome: `dre-pec-detalhado-aberto${suf}`, url: URL_DRE, tamanhos: T, antes: async (p) => { await det(p); await tudo(p); } },
      { nome: `dre-pec-2anos${suf}`, url: URL_DRE, tamanhos: T, antes: async (p) => { await det(p); await tudo(p); await clicarRotulo(/^2$/)(p); } },
      { nome: `dre-pec-3anos${suf}`, url: URL_DRE, tamanhos: T, antes: async (p) => { await det(p); await tudo(p); await clicarRotulo(/^3$/)(p); } },
      { nome: `dre-pec-meta-delta${suf}`, url: URL_DRE, tamanhos: T,
        antes: async (p) => { await det(p); await tudo(p); await clicarRotulo(/^Meta$/)(p); await mais('Δ R$')(p); await mais('Δ %')(p); } },
      { nome: `dre-pec-ano-delta${suf}`, url: URL_DRE, tamanhos: T,
        antes: async (p) => { await det(p); await tudo(p); await mais('Δ R$')(p); await mais('Δ %')(p); } },
      { nome: `dre-pec-fazenda${suf}`, url: URL_DRE, tamanhos: T, antes: async (p) => { await det(p); await tudo(p); await mais(/^Ver por fazenda/)(p); } },
      { nome: `dre-pec-so-ha${suf}`, url: URL_DRE, tamanhos: T, antes: async (p) => { await det(p); await tudo(p); await chip('R$')(p); } },
      { nome: `dre-pec-rateio-grupos${suf}`, url: URL_DRE, tamanhos: T,
        antes: async (p) => { await det(p); await tudo(p); await clicar('[data-testid="dre-mais"]')(p); await clicarRotulo(/^Rateio nos grupos$/)(p);
          await p.keyboard.press('Escape'); await p.waitForTimeout(400); } },
      { nome: `dre-lavoura${suf}`, url: `${URL_DRE}&safra=s1`, tamanhos: T, antes: async (p) => { await clicarRotulo(/^Lavoura$/)(p); await tudo(p); } },
      { nome: `dre-lavoura-unidades${suf}`, url: `${URL_DRE}&safra=s1`, tamanhos: T,
        antes: async (p) => { await clicarRotulo(/^Lavoura$/)(p); await tudo(p); await chip('R$/sc ou t')(p); } },
    ];
  }),
  /* EVOLUCAO-TABELA-01 — metas pequenas: o Δ vira "+17 cab" / "+1,2 t" (o texto mais largo da coluna) e o card Desfrute em pontos */
  { nome: 'evolucao-ano-meta-pequena', url: 'tela=evolucao-ano&barra=32&meta=pequena', tamanhos: [[1126, 579], [1366, 768]], inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  { nome: 'evolucao-ano-meta-pequena-t', url: 'tela=evolucao-ano&barra=32&meta=pequena', tamanhos: [[1126, 579], [1366, 768]], antes: clicarRotulo(/^t$/) },
  { nome: 'evolucao-ano-sem-meta', url: 'tela=evolucao-ano&barra=32&meta=aprovada', tamanhos: [[1126, 579], [1366, 768]], antes: clicar('[data-testid="evolucao-com-meta"]') },
  /* PROD-EVOLUCAO-01b — Produção › Evolução por Categoria (o mês por categoria), pior caso (`mocks/evolucaoMes.ts`): os 8 tipos, 3 tipos, mês
     sem Fechamento, sem linha e a aba Composição; NENHUM número cortado a 1126 e a 1366 (Gabriel 30/10 17:16) */
  { nome: 'evolucao-mes', url: 'tela=evolucao-mes&barra=32', tamanhos: [[1126, 579], [1366, 768]] },
  { nome: 'evolucao-mes-3-tipos', url: 'tela=evolucao-mes&barra=32&tipos=3', tamanhos: [[1126, 579], [1366, 768]] },
  { nome: 'evolucao-mes-aberto', url: 'tela=evolucao-mes&barra=32&aberto=1', tamanhos: [[1126, 579], [1366, 768]] },
  { nome: 'evolucao-mes-vazio', url: 'tela=evolucao-mes&barra=32&vazio=1', tamanhos: [[1126, 579], [1366, 768]] },
  /* fix1 (item 4): o painel abre em Composição; "Conferir pesos" (2ª aba) com dd/mm e nomes curtos que cabem INTEIROS */
  { nome: 'evolucao-mes-pesos', url: 'tela=evolucao-mes&barra=32', tamanhos: [[1126, 579], [1366, 768]], antes: clicarRotulo(/^Conferir pesos/), inteiroDe: { sel: '[data-inteiro]', de: 1126 } },
  { nome: 'plano-contas-inativos', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: clicar('[data-testid="mostrar-inativos"]') },
  { nome: 'plano-contas-cliente', url: 'tela=plano-contas&perfil=cliente', tamanhos: TAMANHOS_DO_P92 },
  { nome: 'plano-contas-busca-4', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: async (p) => { await p.locator('[data-testid="busca-plano"]').fill('Outras Saídas'); await p.waitForTimeout(500); } },
  { nome: 'plano-contas-busca-1', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: async (p) => { await p.locator('[data-testid="busca-plano"]').fill('Pagamento Estornado'); await p.waitForTimeout(500); } },
  { nome: 'plano-contas-busca-0', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, antes: async (p) => { await p.locator('[data-testid="busca-plano"]').fill('zzzz nada'); await p.waitForTimeout(500); } },
  { nome: 'plano-contas-novo', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]', antes: clicar('[data-testid="novo-subcentro"]') },
  { nome: 'plano-contas-renomear-previa', url: 'tela=plano-contas', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]', antes: async (p) => {
    await p.locator('[data-testid="renomear-subcentro"]').first().click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="nome-subcentro"]').fill('Animais de terceiros'); await p.locator('[data-testid="conferir-subcentro"]').click(); await p.waitForTimeout(500); } },
  /* FECH-ROTACAO-01 fatia 3 — Fechamento de pastos com o grupo (dado SINTÉTICO, `tela=fechamento-grupo`): a grade com a moldura do
     grupo P10 (um vedado) e o card que só recebe; o modal do P10A com o quadro "Onde o lote esteve" (grupo inteiro) e o do P11 com a
     rotação avulsa ("também esteve em" o P12 de nome longo) */
  ...(() => {
    const T = [[750, 483], [1000, 600], [1126, 579], [1300, 704], [1366, 768], [1440, 800], [1750, 1000]];
    const URL = 'tela=fechamento-grupo&barra=32';
    const grade = async (p) => { await p.locator('[data-testid="grupo-no-fechamento"]').waitFor(); await p.waitForTimeout(600); };
    const modal = (nome) => async (p) => { await grade(p); await p.locator('button', { hasText: new RegExp(`^${nome}`) }).first().click();
      await p.locator('[data-testid="modal-do-pasto"]').waitFor(); await p.waitForTimeout(700);
      await p.locator('[data-testid="lote-onde"]').click(); await p.locator('[data-testid="lote-quadro"]').waitFor(); await p.waitForTimeout(400); };
    /* SÓ O QUE ESTE ITEM TOCA (`regiao`): a moldura do grupo, o quadro do lote e o modal com o botão novo no rodapé. A tela do
       Fechamento nunca teve gate e tem achados antigos fora disto (a fita dos meses a 750px, nome longo do card cortado sem title):
       listados no relatório da fatia 3; tirar a `regiao` mede a tela inteira. */
    const soModal = (nome) => async (p) => { await grade(p); await p.locator('button', { hasText: new RegExp(`^${nome}`) }).first().click();
      await p.locator('[data-testid="modal-do-pasto"]').waitFor(); await p.waitForTimeout(700); };
    return [
      { nome: 'fechamento-grupo', url: URL, tamanhos: T, regiao: '[data-testid="grupo-no-fechamento"]', antes: grade },
      { nome: 'fechamento-grupo-modal', url: URL, tamanhos: T, regiao: '[data-testid="modal-do-pasto"]', antes: soModal('P10A') },
      { nome: 'fechamento-grupo-quadro', url: URL, tamanhos: T, regiao: '[data-testid="lote-quadro"]', antes: modal('P10A') },
      { nome: 'fechamento-grupo-quadro-rotacao', url: URL, tamanhos: T, regiao: '[data-testid="lote-quadro"]', antes: modal('P11') },
      /* CADERNO-CAMPO-01 peça 1 — o diálogo "Exportar mês" (as folhas para marcar, a linha do motivo reservada, Cancelar/Gerar PDF) */
      { nome: 'fechamento-grupo-exportar-mes', url: URL, tamanhos: T, regiao: '[data-testid="exportar-mes"]', antes: async (p) => { await grade(p);
        await p.locator('button', { hasText: 'Exportar mês (PDF)' }).click(); await p.locator('[data-testid="exportar-mes"]').waitFor(); await p.waitForTimeout(800); } },
      /* LOTES-03 F1 — o campo Lote do modal do P10A (`&v=lotes`: Bois no DM-AN-EG-06 e Vacas num 2º lote): o modal com o botão "2 lotes" e
         o painel aberto (o pasto inteiro + por categoria) */
      { nome: 'fechamento-grupo-campo-lote', url: URL + '&v=lotes', tamanhos: TAMANHOS_DO_LOTES, regiao: '[data-testid="modal-do-pasto"]', antes: soModal('P10A') },
      { nome: 'fechamento-grupo-campo-lote-painel', url: URL + '&v=lotes', tamanhos: TAMANHOS_DO_LOTES, regiao: '[data-testid="painel-lote-do-pasto"]',
        antes: async (p) => { await soModal('P10A')(p); await p.locator('[data-testid="campo-lote-do-pasto"]').click();
          await p.locator('[data-testid="painel-lote-do-pasto"]').waitFor(); await p.waitForTimeout(500); } },
    ];
  })(),
  /* LOTES-03 F1 — Produção › Lotes (`tela=lotes`, dado SINTÉTICO dados/lotes.ts): a lista (Ativos, Encerrados, a busca sem achado com o
     vazio dentro do quadro), o assistente "+ Novo lote" (passo 1 com os cartões, o "Cadastrar nova categoria", o passo 4 com os lotes da
     combinação DF-NE-RC e o passo 5) e a ficha do DF-NE-RC-05 (Resumo e Histórico) */
  ...(() => {
    const URL = 'tela=lotes&barra=32';
    const T = TAMANHOS_DO_LOTES;
    const lista = async (p) => { await p.locator('[data-testid="tabela-lotes"]').waitFor(); await p.waitForTimeout(600); };
    const novo = async (p) => { await lista(p); await p.locator('[data-testid="lotes-novo"]').click();
      await p.locator('[data-testid="assistente-do-lote"]').waitFor(); await p.waitForTimeout(500); };
    const escolher = (re) => async (p) => { await p.locator('[data-testid="assistente-cartao"]', { hasText: re }).first().click(); await p.waitForTimeout(250);
      await p.locator('[data-testid="assistente-avancar"]').click(); await p.waitForTimeout(450); };
    const ateNumero = async (p) => { await novo(p); await escolher(/^DF/)(p); await escolher(/^NE/)(p); await escolher(/^RC/)(p);
      await p.locator('[data-testid="assistente-numero"]').waitFor(); await p.waitForTimeout(400); };
    const ficha = async (p) => { await lista(p); await p.locator('[data-testid="linha-lote"]', { hasText: 'DF-NE-RC-05' }).first().click();
      await p.locator('[data-testid="ficha-do-lote"]').waitFor(); await p.waitForTimeout(600); };
    return [
      { nome: 'lotes-lista', url: URL, tamanhos: T, antes: lista },
      { nome: 'lotes-lista-encerrados', url: URL, tamanhos: T, antes: async (p) => { await lista(p); await clicarRotulo(/^Encerrados$/)(p); } },
      { nome: 'lotes-lista-vazia', url: URL, tamanhos: T, antes: async (p) => { await lista(p);
        await p.locator('[data-testid="lotes-busca"]').fill('nenhum lote com este nome'); await p.locator('[data-testid="lotes-vazio"]').waitFor(); await p.waitForTimeout(400); } },
      { nome: 'lotes-assistente-categoria', url: URL, tamanhos: T, regiao: '[data-testid="assistente-do-lote"]', antes: novo },
      { nome: 'lotes-assistente-nova', url: URL, tamanhos: T, regiao: '[data-testid="assistente-do-lote"]', antes: async (p) => { await novo(p);
        await p.locator('[data-testid="assistente-cadastrar-nova"]').click(); await p.locator('[data-testid="assistente-form"]').waitFor(); await p.waitForTimeout(400); } },
      { nome: 'lotes-assistente-numero', url: URL, tamanhos: T, regiao: '[data-testid="assistente-do-lote"]', antes: ateNumero },
      { nome: 'lotes-assistente-perfil', url: URL, tamanhos: T, regiao: '[data-testid="assistente-do-lote"]', antes: async (p) => { await ateNumero(p);
        await p.locator('[data-testid="assistente-avancar"]').click(); await p.locator('[data-testid="assistente-perfil"]').waitFor(); await p.waitForTimeout(400); } },
      { nome: 'lotes-ficha-resumo', url: URL, tamanhos: T, regiao: '[data-testid="ficha-do-lote"]', antes: ficha },
      { nome: 'lotes-ficha-historico', url: URL, tamanhos: T, regiao: '[data-testid="ficha-do-lote"]', antes: async (p) => { await ficha(p);
        await p.locator('[data-testid="ficha-do-lote"]').getByRole('button', { name: /^Histórico$/ }).click();
        await p.locator('[data-testid="linha-historico"]').first().waitFor(); await p.waitForTimeout(400); } },
    ];
  })(),
  /* FECH-ROTACAO-01 fatia 2 — Cadastros › Pastos, modo "Grupos" (dado SINTÉTICO no `tela=pastos`): a lista dos grupos, com os
     inativos, o modal de editar (3 piquetes, a prévia "já está assim"), o novo grupo com o pasto de nome longo e área no milhar, a
     prévia da desativação, e a etiqueta do grupo no cartão do modo "Ordem manual" */
  ...(() => {
    const T = [[750, 483], [1000, 600], [1126, 579], [1300, 704], [1366, 768], [1440, 800], [1750, 1000]];
    const URL = 'tela=pastos&barra=32';
    const grupos = async (p) => { await p.locator('[data-testid="pastos-modo-grupos"]').click(); await p.locator('[data-testid="grupos-tabela"]').waitFor(); await p.waitForTimeout(300); };
    const abrir = (nome) => async (p) => { await grupos(p); await p.locator('[data-testid="grupo-linha"]', { hasText: nome }).first().click();
      await p.locator('[data-testid="grupo-dialog"]').waitFor(); await p.waitForTimeout(700); };
    return [
      { nome: 'pastos-grupos', url: URL, tamanhos: T, antes: grupos },
      { nome: 'pastos-grupos-inativos', url: URL, tamanhos: T, antes: async (p) => { await grupos(p); await p.getByText('Inativos', { exact: true }).click(); await p.waitForTimeout(400); } },
      { nome: 'pastos-grupo-editar', url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: abrir('P10') },
      { nome: 'pastos-grupo-novo', url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: async (p) => {
        await grupos(p); await p.locator('[data-testid="grupo-novo"]').click(); await p.locator('[data-testid="grupo-dialog"]').waitFor();
        await p.locator('[data-testid="grupo-nome"]').fill('Retiro do córrego');
        for (const nome of ['P13 Retiro do córrego de baixo', 'P11']) {
          await p.locator('[data-testid="grupo-bloco-pastos"] button', { hasText: /^Adicionar pasto/ }).click(); await p.waitForTimeout(200);
          await p.getByPlaceholder('Buscar pasto').fill(nome); await p.waitForTimeout(200); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
        }
        await p.waitForTimeout(700); } },
      { nome: 'pastos-grupo-desativar', url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: async (p) => { await abrir('Terminação')(p);
        await p.locator('[data-testid="grupo-desativar"]').click(); await p.waitForTimeout(500); } },
      { nome: 'pastos-manual-etiqueta', url: URL, tamanhos: T, antes: async (p) => { await p.locator('button', { hasText: /^Ordem manual$/ }).click(); await p.waitForTimeout(400); } },
      /* PASTO-AREA-OFICIAL-01 — o modo "Áreas": a lista (oficial × mapa, a diferença, o travado, o sem polígono, a última mudança), os
         marcados, a prévia do "Usar área do mapa" (P13 com área no milhar e o nome longo), a prévia com recusa e o desfazer */
      ...(() => {
        const areas = async (p) => { await p.locator('[data-testid="pastos-modo-areas"]').click(); await p.locator('[data-testid="areas-linha"]').first().waitFor(); await p.waitForTimeout(300); };
        const marcar = async (p, nome) => { await p.locator('[data-testid="areas-linha"]', { hasText: nome }).first().locator('[data-testid="areas-marcar"]').click(); };
        const previa = (nomes) => async (p) => { await areas(p); for (const n of nomes) await marcar(p, n);
          await p.locator('[data-testid="areas-usar-mapa"]').click(); await p.locator('[data-testid="areas-previa-linha"]').first().waitFor(); await p.waitForTimeout(400); };
        return [
          { nome: 'pastos-areas', url: URL, tamanhos: T, antes: areas },
          { nome: 'pastos-areas-marcados', url: URL, tamanhos: T, antes: async (p) => { await areas(p); await p.locator('[data-testid="areas-marcar-todos"]').click(); await p.waitForTimeout(300); } },
          { nome: 'pastos-areas-previa', url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: previa(['P13 Retiro', 'P10A', 'T-A3']) },
          { nome: 'pastos-areas-recusa', url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: previa(['P11']) },
          { nome: 'pastos-areas-desfazer', url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: async (p) => { await areas(p);
            await p.locator('[data-testid="areas-desfazer"]').first().click(); await p.locator('[data-testid="areas-desfazer-dialog"]').waitFor(); await p.waitForTimeout(400); } },
        ];
      })(),
    ];
  })(),
  /* PATR-01 PR B — Cadastros › Patrimônio (dado SINTÉTICO, `dados/patrimonio.ts`, com um pior caso: descrição longa e valor no teto):
     a lista, a busca para 1/0 bens e um chip (o quadro tem a mesma altura), a aba que chega depois, e o modal do bem em cada aba (o
     trator, a pastagem, a terra e o bem NOVO — Dados e Lançamentos, a terra num passo) */
  ...(() => {
    const T = [[1000, 600], [1126, 579], [1300, 704], [1440, 800]];
    const URL = 'tela=patrimonio&barra=32';
    const buscar = (txt) => async (p) => { await p.locator('[data-testid="patrimonio-busca"]').fill(txt); await p.waitForTimeout(500); };
    const abrir = (bem, aba) => async (p) => {
      if (bem) await p.locator('[data-testid="patrimonio-linha"]', { hasText: bem }).first().click();
      else await p.locator('[data-testid="patrimonio-novo"]').click();
      await p.locator('[data-testid="bem-dialog"]').waitFor(); await p.waitForTimeout(600);
      if (aba !== 'Dados') { await p.locator('[data-testid="bem-dialog"] button', { hasText: new RegExp(`^${aba}`) }).first().click(); await p.waitForTimeout(600); }
    };
    const modal = (nome, bem, aba) => ({ nome: `patrimonio-bem-${nome}`, url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: abrir(bem, aba) });
    return [
      { nome: 'patrimonio', url: URL, tamanhos: T },
      { nome: 'patrimonio-busca-1', url: URL, tamanhos: T, antes: buscar('Valtra') },
      { nome: 'patrimonio-busca-0', url: URL, tamanhos: T, antes: buscar('zzzz nada') },
      { nome: 'patrimonio-chip', url: URL, tamanhos: T, antes: async (p) => { await p.locator('[data-testid="patrimonio-filtros"] button', { hasText: /^Máquinas$/ }).click(); await p.waitForTimeout(500); } },
      /* a categoria escolhida pelo "Mais N ▾" (só onde ele existe: a 1440 todos os chips cabem e o gesto é o do chip) */
      { nome: 'patrimonio-chip-mais', url: URL, tamanhos: T, antes: async (p) => {
        const mais = p.locator('[data-testid="patrimonio-chips-mais"]');
        if (await mais.count()) { await mais.click(); await p.waitForTimeout(300); await p.getByRole('menuitem', { name: /Terra/ }).click(); }
        else await p.locator('[data-testid="patrimonio-filtros"] button', { hasText: /^Terra$/ }).click();
        await p.waitForTimeout(500); } },
      { nome: 'patrimonio-sem-bem', url: URL, tamanhos: T, antes: async (p) => { await p.locator('button', { hasText: /^Investimentos sem bem/ }).first().click(); await p.waitForTimeout(500); } },
      ...['Dados', 'Lançamentos', 'Depreciação', 'Valor de mercado', 'Documentos'].map((a) => modal(`trator-${a.toLowerCase().replace(/[^a-z]/g, '')}`, 'Trator Valtra', a)),
      modal('pastagem-pastos', 'Reforma de pastagem', 'Pastos'), modal('pastagem-lancamentos', 'Reforma de pastagem', 'Lançamentos'),
      modal('terra-dados', 'Terra nua', 'Dados'), modal('terra-mercado', 'Terra nua', 'Valor de mercado'),
      modal('longo-dados', 'Pivô central', 'Dados'),
      modal('novo-dados', null, 'Dados'), modal('novo-lancamentos', null, 'Lançamentos'),
      /* B2: o veículo (Placa e Renavam à vista), a máquina só com a identificação ANTIGA (só leitura) e o cabeçalho com o mouse em cima
         (o hover clareia o navy; antes trocava o fundo por branco e o rótulo sumia) */
      modal('veiculo-dados', 'Caminhonete Hilux', 'Dados'), modal('antiga-dados', 'Grade aradora', 'Dados'),
      /* PATR-01c (SALVAR-TRAVA item 2): a aba Depreciação do bem que já deprecia com a PRÉVIA — "Corrigir cadastro" (a tabela vira hoje ×
         depois, a frase com a acumulada/contábil) e a "Mudança de estimativa" SEM EFEITO (o aviso âmbar e o atalho "Corrigir cadastro →";
         na bancada, vida de 30 anos ou mais = sem efeito) */
      ...[['depreciacao-corrigir', true, 20], ['depreciacao-sem-efeito', false, 30]].map(([nome, corrigir, anos]) => ({
        nome: `patrimonio-bem-trator-${nome}`, url: URL, tamanhos: T, regiao: '[role="dialog"]', antes: async (p) => {
          await abrir('Trator Valtra', 'Depreciação')(p);
          if (corrigir) await p.locator('[data-testid="bem-dep-mudar"] button', { hasText: /^Corrigir cadastro$/ }).first().click();
          const vida = p.locator('[data-testid="bem-dialog"] [data-testid="campo-numero"] input').first();
          await vida.fill(String(anos)); await vida.blur();
          await p.locator('[data-testid="bem-dep-motivo"]').fill('Cadastro errado desde o início: a vida útil certa é outra');
          await p.locator('[data-testid="bem-dep-ver"]').click(); await p.waitForTimeout(600);
        } })),
      /* MAPA-GLOBAL-01 fix1 (1): o hover MEDIDO (fundo opaco, rótulo legível) — o cenário de cima só fotografa */
      { nome: 'patrimonio-hover-medido', url: URL, tamanhos: T, hoverCabecalho: '[data-testid="patrimonio-tabela"]' },
      { nome: 'patrimonio-hover-cabecalho', url: URL, tamanhos: T, antes: async (p) => {
        await p.locator('[data-testid="patrimonio-tabela"] th', { hasText: /^Código/ }).first().hover(); await p.waitForTimeout(300); } },
    ];
  })(),
  /* P106 — a tela abre em "Mês atual": o período futuro é o botão "Mês futuro" */
  { nome: 'cpr-futuro', url: 'tela=cpr&v=futuro', tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Mês futuro') },
  /* CAD-CONTAS-BANCARIAS-01 — Financeiro › Contas bancárias nos sete tamanhos: a lista do mock, o pior caso (nome, banco e gerente longos,
     saldo de 999.999.999,99), com as inativas, e o modal (780x500) em cada aba, editando e criando */
  /* FIN-VISAO-GERAL-01 PR 3 — a Visão Geral nos três tamanhos do gate + os dois do mock (1130x580 e 1440x860), nos três modos, com 24
     meses (R$ mil) e com o filtro de atividade; `semRolagem`: a PÁGINA não rola — só a grade e a lista do card rolam por dentro */
  ...[['flx', ''], ['sai', ''], ['ent', ''], ['flx', '&faixa=per&de=2025-01&ate=2026-12'], ['sai', '&faixa=66']].map(([m, extra]) => ({
    nome: `visao-geral-${m}${extra ? extra.replace(/[&=]/g, '-') : ''}`, url: `tela=visao-geral&barra=0&modo=${m}${extra}`, tamanhos: TAMANHOS_DA_VG,
    semRolagem: { dentro: '[data-testid="visao-geral"]', exceto: '[data-testid="grade-vg-rolagem"], [data-testid="card-vg-lista"]' } })),
  /* VISAO-GERAL-02 — a Visão Geral nova (dado SINTÉTICO `dados/visaoGeral02.ts`): Global e uma fazenda, a distribuição por fazenda
     (diálogo) e o filtro de uma atividade; nada corta nem sai do lugar nos tamanhos da VG */
  { nome: 'visao-geral-02', url: 'tela=visao-geral-02', tamanhos: TAMANHOS_DA_VG, antes: (p) => p.waitForTimeout(2500) },
  /* VG-RESULTADO-RS-01 — o Resultado em prejuízo: "+R$ 645 mil vs meta" no lugar do % (o texto mais largo da linha do cartão) */
  { nome: 'visao-geral-02-prejuizo', url: 'tela=visao-geral-02&prejuizo=1', tamanhos: TAMANHOS_DA_VG, antes: (p) => p.waitForTimeout(2500) },
  { nome: 'visao-geral-02-fazenda', url: 'tela=visao-geral-02&fz=fA', tamanhos: TAMANHOS_DA_VG, antes: (p) => p.waitForTimeout(2500) },
  { nome: 'visao-geral-02-por-fazenda', url: 'tela=visao-geral-02', tamanhos: TAMANHOS_DA_VG, regiao: '[role="dialog"]',
    antes: async (p) => { await p.waitForTimeout(2500); await clicar('[data-testid="vg-ver-por-fazenda"]')(p); await p.waitForTimeout(400); } },
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
  /* VG-CUSTEIO-FIXO-VARIAVEL-01 — o card "Centros · <atividade>" com os centros em BLOCOS (variável, fixo, com o subtotal do banco): a
     Pecuária (3 centros), a Agricultura e o pior caso de altura (`&vg_centros=13`: 7 + 6 centros de nome longo, o molde de out/26) */
  ...[['blocos-pecuaria', '', 0], ['blocos-agricultura', '', 1], ['blocos-13', '&vg_centros=13', 0]].map(([n, extra, ativ]) => ({
    nome: `visao-geral-analise-${n}`, url: `tela=visao-geral&barra=0${extra}`, tamanhos: [...TAMANHOS_DA_VG, [1366, 768]], regiao: '[data-testid="modal-analise"]',
    rotulosSvg: '[data-testid="analise-grafico-svg"] text, [data-testid="analise-donut-centro"]',
    folgaCelulas: '[data-testid="analise-tabela-lista"] table, [data-testid="analise-foco-lista"] table',
    semRolagem: { dentro: '[data-testid="modal-analise"]', exceto: '[data-testid="analise-tabela-lista"], [data-testid="analise-foco-lista"], [data-testid="analise-abas"], [data-testid="analise-caminho"]' },
    antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').first().dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(600);
      await p.locator(`[data-testid="analise-tabela-linha-${ativ}"]`).click(); await p.locator('[data-testid="analise-tabela-bloco-variavel"]').waitFor({ timeout: 8000 }); await p.waitForTimeout(500);
    } })),
  /* VG-META-NO-MODO-01 (regra final, Gabriel 31/10 11:13) — a análise do Custeio total nos 3 modos × R$ e R$/cab/mês: no Mês só as colunas
     e a meta do mês; na Média a média e a meta média; no Acum. como estava; em R$/cab os rótulos com 2 casas */
  ...['mes', 'media', 'acum'].flatMap((modo) => ['rs', 'cab'].map((un) => ({
    nome: `visao-geral-analise-modo-${modo}-${un}`, url: 'tela=visao-geral&barra=0', tamanhos: [...TAMANHOS_DA_VG, [1366, 768]], regiao: '[data-testid="modal-analise"]',
    rotulosSvg: '[data-testid="analise-grafico-svg"] text, [data-testid="analise-donut-centro"]',
    folgaCelulas: '[data-testid="analise-tabela-lista"] table, [data-testid="analise-foco-lista"] table',
    semRolagem: { dentro: '[data-testid="modal-analise"]', exceto: '[data-testid="analise-tabela-lista"], [data-testid="analise-foco-lista"], [data-testid="analise-abas"], [data-testid="analise-caminho"]' },
    antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').first().dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await p.waitForTimeout(600);
      if (modo !== 'mes') { await p.locator('[data-testid="analise-tabela"]').getByText(modo === 'media' ? 'Média' : 'Acum.', { exact: true }).dispatchEvent('click'); await p.waitForTimeout(600); }
      if (un === 'cab') { await p.locator('[data-testid="analise-unidade"]').click(); await p.locator('[data-testid="analise-unidade-rs_cab"]').click(); await p.waitForTimeout(700); }
    } }))),
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
  /* CARTAO-LANCAMENTO-01 — o cadastro do cartão: Dia de fechamento e Dia de vencimento no lugar de Agência e Conta, e a explicação embaixo */
  { nome: 'contas-editar-cartao', url: 'tela=contas&barra=32&n=longo&v=editar&aba=dados&cartao=1', tamanhos: [...TAMANHOS_DO_CONTRATO, [1366, 768]],
    regiao: '[data-testid="modal-conta-bancaria"]' },
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
  /* CPR-LARGURA-01 (Gabriel 03/11 19:50) — a lista cabe a 1.280, 1.440 e 1.920 sem barra horizontal, cada número inteiro na sua célula; o
     Ampliado sem a barra lateral (`&semlateral=1`), como no app (o Ampliar a esconde) */
  ...[['cpr-largura', 'tela=cpr', undefined], ['cpr-largura-ampliado', 'tela=cpr&semlateral=1', clicar('[data-testid="cpr-ampliar"]')]].map(([nome, url, antes]) => ({
    nome, url, antes, tamanhos: [[1280, 720], [1440, 800], [1920, 1000]],
    semRolarNoX: { lista: '[data-tabela-que-rola]', celulas: '[data-celula-valor], [data-celula-nf], [data-celula-data], [data-celula-status], :has(> [data-valor-da-linha])' } })),
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
  /* CARTAO-LANCAMENTO-01 — a compra à vista no cartão (o vencimento da fatura com 💳, a frase embaixo da conta, a forma "auto" e o resumo);
     `&dias=sem`: sem dia digitado, a frase mais longa ("sugerido pelas faturas; sem dia de fechamento") */
  ...['', '&dias=sem'].flatMap((d) => ['Geral', 'Pagamento'].map((aba) => ({ nome: `lancamento-cartao${d ? '-sem-dias' : ''}-${aba}`,
    url: `tela=lancamento&m=novo&v=cartaoavista${d}`, tamanhos: [...TAMANHOS_DO_CONSORCIO, [1366, 768]], antes: clicarTexto(aba) }))),
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
  /* NOTA-NOVA-MODAL-REAL (30/10) — a nota NOVA não fica mais nesta tela (passa ao Novo lançamento: `nota-nova-modal-*` abaixo); aqui, a já
     lançada e a barrada (`diverge`: a chave não confere) */
  ...['diverge', 'jalancada', 'emparcela', 'cancelados', 'irmas', 'diferenca', 'lr', 'lr2', 'gulart', 'gulartlongo', 'm2', 'avista'].map((v) => ({ nome: `nota-pdf${v ? `-${v}` : ''}`, url: `tela=nota-pdf&v=${v}`, tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-parcelas-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="nota-ja-lancada-rolagem"], [data-testid="nota-hoje-rolagem"]' },
  })),
  /* P101 — abaixo de 1000px a prévia tem três abas: as outras duas (Parcelas e lançamento; Arquivo) em todas as variantes, nos estreitos. P163-2: a
     nota JÁ LANÇADA tem as abas dela (abaixo, `nota-pdf-ja-*`) */
  ...['diverge']
    .flatMap((v) => [['lancamento', 'Parcelas e lançamento'], ['arquivo', 'Arquivo']].map(([a, rotulo]) => ({ nome: `nota-pdf-aba-${a}${v ? `-${v}` : ''}`,
      url: `tela=nota-pdf&v=${v}`, tamanhos: TAMANHOS_ESTREITOS_DA_NOTA,
      semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-parcelas-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="nota-ja-lancada-rolagem"], [data-testid="nota-hoje-rolagem"]' },
      ...(v === 'irmas' && a === 'lancamento' ? { semRolarNoLugar: '[data-testid="nota-nf-digitada"]' } : {}),
      antes: async (p) => { await p.locator('[data-testid="nota-abas"] button', { hasText: rotulo }).first().click(); await p.waitForTimeout(400); } }))),
  /* P95 — "Novo a partir da nota": a nota lida, a da chave digitada, as recusadas com o campo da chave (nome comprido) e o aviso do repetido */
  /* P101 — em TODOS os tamanhos: abaixo de 1000px a tabela perde a coluna CNPJ (no `title` do Emitente) e estreita (antes vazava 155px a 750) */
  { nome: 'nota-novo-da-nota', url: 'tela=novo-da-nota', tamanhos: TAMANHOS_DO_CONSORCIO },
  /* NOTA-NOVA-MODAL-REAL (Gabriel 30/10) — a nota que NÃO está no sistema abre DIRETO o Novo lançamento: o PDF (4 duplicatas), só a chave
     digitada (valor e data para o operador) e o cartão em 10× (D2: Parcelada 10× no Pagamento, a 1ª fatura sugerida); Geral, Pagamento e
     Documentos (o anexo clicável) nos sete tamanhos. Substitui a tela intermediária (`nota-pdf` da nota nova, `nota-pdf-aba-*`, `nota-pdf-cartao*`). */
  ...['pdf', 'chave', 'cartao'].flatMap((v) => {
    const pronto = async (p) => { await p.locator('[role="dialog"]').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(600); };
    const parcelada10 = async (p) => {
      await clicarTexto('Pagamento')(p);
      await p.getByRole('combobox').filter({ hasText: 'À vista' }).first().click(); await p.getByRole('option', { name: 'Parcelada' }).click();
      const n = p.getByRole('spinbutton').first(); await n.fill('10'); await n.blur(); await p.waitForTimeout(600);
    };
    return [
      /* a Geral rola por dentro quando a nota traz avisos (as faixas no topo): o corpo do Novo lançamento rola por desenho, como no XML (`lancamento-xml-*`) */
      { nome: `nota-nova-modal-${v}-Geral`, url: `tela=lancamento&m=novo&v=nota${v}`, tamanhos: TAMANHOS_DO_CONSORCIO, antes: pronto },
      { nome: `nota-nova-modal-${v}-Pagamento`, url: `tela=lancamento&m=novo&v=nota${v}`, tamanhos: TAMANHOS_DO_CONSORCIO,
        antes: async (p) => { await pronto(p); if (v === 'cartao') await parcelada10(p); else await clicarTexto('Pagamento')(p); } },
      { nome: `nota-nova-modal-${v}-Documentos`, url: `tela=lancamento&m=novo&v=nota${v}`, tamanhos: TAMANHOS_DO_CONSORCIO,
        antes: async (p) => { await pronto(p); await clicarTexto('Documentos')(p); } },
    ];
  }),
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
  /* P143-DATAS-01 — duas compras iguais seguidas (12 × 69,90, SINTÉTICO): a 1/12 da nova diz "achadas 1 de 12"; a 6/12 da antiga, "7 de 12" */
  ...[['nova', ''], ['antiga', '&qual=antiga']].map(([n, extra]) => ({ nome: `lancamento-parcela-duas-${n}`, url: `tela=lancamento&m=editar&v=salduas${extra}`,
    tamanhos: TAMANHOS_DO_P104, semRolarNoLugar: '[data-testid="parcela-solta"]',
    antes: async (p) => { await clicarTexto('Pagamento')(p); await p.locator('[data-testid="parcelas-no-pagamento-rodape"]').waitFor(); await p.waitForTimeout(600); } })),
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
  /* a frase mora na aba "Parcelas × sistema" (desde 29/10 a nota já lançada abre em "No sistema hoje"): o cenário abre a aba antes */
  { nome: 'nota-pdf-nf-digitada', url: 'tela=nota-pdf&v=irmas', tamanhos: TAMANHOS_DO_CONSORCIO.filter(([l]) => l >= 1000),
    semRolarNoLugar: '[data-testid="nota-nf-digitada"]',
    antes: async (p) => { await p.locator('[data-testid="nota-abas-ja"]').waitFor({ timeout: 8000 }); await p.locator('[data-testid="nota-abas-ja"] button', { hasText: 'Parcelas × sistema' }).first().click(); await p.waitForTimeout(500); } },
  { nome: 'nota-pdf-nota-lida-confirmar', url: 'tela=nota-pdf&v=irmas', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[role="alertdialog"]',
    antes: async (p) => {
      /* P163-2 — a nota já lançada abre em abas (`nota-abas-ja`, em todo tamanho): o "Usar a nota lida" mora em "No sistema hoje" */
      const ja = p.locator('[data-testid="nota-abas-ja"]');
      if (await ja.count()) { await ja.locator('button', { hasText: 'Parcelas × sistema' }).first().click(); await p.waitForTimeout(400); }
      else if (p.viewportSize().width < 1000) { await p.locator('[data-testid="nota-abas"] button', { hasText: 'Parcelas e lançamento' }).first().click(); await p.waitForTimeout(400); }
      await p.locator('[data-testid="nota-usar-nota-lida"]').first().click(); await p.waitForTimeout(600);
    } },
  /* (o "Atualizar e parcelar" saiu — D1 do NOTA-NOVA-MODAL-REAL, Gabriel 30/10: o aberto se completa pelo "Ler a NF" do Editar) */
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
  /* P153b (D3) — "Casar e trocar a conta": a confirmação curta (conta antes → depois) e o botão "Conciliar e trocar a conta" */
  { nome: 'casar-1x1-trocar', url: 'tela=casar-1x1&v=trocar', tamanhos: TAMANHOS_DO_CONSORCIO },
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
  /* P159c — "Sugestões para casar" nos 10 tamanhos: a data inteira (dd/mm/aaaa) nunca corta nem quebra; texto em uma linha com "…" + title.
     CONC-SUGESTOES-TABELA-01 (Gabriel 04/11): o extrato numa faixa própria e as duas listas na tabela da lista do Financeiro; `rural` = o caso
     do BB 16/10 (−1.265,22, sintético) com o histórico procurado e dois lançamentos marcados (o rodapé em colunas) */
  ...[['casar-sugestoes', 'tela=sugestoes-casar'], ['casar-sugestoes-vazio', 'tela=sugestoes-casar&v=vazio']].map(([nome, url]) => ({ nome, url,
    tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]' })),
  /* P153 — o "Procurar no histórico" depois de procurar (8 achados, o quadro de 6 rola, a faixa amarela), no modal e na estação; e a
     estação com o banco SEM nome (D1: o campo vazio e a frase) */
  { nome: 'casar-sugestoes-rural', url: 'tela=sugestoes-casar&v=rural', tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor();
      const cx = p.locator('[data-testid="sugestoes-lista"] tbody button[role="checkbox"]'); await cx.nth(1).click(); await cx.nth(2).click(); await p.waitForTimeout(300); } },
  /* o ajuste 07:55: MUITAS sugestões e achados — cada lista rola só dentro dela, o modal não rola nem muda de altura */
  { nome: 'casar-sugestoes-rural-muitas', url: 'tela=sugestoes-casar&v=ruralmuitas', tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]',
    semRolagem: { dentro: '[data-testid="sugestoes-casar"]', exceto: '[data-testid="sugestoes-lista"], [data-testid="procurar-historico-quadro"]' },
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); } },
  { nome: 'casar-sugestoes-procurado', url: 'tela=sugestoes-casar', tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); } },
  /* P153b — o caso da Guariroba (sintético): a sugestão "mesmo fornecedor · valor difere" e o histórico com Casar, Casar e trocar conta,
     Criar igual e o selo "outra conta"; e a lista ordenada por valor (a seta no cabeçalho, nada se mexe fora dele) */
  { nome: 'casar-sugestoes-guariroba', url: 'tela=sugestoes-casar&v=guariroba', tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); } },
  { nome: 'casar-sugestoes-guariroba-por-valor', url: 'tela=sugestoes-casar&v=guariroba', tamanhos: TAMANHOS_DO_P92, regiao: '[data-testid="sugestoes-casar"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor();
      await clicar('[data-testid="procurar-ordenar-valor"]')(p); } },
  { nome: 'casar-estacao-procurado', url: 'tela=estacao', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]',
    antes: async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); } },
  { nome: 'casar-estacao-sem-nome', url: 'tela=estacao&v=semnome', tamanhos: TAMANHOS_DO_P92, regiao: '[role="dialog"]' },
  /* CONC-CRIAR-COM-NOTA-01 — o Novo pelo extrato: a aba Documentos (o "Ler a NF" + os pendentes), o Geral PREENCHIDO pela nota (as faixas do
     XML; rola no corpo como o "+ Da nota") e o "Casar com o banco" de hoje com a nota já lançada (a coluna NF, a linha a 9,5px sem quebrar) */
  { nome: 'conc-criar-com-nota-documentos', url: 'tela=estacao&v=nota', tamanhos: TAMANHOS_DO_CONSORCIO,
    regiao: '[role="dialog"]:has([data-testid="doc-ler-nf"])', antes: criarComNota(false) },
  /* ⚠ a Geral com as faixas da nota ROLA no corpo, como no Novo do "+ Da nota" de hoje (`lancamento-xml-Geral-*` não exige sem rolagem) */
  { nome: 'conc-criar-com-nota-preenchido', url: 'tela=estacao&v=nota', tamanhos: TAMANHOS_DO_CONSORCIO,
    regiao: '[role="dialog"]:has([data-testid="xml-faixas"])', antes: criarComNota(true) },
  { nome: 'conc-criar-com-nota-casar', url: 'tela=estacao&v=notaja', tamanhos: TAMANHOS_DO_P92,
    regiao: '[role="dialog"]:has([data-testid="levado-nf"])', antes: async (p) => { await criarComNota(true)(p); await p.locator('[data-testid="levado-nf"]').waitFor(); } },
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

/* CPR-LARGURA-01 (Gabriel 03/11) — roda NA PAGINA: a lista `lista` cabe na tela SEM BARRA HORIZONTAL (o rolador dela não rola no X) e
   todo número/data/NF/status dela (`celulas`) cabe na PRÓPRIA célula (o texto da faixa "▼ −R$ 113.386,53" passava 9px da coluna de 94 e
   "NF 000.000.000" entrava no Status: nada rola nem corta, e por isso as outras regras não viam) */
function medirSemRolarNoX({ lista, celulas }) {
  const achados = [];
  const l = document.querySelector(lista); if (!l) return [{ regra: 'rolagem', texto: `${lista} nao achada` }];
  const rolador = l.parentElement;
  if (rolador.scrollWidth > rolador.clientWidth + 1) achados.push({ regra: 'rolagem', texto: `barra horizontal na lista: pede ${rolador.scrollWidth}px, tem ${rolador.clientWidth}` });
  const rr = l.getBoundingClientRect();
  for (const e of l.querySelectorAll(celulas)) {
    const r = e.getBoundingClientRect(); if (r.width < 1) continue;
    const rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect();
    if (t.width > 0 && (t.right > r.right + 0.5 || t.left < r.left - 0.5)) achados.push({ regra: 'numero-vaza', texto: `"${(e.textContent ?? '').trim()}" passa da celula (${Math.round(t.width)}px em ${Math.round(r.width)})` });
    else if (r.right > Math.min(rr.right, innerWidth) + 0.5) achados.push({ regra: 'rolagem', texto: `"${(e.textContent ?? '').trim()}" fora da tela` });
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
/* MAPA-GLOBAL-01 fix1 (2, Gabriel 31/10) — `cabecalhoInteiro` (opcional, por cenário): todo cabeçalho de tabela (`thead th`) cabe INTEIRO
   na coluna: nem o `th` passa da largura, nem um pedaço dele corta ("…" incluso — cabeçalho nunca tem reticências). "Área ha", "Peso kg"
   e "Sem fech." passavam da coluna por baixo do vizinho opaco e o gate dizia 0: a regra de corte só via quem tem `overflow: hidden`. */
function medirCabecalhoInteiro(regiao) {
  const raiz = regiao ? document.querySelector(regiao) : document; if (!raiz) return [];
  const achados = [];
  for (const th of raiz.querySelectorAll('thead th')) {
    const r = th.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const nome = (th.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (th.scrollWidth > th.clientWidth + 1) { achados.push({ regra: 'cabecalho-inteiro', texto: `"${nome}" pede ${th.scrollWidth}px, a coluna tem ${th.clientWidth}` }); continue; }
    for (const e of th.querySelectorAll('*')) {
      const cs = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 2 && (cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis')) {
        achados.push({ regra: 'cabecalho-inteiro', texto: `"${nome}" corta (pede ${e.scrollWidth}px, tem ${e.clientWidth})` }); break;
      }
      const re = e.getBoundingClientRect();
      if (re.width > 1 && (re.right > r.right + 0.5 || re.left < r.left - 0.5)) { achados.push({ regra: 'cabecalho-inteiro', texto: `"${nome}" sai da coluna (${Math.round(Math.max(re.right - r.right, r.left - re.left))}px)` }); break; }
    }
  }
  return achados;
}
/* MAPA-GLOBAL-01 fix1 (1) — `hoverCabecalho: '<seletor da tabela>'` (opcional): com o mouse num cabeçalho que ordena, o fundo segue OPACO e o
   rótulo legível (contraste ≥ 3). O `hover:bg-primary-foreground/10` trocava o navy por branco a 10% e o rótulo branco sumia. */
function medirHoverCabecalho() {
  const th = [...document.querySelectorAll('th:hover')].pop(); if (!th) return [{ regra: 'cabecalho-hover', texto: 'nenhum cabecalho com o mouse em cima' }];
  const rgba = (s) => { const m = s.match(/[\d.]+/g) ?? []; return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m[3] == null ? 1 : +m[3] }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cs = getComputedStyle(th), fundo = rgba(cs.backgroundColor), letra = rgba(cs.color);
  const nome = (th.textContent ?? '').trim().slice(0, 30);
  if (fundo.a < 0.99) return [{ regra: 'cabecalho-hover', texto: `"${nome}": com o mouse em cima o fundo fica translucido (${cs.backgroundColor})` }];
  const [cl, ce] = [lum(fundo), lum(letra)].sort((x, y) => y - x);
  const contraste = (cl + 0.05) / (ce + 0.05);
  return contraste < 3 ? [{ regra: 'cabecalho-hover', texto: `"${nome}": com o mouse em cima o rotulo some (contraste ${contraste.toFixed(1)})` }] : [];
}
/* MAPA-GLOBAL-01 fix1 (2c) — o GRÁFICO do Global, medido sozinho onde ele existe: o subtítulo fica abaixo das abas (nunca por trás), a
   legenda inteira dentro do card e pelo menos 2 barras à vista. Antes tudo rolava junto e a legenda sumia atrás das abas/abaixo do card. */
function medirGraficoDoGlobal() {
  const card = document.querySelector('[data-testid="global-grafico"]'); if (!card) return [];
  const c = card.getBoundingClientRect(), achados = [];
  const abas = card.querySelector('[role="radiogroup"], [role="tablist"]') ?? card.firstElementChild;
  const quadro = card.querySelector('[data-testid^="grafico-"]:not([data-testid$="-barras"])');
  if (!quadro) return [{ regra: 'grafico', texto: 'grafico nao achado' }];
  const sub = quadro.firstElementChild, barras = quadro.querySelector('[data-testid$="-barras"]'), leg = quadro.lastElementChild;
  const a = abas.getBoundingClientRect(), su = sub.getBoundingClientRect(), le = leg.getBoundingClientRect();
  if (su.top < a.bottom - 0.5) achados.push({ regra: 'grafico', texto: `o subtitulo passa por tras das abas (${Math.round(a.bottom - su.top)}px)` });
  if (le.bottom > c.bottom + 0.5 || le.top < c.top) achados.push({ regra: 'grafico', texto: `a legenda sai do card (${Math.round(le.bottom - c.bottom)}px)` });
  if (barras && barras.getBoundingClientRect().height < 2 * 18 - 0.5) achados.push({ regra: 'grafico', texto: `menos de 2 barras a vista (${Math.round(barras.getBoundingClientRect().height)}px)` });
  return achados;
}
/* MAPA-ROTULO-POR-CAMADA-01 — os RÓTULOS dos pastos (`[data-rotulo-pasto]`) em toda tela do mapa: nenhum rótulo se sobrepõe a outro e
   nenhum sai do mapa (o texto inteiro à vista). Rótulos que não cabem somem (ficam no hover), como sempre. */
function medirRotulosDoMapa() {
  const achados = [];
  const mapa = document.querySelector('[data-testid="mapa-gestor-mapa"]'); if (!mapa) return achados;
  const m = mapa.getBoundingClientRect();
  const rs = [...mapa.querySelectorAll('[data-rotulo-pasto]')].map((e) => ({ t: (e.textContent ?? '').trim(), r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0);
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i].r;
    if (a.left < m.left - 0.5 || a.right > m.right + 0.5) achados.push({ regra: 'rotulo', texto: `rótulo sai do mapa: ${rs[i].t.slice(0, 40)}` });
    for (let j = i + 1; j < rs.length; j++) {
      const b = rs[j].r;
      const sobre = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      if (sobre) achados.push({ regra: 'rotulo', texto: `rótulos sobrepostos: "${rs[i].t.slice(0, 30)}" × "${rs[j].t.slice(0, 30)}"` });
    }
  }
  return achados;
}
/* MAPA-CARTOES-LARGURA-01 — os CARTÕES de cima do mapa (`[data-cartao-mapa]`, o componente `CartaoDoMapa`), medidos em toda tela que os
   tem: nenhuma linha pede mais largura que a reservada (texto cortado), um cartão não invade o vizinho e todos têm a MESMA altura (2 linhas
   fixas). O detector se prova no cenário `mapa-geo-cartoes-pior` com a largura da lotação encolhida (ver o relatório). */
function medirCartoesDoMapa() {
  const achados = [];
  const cartoes = [...document.querySelectorAll('[data-cartao-mapa]')].filter((c) => c.getBoundingClientRect().width >= 1);
  for (const c of cartoes) {
    for (const l of c.querySelectorAll('[data-linha-cartao]')) {
      if (l.scrollWidth > l.clientWidth + 0.5) achados.push({ regra: 'cartao', texto: `${c.dataset.cartaoMapa}: "${(l.textContent ?? '').trim()}" pede ${l.scrollWidth}px, tem ${l.clientWidth}` });
    }
  }
  for (let i = 1; i < cartoes.length; i++) {
    const a = cartoes[i - 1].getBoundingClientRect(), b = cartoes[i].getBoundingClientRect();
    if (Math.abs(a.top - b.top) < 1 && a.right > b.left + 0.5) achados.push({ regra: 'cartao', texto: `${cartoes[i - 1].dataset.cartaoMapa} invade ${cartoes[i].dataset.cartaoMapa} (${Math.round(a.right - b.left)}px)` });
  }
  if (new Set(cartoes.map((c) => Math.round(c.getBoundingClientRect().height))).size > 1) achados.push({ regra: 'cartao', texto: 'os cartões não têm a mesma altura' });
  return achados;
}
/* MAPA-GLOBAL-01 fix1 (5) — o MENU POR CIMA DO MAPA, medido sozinho em toda tela do mapa (`mapa-geo-tela`): uma gaveta igual à do menu
   lateral (V2ContextDrawer: 200px desde o UI-VARREDURA-01 L5 v2, z-50) é posta ao lado da barra; em cada vidro, no mapa e nos cards que ela cobre, o ponto do meio da
   parte coberta tem de ser a gaveta. Sem o `isolate` da tela, os vidros (z-500) e o Leaflet (z-400…1000) ficavam por cima do menu. */
function medirMenuPorCima(foto) {
  const tela = document.querySelector('[data-testid="mapa-geo-tela"]'); if (!tela) return [];
  const t = tela.getBoundingClientRect();
  const gaveta = document.createElement('div');
  gaveta.dataset.gavetaDeTeste = '1';
  /* pointer-events: auto — com um menu do Radix aberto o body fica com pointer-events: none, a gaveta herdaria e o elementFromPoint a pularia */
  Object.assign(gaveta.style, { position: 'fixed', left: `${t.left}px`, top: '0', bottom: '0', width: '200px', zIndex: '50', background: 'rgb(30,58,95)', pointerEvents: 'auto' });
  document.body.appendChild(gaveta);
  const g = gaveta.getBoundingClientRect(), achados = [];
  const alvos = ['[data-testid="mapa-kpis"]', '[data-testid="mapa-filtros"]', '[data-testid="mapa-legenda"]', '.leaflet-container', '.leaflet-control-container .leaflet-control',
    '[data-testid="global-kpis"]', '[data-testid="global-tabela-fazendas"]', '[data-testid="global-barra"]'];
  for (const sel of alvos) for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const x0 = Math.max(r.left, g.left), x1 = Math.min(r.right, g.right), y0 = Math.max(r.top, g.top), y1 = Math.min(r.bottom, g.bottom);
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    const no = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
    if (!no || !gaveta.contains(no)) achados.push({ regra: 'menu-por-cima', texto: `${sel} fica por cima do menu lateral` });
  }
  if (!foto) gaveta.remove();
  return achados;
}
/* MAPA-CONTROLES-01 (Gabriel 31/10) — o CANTO DO MAPA do Gestor, medido sozinho em toda tela que tem o mapa do Gestor: com o painel do
   pasto aberto, o zoom e os créditos do Google ficam à esquerda dele; fechado, encostados na borda direita (os créditos no rodapé quando
   cabem ao lado da legenda, senão logo acima dela; o + / − acima deles e acima da faixa da legenda). Os créditos nunca por baixo de painel, legenda, Filtros ou KPIs (exigência do Google). */
function medirCantoDoMapa() {
  const mapa = document.querySelector('[data-testid="mapa-gestor-mapa"]'); if (!mapa) return [];
  const caixa = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width < 2 || r.height < 2 ? null : r; };
  const m = mapa.getBoundingClientRect(), z = caixa('.leaflet-control-zoom'), c = caixa('[data-testid="mapa-creditos"]');
  /* MAPA-02f-b: o painel da infraestrutura ocupa o mesmo lugar do painel do pasto (o canto segue qualquer um dos dois) */
  const painel = caixa('[data-testid="mapa-painel"]') ?? caixa('[data-testid="mapa-painel-infra"]'), legenda = caixa('[data-testid="mapa-legenda"]');
  const achados = [], px = (n) => `${Math.round(n)}px`;
  if (!z) return [{ regra: 'canto-do-mapa', texto: 'zoom nao achado' }];
  if (!c) return [{ regra: 'canto-do-mapa', texto: 'creditos nao achados' }];
  if (painel) {
    if (z.right > painel.left - 2) achados.push({ regra: 'canto-do-mapa', texto: `painel aberto: o zoom invade o painel (${px(z.right - painel.left)})` });
    if (c.right > painel.left - 2) achados.push({ regra: 'canto-do-mapa', texto: `painel aberto: os creditos invadem o painel (${px(c.right - painel.left)})` });
  } else {
    if (m.right - z.right > 14) achados.push({ regra: 'canto-do-mapa', texto: `painel fechado: o zoom fica a ${px(m.right - z.right)} da borda direita` });
    if (m.right - c.right > 14) achados.push({ regra: 'canto-do-mapa', texto: `painel fechado: os creditos ficam a ${px(m.right - c.right)} da borda direita` });
    /* no rodapé quando cabem ao lado da legenda inteira (MAPA-COMPACTO-01: a largura MEDIDA dos créditos + 30 de margens); senão logo
       acima da faixa dela */
    const cabem = !legenda || m.width >= document.querySelector('[data-testid="mapa-legenda"]').scrollWidth + 30 + c.width;
    if (cabem && m.bottom - c.bottom > 14) achados.push({ regra: 'canto-do-mapa', texto: `painel fechado: os creditos cabem no rodape e ficam a ${px(m.bottom - c.bottom)} dele` });
    if (!cabem && (c.bottom > legenda.top + 0.5 || legenda.top - c.bottom > 24)) achados.push({ regra: 'canto-do-mapa', texto: 'painel fechado: sem lugar no rodape, os creditos nao ficam logo acima da legenda' });
  }
  if (z.bottom > c.top + 0.5) achados.push({ regra: 'canto-do-mapa', texto: 'o zoom nao fica acima dos creditos' });
  if (legenda && z.bottom > legenda.top + 0.5) achados.push({ regra: 'canto-do-mapa', texto: 'o zoom desce ate a faixa da legenda' });
  const cruza = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  /* MAPA-COMPACTO-01 — as regras da Google (Map Tiles API › Policies): logo de 16 a 19 px, sem deformar; espaço livre de 10 px nos lados
     e em cima e 5 px embaixo, sem nada da casa dentro; o texto da atribuição INTEIRO numa linha (ou o botão "Fontes dos dados") */
  const logo = caixa('[data-testid="mapa-creditos-logo"]'), faixaEl = document.querySelector('[data-testid="mapa-creditos-faixa"]');
  if (logo) {
    if (logo.height < 15.5 || logo.height > 19.5) achados.push({ regra: 'canto-do-mapa', texto: `o logo do Google tem ${px(logo.height)} de altura (16 a 19)` });
    const livre = { left: logo.left - 10, right: logo.right + 10, top: logo.top - 10, bottom: logo.bottom + 5 };
    for (const [nome, sel] of [['painel', '[data-testid="mapa-painel"]'], ['painel da infraestrutura', '[data-testid="mapa-painel-infra"]'], ['legenda', '[data-testid="mapa-legenda"]'], ['Filtros', '[data-testid="mapa-filtros"]'], ['zoom', '.leaflet-control-zoom']]) {
      const b = caixa(sel); if (b && cruza(livre, b)) achados.push({ regra: 'canto-do-mapa', texto: `${nome} entra no espaço livre do logo do Google` });
    }
  }
  if (faixaEl && faixaEl.getBoundingClientRect().width > 1) {
    const f = faixaEl.getBoundingClientRect();
    if (f.height > 16.5) achados.push({ regra: 'canto-do-mapa', texto: `o texto dos créditos tem ${px(f.height)} (uma linha)` });
    if (faixaEl.scrollWidth > faixaEl.clientWidth + 1) achados.push({ regra: 'canto-do-mapa', texto: 'o texto dos créditos é cortado' });
  }
  for (const [nome, sel] of [['painel', '[data-testid="mapa-painel"]'], ['painel da infraestrutura', '[data-testid="mapa-painel-infra"]'], ['legenda', '[data-testid="mapa-legenda"]'], ['Filtros', '[data-testid="mapa-filtros"]'], ['KPIs', '[data-testid="mapa-kpis"]']]) {
    const b = caixa(sel); if (!b) continue;
    if (cruza(c, b)) achados.push({ regra: 'canto-do-mapa', texto: `os creditos ficam por baixo de ${nome}` });
    if (cruza(z, b)) achados.push({ regra: 'canto-do-mapa', texto: `o zoom fica por baixo de ${nome}` });
  }
  return achados;
}
/* FIN-CONSORCIO-04 — a tabela que rola por dentro mostra, sem rolar, o cabeçalho, N linhas e o Total inteiros (roda NA PAGINA) */
/* MAPA-ZOOM-ENTRE-VISOES-01 (Gabriel, homologação 02/11) — `mesmoEnquadramento` (opcional, por cenário; roda DEPOIS do `antes`): o enquadramento
   (centro + zoom) do mapa é UM só por fazenda. Abre o Gestor, dá zoom (2 cliques no "+" do Leaflet), lê o `data-enquadramento` do contêiner
   ("lat,lng,zoom", gravado pelo hook em todo `moveend`) e confere que continua IGUAL depois de trocar para Operação, para Validação, de
   voltar ao Gestor, de trocar o mês e de trocar a camada. Zoom igual e lat/lng a ≤ 1e-5. O código antigo (cada visão enquadrava a fazenda
   inteira ao nascer, e o contêiner não tinha o atributo) reprova nos dois: "zoom 16 → 15" e "sem data-enquadramento". */
async function medirZoomSensibilidade(p) {
  const zoom = async () => {
    await p.waitForTimeout(900);
    const b = await p.locator('.leaflet-container').first().getAttribute('data-enquadramento');
    return b ? Number(b.split(',')[2]) : NaN;
  };
  const achados = [];
  try {
    const z0 = await zoom();
    await p.locator('.leaflet-control-zoom-in').first().click();
    const z1 = await zoom();
    if (!(Math.abs(z1 - z0 - 1) < 0.01)) achados.push({ regra: 'zoom', texto: `1 clique no "+": ${z0} → ${z1} (esperado +1 nível)` });
    const c = await p.locator('.leaflet-container').first().boundingBox();
    await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await p.mouse.wheel(0, -100);
    const z2 = await zoom();
    if (!(z2 - z1 >= 0.5 - 0.01 && z2 - z1 <= 2 + 0.01)) achados.push({ regra: 'zoom', texto: `1 giro da roda (100 px): ${z1} → ${z2} (esperado de +0,5 a +2 níveis; antes era +0,25)` });
  } catch (e) { achados.push({ regra: 'erro', texto: `zoomSensibilidade: ${String(e).slice(0, 100)}` }); }
  return achados;
}
async function medirMesmoEnquadramento(p) {
  const achados = [];
  const botao = (nome) => p.getByRole('button', { name: nome, exact: true }).first();
  const ler = async () => {
    await p.waitForTimeout(1500);
    const bruto = await p.locator('.leaflet-container').first().getAttribute('data-enquadramento');
    if (!bruto) return null;
    const [lat, lng, zoom] = bruto.split(',').map(Number);
    return [lat, lng, zoom].every(Number.isFinite) ? { lat, lng, zoom, bruto } : null;
  };
  try {
    await botao('Gestor').click(); await p.waitForTimeout(800);
    const antesDoZoom = await ler();
    for (let i = 0; i < 2; i++) { await p.locator('.leaflet-control-zoom-in').first().click(); await p.waitForTimeout(500); }
    const base = await ler();
    if (!base) return [{ regra: 'enquadramento', texto: 'Gestor: o contêiner do mapa não tem data-enquadramento' }];
    if (antesDoZoom && Math.abs(base.zoom - antesDoZoom.zoom) < 0.01)
      achados.push({ regra: 'enquadramento', texto: `Gestor: o zoom não mudou com os cliques no "+" (${antesDoZoom.zoom}) — a medição não prova nada` });
    const passos = [
      ['Operação', async () => { await botao('Operação').click(); }],
      ['Validação', async () => { await botao('Validação').click(); }],
      ['Gestor de volta', async () => { await botao('Gestor').click(); }],
      ['mês', async () => { await mapaMes('Ago')(p); }],
      ['camada', async () => { await mapaCamada('Lotação (kg/ha)')(p); }],
    ];
    for (const [nome, agir] of passos) {
      await agir();
      const lido = await ler();
      if (!lido) { achados.push({ regra: 'enquadramento', texto: `${nome}: sem data-enquadramento no contêiner do mapa` }); continue; }
      if (Math.abs(lido.zoom - base.zoom) > 1e-9)
        achados.push({ regra: 'enquadramento', texto: `${nome}: zoom ${base.zoom} → ${lido.zoom} (${base.bruto} → ${lido.bruto})` });
      else if (Math.abs(lido.lat - base.lat) > 1e-5 || Math.abs(lido.lng - base.lng) > 1e-5)
        achados.push({ regra: 'enquadramento', texto: `${nome}: centro andou (${base.bruto} → ${lido.bruto})` });
    }
  } catch (e) { achados.push({ regra: 'erro', texto: `mesmoEnquadramento: ${String(e).slice(0, 100)}` }); }
  return achados;
}
/* MAPA-ZOOM-E-PAINEL-01 — `barraCompacta` (opcional, por cenário): a barra do polígono existe, tem no máximo `alturaMax` px, fica INTEIRA dentro do
   mapa (`mapa`), não rola (scrollWidth ≤ clientWidth) e não pisa no `vizinho` (os botões do topo). A barra antiga (~600×250) reprova pela altura. */
function medirBarraCompacta({ sel, alturaMax, mapa, vizinho, area }) {
  const b = document.querySelector(sel); const m = document.querySelector(mapa);
  if (!b || !m) return [{ regra: 'barra', texto: `${!b ? sel : mapa} nao achado` }];
  const r = b.getBoundingClientRect(), c = m.getBoundingClientRect(); const achados = [];
  if (r.height > alturaMax + 0.5) achados.push({ regra: 'barra', texto: `a barra do poligono tem ${Math.round(r.height)}px de altura (max ${alturaMax})` });
  if (r.left < c.left - 0.5 || r.top < c.top - 0.5 || r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5)
    achados.push({ regra: 'barra', texto: `a barra sai do mapa (${Math.round(r.left - c.left)},${Math.round(r.top - c.top)} ate ${Math.round(c.right - r.right)},${Math.round(c.bottom - r.bottom)})` });
  if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) achados.push({ regra: 'barra', texto: 'a barra rola por dentro' });
  for (const el of b.querySelectorAll('button')) {
    const e = el.getBoundingClientRect(); if (e.width < 2) continue;
    if (e.right > r.right + 0.5 || e.left < r.left - 0.5 || e.bottom > r.bottom + 0.5 || e.top < r.top - 0.5)
      achados.push({ regra: 'barra', texto: `botao "${el.getAttribute('aria-label') ?? '?'}" sai da barra` });
    /* MAPA-DICAS-01: o nome do ícone é o `aria-label` (a dica rica mostra o nome e a frase; o `title` nativo saiu para não aparecer junto) */
    if (!el.getAttribute('aria-label')) achados.push({ regra: 'barra', texto: 'botao de icone sem aria-label (sem nome para a dica e o leitor de tela)' });
  }
  const v = vizinho ? document.querySelector(vizinho) : null;
  if (v) { const q = v.getBoundingClientRect();
    if (r.right > q.left - 0.5 && r.left < q.right && r.bottom > q.top && r.top < q.bottom) achados.push({ regra: 'barra', texto: 'a barra pisa nos botoes do topo' }); }
  /* MAPA-DICAS-01 (área): a barra mostra "12,84 ha" (e "cadastro 12,50 (+0,34)" quando o pasto tem área oficial diferente) — números INTEIROS,
     sem corte (o nome é quem cede) */
  if (area) {
    const a = b.querySelector('[data-testid="validacao-painel-area"]');
    if (!a) achados.push({ regra: 'barra-area', texto: 'a barra nao tem a area (validacao-painel-area)' });
    else {
      const t = (a.textContent ?? '').trim(); const ar = a.getBoundingClientRect();
      if (!/\d[\d.]*,\d{2} ha/.test(t)) achados.push({ regra: 'barra-area', texto: `a area da barra nao e "N,NN ha": "${t}"` });
      if (area.cadastro && !/cadastro \d[\d.]*,\d{2} \([+-]\d[\d.]*,\d{2}\)/.test(t)) achados.push({ regra: 'barra-area', texto: `falta "cadastro N,NN (+N,NN)" na barra: "${t}"` });
      if (a.scrollWidth > a.clientWidth + 1 || ar.right > r.right + 0.5 || ar.left < r.left - 0.5) achados.push({ regra: 'barra-area', texto: `a area da barra esta cortada ("${t}")` });
      for (const f of a.querySelectorAll('*')) { const fr = f.getBoundingClientRect();
        if (fr.right > ar.right + 0.5 || f.scrollWidth > f.clientWidth + 1) achados.push({ regra: 'barra-area', texto: 'o cadastro da barra esta cortado' }); }
    }
  }
  return achados;
}
/* MAPA-DICAS-01 (área) — `colunaHa` (opcional, por cenário): em TODA linha da lista a célula "ha" (`validacao-area`) tem "N,NN" (ou "—"), alinha à
   direita, cabe inteira na célula (scrollWidth ≤ clientWidth, sem "…") e a lista não ganha rolagem lateral. */
function medirColunaHa() {
  const achados = []; const cs = [...document.querySelectorAll('[data-testid="validacao-area"]')];
  if (!cs.length) return [{ regra: 'coluna-ha', texto: 'nenhuma celula validacao-area (a lista nao tem a coluna ha)' }];
  const lista = document.querySelector('[data-testid="validacao-lista-linhas"]');
  if (lista && lista.scrollWidth > lista.clientWidth + 1) achados.push({ regra: 'coluna-ha', texto: 'a lista rola para o lado' });
  for (const c of cs) {
    const t = (c.textContent ?? '').trim(); const st = getComputedStyle(c);
    if (!/^(\d[\d.]*,\d{2}|—)$/.test(t)) achados.push({ regra: 'coluna-ha', texto: `celula ha fora do formato: "${t}"` });
    if (st.textAlign !== 'right' && st.textAlign !== 'end') achados.push({ regra: 'coluna-ha', texto: `"${t}" nao alinha a direita` });
    if (st.textOverflow === 'ellipsis' || c.scrollWidth > c.clientWidth + 1) achados.push({ regra: 'coluna-ha', texto: `a area "${t}" esta cortada` });
  }
  return achados;
}
/* MAPA-DICAS-01 (área) — `rotuloDeArea` (opcional, por cenário): com o zoom aproximado ("+" 2×, até 4 mais se preciso) o rótulo do `nome` mostra a
   linha da área (`rotulo-area`, "N,N ha"); com o afastado ("−" 3×, até 6 mais) a linha SOME e o nome fica. O zoom em que a bancada abre não é
   conhecido de antemão: os cliques extras só andam na direção pedida, e o número de cliques gasto vai no achado. */
async function medirRotuloDeArea(p, { nome }) {
  const achados = [];
  const rotulo = () => p.evaluate((n) => { const el = [...document.querySelectorAll('.pasto-label')].find((e) => (e.textContent ?? '').includes(n));
    return el ? { achou: true, area: el.querySelector('[data-testid="rotulo-area"]')?.textContent?.trim() ?? null } : { achou: false, area: null }; }, nome);
  const clicar = async (cls, n) => { for (let i = 0; i < n; i++) { await p.locator(`.leaflet-control-zoom-${cls}`).first().click(); await p.waitForTimeout(450); } };
  await clicar('in', 2);
  let r = await rotulo(); let extra = 0;
  while (!r.area && r.achou && extra < 4) { await clicar('in', 1); extra++; r = await rotulo(); }
  if (!r.achou) return [{ regra: 'rotulo-area', texto: `o rotulo de ${nome} nao esta no mapa` }];
  if (!r.area || !/^\d[\d.]*,\d ha$/.test(r.area)) achados.push({ regra: 'rotulo-area', texto: `com zoom aproximado o rotulo de ${nome} nao mostra "N,N ha" (${r.area ?? 'sem a linha'}; +${2 + extra} cliques)` });
  await clicar('out', 3 + extra);
  r = await rotulo(); let mais = 0;
  while (r.area && mais < 6) { await clicar('out', 1); mais++; r = await rotulo(); }
  if (r.area) achados.push({ regra: 'rotulo-area', texto: `com zoom afastado o rotulo de ${nome} ainda mostra a area (${r.area}; −${3 + extra + mais} cliques)` });
  if (!r.achou) achados.push({ regra: 'rotulo-area', texto: `o nome ${nome} sumiu junto com a area` });
  return achados;
}
/* MAPA-ZOOM-E-PAINEL-01 — `pastoInteiro` (opcional, por cenário): o `path` do polígono selecionado (classe `poligono-selecionado`) cabe INTEIRO na
   área visível do mapa (o mapa menos o que está marcado `data-sobre-o-mapa` e encostado no topo, menos a lista, se ela entrar no mapa) e ocupa
   pelo menos `minimo` do lado limitante — sem isto, o zoom antigo (fazenda inteira) "cabia" também. */
function medirPastoInteiro({ poligono, mapa, lista, minimo }) {
  const m = document.querySelector(mapa); const ps = [...document.querySelectorAll(poligono)];
  if (!m) return [{ regra: 'pasto-inteiro', texto: `${mapa} nao achado` }];
  if (!ps.length) return [{ regra: 'pasto-inteiro', texto: `${poligono} nao achado (nada selecionado no mapa)` }];
  const c = m.getBoundingClientRect(); const v = { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
  for (const el of document.querySelectorAll('[data-sobre-o-mapa]')) { const r = el.getBoundingClientRect();
    if (r.width > 0 && r.top - c.top <= 16) v.top = Math.max(v.top, r.bottom); }
  const l = lista ? document.querySelector(lista) : null;
  if (l) { const r = l.getBoundingClientRect(); if (r.right > v.left && r.left < v.right) v.left = Math.max(v.left, r.right); }
  const u = ps.map((e) => e.getBoundingClientRect()).reduce((a, r) => ({ left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }));
  const achados = []; const T = 1.5;
  if (u.left < v.left - T || u.top < v.top - T || u.right > v.right + T || u.bottom > v.bottom + T)
    achados.push({ regra: 'pasto-inteiro', texto: `o poligono nao cabe na area visivel (esq ${Math.round(u.left - v.left)}, topo ${Math.round(u.top - v.top)}, dir ${Math.round(v.right - u.right)}, base ${Math.round(v.bottom - u.bottom)})` });
  const fr = Math.max((u.right - u.left) / (v.right - v.left), (u.bottom - u.top) / (v.bottom - v.top));
  if (fr < minimo) achados.push({ regra: 'pasto-inteiro', texto: `o poligono ocupa so' ${Math.round(fr * 100)}% da area visivel (minimo ${Math.round(minimo * 100)}%): nao enquadrou o pasto` });
  return achados;
}
/* MAPA-DICAS-01 — `dicasDoMapa` (opcional, por cenário; roda DEPOIS do `antes`, com P_01 selecionado). `medirDicaAberta` roda NA PÁGINA, com a dica
   aberta, e devolve os achados de UMA dica:
     - SAI DA JANELA: o retângulo da dica passa de 0..innerWidth / 0..innerHeight;
     - CORTADA: `scrollWidth > clientWidth + 1` ou `scrollHeight > clientHeight + 1` na dica OU em qualquer filho dela. COMO REPROVA UMA DICA CORTADA:
       a dica cortada é a que tem `overflow:hidden`/`truncate`/altura fixa — o conteúdo é MAIOR que a caixa, logo `scrollWidth`/`scrollHeight` passam do
       `clientWidth`/`clientHeight` em pelo menos 2 px e o achado sai (o auto-teste do gate, abaixo, monta uma dica assim e exige o achado);
       a dica certa (`w-max`, `overflow-visible`, quebra de linha) cresce com o texto e dá scroll == client;
     - CRUZA A BARRA: o retângulo da dica pisa (mais de 1 px nos dois eixos) na barra de onde o botão saiu (`barraDeOrigem`) — ela é a de baixo, e a
       dica fica EMBAIXO do botão; se o Radix a virar para cima por falta de lugar, ela cobre a barra e reprova;
     - LARGA: mais de 260 px (+1 de folga de arredondamento). Que ela NÃO APARECE em 600 ms o `medirDicasDoMapa` acha (waitFor com 600 ms). */
function medirDicaAberta({ barraDeOrigem, nome }) {
  const achados = [];
  /* a dica ABERTA deste botão (a anterior pode estar fechando: `data-state="closed"`) */
  const abertas = [...document.querySelectorAll('[data-testid="dica-do-mapa"]')]
    .filter((d) => d.getBoundingClientRect().width > 0 && d.getAttribute('data-state') !== 'closed');
  const comNome = abertas.filter((d) => (d.textContent ?? '').includes(nome));
  const d = (comNome.length ? comNome : abertas)[(comNome.length ? comNome : abertas).length - 1];
  if (!d) return [{ regra: 'dica', texto: `"${nome}": a dica nao esta na tela` }];
  const r = d.getBoundingClientRect();
  if (r.left < -0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5)
    achados.push({ regra: 'dica', texto: `"${nome}": a dica sai da janela (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})` });
  for (const e of [d, ...d.querySelectorAll('*')]) {
    if (e.closest('[role="tooltip"]')) continue; // a cópia invisível do Radix para leitor de tela (1×1 px de propósito)
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      achados.push({ regra: 'dica', texto: `"${nome}": texto cortado (scroll ${e.scrollWidth}x${e.scrollHeight} > caixa ${e.clientWidth}x${e.clientHeight})` });
  }
  const barra = barraDeOrigem ? document.querySelector(barraDeOrigem) : null;
  if (barra) {
    const b = barra.getBoundingClientRect();
    const w = Math.min(r.right, b.right) - Math.max(r.left, b.left), h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
    if (w > 1 && h > 1) achados.push({ regra: 'dica', texto: `"${nome}": a dica cruza a barra de onde saiu (${Math.round(w)}x${Math.round(h)}px)` });
  }
  if (r.width > 261) achados.push({ regra: 'dica', texto: `"${nome}": a dica tem ${Math.round(r.width)} px de largura (maximo 260)` });
  return achados;
}
async function medirDicasDoMapa(p, cfg, prefixoDaFoto) {
  const achados = [];
  try {
    for (const barra of cfg.barras) {
      const botoes = p.locator(`${barra} button`);
      const n = await botoes.count();
      if (n === 0) { achados.push({ regra: 'dica', texto: `a barra ${barra} nao tem botoes` }); continue; }
      for (let i = 0; i < n; i++) {
        const b = botoes.nth(i);
        const nome = (await b.getAttribute('aria-label')) ?? (await b.innerText()) ?? `botao ${i}`;
        if (!(await b.isVisible())) continue;
        if (await b.getAttribute('title')) achados.push({ regra: 'dica', texto: `"${nome}": ainda tem o title nativo (aparece junto da dica)` });
        /* a dica do botão anterior FECHA antes do próximo (senão mede a dica errada — o print do "Unir" mostrava a do "Dividir") */
        await p.mouse.move(5, 5);
        await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="dica-do-mapa"]')].some((d) => d.getAttribute('data-state') !== 'closed'), null, { timeout: 2000 }).catch(() => {});
        await p.waitForTimeout(100);
        await b.hover();
        try { await p.locator('[data-testid="dica-do-mapa"]:not([data-state="closed"])', { hasText: nome }).last().waitFor({ state: 'visible', timeout: 1500 }); }
        catch { achados.push({ regra: 'dica', texto: `"${nome}": a dica nao aparece em 1,5 s (o atraso configurado e 300 ms; a bancada soma a animacao e o Playwright)` }); continue; }
        await p.waitForTimeout(250); // a animação de entrada termina antes de medir
        achados.push(...(await p.evaluate(medirDicaAberta, { barraDeOrigem: barra, nome })));
        if (prefixoDaFoto) await p.screenshot({ path: `${prefixoDaFoto}_dica-${nome.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.png` });
        await p.mouse.move(5, 5); await p.waitForTimeout(200);
      }
    }
  } catch (e) { achados.push({ regra: 'erro', texto: `dicasDoMapa: ${String(e).slice(0, 100)}` }); }
  return achados;
}
/* MAPA-ZOOM-E-PAINEL-01 — `semReenquadrar` (opcional, por cenário; roda DEPOIS do `antes`, com P_01 selecionado): o `data-enquadramento` não muda
   (1) ao clicar de novo no MESMO polígono na lista, (2) ao fechar a barra (✕), (3) em Vértices, ao clicar no polígono no mapa. */
async function medirSemReenquadrar(p) {
  const achados = [];
  const ler = async () => { await p.waitForTimeout(1200); return p.locator('.leaflet-container').first().getAttribute('data-enquadramento'); };
  try {
    const caixa = await p.locator('path.poligono-selecionado').first().boundingBox();
    if (!caixa) return [{ regra: 'reenquadra', texto: 'P_01 nao esta selecionado no mapa' }];
    const centro = [caixa.x + caixa.width / 2, caixa.y + caixa.height / 2];
    const linha = p.locator('[data-testid="validacao-nome"]', { hasText: 'P_01' }).first();
    const a0 = await ler(); if (!a0) return [{ regra: 'reenquadra', texto: 'sem data-enquadramento' }];
    await linha.click(); const a1 = await ler();
    if (a1 !== a0) achados.push({ regra: 'reenquadra', texto: `clicar de novo no mesmo poligono reenquadrou (${a0} -> ${a1})` });
    await p.locator('[data-testid="validacao-painel-poligono"] button[aria-label="Fechar"]').click(); const a2 = await ler();
    if (a2 !== a0) achados.push({ regra: 'reenquadra', texto: `fechar a barra reenquadrou (${a0} -> ${a2})` });
    await linha.click(); await p.locator('[data-testid="validacao-painel-poligono"]').waitFor({ timeout: 3000 });
    await p.locator('[data-testid="editar-poligono"] button[aria-label="Vértices"]').click();
    await p.locator('[data-testid="barra-edicao-poligono"]').waitFor({ timeout: 3000 });
    const b0 = await ler();
    await p.mouse.click(centro[0], centro[1]); const b1 = await ler();
    if (b1 !== b0) achados.push({ regra: 'reenquadra', texto: `clicar no poligono em Vertices reenquadrou (${b0} -> ${b1})` });
  } catch (e) { achados.push({ regra: 'erro', texto: `semReenquadrar: ${String(e).slice(0, 100)}` }); }
  return achados;
}
/* MAPA-LISTA-SEM-PULO-01 (UI-ESPACO-RESERVADO) — `listaSemPulo` (opcional, por cenário; página já na Validação): MARCAR a caixa de um polígono não
   desloca NADA. Lê o `top` da 1ª linha da lista e da faixa de ações (e a altura da faixa, o lugar do selo "N selecionados" e o
   `data-enquadramento` do mapa) com 0, 1, N (até 5; o que houver, mínimo 2) e 0 de novo marcados: diferença > 0,5 px = achado `pulo`;
   o mapa reenquadrou = achado `pulo`; botão da faixa que NÃO existe em algum dos estados = achado `pulo` (os que dependem da seleção
   ficam à vista e inativos). `sel` troca os seletores (o auto-teste monta uma lista falsa). */
const SEL_LISTA_SEM_PULO = {
  linha: '[data-testid="validacao-linha"]', faixa: '[data-testid="validacao-lista-acoes"]', caixa: '[data-testid="validacao-linha"] [role="checkbox"]',
  contador: '[data-testid="validacao-contador"]', mapa: '.leaflet-container',
  botoes: ['validacao-selecionar-todos', 'unir-selecionados', 'apagar-selecionados', 'apagar-sem-classificacao'],
};
async function medirListaSemPulo(p, sel = SEL_LISTA_SEM_PULO) {
  const achados = [];
  const ler = async () => { await p.waitForTimeout(700); return p.evaluate((s) => {
    const top = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect().top : null; };
    const faixa = document.querySelector(s.faixa), cont = document.querySelector(s.contador), mapa = document.querySelector(s.mapa);
    const rc = cont ? cont.getBoundingClientRect() : null, rm = mapa ? mapa.getBoundingClientRect() : null;
    return { linha: top(s.linha), faixa: top(s.faixa), altura: faixa ? faixa.getBoundingClientRect().height : null,
      contador: rc ? [rc.top, rc.left, rc.width] : null, mapa: rm ? [rm.top, rm.left, rm.width, rm.height] : null,
      enquadramento: mapa ? mapa.getAttribute('data-enquadramento') : null,
      faltam: s.botoes.filter((b) => !document.querySelector(`[data-testid="${b}"]`)) };
  }, sel); };
  const compara = (nome, a, b) => {
    const rotulo = { linha: 'a 1a linha da lista', faixa: 'a faixa de acoes', altura: 'a altura da faixa' };
    for (const k of ['linha', 'faixa', 'altura']) {
      if (a[k] === null || b[k] === null) { if (k !== 'altura') achados.push({ regra: 'pulo', texto: `${nome}: ${rotulo[k]} nao existe` }); continue; }
      if (Math.abs(a[k] - b[k]) > 0.5) achados.push({ regra: 'pulo', texto: `${nome}: ${rotulo[k]} foi de ${a[k].toFixed(1)} para ${b[k].toFixed(1)} px` });
    }
    if (a.contador && b.contador && a.contador.some((v, i) => Math.abs(v - b.contador[i]) > 0.5)) achados.push({ regra: 'pulo', texto: `${nome}: o selo da selecao mudou de lugar/largura (${a.contador.map((v) => v.toFixed(1))} -> ${b.contador.map((v) => v.toFixed(1))})` });
    if (!a.contador || !b.contador) achados.push({ regra: 'pulo', texto: `${nome}: o selo da selecao ${!b.contador ? 'some' : 'so aparece com a selecao'}` });
    if (a.mapa && b.mapa && a.mapa.some((v, i) => Math.abs(v - b.mapa[i]) > 0.5)) achados.push({ regra: 'pulo', texto: `${nome}: o mapa mudou de lugar/tamanho` });
    if (a.enquadramento !== b.enquadramento) achados.push({ regra: 'pulo', texto: `${nome}: o mapa reenquadrou (${a.enquadramento} -> ${b.enquadramento})` });
    for (const x of b.faltam) achados.push({ regra: 'pulo', texto: `${nome}: o botao ${x} nao existe` });
  };
  try {
    const caixas = p.locator(sel.caixa), n = Math.min(5, await caixas.count());
    if (n < 2) return [{ regra: 'pulo', texto: `a lista tem ${n} poligono(s) (preciso de 2+)` }];
    const e0 = await ler();
    if (e0.faltam.length) for (const x of e0.faltam) achados.push({ regra: 'pulo', texto: `0 marcados: o botao ${x} nao existe` });
    await caixas.nth(0).click(); const e1 = await ler(); compara('1 marcado', e0, e1);
    for (let i = 1; i < n; i++) await caixas.nth(i).click();
    const eN = await ler(); compara(`${n} marcados`, e0, eN);
    for (let i = 0; i < n; i++) await caixas.nth(i).click();
    const eF = await ler(); compara('desmarcou tudo', e0, eF);
  } catch (e) { achados.push({ regra: 'erro', texto: `listaSemPulo: ${String(e).slice(0, 100)}` }); }
  return achados;
}
/* MAPA-CROMO-01 — `cromoDoMapa` (roda em TODO cenário `mapa-geo-*` e `mapa-validacao-*`): tudo o que flutua sobre o mapa (`data-cromo` =
   cima|botoes|painel|aviso|base, a barra e a lista dos piquetes, os botões do topo e o aviso pelos testids, os controles do Leaflet) (1) NÃO
   se cruza — nenhum retângulo corta outro (aninhado não conta; Leaflet × Leaflet fica com o MAPA-CONTROLES-01) e (2) não tem texto cortado:
   elemento com scrollWidth > clientWidth + 1 só passa se ele (ou um ancestral) leva `title` com o texto inteiro. O aviso antigo (pílula
   centrada, z-10, sem title) caía por cima do "Ver fazenda inteira" e cortava "Sede / b…": reprova nas duas. */
function medirCromoDoMapa() {
  const SEL = '[data-cromo], [data-testid="barra-piquetes"], [data-testid="piquetes-lista"], [data-testid="validacao-tipo-pedido"], [data-testid="validacao-ver-fazenda"], [data-testid="edicao-desenhar-novo"], [data-testid="validacao-pasto-inteiro"], [data-testid="validacao-painel-poligono"], .leaflet-control-zoom, .leaflet-control-attribution';
  const visiveis = [...document.querySelectorAll(SEL)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden'; });
  if (!visiveis.length) return [];
  const ehLeaflet = (e) => e.matches('.leaflet-control-zoom, .leaflet-control-attribution');
  const nome = (e) => e.getAttribute('data-cromo') ?? e.getAttribute('data-testid') ?? e.className.toString().slice(0, 30);
  const achados = [];
  for (let i = 0; i < visiveis.length; i++) for (let j = i + 1; j < visiveis.length; j++) {
    const a = visiveis[i], b = visiveis[j];
    if (a.contains(b) || b.contains(a) || (ehLeaflet(a) && ehLeaflet(b))) continue;
    const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
    const w = Math.min(x.right, y.right) - Math.max(x.left, y.left), h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
    if (w > 1 && h > 1) achados.push({ regra: 'cromo', texto: `"${nome(a)}" e "${nome(b)}" se cruzam (${Math.round(w)}x${Math.round(h)}px)` });
  }
  const raizes = visiveis.filter((e) => !ehLeaflet(e));
  const vistos = new Set();
  for (const raiz of raizes) for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
    if (vistos.has(el)) continue; vistos.add(el);
    if (!(el.scrollWidth > el.clientWidth + 1) || el.clientWidth < 2) continue;
    const texto = (el.textContent ?? '').replace(/\s+/g, ' ').trim(); if (!texto) continue;
    let ok = false;
    /* MAPA-DICAS-01 (área): o nome que cede na barra do polígono abre a DicaDoMapa (o `title` nativo saiu); o texto inteiro fica no `aria-label` */
    for (let a = el; a && a !== document.body; a = a.parentElement) { const t = a.getAttribute('title') ?? a.getAttribute('aria-label'); if (t && t.replace(/\s+/g, ' ').includes(texto)) { ok = true; break; } }
    if (!ok) achados.push({ regra: 'cromo', texto: `texto cortado sem title inteiro em "${nome(raiz)}": "${texto.slice(0, 40)}"` });
  }
  return achados;
}
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
/* MAPA-EDITAR-POLIGONO-09 (UI-ESPACO-RESERVADO) — `visivelNaTela` (opcional, por cenário): cada seletor existe, está INTEIRO dentro da janela,
   dentro do `dentro` e de todo ancestral que corta (overflow ≠ visible), e é ele (ou um filho) que está no centro (nada por cima). Com
   `altura`, o `dentro` tem exatamente essa altura (a barra não cresce nem encolhe com o que mostra). */
function medirVisivelNaTela({ sels, dentro, altura, inteirosEm = [] }) {
  const achados = [];
  /* `inteirosEm`: TODO elemento visível dentro de cada caixa cabe inteiro nela (campo, seletor, texto — não só botão: a zona que se
     acomoda corta por dentro, e o campo do nome cortado passava) */
  for (const sel of inteirosEm) {
    for (const cx of document.querySelectorAll(sel)) {
      const c = cx.getBoundingClientRect();
      for (const el of cx.querySelectorAll('*')) {
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === 'hidden') continue;
        if (r.right > c.right + 0.5 || r.left < c.left - 0.5) {
          achados.push({ regra: 'visivel', texto: `${sel}: "${(el.getAttribute('data-testid') ?? el.getAttribute('placeholder') ?? el.textContent ?? el.tagName).trim().slice(0, 30)}" cortado (${Math.round(r.right - c.right)}px)` });
          break;
        }
      }
    }
  }
  const caixa = dentro ? document.querySelector(dentro) : null;
  if (dentro && !caixa) return [{ regra: 'visivel', texto: `${dentro} nao achado` }];
  if (caixa && altura && Math.abs(caixa.getBoundingClientRect().height - altura) > 0.5)
    achados.push({ regra: 'visivel', texto: `${dentro} com ${Math.round(caixa.getBoundingClientRect().height)}px de altura (esperado ${altura})` });
  for (const sel of sels) {
    const el = document.querySelector(sel); if (!el) { achados.push({ regra: 'visivel', texto: `${sel} nao achado` }); continue; }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { achados.push({ regra: 'visivel', texto: `${sel} sem tamanho` }); continue; }
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
      achados.push({ regra: 'visivel', texto: `${sel} sai da janela (direita ${Math.round(r.right)} de ${innerWidth})` });
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a); if (st.overflowX === 'visible' && st.overflowY === 'visible' && a !== caixa) continue;
      const c = a.getBoundingClientRect();
      if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) {
        achados.push({ regra: 'visivel', texto: `${sel} cortado por ${a.getAttribute('data-testid') ?? a.tagName.toLowerCase()} (${Math.round(r.right - c.right)}px)` }); break;
      }
    }
    const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    // o botão desabilitado não recebe o mouse (pointer-events: none): o ponto cai num ANCESTRAL dele — isso não é "coberto"
    if (!topo || !(topo === el || el.contains(topo) || topo.contains(el))) achados.push({ regra: 'visivel', texto: `${sel} coberto por ${topo?.getAttribute('data-testid') ?? topo?.tagName?.toLowerCase()}` });
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
      /* NOTA-NOVA-MODAL-REAL — o NOME DE ARQUIVO (`data-nome-de-arquivo`) é texto mesmo começando por dígitos ("000.000.937.pdf"): vale a regra do texto */
      if (naCelula && EH_NUMERO(inteiro) && !e.closest('[data-nome-de-arquivo]')) achados.push({ regra: 'numero', texto: `numero/data/documento com "…": ${t}` });
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
  /* MAPA-DICAS-01 — auto-teste da `medirDicaAberta`: uma dica CORTADA (overflow hidden, 100 px, texto longo sem quebra) e uma que sai da janela e
     cruza a barra TÊM de gerar achado; uma dica inteira, embaixo da barra, não */
  await p0.setContent(`<body style="margin:0"><div id="bar" style="position:absolute;left:10px;top:10px;width:200px;height:30px"></div>
    <div data-testid="dica-do-mapa" style="position:absolute;left:10px;top:60px;width:100px;overflow:hidden;white-space:nowrap;font:10px sans-serif">Um texto longo demais para caber nesta dica cortada</div></body>`);
  const dicaCortada0 = await p0.evaluate(medirDicaAberta, { barraDeOrigem: '#bar', nome: 'cortada' });
  await p0.setContent(`<body style="margin:0"><div id="bar" style="position:absolute;left:10px;top:10px;width:200px;height:30px"></div>
    <div data-testid="dica-do-mapa" style="position:absolute;left:10px;top:20px;width:max-content;max-width:260px;font:10px sans-serif">Dica inteira</div></body>`);
  const dicaCruza0 = await p0.evaluate(medirDicaAberta, { barraDeOrigem: '#bar', nome: 'cruza' });
  await p0.setContent(`<body style="margin:0"><div id="bar" style="position:absolute;left:10px;top:10px;width:200px;height:30px"></div>
    <div data-testid="dica-do-mapa" style="position:absolute;left:10px;top:60px;width:max-content;max-width:260px;font:10px sans-serif">Dica inteira, embaixo</div></body>`);
  const dicaOk0 = await p0.evaluate(medirDicaAberta, { barraDeOrigem: '#bar', nome: 'ok' });
  if (!dicaCortada0.some((a) => a.texto.includes('cortado')) || !dicaCruza0.some((a) => a.texto.includes('cruza a barra')) || dicaOk0.length) {
    console.error(`check-ui-cortes: AUTO-TESTE DAS DICAS DO MAPA FALHOU (cortada: ${JSON.stringify(dicaCortada0)}, cruza: ${JSON.stringify(dicaCruza0)}, ok: ${JSON.stringify(dicaOk0)})`); process.exit(2);
  }
  /* MAPA-LISTA-SEM-PULO-01 — auto-teste da `medirListaSemPulo`: uma lista falsa cuja faixa de ações SÓ APARECE com seleção (e empurra a lista) TEM de
     gerar achado `pulo`; a que reserva a faixa (sempre presente, altura fixa) não */
  const listaFalsa = (sempre) => `<body style="margin:0;font:10px sans-serif"><div data-testid="validacao-lista"><div id="slot"></div>
    <div id="lin" data-testid="validacao-linha"><span role="checkbox" id="cx" style="display:inline-block;width:14px;height:14px;border:1px solid #000"></span></div>
    <div data-testid="validacao-linha"><span role="checkbox" style="display:inline-block;width:14px;height:14px;border:1px solid #000"></span></div></div>
    <span data-testid="validacao-contador" style="display:inline-block;width:90px">0 selecionados</span>
    <script>(() => {
      const marcados = new Set(); const slot = document.getElementById('slot');
      const nomes = ['validacao-selecionar-todos', 'unir-selecionados', 'apagar-selecionados', 'apagar-sem-classificacao'];
      const desenha = () => { slot.innerHTML = (${sempre} || marcados.size) ? '<div data-testid="validacao-lista-acoes" style="height:24px">' + nomes.map((n) => '<button data-testid="' + n + '">x</button>').join('') + '</div>' : ''; };
      document.querySelectorAll('[role=checkbox]').forEach((c) => c.addEventListener('click', () => { marcados.has(c) ? marcados.delete(c) : marcados.add(c); desenha(); }));
      desenha();
    })();</script></body>`;
  await p0.setContent(listaFalsa(false));
  const semPuloMau0 = await medirListaSemPulo(p0, { ...SEL_LISTA_SEM_PULO, mapa: '#nenhum' });
  await p0.setContent(listaFalsa(true));
  const semPuloBom0 = await medirListaSemPulo(p0, { ...SEL_LISTA_SEM_PULO, mapa: '#nenhum' });
  if (!semPuloMau0.some((a) => a.regra === 'pulo') || semPuloBom0.length) {
    console.error(`check-ui-cortes: AUTO-TESTE DA LISTA SEM PULO FALHOU (faixa que aparece: ${JSON.stringify(semPuloMau0)}, faixa reservada: ${JSON.stringify(semPuloBom0)})`); process.exit(2);
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
    if (cen.semRolarNoX) daRolagem.push(...(await p.evaluate(medirSemRolarNoX, cen.semRolarNoX))); // CPR-LARGURA-01
    if (cen.semRolarVertical) daRolagem.push(...(await p.evaluate(medirSemRolarVertical, cen.semRolarVertical)));
    if (cen.rotulosSvg) daRolagem.push(...(await p.evaluate(medirRotulosSvg, cen.rotulosSvg)));
    if (cen.folgaCelulas) daRolagem.push(...(await p.evaluate(medirFolgaCelulas, cen.folgaCelulas)));
    if (cen.botoesDentro) daRolagem.push(...(await p.evaluate(medirBotoesDentro, cen.botoesDentro)));
    if (cen.visivelNaTela) daRolagem.push(...(await p.evaluate(medirVisivelNaTela, cen.visivelNaTela)));
    if (cen.mesmoEnquadramento) daRolagem.push(...(await medirMesmoEnquadramento(p))); // MAPA-ZOOM-ENTRE-VISOES-01
    if (cen.zoomSensibilidade) daRolagem.push(...(await medirZoomSensibilidade(p))); // MAPA-ZOOM-E-PAINEL-01
    if (/^mapa-(geo|validacao)-/.test(cen.nome)) daRolagem.push(...(await p.evaluate(medirCromoDoMapa))); // MAPA-CROMO-01
    if (cen.barraCompacta) daRolagem.push(...(await p.evaluate(medirBarraCompacta, cen.barraCompacta))); // MAPA-ZOOM-E-PAINEL-01
    if (cen.pastoInteiro) daRolagem.push(...(await p.evaluate(medirPastoInteiro, cen.pastoInteiro))); // MAPA-ZOOM-E-PAINEL-01
    if (cen.colunaHa) daRolagem.push(...(await p.evaluate(medirColunaHa))); // MAPA-DICAS-01 (área)
    if (cen.rotuloDeArea) daRolagem.push(...(await medirRotuloDeArea(p, cen.rotuloDeArea))); // MAPA-DICAS-01 (área; muda o zoom: por último entre as de mapa)
    if (cen.semReenquadrar) daRolagem.push(...(await medirSemReenquadrar(p))); // MAPA-ZOOM-E-PAINEL-01
    if (cen.listaSemPulo) daRolagem.push(...(await medirListaSemPulo(p))); // MAPA-LISTA-SEM-PULO-01 (marca caixas: depois das outras de mapa)
    if (cen.dicasDoMapa) { // MAPA-DICAS-01: depois das outras medições (o hover muda o estado do mapa)
      if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });
      daRolagem.push(...(await medirDicasDoMapa(p, cen.dicasDoMapa, FOTOS ? path.join(FOTOS, `${cen.nome}_${w}x${h}`) : null)));
    }
    if (cen.titulosDeBloco) daRolagem.push(...(await p.evaluate(medirTitulosDeBloco)));
    daRolagem.push(...(await p.evaluate(medirCantoDoMapa))); // MAPA-CONTROLES-01: só age onde há o mapa do Gestor
    if (cen.semRolarNoLugar) daRolagem.push(...(await p.evaluate(medirSemRolarNoLugar, cen.semRolarNoLugar)));
    if (cen.inteiroDe && w >= cen.inteiroDe.de) daRolagem.push(...(await p.evaluate(medirInteiro, cen.inteiroDe.sel)));
    /* P159e — o ALINHAMENTO SOBERANO vale em toda tela que marca os números (`data-alinha-coluna`) */
    daRolagem.push(...(await p.evaluate(medirAlinhamento, cen.regiao ?? null)));
    const achadosTodos = [...daRolagem, ...(await p.evaluate(medir, cen.regiao ?? null)), ...(await p.evaluate(medirCabecalho, cen.regiao ?? null)),
      ...(await p.evaluate(medirSobreposicao, cen.regiao ?? null)), ...(daAltura ? [daAltura] : []), ...dasAlturas, ...erros.map((e) => ({ regra: 'erro', texto: e }))];
    /* MAPA-GLOBAL-01 fix1: cabeçalho inteiro, hover do cabeçalho e o menu lateral por cima do mapa (este, sozinho em toda tela do mapa) */
    if (cen.cabecalhoInteiro) achadosTodos.push(...(await p.evaluate(medirCabecalhoInteiro, cen.regiao ?? null)));
    achadosTodos.push(...(await p.evaluate(medirGraficoDoGlobal))); // só age onde há o gráfico do Global
    achadosTodos.push(...(await p.evaluate(medirCartoesDoMapa))); // MAPA-CARTOES-LARGURA-01: só age onde há os cartões do mapa
    achadosTodos.push(...(await p.evaluate(medirRotulosDoMapa))); // MAPA-ROTULO-POR-CAMADA-01: só age no mapa do Gestor
    if (cen.hoverCabecalho) {
      try { await p.locator(`${cen.hoverCabecalho} th[aria-sort]`).first().hover(); await p.waitForTimeout(300); achadosTodos.push(...(await p.evaluate(medirHoverCabecalho))); }
      catch (e) { achadosTodos.push({ regra: 'erro', texto: `hover do cabecalho: ${String(e).slice(0, 100)}` }); }
      if (FOTOS) await p.screenshot({ path: path.join(FOTOS, `${cen.nome}_${w}x${h}_hover.png`) });
    }
    if (await p.$('[data-testid="mapa-geo-tela"]')) {
      achadosTodos.push(...(await p.evaluate(medirMenuPorCima, Boolean(FOTOS))));
      if (FOTOS) { await p.screenshot({ path: path.join(FOTOS, `${cen.nome}_${w}x${h}_menu.png`) }); await p.evaluate(() => document.querySelectorAll('[data-gaveta-de-teste]').forEach((e) => e.remove())); }
    }
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
