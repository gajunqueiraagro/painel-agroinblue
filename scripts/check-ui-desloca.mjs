#!/usr/bin/env node
/**
 * UI-SEM-DESLOCAR-01 (FORN-01b, Gabriel 21/10/2026) — `npm run check:ui-desloca`: as telas reais na bancada do `check:ui-cortes`
 * (scripts/ui-cortes, banco simulado), no Chromium do Playwright. Em cada tela, troca os ESTADOS — tamanho de pagina, pagina, filtros e
 * segmentos, abas, busca com e sem resultado, a faixa de aviso aparecendo — e reprova se x, y ou largura de qualquer CONTROLE (botao, aba,
 * campo, seletor), TITULO ou CABECALHO DE TABELA mudar em relacao ao estado inicial (mais de 0,5px). E' a LEI DE ESTABILIDADE VISUAL
 * (13/09) e o espaco reservado (09/10) virando gate: o texto que muda com a selecao tem largura reservada para o maior valor possivel.
 *   - Medidos: `button, [role=tab], [role=button], [role=combobox], input, select, textarea, h1-h4, th, [data-desloca]` visiveis, fora
 *     de `tbody` e da area que rola (as linhas sao o conteudo que muda; o cabecalho `th` e o que esta' preso contam) e fora de
 *     `[data-desloca-livre]` (o miolo que troca de proposito). A identidade de cada um e' o `data-testid` (com a ordem, se repete) ou o
 *     caminho no DOM.
 *   - `auto`: troca cada opcao de cada `Segmentado` (pelas classes do componente) e cada aba (`role=tab`) da tela, uma por vez.
 *   - So' comparam os que existem nos dois estados (o que aparece ou some e' conteudo); o que ESTAVA e mudou de lugar ou de largura,
 *     reprova.
 * Antes de varrer, o detector se prova num fixture (um rotulo que cresce empurra o vizinho): se nao achar, sai com codigo 2.
 * P100 — `presos` (opcional, seletor): o que tem de ficar PRESO e A VISTA em todo estado (as linhas congeladas da grade, o "Resultado"
 * e o "Saldo final" do card) e' medido SEMPRE — mesmo dentro de area que rola ou `data-desloca-livre` — e, alem de nao mudar de lugar,
 * tem de estar inteiro dentro da caixa visivel de todo ancestral que corta (rolou para fora ou sumiu = achado).
 * `--so NOME` mede so' os cenarios que comecam com NOME; `--tamanhos 1126x579,...` troca os tamanhos.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filtroRapido } from './ui-gate-rapido.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SO = arg('--so');
const TAMANHOS = arg('--tamanhos') ? arg('--tamanhos').split(',').map((t) => t.split('x').map(Number))
  : [[750, 483], [814, 530], [1000, 600], [1126, 579], [1300, 704], [1440, 800]];

/* P92 — os nove tamanhos do Negociar lote (os sete do consórcio + 750x483 e 900x600) e o 1024x600, a fronteira em que o resumo de 400px aparece */
const TAMANHOS_DO_P92 = [[750, 483], [750, 520], [750, 600], [814, 530], [900, 600], [1000, 600], [1024, 600], [1126, 579], [1300, 704], [1440, 800]];
const espera = (p, ms = 450) => p.waitForTimeout(ms);
/* P109 — a faixa em volta do rótulo do regime da meta (o pai dele) */
const REGIAO_DO_ROTULO = '*:has(> [data-testid="meta-regime"])';
const botao = (re) => async (p) => { await p.getByRole('button', { name: re }).first().click(); await espera(p); };
const clicar = (sel) => async (p) => { await p.locator(sel).first().click(); await espera(p); };
const noLugar = (sel) => async (p) => { await p.locator(sel).first().dispatchEvent('click'); await espera(p); };
/* o gesto e, depois, a casca da bancada de volta ao topo (o clique rola a PAGINA para trazer o botao a vista; o que se mede e' a tela) */
const noTopo = (g) => async (p) => { await g(p); await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('[data-casca]').forEach((c) => { c.scrollTop = 0; }); }); await espera(p, 150); };
const ampliar = async (p) => { await p.locator('[data-testid="rodape-lancamentos"]').waitFor(); await espera(p, 900); await p.getByRole('button', { name: /^Ampliar$/ }).first().click(); await espera(p, 700); };
const digitar = (sel, txt) => async (p) => { await p.locator(sel).first().fill(txt); await espera(p, 800); };

/* Cada estado e' um gesto aplicado em sequencia; cada um e' comparado com o estado INICIAL da tela. `url` = outra pagina inteira
   comparada com a inicial (a faixa de aviso aparecendo). */
