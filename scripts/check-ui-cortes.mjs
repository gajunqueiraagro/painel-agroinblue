#!/usr/bin/env node
/**
 * UI-SEM-CORTE-01 — `npm run check:ui-cortes`: as telas reais na bancada (scripts/ui-cortes, banco simulado) a 1000x600, 1126x579 e
 * 1440x800, no Chromium do Playwright. Reprova:
 *   (1) RETICENCIAS — elemento com `text-overflow: ellipsis` (ou `-webkit-line-clamp`) cujo texto nao cabe (scrollWidth > clientWidth,
 *       ou scrollHeight > clientHeight no clamp): nenhum texto com "…" em tela nenhuma; e o CORTE CALADO — texto proprio numa linha so'
 *       (`nowrap`) cortado por `overflow: hidden` sem reticencias;
 *   (2) CABECALHO PRESO COM VAO — num container que rola, rolado ate' o meio: o cabecalho preso (`position: sticky`) nao encosta no topo
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

const TAMANHOS_DO_CONTRATO = [[750, 483], [750, 530], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
const TAMANHOS_DA_VG = [[1000, 600], [1126, 579], [1130, 580], [1440, 800], [1440, 860]];
const TAMANHOS_DO_CONSORCIO = [[750, 520], [750, 600], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];
/* FIN-CONSORCIO-04 — no consórcio rolam por dentro só a lista de parcelas e a tabela das faixas (cabeçalho e Total presos nelas) */
const EXCETO_CONSORCIO = '[data-testid="lista-parcelas-consorcio"], [data-testid="lista-faixas-consorcio"]';
const clicar = (sel) => async (p) => { await p.locator(sel).first().click(); await p.waitForTimeout(500); };
const clicarRotulo = (re) => async (p) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(500); };
const clicarTexto = (txt) => async (p) => { await p.getByText(txt, { exact: true }).first().click(); await p.waitForTimeout(500); };
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
  /* FORN-BUSCA-UNICA-01 — o filtro de fornecedor com um nome longo escolhido: o chip mostra o nome inteiro. FIN-FILTRO-DOC-01 —
     `alturaFixa`: a fileira de filtros tem de ter a MESMA altura antes e depois de escolher o nome longo (nada empurra a tela) */
  { nome: 'financeiro-filtro-fornecedor', url: 'tela=financeiro', regiao: '[data-testid="filtros-da-lista"]', alturaFixa: '[data-testid="filtros-da-lista"]', antes: async (p) => {
    await p.locator('label:text-is("Fornecedor") + div [role="combobox"]').first().click(); await p.waitForTimeout(300);
    await p.locator('[data-testid="favorecido-opcao"]').filter({ hasText: 'Cooperativa' }).first().click(); await p.waitForTimeout(500); } },
  ...['Dados gerais', 'Endereço e contato', 'Pagamento', 'Padrões', 'Uso'].map((aba) => ({ nome: `fornecedor-cadastro-${aba}`, url: 'tela=fornecedor-cadastro', antes: clicarTexto(aba) })),
  /* FIN-CONTRATO-TELA-FONTE-01 — a tela do contrato nos sete tamanhos: o crédito em cada aba, o título de 120 caracteres, a compra parcelada
     com a conta longa nas parcelas e o consórcio */
  ...['Cronograma', 'Liberações', 'Pagamentos', 'Histórico', 'Documentos', 'A resolver'].map((aba) => ({ nome: `contrato-v4-${aba}`, url: 'tela=contrato', tamanhos: TAMANHOS_DO_CONTRATO,
    antes: aba === 'Cronograma' ? undefined : async (p) => { await p.getByRole('button', { name: new RegExp(`^${aba}`) }).first().click(); await p.waitForTimeout(500); } })),
  { nome: 'contrato-titulo-longo', url: 'tela=contrato&v=titulo', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contrato-parcelamento', url: 'tela=contrato&v=parcelamento', tamanhos: TAMANHOS_DO_CONTRATO },
  { nome: 'contrato-consorcio', url: 'tela=contrato&v=consorcio', tamanhos: TAMANHOS_DO_CONTRATO },
  ...['Geral', 'Pagamento', 'Documentos'].flatMap((aba) => ['novo', 'editar'].map((m) => ({ nome: `lancamento-${m}-${aba}`, url: `tela=lancamento&m=${m}`, antes: clicarTexto(aba) }))),
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
  { nome: 'cpr-futuro', url: 'tela=cpr&v=futuro', tamanhos: TAMANHOS_DO_CONSORCIO },
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
  { nome: 'cpr-encerrado', url: 'tela=cpr&v=encerrado', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'cpr-encerrado-saem-hoje', url: 'tela=cpr&v=encerrado', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[data-testid="cpr-grupo-saem_hoje"]',
    antes: async (p) => { await p.locator('[data-testid="cpr-grupo-saem_hoje"]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(400); } },
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
  /* CRIAR-DO-EXTRATO-01 — a faixa da referência em UMA linha (extrato e planilha), com o histórico de 300 caracteres: varrida (nenhum
     "…") e com a MESMA altura da faixa curta (`alturasComo`), e a Geral sem rolagem dentro do modal; o vencimento faltando ao salvar */
  ...['extrato', 'planilha'].flatMap((o) => [
    { nome: `criar-do-${o}-Geral`, url: `tela=lancamento&m=novo&v=${o}`, tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]' } },
    { nome: `criar-do-${o}-Geral-longo`, url: `tela=lancamento&m=novo&v=${o}&ref=longo`, alturasComo: `tela=lancamento&m=novo&v=${o}`, tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]' } },
    { nome: `criar-do-${o}-Pagamento-longo`, url: `tela=lancamento&m=novo&v=${o}&ref=longo`, tamanhos: TAMANHOS_DO_CONSORCIO, antes: clicarTexto('Pagamento') }]),
  { nome: 'lancamento-novo-Geral-7', url: 'tela=lancamento&m=novo', tamanhos: TAMANHOS_DO_CONSORCIO },
  { nome: 'lancamento-vencimento-falta', url: 'tela=lancamento&m=editar&v=semvenc', tamanhos: TAMANHOS_DO_CONSORCIO,
    antes: async (p) => { await p.locator('button[tabindex="17"]').first().click(); await p.waitForTimeout(500); } },
  /* OC-DESFAZER-PREVISTO-01b — os tres estados do "Desfazer"/"Atualizar compromisso" (mock de 20/10 19h16), 460x344 fixo e sem
     rolagem, nos sete tamanhos: bloqueio por realizado/conciliado, agendado com confirmacao, Atualizar com data ja passada (e o
     desfazer pronto, o rol de sempre). */
  ...['bloqueio', 'agendado', 'pronto', 'atualizar'].map((e) => ({ nome: `oc-dialogo-${e}`, url: `tela=oc-dialogo&v=${e}`,
    tamanhos: TAMANHOS_DO_CONSORCIO, semRolagem: { dentro: '[role="dialog"]' } })),
  /* FIN-NOTA-PDF-01 — "Novo lançamento · da nota fiscal" (o mock aprovado), o PDF SINTETICO lido de verdade, nos sete tamanhos: o modal
     fixo nao rola (so' as duas tabelas rolam dentro do quadro delas, no pior caso de 12 parcelas e 14 itens), nada passa da caixa. */
  ...['', 'cadastrado', 'registrada', 'diverge', 'longo', 'lavoura', 'semdup', 'jalancada'].map((v) => ({ nome: `nota-pdf${v ? `-${v}` : ''}`, url: `tela=nota-pdf&v=${v}`, tamanhos: TAMANHOS_DO_CONSORCIO,
    semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="nota-parcelas-rolagem"], [data-testid="nota-itens-rolagem"], [data-testid="nota-ja-lancada-rolagem"]' } })),
  /* FIN-NOTA-PDF-01b — a confirmacao do "Atualizar e parcelar" (o texto que diz que o existente vira 1/4) */
  { nome: 'nota-pdf-parcelar-confirmar', url: 'tela=nota-pdf&v=parcelar', tamanhos: TAMANHOS_DO_CONSORCIO, regiao: '[role="alertdialog"]',
    antes: async (p) => { await p.locator('[data-testid="nota-atualizar-este"]').first().click(); await p.waitForTimeout(600); } },
  /* ITENS-NOTA-01 — a aba "Itens da nota (N)" do Novo lançamento pela nota (Valores e Fiscal), o diálogo da OC no pior caso (40 itens,
     descrição de 120 caracteres, razão social longa) e o backfill antes e depois do Simular: o modal fixo nao rola, so' o corpo da tabela */
  ...[['', null], ['-fiscal', 'Fiscal']].flatMap(([s, f]) => [
    { nome: `lancamento-xml-Itens${s}`, url: 'tela=lancamento&m=novo&v=xml', tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="itens-rolagem"]' },
      antes: async (p) => { await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); if (f) await clicarTexto(f)(p); } },
    { nome: `itens-nota-oc${s}`, url: 'tela=itens-nota', tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="itens-rolagem"]' }, antes: f ? clicarTexto(f) : undefined }]),
  /* ITENS-NOTA-FONTE-01 — ate' 18 itens SEM rolar a partir de 1126x579 (a tabela tambem, so' o corpo poderia); nos menores, nada corta */
  ...['xml18', 'xml14'].flatMap((x) => [
    { nome: `lancamento-${x}-Itens`, url: `tela=lancamento&m=novo&v=${x}`, tamanhos: TAMANHOS_DO_CONSORCIO,
      semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="itens-rolagem"]' },
      antes: async (p) => { await p.getByRole('tab', { name: /^Itens da nota/ }).first().click(); await p.waitForTimeout(500); } },
    { nome: `lancamento-${x}-Itens-sem-rolar`, url: `tela=lancamento&m=novo&v=${x}`, tamanhos: [[1126, 579], [1300, 704], [1440, 800]],
      semRolagem: { dentro: '[role="dialog"]', exceto: '[data-testid="itens-rolagem"]' }, semRolarVertical: '[data-testid="itens-rolagem"]',
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
  { nome: 'casar-bloco-pos', url: 'tela=casar-bloco&v=pos', tamanhos: TAMANHOS_DO_CONSORCIO },
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
        && (dono.getAttribute('title') ?? '').replace(/\s+/g, ' ').includes(inteiro));
      if (naCelula && EH_NUMERO(inteiro)) achados.push({ regra: 'numero', texto: `numero/data/documento com "…": ${t}` });
      else if (!comTitle) achados.push({ regra: 'reticencias', texto: naCelula ? `${t} (sem o texto inteiro no title)` : t });
    }
    else if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 0.5) achados.push({ regra: 'reticencias', texto: texto(e) });
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
        if (t && t !== '—' && t !== '-' && !/^\d{2}\/\d{2}\/\d{4}$/.test(t)) achados.push({ regra: 'data', texto: `${th.textContent.trim()}: ${t}` });
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
    const reticenciasNoCorte = getComputedStyle(corta.el).textOverflow === 'ellipsis' && !!corta.el.closest('td, th');
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
    c.scrollTop = Math.round((c.scrollHeight - c.clientHeight) / 2);
    const rc = c.getBoundingClientRect(); const topo = rc.top + c.clientTop;
    for (const h of presos) {
      const rh = h.getBoundingClientRect(); if (rh.height === 0) continue;
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
const ESCOLHIDOS = CENARIOS.filter((c) => (!SO || c.nome.startsWith(SO)) && naRapida(c));
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
    <tr><td title="12.345.678/0001-90" style="width:40px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">12.345.678/0001-90</td></tr></tbody></table>
    <div style="width:80px;overflow:hidden;white-space:nowrap">Outro nome comprido demais para caber</div>
    <table style="width:40px;table-layout:fixed"><tbody><tr><td style="word-break:break-all">19/10/2026</td></tr></tbody></table>
    <div style="height:120px;overflow:auto;padding-top:8px"><table><thead><tr><th style="position:sticky;top:0;background:rgba(255,255,255,.5)">Data</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, () => '<tr><td>10/09/26</td></tr>').join('')}</tbody></table></div>
    <div style="height:120px;overflow:auto"><div style="overflow-x:auto"><table><thead style="position:sticky;top:0;background:#fff"><tr><th>Nome</th></tr></thead>
    <tbody>${Array.from({ length: 30 }, () => '<tr><td>x</td></tr>').join('')}</tbody></table></div></div>`);
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
  const prova = [...daRolagem0, ...daTabela0, ...daPagina0, ...daSobre0, ...(comMudanca && !semMudar ? [comMudanca] : [])].map((a) => a.regra);
  /* FORN-01b — o detector se prova na regra nova: o nome com "…" e title passa; o corte seco e o documento com "…" sao achados */
  const aceitoErrado = daPagina0.some((a) => a.texto.startsWith('Nome aceito'));
  const seco0 = daPagina0.some((a) => a.texto.startsWith('corte seco: Nome cortado seco'));
  const doc0 = daPagina0.some((a) => a.regra === 'numero' && a.texto.includes('12.345.678/0001-90'));
  if (aceitoErrado || !seco0 || !doc0) { console.error(`check-ui-cortes: AUTO-TESTE DA REGRA DE CORTE FALHOU (aceito acusado: ${aceitoErrado}, corte seco: ${seco0}, documento: ${doc0})`); process.exit(2); }
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
    if (cen.botoesDentro) daRolagem.push(...(await p.evaluate(medirBotoesDentro, cen.botoesDentro)));
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