const CENARIOS = [
  { nome: 'fornecedores', url: 'tela=fornecedores&barra=32&n=2356', estados: [
    ['por pagina 50', botao(/^50$/)], ['por pagina 200', botao(/^200$/)], ['por pagina 100', botao(/^100$/)],
    ['proxima pagina', botao(/^Próxima/)], ['proxima de novo', botao(/^Próxima/)], ['pagina anterior', botao(/^← Anterior/)],
    ['Inativos', botao(/^Inativos /)], ['Mesclados', botao(/^Mesclados /)], ['Todos', botao(/^Todos /)], ['Ativos', botao(/^Ativos /)],
    ['Sem CPF/CNPJ ligado', clicar('[data-testid="filtro-sem-documento"]')], ['Sem CPF/CNPJ desligado', clicar('[data-testid="filtro-sem-documento"]')],
    ['busca com resultado', digitar('[data-testid="busca-fornecedores"]', 'Exemplo')],
    ['busca sem resultado', digitar('[data-testid="busca-fornecedores"]', 'zzzzzz nada')],
    ['busca limpa', digitar('[data-testid="busca-fornecedores"]', '')],
    ['aba Sem cadastro', clicar('[data-testid="aba-sem-cadastro"]')], ['aba Cadastro', clicar('[data-testid="aba-cadastro"]')],
    ['faixa do inativo aparecendo', { url: 'tela=fornecedores&barra=32&n=2356&aviso=1' }],
  ] },
  /* as outras telas do `check:ui-cortes` que tem escolhas: `auto` troca cada opcao de cada `Segmentado` (pelas classes do componente) e cada aba
     (`role=tab`) visivel, uma por vez a partir da tela recem-aberta, e compara com a inicial; `antes` prepara a tela */
  /* FIN-V2-DESEMPENHO-01b — Lançamentos Financeiros paginado no servidor: trocar "por página", página e os seletores da faixa não move
     nada (o intervalo, a página e os totais têm largura reservada; a faixa cresce para baixo só pela largura da janela) */
  { nome: 'financeiro', url: 'tela=financeiro&v=volume&n=450', antes: async (p) => { await p.locator('[data-testid="rodape-lancamentos"]').waitFor(); await espera(p, 900); },
    estados: [
      ['por pagina 50', noTopo(botao(/^50$/))], ['por pagina 100', noTopo(botao(/^100$/))], ['por pagina 200', noTopo(botao(/^200$/))],
      ['proxima pagina', noTopo(clicar('[data-testid="pagina-proxima"]'))], ['proxima de novo', noTopo(clicar('[data-testid="pagina-proxima"]'))],
      ['pagina anterior', noTopo(clicar('[data-testid="pagina-anterior"]'))],
      ['Classificação Macro', noTopo(botao(/^Macro$/))], ['Classificação Subcentro', noTopo(botao(/^Subcentro$/))], ['Classificação Centro', noTopo(botao(/^Centro$/))],
      ['Sem caixa Só c/ DRE', noTopo(botao(/^Só c\/ DRE$/))], ['Sem caixa Ocultar', noTopo(botao(/^Ocultar$/))],
      /* TABELA-ALTURA-FIXA-01 — filtrar de muitos para poucos (6), um ou nenhum lançamento: o quadro não encolhe e a barra da página
         (Anterior/Próxima, "Por pág.") fica no mesmo lugar */
      ...[6, 1, 0].map((n) => [`filtro com ${n} lancamento(s)`, { url: `tela=financeiro&v=volume&n=450&linhas=${n}` }]),
    ] },
  /* P94 — os avisos da conferência e os chips do que veio da OC têm LUGAR RESERVADO na faixa dos totais: fechar um aviso, tirar um chip e
     a tela sem aviso nenhum (o mesmo recorte) não movem a barra, os totais nem a tabela */
  { nome: 'financeiro-fantasma', url: 'tela=financeiro&fantasma=1', antes: async (p) => { await p.locator('[data-testid="aviso-do-filtro"]').first().waitFor(); await espera(p, 600); },
    estados: [
      ['fecha um aviso', noTopo(clicar('[aria-label="Fechar o aviso"]'))],
      ['tira o chip da OC', noTopo(clicar('[data-testid="chip-vindo-da-oc"]'))],
      ['sem aviso nenhum (a tela limpa)', { url: 'tela=financeiro' }],
    ] },
  /* TABELA-ALTURA-FIXA-01 — o mesmo no Ampliado (como no app: a tela da barra de 32px) */
  { nome: 'financeiro-ampliado', url: 'tela=financeiro&v=volume&n=450&barra=32', antes: ampliar,
    estados: [6, 1, 0].map((n) => [`filtro com ${n} lancamento(s)`, async (p) => {
      await p.goto(p.url().replace(/&linhas=\d+/, '') + `&linhas=${n}`); await p.evaluate(() => document.fonts.ready); await espera(p, 1300); await ampliar(p);
    }]) },
  /* FIN-VALOR-CALC-01b — abrir o modo conta num campo de valor não desloca nada, no Negociar lote do caso do Gabriel (dado sintético):
     a conta aberta (balão sob o campo), o Esc, a conta que não fecha e a recusa depois de sair do campo. Nenhum estado aplica valor.
     ⚠ APLICAR um bônus faz o modal crescer 13px nas janelas até 1000 (a leitura "R$/@ · R$/cab" que o modal escreve sob o campo
     preenchido, a MESMA de digitar o número direto): por isso o aplicar se mede no segundo cenário, a partir do bônus já preenchido. */
  ...(() => {
    const campo = (r) => `xpath=//label[normalize-space()="${r}"]/following-sibling::div[1]//input`;
    const conta = (r, t) => async (p) => { const c = p.locator(campo(r)).first(); await c.click(); await c.fill(t); await espera(p, 300); };
    const tecla = (k) => async (p) => { await p.keyboard.press(k); await espera(p, 300); };
    const aba = botao(/^Bônus, descontos e impostos$/);
    return [
      { nome: 'negociar-lote-conta', url: 'tela=negociar-lote', antes: aba, estados: [
        ['conta aberta no Precoce', conta('Precoce', '988.224-976.224')], ['Esc com a conta aberta (o modal fica)', tecla('Escape')],
        ['conta que nao fecha, aberta', conta('Lista / trace', '5/0')], ['recusa depois de sair do campo', tecla('Tab')],
      ] },
      { nome: 'negociar-lote-conta-aplicada', url: 'tela=negociar-lote',
        antes: async (p) => { await aba(p); await conta('Precoce', '12.000')(p); await tecla('Tab')(p); }, estados: [
        ['conta aberta sobre o bonus preenchido', conta('Precoce', '988.224-976.224')], ['conta aplicada (Enter)', tecla('Enter')],
      ] },
      /* P91 — a conta no campo de NUMERO (a carcaca em kg, aba Desempenho; o caso das Novilhas, "445,97*0,50"): aberta, aplicada,
         a que nao fecha e a recusa depois de sair. ⚠ MEDIDO A PARTIR DA CARCACA JA' COM O RESULTADO (como o bonus acima): trocar o
         NUMERO da carcaca (40.676 kg -> 8.696,61) muda a largura das colunas do "Resultado do lote" nas janelas de 1126+ — o mesmo
         de digitar o numero direto, sem conta (a tabela do resumo nao tem largura fixa: fila P92). Aqui se mede so' o gesto. */
      /* P92 — TROCAR A CARCACA nao move nada: o "Resultado do lote" tem colunas de largura fixa (antes, 40.676 -> 8.696,61 kg mudava a
         largura das colunas de 1126px para cima). Do caso real ao numero pequeno, ao grande e de volta. */
      { nome: 'negociar-lote-troca-carcaca', url: 'tela=negociar-lote', tamanhos: TAMANHOS_DO_P92, estados: [
        ['carcaça 8.696,61 kg', async (p) => { await conta('Carcaça', '8.696,61')(p); await tecla('Tab')(p); }],
        ['carcaça 15 kg', async (p) => { await conta('Carcaça', '15')(p); await tecla('Tab')(p); }],
        ['carcaça 999.999.999,99 kg', async (p) => { await conta('Carcaça', '999.999.999,99')(p); await tecla('Tab')(p); }],
        ['de volta a 40.676 kg', async (p) => { await conta('Carcaça', '40.676')(p); await tecla('Tab')(p); }],
      ] },
      { nome: 'negociar-lote-carcaca-conta', url: 'tela=negociar-lote',
        antes: async (p) => { await conta('Carcaça', '222,99')(p); await tecla('Tab')(p); }, estados: [
        ['conta aberta na Carcaça', conta('Carcaça', '445,97*0,50')], ['conta aplicada (Enter)', tecla('Enter')],
        ['conta que nao fecha, aberta', conta('Carcaça', '445,97*')], ['recusa depois de sair do campo', tecla('Tab')],
      ] },
    ];
  })(),
  { nome: 'fornecedores-sem-cadastro', url: 'tela=fornecedores&barra=32&n=2356', antes: clicar('[data-testid="aba-sem-cadastro"]'), auto: true },
  { nome: 'recorrencias', url: 'tela=recorrencias&barra=32', auto: true },
  /* CAD-CONTAS-BANCARIAS-01 — a lista (segmentos, busca com e sem resultado, inativas) e o modal (abas, tipo, formato), editando e criando */
  /* P109 — as 4 telas da meta (o caso real do NJ 2026): o rótulo do regime fica PRESO no lugar dele (`presos`: medido sempre, à vista)
     ao trocar a fazenda e ao passar aos valores ×400; no PC-100 o Realizado ↔ Meta (`auto`) não move nada — o rótulo tem o lugar
     reservado no Realizado (escondido, por isso não é `preso` lá). SÓ EM VOLTA DO RÓTULO (`regiao`: a faixa que o contém, Gabriel
     27/10): os 93 deslocamentos antigos do resto destas telas são o P137 (lista no histórico); tirar a `regiao` mede a tela inteira. */
  ...['fluxo', 'vgplan', 'fech'].map((t) => ({ nome: `meta-${t}`, url: `tela=meta&t=${t}`, presos: '[data-testid="meta-regime"]', regiao: REGIAO_DO_ROTULO,
    antes: (p) => espera(p, 1500),
    estados: [['uma fazenda', { url: `tela=meta&t=${t}&fz=f5` }], ['valores x400', { url: `tela=meta&t=${t}&v=grande` }]] })),
  { nome: 'meta-pc100', url: 'tela=meta&t=pc100', auto: true, regiao: REGIAO_DO_ROTULO, antes: (p) => espera(p, 1500),
    estados: [['Meta com valores x400', async (p) => { await p.goto(p.url().replace('t=pc100', 't=pc100&v=grande')); await espera(p, 1500); await botao(/^Meta$/)(p); }]] },
  /* FIN-VISAO-GERAL-01 PR 3 — nada muda de altura ou posição ao trocar modo, mês, contas, atividade ou período: os QUADROS (card, gráfico,
     grade — `data-desloca`) e todos os controles ficam; o miolo deles é `data-desloca-livre` (o conteúdo que muda de propósito) */
  { nome: 'visao-geral', url: 'tela=visao-geral&barra=0', auto: true, estados: [
    ['mês de março', clicar('[data-testid="vg-mes-3"]')], ['mês de dezembro (previsto)', clicar('[data-testid="vg-mes-12"]')],
    ['ano anterior', botao(/^Ano anterior$/)],
    ['Últ. 12', botao(/^Últ\. 12$/)], ['6 + 6', botao(/^6 \+ 6$/)],
    /* abaixo de 768px os filtros da barra somem (`hidden md:flex`, a regra do atalho da barra): ali o gesto não existe e é pulado */
    ['só uma conta', async (p) => { if (!(await p.locator('[data-testid="vg-contas"]').isVisible())) return; await clicar('[data-testid="vg-contas"]')(p); await p.locator('button', { hasText: 'só esta' }).first().click({ force: true }); await espera(p); await p.keyboard.press('Escape'); await espera(p); }],
    ['atividade agricultura', async (p) => { if (!(await p.locator('[data-testid="vg-atividade"]').isVisible())) return; await clicar('[data-testid="vg-atividade"]')(p); await clicar('[data-testid="vg-atividade-agricultura"]')(p); }],
    ['coluna do gráfico', async (p) => { await p.locator('[data-testid="coluna-2026-05"]').click({ force: true }); await espera(p); }],
    /* P83 — fazenda escolhida: o saldo some (só por conta) e o aviso fica no lugar dele; a altura de nada muda */
    ['fazenda escolhida (sem saldo)', async (p) => { if (!(await p.locator('[data-testid="vg-fazenda"]').isVisible())) return;
      await p.locator('[data-testid="vg-fazenda"] button').first().click(); await espera(p, 300);
      await p.getByText('Faz. Exemplo Dois', { exact: true }).last().click(); await espera(p); await p.keyboard.press('Escape'); await espera(p, 300); }],
    /* P71 — a fazenda de nome mais longo (43 letras): o seletor tem largura fixa — nada na barra se desloca */
    ['fazenda de nome longo', async (p) => { if (!(await p.locator('[data-testid="vg-fazenda"]').isVisible())) return;
      await p.locator('[data-testid="vg-fazenda"] button').first().click(); await espera(p, 300);
      await p.getByText('Fazenda Exemplo Nome Muito Longo Retiro Sul', { exact: true }).last().click(); await espera(p); await p.keyboard.press('Escape'); await espera(p, 300); }],
    /* P79 — os chips: desligar Programado, Previsto e Agendado (nenhum: o aviso aparece) e Vencidos; o aviso tem lugar próprio */
    ['sem Programado', clicar('[data-testid="vg-status-programado"]')], ['sem Previsto', clicar('[data-testid="vg-status-previsto"]')],
    ['nenhum status', clicar('[data-testid="vg-status-agendado"]')], ['sem Vencidos', clicar('[data-testid="vg-status-vencidos"]')],
    ['Programado de volta', clicar('[data-testid="vg-status-programado"]')],
    /* P90 — o critério (mês · média · acumulado): trocar não desloca nada (card, grade e o próprio seletor) */
    ['critério média', async (p) => { await p.locator('[data-testid="vg-criterio"]').getByText('Média', { exact: true }).click(); await espera(p, 300); }],
    ['critério acumulado', async (p) => { await p.locator('[data-testid="vg-criterio"]').getByText('Acumulado', { exact: true }).click(); await espera(p, 300); }],
    ['critério de volta ao mês', async (p) => { await p.locator('[data-testid="vg-criterio"]').getByText('Mês', { exact: true }).click(); await espera(p, 300); }],
    /* P83 — abrir e fechar o "ampliar" de cada bloco não desloca nada. O clique vai ao botão onde ele está (sem o "rolar até ele" do
       Playwright): abaixo de 1000px a VG rola de lado (não tem desenho ali) e o rolar do robô seria lido como deslocamento do modal */
    ...['card', 'grafico', 'grade'].map((b) => [`ampliar o ${b} e fechar`, async (p) => {
      await p.locator(`[data-testid="ampliar-${b}"]`).dispatchEvent('click'); await espera(p, 400); await p.keyboard.press('Escape'); await espera(p, 400); }])] },
  /* PR 4 — o MODAL DE ANÁLISE: nada muda de altura ou posição ao trocar aba, linha, item, ‹ ›, critério, unidade, nível, caminho e mês.
     O clique vai ao elemento onde ele está (`noLugar`, sem o "rolar até ele" do Playwright): abaixo de 1000px o modal rola de lado
     (largura mínima, como a Visão Geral) e o rolar do robô seria lido como deslocamento */
  { nome: 'visao-geral-analise', url: 'tela=visao-geral&barra=0', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700); },
    estados: [
      ['aba da raiz', noLugar('[data-testid="analise-aba-raiz"]')], ['aba Juros', noLugar('[data-testid="analise-aba-Juros"]')],
      ['aba Custeio', noLugar('[data-testid="analise-aba-Custeio"]')], ['linha da esquerda', noLugar('[data-testid="analise-tabela-linha-0"]')],
      ['item do gráfico', noLugar('[data-testid="analise-foco-linha-1"]')], ['próximo irmão', noLugar('[data-testid="analise-proximo"]')],
      ['irmão anterior', noLugar('[data-testid="analise-anterior"]')],
      ['média do período', async (p) => { await p.locator('[data-testid="analise-tabela"]').getByText('Média', { exact: true }).dispatchEvent('click'); await espera(p); }],
      ['acumulado', async (p) => { await p.locator('[data-testid="analise-tabela"]').getByText('Acum.', { exact: true }).dispatchEvent('click'); await espera(p); }],
      ['unidade R$/cab', async (p) => { await p.locator('[data-testid="analise-unidade"]').dispatchEvent('click'); await espera(p, 200); await p.locator('[data-testid="analise-unidade-rs_cab"]').dispatchEvent('click'); await espera(p); }],
      /* P100 — um subcentro da tabela no gráfico (o caminho ganha a cadeia inteira) e, pelo caminho, o centro dele */
      ['subcentro no gráfico', noLugar('[data-testid="analise-foco-linha-2"]')], ['caminho até o centro', noLugar('[data-testid="analise-caminho-3"]')],
      ['caminho até o grupo', noLugar('[data-testid="analise-caminho-1"]')],
      ['outro mês na coluna', async (p) => { await p.locator('[data-testid="analise-coluna-2026-03"]').dispatchEvent('click'); await espera(p); }]] },
  /* PR 5 — a GAVETA de lançamentos (no modal): estrutura FIXA — nada da gaveta (cabeçalho, indicadores, resumo, tabela, total, rodapé)
     nem do modal muda de altura ou posição ao descer de nível, trocar de irmão, subir pelo caminho, chegar ao subcentro com 523
     lançamentos (e pedir a página seguinte), ao de texto longo e ao vazio, nem ao trocar o critério do modal */
  { nome: 'visao-geral-gaveta', url: 'tela=visao-geral&barra=0', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700);
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await espera(p, 500); },
    estados: [
      ['desce: atividade', noLugar('[data-testid="gaveta-linha-0"]')], ['desce: centro', noLugar('[data-testid="gaveta-linha-0"]')],
      ['desce: subcentro com 523', noLugar('[data-testid="gaveta-linha-0"]')], ['mais 23', noLugar('[data-testid="gaveta-mais"]')],
      ['irmão com texto longo', noLugar('[data-testid="gaveta-irmao-1"]')], ['irmão vazio', noLugar('[data-testid="gaveta-irmao-3"]')],
      ['sobe pelo caminho', noLugar('[data-testid="gaveta-caminho-2"]')],
      ['acumulado no modal', async (p) => { await p.locator('[data-testid="analise-tabela"]').getByText('Acum.', { exact: true }).dispatchEvent('click'); await espera(p); }],
      ['irmão de grupo', noLugar('[data-testid="gaveta-caminho-1"]')]] },
  /* P103 — a gaveta no subcentro com TODOS os status ("Ração…": datas, chip de status, "Pagos · Em aberto"): ligar e desligar os
     CHIPS da tela com a gaveta aberta (o clique vai ao chip onde ele está, por baixo do modal) — os não pagos entram e saem da lista, o
     "Pagos · Em aberto" some quando não sobra nenhum (o lugar dele é reservado) e nada se desloca */
  { nome: 'visao-geral-gaveta-chips', url: 'tela=visao-geral&barra=0', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700);
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await espera(p, 500);
      for (const i of [0, 0, 1]) { await p.locator(`[data-testid="gaveta-linha-${i}"]`).dispatchEvent('click'); await espera(p, 400); } },
    estados: [
      ['sem Previsto', noLugar('[data-testid="vg-status-previsto"]')], ['sem Programado', noLugar('[data-testid="vg-status-programado"]')],
      ['sem Agendado (só os pagos e o vencido)', noLugar('[data-testid="vg-status-agendado"]')],
      ['sem Vencidos (só os pagos)', noLugar('[data-testid="vg-status-vencidos"]')],
      ['Previsto de volta', noLugar('[data-testid="vg-status-previsto"]')], ['Vencidos de volta', noLugar('[data-testid="vg-status-vencidos"]')]] },
  /* P119 — ORDENAR a gaveta (no subcentro "Ração…", o pior caso de largura): cada coluna crescente, a mesma de novo decrescente, e trocar de
     nó volta à ordem de sempre. O cabeçalho é miolo livre (as colunas trocam entre filhos e lançamentos), por isso os 8 botões e as 8
     setas são `presos`: medidos SEMPRE — a seta tem lugar reservado, nenhum rótulo anda nem muda de largura quando ela aparece */
  { nome: 'visao-geral-gaveta-ordem', url: 'tela=visao-geral&barra=0', presos: '[data-testid^="gaveta-ordem-"], [data-testid^="gaveta-seta-"]', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700);
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await espera(p, 500);
      for (const i of [0, 0, 1]) { await p.locator(`[data-testid="gaveta-linha-${i}"]`).dispatchEvent('click'); await espera(p, 400); } },
    estados: [
      ...['competencia', 'vencimento', 'pagamento', 'status', 'favorecido', 'descricao', 'conta', 'valor'].map((c) => [`por ${c} ▲`, noLugar(`[data-testid="gaveta-ordem-${c}"]`)]),
      ['por valor ▼', noLugar('[data-testid="gaveta-ordem-valor"]')], ['por favorecido ▲', noLugar('[data-testid="gaveta-ordem-favorecido"]')],
      ['por favorecido ▼', noLugar('[data-testid="gaveta-ordem-favorecido"]')], ['irmão (volta à ordem de sempre)', noLugar('[data-testid="gaveta-irmao-0"]')]] },
  /* PR 5 — o AVISO do rodapé com duas contas escolhidas: a frase das contas entra e sai ao descer e subir — o lugar é reservado */
  { nome: 'visao-geral-gaveta-contas', url: 'tela=visao-geral&barra=0&contas=2', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700);
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await espera(p, 500); },
    estados: [
      ['desce: atividade', noLugar('[data-testid="gaveta-linha-0"]')], ['desce: centro', noLugar('[data-testid="gaveta-linha-0"]')],
      ['desce: subcentro (aviso das contas)', noLugar('[data-testid="gaveta-linha-0"]')], ['irmão longo', noLugar('[data-testid="gaveta-irmao-1"]')],
      ['sobe pelo caminho (sem aviso)', noLugar('[data-testid="gaveta-caminho-2"]')]] },
  /* PR 5b — a VIRADA DO ANO (período nov/25–out/26, acumulado no modal): a frase da virada entra no subcentro, troca pela dos vencidos
     no "Sal…" e sai ao subir — o lugar é reservado */
  { nome: 'visao-geral-gaveta-virada', url: 'tela=visao-geral&barra=0&faixa=per&de=2025-11&ate=2026-10', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700);
      await p.locator('[data-testid="analise-tabela"]').getByText('Acum.', { exact: true }).dispatchEvent('click'); await espera(p, 600);
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await espera(p, 500); },
    estados: [
      ['desce: atividade', noLugar('[data-testid="gaveta-linha-0"]')], ['desce: centro', noLugar('[data-testid="gaveta-linha-0"]')],
      ['desce: subcentro (vencidos + virada)', noLugar('[data-testid="gaveta-linha-0"]')], ['irmão vazio (só a virada)', noLugar('[data-testid="gaveta-irmao-3"]')],
      ['sobe pelo caminho (sem aviso)', noLugar('[data-testid="gaveta-caminho-2"]')]] },
  /* PR 5b — a FATURA DO CARTÃO (`&fatura=1`, a 5ª frase, a mais longa): entra no subcentro, troca pela dos vencidos no "Sal…" e sai ao
     subir — o lugar é reservado */
  { nome: 'visao-geral-gaveta-fatura', url: 'tela=visao-geral&barra=0&fatura=1', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700);
      await p.locator('[data-testid="analise-lanc-total"]').dispatchEvent('click'); await p.locator('[data-testid="gaveta"]').waitFor(); await espera(p, 500); },
    estados: [
      ['desce: atividade', noLugar('[data-testid="gaveta-linha-0"]')], ['desce: centro', noLugar('[data-testid="gaveta-linha-0"]')],
      ['desce: subcentro (vencidos + fatura)', noLugar('[data-testid="gaveta-linha-0"]')], ['irmão vazio (só a fatura)', noLugar('[data-testid="gaveta-irmao-3"]')],
      ['sobe pelo caminho (sem aviso)', noLugar('[data-testid="gaveta-caminho-2"]')]] },
  /* P100 item 6 + 8 — trocar o MÊS (o período vai até ele) não desloca os blocos; o card com 1 a 8 grupos de saída (`&vg_grupos=varia`:
     jan 1 … ago 8) não move "Resultado" nem "Saldo final" */
  { nome: 'visao-geral-mes-grupos', url: 'tela=visao-geral&barra=0&vg_grupos=varia&mes=2026-01',
    presos: '[data-testid="card-linha-resultado"], [data-testid="card-linha-saldo-final"]',
    estados: [1, 2, 4, 8, 3, 12, 10].map((m) => [`mês ${m}`, noLugar(`[data-testid="vg-mes-${m}"]`)]) },
  /* P100 item 7 — rolar a grade até o fim e de volta: o cabeçalho e as linhas do rodapé (Resultado, Saldo final) não saem do lugar */
  { nome: 'visao-geral-grade-rola', url: 'tela=visao-geral&barra=0',
    presos: '[data-testid="grade-linha-resultado"], [data-testid="grade-linha-saldo_final"]',
    estados: [['grade no fim', async (p) => { await p.locator('[data-testid="grade-vg-rolagem"]').evaluate((e) => { e.scrollTop = e.scrollHeight; }); await espera(p, 200); }],
              ['grade no topo', async (p) => { await p.locator('[data-testid="grade-vg-rolagem"]').evaluate((e) => { e.scrollTop = 0; }); await espera(p, 200); }]] },
  /* P100 v4 — a esquerda do modal desce e volta ("‹"), o centro selecionado e o subcentro no gráfico: nada se desloca (o cabeçalho
     da tabela da direita é livre: a coluna "Centro" some de propósito) */
  { nome: 'visao-geral-analise-nivel', url: 'tela=visao-geral&barra=0', antes: async (p) => {
      await p.locator('[data-testid^="grade-linha-saida:grupo:Custeio"]').dispatchEvent('click'); await p.locator('[data-testid="modal-analise"]').waitFor(); await espera(p, 700); },
    estados: [
      ['desce à atividade', noLugar('[data-testid="analise-tabela-linha-0"]')], ['centro selecionado', noLugar('[data-testid="analise-tabela-linha-1"]')],
      ['subcentro no gráfico', noLugar('[data-testid="analise-foco-linha-0"]')], ['volta (‹)', noLugar('[data-testid="analise-tabela-subir"]')],
      ['outra atividade', noLugar('[data-testid="analise-tabela-linha-1"]')]] },
  { nome: 'visao-geral-24m', url: 'tela=visao-geral&barra=0&faixa=per&de=2025-01&ate=2026-12', auto: true },
  { nome: 'contas-lista', url: 'tela=contas&barra=32&n=longo', auto: true, estados: [
    ['busca com resultado', digitar('[data-testid="busca-contas"]', 'bradesco')], ['busca sem resultado', digitar('[data-testid="busca-contas"]', 'zzzz')],
    ['mostrar inativas', clicar('[data-testid="mostrar-inativas"]')]] },
  { nome: 'contas-modal', url: 'tela=contas&barra=32&v=editar', auto: true },
  { nome: 'contas-nova', url: 'tela=contas&barra=32&v=nova', auto: true },
  { nome: 'cpr', url: 'tela=cpr', auto: true },
  { nome: 'mesclar', url: 'tela=mesclar', auto: true },
  /* FIN-NOTA-PDF-01 — o modal da nota: nada anda quando o "Falta:" troca pelo aviso de baixo, quando a faixa "Atualizar este" aparece,
     quando a nota e' barrada (ja' registrada, chave que nao confere) ou no pior caso de texto. Cada um contra a nota recem-aberta. */
  { nome: 'nota-pdf', url: 'tela=nota-pdf', estados: [
    ['fornecedor cadastrado, subcentro sugerido, "Atualizar este"', { url: 'tela=nota-pdf&v=cadastrado' }],
    ['nota ja registrada', { url: 'tela=nota-pdf&v=registrada' }], ['chave nao confere', { url: 'tela=nota-pdf&v=diverge' }],
    ['pior caso de texto', { url: 'tela=nota-pdf&v=longo' }],
    ['subcentro de lavoura (Safra e Cultura)', { url: 'tela=nota-pdf&v=lavoura' }], ['nota sem duplicata (Criar lancamento)', { url: 'tela=nota-pdf&v=semdup' }],
    ['nota ja lancada (NOTA-JA-LANCADA-01)', { url: 'tela=nota-pdf&v=jalancada' }],
    ['nota avulsa, remessa de entrega futura (NOTA-AVULSA-890-01)', { url: 'tela=nota-pdf&v=avulsa' }],
    ['nota ja lancada em parcela (NOTA-CONTAS-NA-CRIACAO-01 C)', { url: 'tela=nota-pdf&v=emparcela' }],
    ['nota ja lancada com cancelados no fim (D)', { url: 'tela=nota-pdf&v=cancelados' }], ['so cancelados (D)', { url: 'tela=nota-pdf&v=socancelados' }],
    /* P95 — a previa pela chave digitada (emissao e valor em ambar no lugar dos lidos) e a nota achada em parcelas soltas */
    ['nota pela chave digitada (P95)', { url: 'tela=nota-pdf&v=pelachave' }], ['nota em parcelas soltas, "k/4" (P95)', { url: 'tela=nota-pdf&v=irmas' }],
    /* P128a — a tabela sistema × nota com diferença em vermelho, "só no sistema" e o "Documento hoje" */
    ['nota no sistema com diferenca (P128a)', { url: 'tela=nota-pdf&v=diferenca' }],
  ] },
  /* P127 + P128c — o Novo documento: soltar a nota (a faixa do lançamento vira a da nota lida, com as divergências) e trocar um campo para o
     do lançamento não deslocam o formulário (o modal tem altura fixa) */
  /* P128b — a prévia campo a campo: desmarcar uma coluna, manter uma célula (✎), trocar o nº (a prévia reconferindo) não deslocam nada */
  { nome: 'previa-completar', url: 'tela=previa-completar&cam=2', estados: [
    ['desmarca Descrição', clicar('[data-testid="previa-coluna-descricao"]')], ['marca Conta', clicar('[data-testid="previa-coluna-conta"]')],
    ['mantém uma célula', noLugar('[data-testid="previa-celula"] [data-testid="previa-muda"]')],
    ['troca o nº', async (p) => { await p.locator('[data-testid="previa-numero"]').fill('NF 000.004.876'); await espera(p, 700); }],
  ] },
  /* P167 — abrir e fechar a confirmação do cancelamento no rodapé: o corpo do documento não anda (o rodapé troca no mesmo lugar) */
  { nome: 'documento-nota-cancelar', url: 'tela=documento-nota&v=cancelar', estados: [
    ['abre o cancelar', async (p) => { await p.locator('[data-testid="abrir-cancelar-nota"]').click(); await espera(p, 300); }],
    ['volta', async (p) => { await p.locator('[data-testid="cancelar-nota"] button', { hasText: 'Voltar' }).click(); await espera(p, 300); }],
  ] },
  { nome: 'documento-nota', url: 'tela=documento-nota', estados: [
    ['nota lida', async (p) => {
      const xml = await p.evaluate(() => globalThis.__xmlDaBancada);
      await p.locator('[data-testid="doc-arquivo"]').setInputFiles({ name: 'nota.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
      await p.locator('[data-testid="nota-lida"]').waitFor({ timeout: 8000 }); await espera(p, 400);
    }],
    ['usar o valor do lançamento', async (p) => {
      const xml = await p.evaluate(() => globalThis.__xmlDaBancada);
      await p.locator('[data-testid="doc-arquivo"]').setInputFiles({ name: 'nota.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
      await p.locator('[data-testid="nota-lida"]').waitFor({ timeout: 8000 });
      await p.locator('[data-trocar="valor"]').first().click(); await espera(p, 400);
    }],
  ] },
  /* P128a — trocar o CAMINHO (Completar → Completar e atualizar → Criar novo): o texto de cada cartão e o botão do rodapé trocam no lugar */
  { nome: 'nota-pdf-caminhos', url: 'tela=nota-pdf&v=diferenca', antes: async (p) => {
    const t = p.locator('[data-testid="nota-abas"] button', { hasText: 'Parcelas e lançamento' });
    if (await t.count()) { await t.first().click(); await espera(p, 300); }
  }, estados: [
    ['Completar e atualizar as nao pagas', clicar('[data-testid="nota-caminho-atualizar"]')],
    ['Criar um lancamento novo', clicar('[data-testid="nota-caminho-criar"]')],
  ] },
  /* P74 — "Como foi pago?": trocar À vista → Cartão em N× → (cartão, 4) → Parcelas livres → Duplicatas apagado não move o título do bloco, os
     outros blocos nem o rodapé (o conteúdo do bloco troca por dentro, na altura dele) */
  /* P101 — em todos os tamanhos: abaixo de 1000px, na aba "Parcelas e lançamento" */
  { nome: 'nota-pdf-como-foi-pago', url: 'tela=nota-pdf&v=semdup', antes: async (p) => {
    const t = p.locator('[data-testid="nota-abas"] button', { hasText: 'Parcelas e lançamento' });
    if (await t.count()) { await t.first().click(); await espera(p, 300); }
  }, estados: [
    ['Cartao em Nx', async (p) => { await clicar('[data-testid="nota-como-foi-pago"]')(p); await clicar('[data-testid="nota-como-cartao"]')(p); }],
    ['cartao escolhido, 4 parcelas', async (p) => {
      await clicar('[data-testid="nota-como-foi-pago"]')(p); await clicar('[data-testid="nota-como-cartao"]')(p);
      await p.locator('[data-testid="nota-cartao"] button', { hasText: 'Selecione o cartão' }).first().click(); await espera(p, 300);
      await p.getByText('Cartão Elo Exemplo', { exact: true }).last().click(); await espera(p, 300);
      await digitar('[data-testid="nota-cartao-parcelas"]', '4')(p);
    }],
  ] },
  /* P102 — o Editar obrigação da compra parcelada: trocar de aba não move a barra de abas nem o rodapé (o "Voltar para à vista" e o Salvar) */
  { nome: 'obrigacao-editar', url: 'tela=contrato&v=parcelamento&np=18&docs=1', antes: async (p) => {
    await p.locator('[data-testid="botoes-do-contrato"] button', { hasText: 'Editar' }).first().click(); await p.locator('[role="dialog"]').first().waitFor(); await espera(p, 900);
  }, estados: [1, 2, 3].map((i) => [`aba ${i}`, async (p) => { const t = p.locator('[role="dialog"] [role="tab"]').nth(i); if (await t.count()) { await t.click(); await espera(p, 500); } }]) },
  /* P116 — a aba Auditoria (coluna do autor sempre, 62px): ir e voltar não move a barra de abas, o cabeçalho nem o rodapé; com uma pessoa só, idem */
  ...['', '&aud=um'].map((a) => ({ nome: `lancamento-auditoria${a ? '-um' : ''}`, url: `tela=lancamento&m=editar${a}`, estados: [
    ['aba Auditoria', async (p) => { await p.getByRole('tab', { name: /Auditoria/ }).first().click(); await espera(p, 700); }],
    ['de volta à primeira aba', async (p) => { await p.locator('[role="dialog"] [role="tab"]').first().click(); await espera(p, 500); }],
  ] })),
  /* P117 — a linha fixa sob o Fornecedor: com cidade ("CNPJ · Presidente Prudente/SP") e sem (só o CNPJ) — nada anda */
  { nome: 'lancamento-fornecedor-cidade', url: 'tela=lancamento&m=editar', estados: [['cadastro sem cidade', { url: 'tela=lancamento&m=editar&cidade=sem' }]] },
  /* P121 — o Resumo do lançamento: os nomes longos do mock no lugar dos curtos — nenhum bloco muda de altura, nada abaixo anda */
  { nome: 'lancamento-resumo-longo', url: 'tela=lancamento&m=editar&v=sal', estados: [['nomes longos', { url: 'tela=lancamento&m=editar&v=sal&resumo=longo' }]] },
  /* P138 — "Usar" a safra da competência: a linha da sugestão sai e o campo se enche — nada abaixo anda */
  { nome: 'lancamento-safra-usar', url: 'tela=lancamento&m=editar&safra=sem', estados: [['Usar a sugestão', clicar('[data-testid="safra-usar-sugestao"]')]] },
  /* P117 (Gabriel 27/10) — a linha sob o Fornecedor VAZIA: no Novo lançamento o campo nasce sem fornecedor (o do lançamento não tem "×");
     escolher um enche a linha ("CNPJ · Cidade/UF") sem empurrar nada. ⚠ No modal do lançamento o cartão já reserva o espaço: a mutação que tira o `h-[14px]` NÃO cai aqui
     (gate 27/10; aceito pelo Gabriel — o desloca prova que nada anda nesta tela) */
  { nome: 'lancamento-fornecedor-vazio', url: 'tela=lancamento', estados: [['escolher o fornecedor', async (p) => {
    await p.locator('button[role="combobox"]:has([data-testid="favorecido-gatilho-texto"])').first().click(); await espera(p, 400);
    await p.locator('[data-testid="favorecido-lista"] button', { hasText: 'Agropecuaria Exemplo' }).first().click(); await espera(p, 600);
  }]] },
  /* P74 B — "Parcelar este lançamento": abrir o bloco e escolher 4 não move a aba Pagamento acima dele nem o rodapé */
  { nome: 'lancamento-parcelar', url: 'tela=lancamento&m=editar&v=salcartao', antes: async (p) => { await clicar('text=Pagamento')(p); },
    estados: [['aberto com 4 parcelas', async (p) => { await clicar('[data-testid="parcelar-este-abrir"]')(p); await digitar('[data-testid="parcelar-este-n"]', '4')(p); }]] },
  /* P95 — "Novo a partir da nota": digitar a chave errada troca a frase pelo erro no MESMO lugar; o campo e o "Usar" nao andam. P101: em
     todos os tamanhos (abaixo de 1000px a tabela perde a coluna CNPJ e cabe) */
  { nome: 'nota-novo-da-nota', url: 'tela=novo-da-nota', estados: [
    ['chave errada digitada e "Usar"', async (p) => { await digitar('[data-testid="xml-digitar-chave"]', '5026 0911 2223 3300 0424 5501 0000 0009 3712 1753 8290')(p); await clicar('[data-testid="xml-usar-chave"]')(p); }],
    ['chave curta e "Usar"', async (p) => { await digitar('[data-testid="xml-digitar-chave"]', '5026')(p); await clicar('[data-testid="xml-usar-chave"]')(p); }],
  ] },
  /* ITENS-NOTA-01 — os itens da nota: Valores <-> Fiscal (o `auto` troca o Segmentado) no dialogo da OC; o backfill antes e depois do
     Simular (a contagem e as linhas chegam, os botoes nao andam) */
  { nome: 'itens-nota-oc', url: 'tela=itens-nota', auto: true },
  /* FIN-CLASSIF-DIVIDIDA-01b — a aba Itens do lancamento dividido: Valores / Fiscal / Contas (a tabela troca de proposito, `data-desloca-livre`;
     a barra e o cabecalho da nota nao andam) e a volta para a Geral (as partes) */
  { nome: 'lancamento-dividido', url: 'tela=lancamento&m=editar&v=sal&div=1', antes: async (p) => {
      await p.getByRole('tab', { name: /Itens da nota/ }).first().click(); await espera(p); }, estados: [
    ['vista Contas', botao(/^Contas$/)], ['vista Fiscal', botao(/^Fiscal$/)], ['vista Valores', botao(/^Valores$/)],
  ] },
  /* SELETOR-CONTA-POR-ATIVIDADE-01 — a conta do item aberta (o `EscolherConta`): trocar a atividade na barra nao mexe na barra, na busca
     nem no lugar/tamanho da lista (`data-desloca`); so' os itens dentro dela mudam */
  { nome: 'escolher-conta', url: 'tela=lancamento&m=editar&v=sal&div=1', antes: async (p) => {
      await p.getByRole('tab', { name: /Itens da nota/ }).first().click(); await espera(p); await botao(/^Contas$/)(p);
      await clicar('[data-testid="conta-do-item-1"] [role="combobox"]')(p); }, estados: [
    /* o plano da bancada usa pecuaria e agricultura: a barra tem essas duas */
    ['atividade Lavoura', clicar('[data-testid="conta-barra-atividade"] button:has-text("Lavoura")')],
    ['todas (desmarca)', clicar('[data-testid="conta-barra-atividade"] button:has-text("Lavoura")')],
    ['atividade Pecuária', clicar('[data-testid="conta-barra-atividade"] button:has-text("Pecuária")')],
  ] },
  /* NOTA-FORNECEDOR-COMPARAR-01 — "Atualizar N campos" -> "Confirmar" (a frase aparece no rodape) e o estado "nao parece o certo" */
  { nome: 'comparar-cadastro', url: 'tela=comparar-cadastro', estados: [
    ['pedindo a confirmacao', clicar('[data-testid="comparar-atualizar"]')],
    ['cadastro que nao parece o certo', { url: 'tela=comparar-cadastro&v=errado' }],
  ] },
  /* PARC-DOCS-TABELA-01 — Editar obrigação da compra parcelada (18 parcelas, uma nota): trocar de aba e voltar a Documentos não mexe no
     cabeçalho do modal, nas abas, no rodapé nem no cabeçalho da tabela das parcelas; e a densidade é a mesma na volta */
  ...[2, 18].map((np) => ({ nome: `parcelamento-abas-${np}`, url: `tela=contrato&v=parcelamento&np=${np}&docs=1`, antes: async (p) => {
      await p.locator('button[title="Nota fiscal e boletos das parcelas"]').click(); await p.locator('[data-testid="parcelas-da-compra"]').waitFor(); await espera(p, 600); },
    estados: ['Contrato', 'Parcelas', 'Classificação', 'Documentos'].map((aba) => [`aba ${aba}`, async (p) => {
      await p.getByRole('dialog').getByRole('tab', { name: aba, exact: true }).click(); await espera(p, 500); }]) })),
  { nome: 'itens-nota-guardadas', url: 'tela=itens-nota&v=guardadas', estados: [
    ['simulado (30 linhas, contagem)', async (p) => { await p.locator('[data-testid="itens-guardadas-simular"]').click();
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="itens-guardadas-linha"]').length === 30); await espera(p); }],
  ] },
  /* OC-CC-BOTAO-BUSCAR-DESLOCA-01 — os botoes da conta corrente nao andam com o motivo ("Principal já programado…") aparecendo ou
     sumindo, nem as abas com a sub-aba Despesas. So' nos tamanhos em que o modal da OC tem desenho (>= 1000). */
  ...['venda', 'abate'].map((v) => ({ nome: `oc-cc-faixa-${v}`, url: `tela=oc&v=${v}&aba=financeiro&cc=1`, minLargura: 1000, estados: [
    ['sem principal programado (sem o motivo)', { url: `tela=oc&v=${v}&aba=financeiro&cc=1&coberto=0` }],
  ] })),
  /* fatia "casar" (ate' aqui sem cenario: "0 telas"): no 1:1 digitar outro valor e corrigir o valor do lancamento nao mexem no cabecalho, no resumo nem no
     rodape; no bloco trocar a regra nao mexe nas tabelas nem no Conciliar */
  { nome: 'casar-1x1-levado', url: 'tela=casar-1x1&v=levado', antes: async (p) => { await p.locator('[data-testid="levado"]').waitFor(); await espera(p); },
    estados: [
      ['valor do campo diferente do banco', digitar('input[aria-label^="Valor de"]', '0,02')],
      ['corrigir o valor do lancamento', botao(/Corrigir o valor do lançamento/)],
    ] },
  /* P139 — no "Criar transferencia": escolher um dos espelhos do empate e confirmar a gemea nao mexem no movimento, na conta, na
     lista nem no rodape (modal de tamanho fixo; o botao principal tem largura fixa) */
  { nome: 'criar-transferencia-empate', url: 'tela=criar-transferencia&v=empate',
    antes: async (p) => { await p.locator('[data-testid="aviso-empate"]').waitFor(); await espera(p); },
    estados: [['escolher o 2o espelho', botao(/16\/08\/2027/)]] },
  { nome: 'criar-transferencia-gemea', url: 'tela=criar-transferencia&v=gemea',
    antes: async (p) => { await p.locator('[data-testid="aviso-gemea"]').waitFor(); await espera(p); },
    estados: [['criar mesmo assim', botao(/Criar mesmo assim/)]] },
  /* P154 — a prévia: carregando -> com a lista -> com a recusa -> vazia; os botões e o título não andam (lugares fixos) */
  { nome: 'fora-da-vigencia', url: 'tela=fora-da-vigencia&v=carregando',
    antes: async (p) => { await p.locator('[data-testid="modal-fora-da-vigencia"]').waitFor(); await espera(p); },
    estados: [['com a lista', { url: 'tela=fora-da-vigencia&v=encurtada' }], ['com a recusa', { url: 'tela=fora-da-vigencia&v=erro' }]] },
  { nome: 'fora-da-vigencia-cancelar', url: 'tela=fora-da-vigencia&v=cancelar',
    antes: async (p) => { await p.locator('[data-testid="modal-fora-da-vigencia"]').waitFor(); await espera(p); },
    estados: [['nada a cancelar', { url: 'tela=fora-da-vigencia&v=vazia' }]] },
  /* P124 — o palco do mês: buscar, marcar todas as exatas, a prévia do lote e voltar — os chips, os botões e o rodapé não andam */
  { nome: 'palco-do-mes', url: 'tela=palco-do-mes', tamanhos: [[1000, 600], [1126, 579], [1300, 704], [1440, 800]],
    antes: async (p) => { await p.locator('[data-testid="linha-palco"]').first().waitFor(); await espera(p); },
    estados: [
      ['buscou as sugestoes', async (p) => { await p.locator('[data-testid="buscar-sugestoes"]').click(); await p.locator('[data-testid="chip-sugestao-exata"]:not([disabled])').waitFor(); await espera(p); }],
      ['filtro exata', clicar('[data-testid="chip-sugestao-exata"]')],
      ['marcar todas as exatas', clicar('[data-testid="marcar-exatas"]')],
      ['previa do lote', clicar('[data-testid="conciliar-selecionados"]')],
      ['voltar', botao(/^Voltar$/)],
    ] },
  /* P141 (CONC-LAYOUT-01) — Saldos por conta: os selos OFX/PDF e o ↗ PRESOS (lugar fixo) entre a página com arquivos e a sem nenhum,
     a conta escolhida e o "← Todas"; o modal do ↗ entre carregando e carregado. A prova: sem a largura fixa do lugar do selo, o PDF anda. */
  { nome: 'conciliacao-saldos', url: 'tela=conciliacao', tamanhos: TAMANHOS_DO_P92,
    presos: '[data-conta="cc1"] [data-testid="slot-ofx"], [data-conta="cc1"] [data-testid="slot-pdf"], [data-conta="cc1"] [data-testid="abrir-extrato-sistema"]',
    antes: async (p) => { await p.locator('[data-testid="linha-saldo-conta"]').first().waitFor(); await espera(p); },
    estados: [['sem nenhum arquivo', { url: 'tela=conciliacao&v=sem' }], ['conta escolhida', clicar('[data-conta="cc2"]')], ['← Todas', botao(/← Todas/)],
      /* P166 — a faixa do status tem altura FIXA: verde, âmbar e cinza não empurram os blocos nem a régua */
      ['faixa conciliado', { url: 'tela=conciliacao&v=ok' }], ['faixa com pendência', { url: 'tela=conciliacao&v=pendencia' }],
      ['faixa pendente', { url: 'tela=conciliacao&v=pendente' }]] },
  { nome: 'conciliacao-extrato-do-sistema', url: 'tela=extrato-do-sistema&v=carregando', tamanhos: TAMANHOS_DO_P92,
    antes: async (p) => { await p.locator('[data-testid="modal-extrato-sistema"]').waitFor(); await espera(p); },
    estados: [['carregado', { url: 'tela=extrato-do-sistema' }]] },
  /* P159a (CONC-TELAS-01) — a Conferência: trocar o chip (Sem par, Casados, Vencidos, Todos) não mexe no cabeçalho do modal, nos chips,
     na faixa nem no cabeçalho das colunas (régua fixa); o Casar lançamentos: trocar de sub-aba não mexe na barra, e o mês curto não mexe
     nas colunas do Extrato. */
  /* P153 — procurar no histórico não mexe em nada fora do quadro: o botão, a contagem e a linha do banco ficam onde estão (a frase é linha do quadro) */
  { nome: 'casar-sugestoes-procurar', url: 'tela=sugestoes-casar', tamanhos: TAMANHOS_DO_P92,
    presos: '[data-testid="sugestoes-extrato"], [data-testid="procurar-historico-botao"], [data-testid="procurar-historico-contagem"]',
    estados: [['procurou', async (p) => { await clicar('[data-testid="procurar-historico-botao"]')(p); await p.locator('[data-testid="procurar-historico-achado"]').first().waitFor(); await espera(p); }]] },
  { nome: 'conferencia-chips', url: 'tela=conciliacao', tamanhos: TAMANHOS_DO_P92,
    presos: '[data-testid="chips-conferencia"] button, [data-testid="faixa-conferencia"], [data-testid="mesa-conferencia"] thead th',
    antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
      await botao(/^Casar lançamentos$/)(p); await p.locator('[data-testid="barra-casar"]').getByRole('button', { name: 'Conferência' }).click();
      await p.locator('[data-testid="mesa-conferencia"]').waitFor(); await espera(p); },
    estados: [['Sem par', clicar('[data-testid="chip-sem_par"]')], ['Casados', clicar('[data-testid="chip-casados"]')],
      ['Vencidos', clicar('[data-testid="chip-vencidos"]')], ['Todos', clicar('[data-testid="chip-todos"]')]] },
  { nome: 'casar-extrato', url: 'tela=conciliacao', tamanhos: TAMANHOS_DO_P92, minLargura: 1000,
    presos: '[data-testid="barra-casar"], [data-testid="resumo-espelho"]',
    antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
      await botao(/^Casar lançamentos$/)(p); await p.locator('[data-testid="extrato-saldo-final"]').waitFor(); await espera(p); },
    estados: [['Sistema', botao(/^Sistema$/)], ['Evolução do saldo', botao(/^Evolução do saldo$/)], ['Extrato (banco)', botao(/^Extrato \(banco\)$/)]] },
  /* P159b — a Evolução: ligar "mostrar dias sem movimento" não mexe nas colunas (régua fixa) nem no rodapé preso */
  { nome: 'casar-evolucao-vazios', url: 'tela=conciliacao', tamanhos: TAMANHOS_DO_P92, minLargura: 1000,
    presos: '[data-testid="evolucao-lista"] thead th, [data-testid="evolucao-rodape"]',
    antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
      await botao(/^Casar lançamentos$/)(p); await p.locator('[data-testid="extrato-saldo-final"]').waitFor();
      await botao(/^Evolução do saldo$/)(p); await p.locator('[data-testid="evolucao-lista"]').waitFor(); await espera(p); },
    estados: [['mostrar dias sem movimento', clicar('[data-testid="evolucao-mostrar-vazios"]')], ['esconder de novo', clicar('[data-testid="evolucao-mostrar-vazios"]')]] },
  { nome: 'casar-extrato-mes-curto', url: 'tela=conciliacao', tamanhos: TAMANHOS_DO_P92, minLargura: 1000,
    presos: '[data-testid="extrato-do-mes"] thead th',
    antes: async (p) => { await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p);
      await botao(/^Casar lançamentos$/)(p); await p.locator('[data-testid="extrato-saldo-final"]').waitFor(); await espera(p); },
    estados: [['mês curto', async (p) => { await p.goto(p.url().replace('tela=conciliacao', 'tela=conciliacao&v=poucos'));
      await p.locator('[data-conta="cc1"]').first().waitFor(); await clicar('[data-conta="cc1"]')(p); await botao(/^Casar lançamentos$/)(p);
      await p.locator('[data-testid="extrato-saldo-final"]').waitFor(); await espera(p); }]] },
  { nome: 'casar-bloco', url: 'tela=casar-bloco', antes: async (p) => { await p.locator('[data-testid="conciliar-bloco"]').waitFor(); await espera(p); },
    estados: [
      ['regra mais antigo primeiro', botao(/Mais antigo primeiro/)],
      ['regra soma exata de volta', botao(/Soma exata/)],
    ] },
  /* CONC-SEM-TRAVA-01 (tela) — o modal Conciliar: trocar de cartao, escolher outra sugestao, buscar e tentar sem motivo nao mexem
     nos lados, na caixa da diferenca, nos cartoes, no motivo nem no rodape (tamanho fixo) */
  { nome: 'conciliar-sobra', url: 'tela=conciliar&v=sobra', antes: async (p) => { await p.locator('[data-testid="botao-conciliar"]').waitFor(); await espera(p); },
    estados: [
      ['cartao lancar na OC', clicar('[data-testid="cartao-sobra_na_oc"] input[name="opcao-conciliar"]')],
      ['cartao criar a diferenca', clicar('[data-testid="cartao-criar_diferenca"] input[name="opcao-conciliar"]')],
      ['busca com resultado', digitar('[data-testid="busca-acrescentar"]', 'Novilhas')],
      ['conciliar sem motivo (aviso)', clicar('[data-testid="botao-conciliar"]')],
    ] },
  { nome: 'conciliar-falta', url: 'tela=conciliar&v=falta', antes: async (p) => { await p.locator('[data-testid="botao-conciliar"]').waitFor(); await espera(p); },
    estados: [
      ['cartao deixar em aberto', clicar('[data-testid="cartao-ligar_com_falta"] input[name="opcao-conciliar"]')],
      ['cartao desconto na OC', clicar('[data-testid="cartao-desconto_na_oc"] input[name="opcao-conciliar"]')],
      ['conciliar sem motivo (aviso)', clicar('[data-testid="botao-conciliar"]')],
    ] },
  /* OC-CORRECOES-01 C3 — o "Buscar recebimento no Financeiro": a busca e a escolha nao mexem no campo, no cabecalho nem nos botoes */
  { nome: 'oc-cc-buscar', url: 'tela=oc-cc&v=buscar', antes: async (p) => { await p.locator('[data-testid="busca-recebimento"]').waitFor(); await espera(p); },
    estados: [
      ['busca com resultado', digitar('[data-testid="busca-recebimento"]', '118')],
      ['busca sem resultado', digitar('[data-testid="busca-recebimento"]', 'zzzzzz nada')],
      ['busca limpa', digitar('[data-testid="busca-recebimento"]', '')],
      ['escolher um', clicar('tr[data-lancamento="m1"]')],
      ['vincular sem motivo (aviso)', botao(/^Vincular$/)],
    ] },
];

/* roda NA PAGINA: o retangulo de cada elemento medido, pela identidade */
function medirPosicoes(cfg) {
  /* P109 — `regiao` (opcional, seletor): so' o que esta' dentro dela conta (os `presos` sempre); o argumento e' `[presos, regiao]` */
  const [presos, regiao] = Array.isArray(cfg) ? cfg : [cfg, null];
  const SEL = 'button, [role="tab"], [role="button"], [role="combobox"], input, select, textarea, h1, h2, h3, h4, th, [data-desloca]';
  const raiz = document.getElementById('root') ?? document.body;
  const caminho = (e) => { const p = []; for (let x = e; x && x !== raiz; x = x.parentElement) { const pai = x.parentElement; p.unshift(`${x.tagName.toLowerCase()}${pai ? `:${[...pai.children].indexOf(x)}` : ''}`); } return p.join('>'); };
  const rolaPorDentro = (e) => {
    /* a lista e' o container que rola DENTRO da tela (o da casca da bancada, `data-casca`, e' a pagina: nao conta) */
    for (let a = e; a && a !== raiz && !a.hasAttribute('data-casca'); a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'sticky') return false;
      if (a !== e && /(auto|scroll)/.test(cs.overflowY)) return true;
    }
    return false;
  };
  const vistos = new Map(); const out = {};
  for (const e of document.querySelectorAll(SEL)) {
    if (e.closest('tbody') || e.closest('[data-desloca-livre]') || (regiao && !e.closest(regiao))) continue;
    /* dentro da area que ROLA (a lista) mora o conteudo: so' o cabecalho e o que esta' preso (sticky) contam */
    if (e.tagName !== 'TH' && rolaPorDentro(e)) continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) continue;
    const tid = e.getAttribute('data-testid');
    let chave = tid ? `#${tid}` : caminho(e);
    const n = vistos.get(chave) ?? 0; vistos.set(chave, n + 1); if (n) chave += `[${n}]`;
    out[chave] = { x: r.left, y: r.top, w: r.width, rotulo: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40) };
  }
  if (presos) for (const e of document.querySelectorAll(presos)) {
    const r = e.getBoundingClientRect();
    let aVista = r.width > 1 && r.height > 1;
    /* ate' a casca da bancada (`data-casca`): ela e' a PAGINA (rolar a pagina nao conta — a mesma regra do `rolaPorDentro`) */
    for (let a = e.parentElement; a && aVista && !a.hasAttribute('data-casca'); a = a.parentElement) {
      const cs = getComputedStyle(a); if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
      const c = a.getBoundingClientRect();
      const topo = c.top + a.clientTop;   /* a caixa visivel: dentro da borda */
      if (r.top < topo - 0.5 || r.bottom > topo + a.clientHeight + 0.5) aVista = false;
    }
    const tid = e.getAttribute('data-testid') ?? e.tagName;
    out[`!${tid}`] = { x: r.left, y: r.top, w: r.width, preso: true, aVista, rotulo: (e.textContent ?? tid).replace(/\s+/g, ' ').trim().slice(0, 40) };
  }
  return out;
}
const comparar = (a, b, estado) => {
  const achados = [];
  for (const [k, va] of Object.entries(a)) {
    const vb = b[k];
    if (va.preso && (!vb || !vb.aVista)) { achados.push({ estado, texto: `"${va.rotulo}" (preso) ${vb ? 'saiu da vista' : 'sumiu'}` }); continue; }
    if (!vb) continue;
    const d = [['x', vb.x - va.x], ['y', vb.y - va.y], ['largura', vb.w - va.w]].filter(([, v]) => Math.abs(v) > 0.5);
    if (d.length) achados.push({ estado, texto: `"${va.rotulo}"${va.rotulo !== vb.rotulo ? ` -> "${vb.rotulo}"` : ''}: ${d.map(([n, v]) => `${n} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(', ')}` });
  }
  return achados;
};

/* UI-GATE-RAPIDO-01 — `--rapido`: so' as telas cuja arvore de imports alcanca o diff contra o origin/proto (`scripts/ui-gate-rapido.mjs`);
   mudanca compartilhada sai com 3 ("rode o completo"); diff sem tela, com 0. */
const RAPIDO = process.argv.includes('--rapido');
const naRapida = RAPIDO ? filtroRapido('check-ui-desloca') : () => true;
/* o modo rapido mede nos MESMOS tamanhos do completo (ver check-ui-cortes) */
const TAMANHOS_DA_VEZ = TAMANHOS;
/* P92 — o cenario pode pedir os PROPRIOS tamanhos (`tamanhos`), como no check-ui-cortes; o `--tamanhos` da linha de comando manda sobre eles */
const tamanhosDe = (c) => (c.tamanhos && !arg('--tamanhos') ? c.tamanhos : TAMANHOS_DA_VEZ);
const ESCOLHIDOS = CENARIOS.filter((c) => (!SO || (SO.endsWith('$') ? c.nome === SO.slice(0, -1) : c.nome.startsWith(SO))) && naRapida(c));
const servidor = await createServer({ configFile: path.join(AQUI, 'ui-cortes/vite.config.mts'), server: { port: 0, host: '127.0.0.1' } });
await servidor.listen();
const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
const navegador = await chromium.launch();
let codigo = 0;
try {
  /* AUTO-TESTE: o rotulo que cresce empurra o botao ao lado (achado); o que tem largura reservada nao empurra (sem achado) */
  const p0 = await navegador.newPage({ viewport: { width: 800, height: 300 } });
  await p0.setContent(`<div id="root"><div style="display:flex;gap:8px"><span id="t">1–50</span><button data-testid="vizinho">Próxima</button></div>
    <div style="display:flex;gap:8px"><span id="r" style="display:inline-block;width:120px">1–50</span><button data-testid="reservado">Próxima</button></div></div>`);
  const a0 = await p0.evaluate(medirPosicoes);
  await p0.evaluate(() => { document.getElementById('t').textContent = '1.001–1.050 de 2.356'; document.getElementById('r').textContent = '1.001–1.050'; });
  const prova = comparar(a0, await p0.evaluate(medirPosicoes), 'prova');
  await p0.close();
  if (!prova.some((x) => x.texto.startsWith('"Próxima"')) || prova.length !== 1) { console.error(`check-ui-desloca: AUTO-TESTE FALHOU (${JSON.stringify(prova)})`); process.exit(2); }
  /* P100 — `presos` se prova: numa lista que rola, o rodape preso (sticky) fica; o que nao e' preso sai da vista ao rolar (achado) */
  const pp = await navegador.newPage({ viewport: { width: 400, height: 300 } });
  await pp.setContent(`<div id="root"><div id="rola" style="height:100px;overflow:auto"><table><tbody>${'<tr><td>linha</td></tr>'.repeat(30)}</tbody>
    <tfoot style="position:sticky;bottom:0;background:#fff"><tr data-testid="preso-ok"><td>Resultado</td></tr></tfoot></table>
    <div data-testid="preso-mal">Saldo final solto</div></div></div>`);
  const sel0 = '[data-testid="preso-ok"], [data-testid="preso-mal"]';
  await pp.evaluate(() => { document.getElementById('rola').scrollTop = 0; });
  const q0 = await pp.evaluate(medirPosicoes, sel0);
  await pp.evaluate(() => { document.getElementById('rola').scrollTop = 30; });
  const q1 = comparar(q0, await pp.evaluate(medirPosicoes, sel0), 'prova presos');
  await pp.close();
  if (q1.some((x) => x.texto.startsWith('"Resultado"')) || !q1.some((x) => x.texto.startsWith('"Saldo final solto"'))) {
    console.error(`check-ui-desloca: AUTO-TESTE DOS PRESOS FALHOU (${JSON.stringify(q1)})`); process.exit(2);
  }

  const todos = []; let medicoes = 0;
  for (const cen of ESCOLHIDOS) for (const [w, h] of tamanhosDe(cen)) {
    if (w < (cen.minLargura ?? 0)) continue; /* tela sem desenho abaixo desta largura (o modal da OC: >= 1000) */
    const p = await navegador.newPage({ viewport: { width: w, height: h } });
    const erros = []; p.on('pageerror', (e) => erros.push(String(e).slice(0, 160)));
    const abrir = async (pg, url) => { await pg.goto(`${base}/index.html?${url}`); await pg.evaluate(() => document.fonts.ready); await espera(pg, 1300); };
    await abrir(p, cen.url);
    if (cen.antes) await cen.antes(p);
    const inicial = await p.evaluate(medirPosicoes, [cen.presos ?? null, cen.regiao ?? null]);
    /* `auto`: as escolhas da tela, por indice (a lista e' relida na tela recem-aberta a cada troca) */
    /* o `Segmentado` da casa: `div.inline-flex.shrink-0.overflow-hidden.rounded-md.border` com os botoes filhos (src/components/ui/segmentado) */
    const ESCOLHAS = 'div.inline-flex.shrink-0.overflow-hidden.rounded-md.border > button:not([disabled]), [role="tab"]:not([disabled])';
    const estados = [...(cen.estados ?? [])];
    if (cen.auto) {
      const rotulos = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('tbody'))
        .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)), ESCOLHAS);
      rotulos.forEach((rot, i) => estados.push([`escolha "${rot}"`, async (pg) => {
        await abrir(pg, cen.url); if (cen.antes) await cen.antes(pg);
        await pg.evaluate(([sel, k]) => { const v = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('tbody')); v[k]?.click(); }, [ESCOLHAS, i]);
        await espera(pg, 600);
      }]));
    }
    for (const [nome, gesto] of estados) {
      medicoes++;
      if (typeof gesto === 'function') {
        try { await gesto(p); } catch (e) { erros.push(`${nome}: ${String(e).slice(0, 100)}`); continue; }
        todos.push(...comparar(inicial, await p.evaluate(medirPosicoes, [cen.presos ?? null, cen.regiao ?? null]), nome).map((a) => ({ tela: cen.nome, tamanho: `${w}x${h}`, ...a })));
      } else {
        const pu = await navegador.newPage({ viewport: { width: w, height: h } }); await abrir(pu, gesto.url);
        todos.push(...comparar(inicial, await pu.evaluate(medirPosicoes, [cen.presos ?? null, cen.regiao ?? null]), nome).map((a) => ({ tela: cen.nome, tamanho: `${w}x${h}`, ...a })));
        await pu.close();
      }
    }
    todos.push(...erros.map((e) => ({ tela: cen.nome, tamanho: `${w}x${h}`, estado: 'erro', texto: e })));
    await p.close();
  }
  const unicos = [...new Map(todos.map((a) => [`${a.tela}|${a.estado}|${a.texto}`, a])).values()];
  if (unicos.length) {
    codigo = 1;
    console.error(`check-ui-desloca: ${unicos.length} achado(s):`);
    for (const a of unicos) console.error(`  ${a.tela} [${todos.filter((x) => x.tela === a.tela && x.estado === a.estado && x.texto === a.texto).map((x) => x.tamanho).join(' ')}] ${a.estado}: ${a.texto}`);
  } else console.log(`check-ui-desloca: ${ESCOLHIDOS.length} telas, ${medicoes} trocas de estado medidas (${new Set(ESCOLHIDOS.flatMap((c) => tamanhosDe(c).map((t) => t.join('x')))).size} tamanhos): nada se desloca.`);
} finally { await navegador.close(); await servidor.close(); }
process.exit(codigo);
