/* P141 (CONC-LAYOUT-01) — a aba Conciliação na bancada: as linhas do DONO (`fn_conciliacao_resumo_mes`) no pior caso, SINTÉTICAS.
 *   cc1  nome mais longo que o real, -99.999.999,99 em Sistema e Extrato, "confere", OFX cheio + PDF
 *   cc2  OFX VAZADO (a conta importa OFX, o do mês não trouxe saldo), diferença de centavos
 *   inv  sem saldo do extrato ("falta saldo" no subtotal e no Total), sem arquivo
 *   car  Diferença no pior valor (-99.999.999,99), só PDF
 * `semArquivos`: os mesmos números, nenhum OFX/PDF — o deslocamento compara as duas páginas (o lugar dos selos é fixo).
 * `linhasSistema`: a lista do sistema da cc1 para o "Extrato do sistema" (o ↗): três dias, textos longos, o parcial e a interna.
 * P166 (CONC-TELA-02) — a FAIXA do status nos quatro casos, pelo `v` da bancada: (padrão) não conciliado · `ok` conciliado ·
 * `pendencia` conciliado com 3 sem subcentro (âmbar, "corrigir ›") · `pendente` (cinza, as frases do dono). `nj`: os nomes no
 * TAMANHO REAL (25–26 letras, o maior das contas ativas do proto em 28/10, fora uma de 47) — o nome não pode cortar de 1024px para cima. */
import { comProprio } from '@/lib/conciliacao/resumoDoDono.fixture';

const linhaConta = (x: Record<string, unknown>) => comProprio({
  nivel: 'conta', consolida_em_conta_id: null, tem_extrato: true, entradas: 0, saidas: 0, motivos: [], avisos: [],
  retido_em_depositos: { qtde: 0, valor: 0 }, extratos_sem_par: { qtde: 0, valor: 0 }, lancamentos_sem_par: { qtde: 0, valor: 0 },
  banco: { entradas: 0, saidas: 0 }, posicao: null, sem_conta: null, saldo_extrato_data: '2031-09-30', saldo_inicial_origem: 'informado',
  entradas_terceiros: 0, entradas_transferencias: 0, saidas_terceiros: 0, saidas_transferencias: 0, ...x,
});
const SUB = (tipo: string, x: Record<string, unknown>) => linhaConta({ nivel: 'tipo', conta_id: null, tipo_conta: tipo, ...x });

export const CONTAS = [
  /* CONC-PAINEL-CONTA-01 (Gabriel 12:42) — nomes do TAMANHO DOS REAIS: o maior nome real ativo tem 26 letras (a permuta de 47 vai ser
     renomeada, com OK); o nome gigante de antes não existe de verdade e alargava a coluna Conta à toa */
  { id: 'cc1', nome_conta: 'Cooperativa Exemplo - Sede', nome_exibicao: null, tipo_conta: 'cc', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 1, ativo: true, cliente_id: 'cli' },
  { id: 'cc2', nome_conta: 'Banco Alfa', nome_exibicao: null, tipo_conta: 'cc', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 1, ativo: true, cliente_id: 'cli' },
  { id: 'inv', nome_conta: 'Invest Exemplo Aplicação Automática', nome_exibicao: null, tipo_conta: 'inv', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 1, ativo: true, cliente_id: 'cli' },
  { id: 'car', nome_conta: 'Cartão Exemplo - Visa Infinite', nome_exibicao: null, tipo_conta: 'cartao', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 0, ativo: true, cliente_id: 'cli' },
];

/** P166 — os mesmos papéis com nomes SINTÉTICOS no tamanho real (26 · 10 · 26 · 25 letras). */
export const CONTAS_TAMANHO_REAL = CONTAS.map((c, i) => ({ ...c,
  nome_conta: ['Banco Exemplos PJ Pecuária', 'Banco Alfa', 'Invest-Exemplo PJ Pecuária', 'Cartão Exemplo - Ourocard'][i] }));
/** CONC-LAYOUT-FIXO-01 — os mesmos papéis com nomes SINTÉTICOS no tamanho dos da Vera (8 a 16 letras: 15 · 9 · 12 · 14). Com o NJ, a prova de
 *  que a divisão Saldos | Resumo não muda com o cliente (UI-LARGURA-FIXA-01). */
export const CONTAS_VERA = CONTAS.map((c, i) => ({ ...c,
  nome_conta: ['Banco Exemplo PF', 'Sicoob Ex', 'Invest Exemp', 'Cartão Exemplo'][i] }));

const L = (data: string, valor: number, saldo: number, descricao: string, o: Record<string, unknown> = {}) => ({
  tipo: 'lancamento', data, valor, lancamento_id: `l-${data}-${valor}`, extrato_id: null, parcial: false, falta: null, descricao,
  fornecedor: 'Cooperativa Agropecuária Exemplo dos Produtores Rurais Ltda', centro: 'Pecuária Engorda', subcentro: 'Nutrição Engorda Suplementação',
  status_exibicao: 'conciliado', saldo_apos: saldo, saldo_apos_proprio: saldo, ...o,
});
/* Na ORDEM DO DONO, com o saldo corrido dele. O saldo final é o último. */
export const LINHAS_SISTEMA = [
  L('2031-09-01', 10.5, 11.5, 'PIX RECEBIDO · REEMBOLSO SINTÉTICO'),
  L('2031-09-01', -99999999.99, -99999988.49, 'PAGAMENTO DE BOLETO · FORNECEDOR SINTÉTICO COM O NOME LONGO DE EXEMPLO'),
  L('2031-09-01', 1200, -99998788.49, 'TED RECEBIDA · VENDA DE BEZERROS DESMAMADOS'),
  L('2031-09-02', -2561.6, -100001350.09, 'PARCELA PARCIAL · CONTRATO SINTÉTICO', { status_exibicao: 'parcial', parcial: true, falta: 9999999.99 }),
  L('2031-09-02', -500, -100001850.09, 'APLICAÇÃO AUTOMÁTICA INVEST EXEMPLO', { tipo: 'transferencia_interna', centro: null, subcentro: null, fornecedor: null }),
  L('2031-09-03', 1849.6, -100000000.49, 'RESGATE · TÍTULO SINTÉTICO', { status_exibicao: 'realizado' }),
  L('2031-09-03', 0.5, -99999999.99, 'RENDIMENTO SINTÉTICO'),
];

export function resumoDoMes(contaIds: string[] | null, v: string | null = null) {
  const nomes = v === 'nj' || v === 'nj10' ? CONTAS_TAMANHO_REAL : v === 'vera' ? CONTAS_VERA : v === 'sr' ? CONTAS_SR : CONTAS;
  const cc1 = linhaConta({ conta_id: 'cc1', conta_nome: nomes[0].nome_conta, tipo_conta: 'cc', status: v === 'sr' ? 'nao_conciliado' : 'conciliado', saldo_inicial: 1,
    saldo_sistema: -99999999.99, saldo_extrato: -99999999.99, diferenca: 0, entradas: 3060.6, saidas: -100003061.59,
    /* CONC-PAINEL-02 (`&v=sr`) — a corrente com linhas do extrato sem par (o passo "Casar lançamentos") */
    ...(v === 'sr' ? { extratos_sem_par: { qtde: 58, valor: 1204330.1 }, lancamentos_sem_par: { qtde: 2, valor: 1500 } } : {}),
    /* CONC-PAINEL-02 entrega 2 (`&v=nj10`) — as 3 linhas do extrato sem par do NJ BB out/26 (nomes inventados) */
    ...(v === 'nj10' ? { status: 'nao_conciliado', extratos_sem_par: { qtde: 3, valor: 413338.42 }, lancamentos_sem_par: { qtde: 1, valor: 89.9 } } : {}),
    ...(contaIds?.length === 1 ? { linhas_sistema: LINHAS_SISTEMA } : {}) });
  const cc2 = linhaConta({ conta_id: 'cc2', conta_nome: nomes[1].nome_conta, tipo_conta: 'cc', status: 'nao_conciliado', saldo_inicial: 1,
    saldo_sistema: 1, saldo_extrato: 1.03, diferenca: -0.03, motivos: [{ motivo: 'saldo_diverge', valor: -0.03 }] });
  const inv = v === 'sr'
    /* CONC-PAINEL-02 — a previdência com saldo informado (o PDF) e a diferença (números inventados) */
    ? linhaConta({ conta_id: 'inv', conta_nome: nomes[2].nome_conta, tipo_conta: 'inv', status: 'nao_conciliado', saldo_inicial: 684217.35,
        saldo_sistema: 184217.35, saldo_extrato: 184217.35 + DIFERENCA_SR, diferenca: DIFERENCA_SR, tem_extrato: false, saidas: 500000,
        saidas_transferencias: 500000, motivos: [{ motivo: 'saldo_diverge', valor: DIFERENCA_SR }], avisos: [{ motivo: 'sem_extrato' }] })
    : linhaConta({ conta_id: 'inv', conta_nome: nomes[2].nome_conta, tipo_conta: 'inv', status: 'pendente', saldo_inicial: 99999999.99,
    saldo_sistema: 99999999.99, saldo_extrato: null, diferenca: null, tem_extrato: false, saldo_extrato_data: null,
    motivos: [{ motivo: 'saldo_nao_informado', falta: 'final' }], avisos: [{ motivo: 'sem_extrato' }] });
  const car = linhaConta({ conta_id: 'car', conta_nome: nomes[3].nome_conta, tipo_conta: 'cartao', status: 'nao_conciliado', saldo_inicial: 0,
    saldo_sistema: -6470.73, saldo_extrato: 99993529.26, diferenca: -99999999.99, motivos: [{ motivo: 'saldo_diverge', valor: -99999999.99 }] });
  const contas = [cc1, cc2, inv, car].filter((l) => !contaIds || contaIds.includes(String(l.conta_id)));
  if (contaIds) return contas;
  const semSaldo = { motivo: 'contas_sem_saldo', qtde: 1, contas: [{ conta_id: 'inv', conta_nome: nomes[2].nome_conta }] };
  /* P166 — o status do TOTAL (o que a faixa desenha no Todas) em cada caso; os números não mudam */
  const doTotal = v === 'ok' ? { status: 'conciliado', motivos: [semSaldo], avisos: [] }
    : v === 'pendencia' ? { status: 'conciliado', motivos: [semSaldo], avisos: [{ motivo: 'sem_classificacao', qtde: 3, valor_entradas: 0, valor_saidas: 1250.4 }] }
    : v === 'pendente' ? { status: 'pendente', motivos: [{ motivo: 'contas_pendentes', qtde: 1 }, semSaldo], avisos: [] }
    : { status: 'nao_conciliado', motivos: [{ motivo: 'contas_nao_conciliadas', qtde: 2, contas: [] }, semSaldo], avisos: [] };
  return [...contas,
    SUB('cc', { conta_nome: 'Conta corrente', status: 'nao_conciliado', saldo_sistema: -99999998.99, saldo_extrato: -99999998.96, diferenca: -0.03 }),
    SUB('inv', { conta_nome: 'Investimentos', status: 'pendente', saldo_sistema: 99999999.99, saldo_extrato: null, diferenca: null, motivos: [semSaldo] }),
    SUB('cartao', { conta_nome: 'Cartão', status: 'nao_conciliado', saldo_sistema: -6470.73, saldo_extrato: 99993529.26, diferenca: -99999999.99 }),
    linhaConta({ nivel: 'total', conta_id: null, conta_nome: 'Total', saldo_inicial: 99999999.99, saldo_sistema: -6470.73,
      saldo_extrato: null, diferenca: null, entradas: 3060.6, saidas: -100003061.59, ...doTotal }),
  ];
}

/* Os arquivos do mês: o OFX com saldo da cc1 (set), o da cc2 de OUTRO mês (a conta importa OFX, o de set não trouxe saldo → vazado);
   PDF na cc1 e no cartão. CONC-PAINEL-02: com id, nome e caminho (o painel lista e abre; `lerComprovante` recusa a linha sem id). */
export const IMPORTACOES = [
  { id: 'imp-cc1', conta_bancaria_id: 'cc1', saldo_declarado: -99999999.99, saldo_declarado_data: '2031-09-30', nome_arquivo: 'Extrato Exemplo Conta Movimento set-31.ofx',
    tipo_arquivo: 'OFX', created_at: '2031-10-02T10:00:00Z', cancelado_em: null, cancelada_em: null },
  { id: 'imp-cc2', conta_bancaria_id: 'cc2', saldo_declarado: 1, saldo_declarado_data: '2031-08-31', nome_arquivo: 'alfa-ago.ofx', tipo_arquivo: 'OFX',
    created_at: '2031-09-02T10:00:00Z', cancelado_em: null, cancelada_em: null },
];
export const DOCUMENTOS = [
  { id: 'doc-cc1', conta_bancaria_id: 'cc1', ano_mes: '2031-09', nome: 'Extrato Exemplo Conta Movimento set-31.pdf', tipo: 'application/pdf',
    url: 'cli/saldos/cc1/2031-09/doc-cc1.pdf', uploaded_em: '2031-10-02T10:05:00Z' },
  { id: 'doc-car', conta_bancaria_id: 'car', ano_mes: '2031-09', nome: 'Fatura Exemplo Visa venc 10-10.pdf', tipo: 'application/pdf',
    url: 'cli/saldos/car/2031-09/doc-car.pdf', uploaded_em: '2031-10-03T09:00:00Z' },
];
/** CONC-PAINEL-02 (`&v=sr`) — o caso da Santa Rita com NOMES E NÚMEROS INVENTADOS: a previdência (investimento, sem OFX) com o comprovante do
 *  mês e uma diferença; existe um previsto SEM CONTA do mesmo valor (o "Explicar a diferença" o acha primeiro). */
export const DOCUMENTOS_SR = [...DOCUMENTOS,
  { id: 'doc-inv', conta_bancaria_id: 'inv', ano_mes: '2031-09', nome: 'Previdência Exemplo Saldo 3009.pdf', tipo: 'application/pdf',
    url: 'cli/saldos/inv/2031-09/doc-inv.pdf', uploaded_em: '2031-10-10T12:00:00Z' }];
export const CONTAS_SR = CONTAS.map((c, i) => ({ ...c, nome_conta: ['Banco Exemplo Brasil', 'Banco Alfa', 'Previdência Exemplo VGBL', 'Cartão Exemplo'][i] }));
export const DIFERENCA_SR = -537.42;
export const CANDIDATOS_SR = [{ id: 'l-ajuste', descricao: 'Ajuste da previdência - previsto', valor: 537.42, tipo_operacao: '2-Saídas', status_transacao: 'previsto',
  conta_bancaria_id: null, data_pagamento: null, data_vencimento: '2031-09-30' }];
/** O elo arquivo → movimento (`useImportacoesDaConta`) e os movimentos que o arquivo trouxe (o "Ver" da importação). */
export const LIGACOES = [1, 2, 3].map((n) => ({ id: `ext-${n}`, importacao_id: 'imp-cc1', cancelado_em: null, data_movimento: `2031-09-0${n}` }));
export const MOVIMENTOS_DO_ARQUIVO = [
  { id: 'ext-1', data_movimento: '2031-09-01', descricao: 'PIX RECEBIDO · REEMBOLSO SINTÉTICO', valor: 10.5 },
  { id: 'ext-2', data_movimento: '2031-09-02', descricao: 'PAGAMENTO DE BOLETO · FORNECEDOR SINTÉTICO COM O NOME LONGO DE EXEMPLO', valor: -99999999.99 },
  { id: 'ext-3', data_movimento: '2031-09-03', descricao: 'TED RECEBIDA · VENDA DE BEZERROS DESMAMADOS', valor: 1200 },
];

/** CONC-PAINEL-02 ajuste (Gabriel 23/11 17:09, `&v=nj10`) — o caso do print do NJ BB out/26 com NOMES INVENTADOS: 10 arquivos na mesma conta
 *  (9 OFX baixados dia a dia, cada um do dia 1 até o dia do download — todos se sobrepõem — e o PDF do saldo). */
const DD = (n: number) => String(n).padStart(2, '0');
export const IMPORTACOES_NJ10 = Array.from({ length: 9 }, (_, i) => ({
  id: `imp-nj-${i + 1}`, conta_bancaria_id: 'cc1', saldo_declarado: i === 8 ? -99999999.99 : 1250000 - i * 37215.4, saldo_declarado_data: `2031-09-${DD(3 + i * 3)}`,
  nome_arquivo: `Extrato Banco Exemplos PJ Pecuária 2031-09-${DD(3 + i * 3)}.ofx`, tipo_arquivo: 'OFX', created_at: `2031-09-${DD(4 + i * 3)}T08:00:00Z`,
  cancelado_em: null, cancelada_em: null, arquivo_caminho: i >= 7 ? `cli/importacoes/cc1/imp-nj-${i + 1}.ofx` : null,
}));
export const LIGACOES_NJ10 = IMPORTACOES_NJ10.flatMap((imp, i) => Array.from({ length: 3 + i * 3 }, (_, d) => ({
  id: `ext-nj-${i + 1}-${d + 1}`, importacao_id: imp.id, cancelado_em: null, data_movimento: `2031-09-${DD(d + 1)}` })));

/** CONC-PAINEL-02 entrega 2 (`&v=nj10`) — o extrato do mês da cc1 (`useConciliacaoDoMes`): 3 sem par (uma exata, uma a conferir com empate, uma sem
 *  sugestão) e uma já conciliada; e o que o motor (`fn_candidatos_conciliacao`) devolve para cada uma. Nomes e números inventados. */
export const MOVS_NJ10 = [
  { id: 'mv-1', data_movimento: '2031-09-03', descricao: 'PAG BOLETO ENERGIA ELETRICA EXEMPLO DISTRIBUIDORA S/A', documento: null, valor: -3118.42 },
  { id: 'mv-2', data_movimento: '2031-09-05', descricao: 'TED RECEBIDA FRIGORIFICO EXEMPLO DO CENTRO-OESTE LTDA', documento: null, valor: 410220 },
  { id: 'mv-3', data_movimento: '2031-09-12', descricao: 'PIX ENVIADO JOSE EXEMPLO DA SILVA', documento: null, valor: -1500 },
  { id: 'mv-4', data_movimento: '2031-09-15', descricao: 'TARIFA PACOTE SERVICOS', documento: null, valor: -89.9 },
];
export const ITENS_NJ10 = [{ extrato_id: 'mv-4', valor_aplicado: -89.9, lancamento_id: 'l-tar', financeiro_lancamentos_v2: { descricao: 'Tarifa bancária', financeiro_fornecedores: null } }];
export function candidatosNj10(extratoId: string) {
  const c = (o: Record<string, unknown>) => ({ numero_documento: null, status: 'programado', ja_conciliado: 0, delta_valor: 0, delta_dias: 2, indisponivel: false,
    motivo_indisponivel: null, ambiguo: false, pre_marcado: false, score: 92, ...o });
  if (extratoId === 'mv-1') return [c({ id: 'l-ener', descricao: 'Energia elétrica - Sede Exemplo', favorecido: 'Distribuidora de Energia Exemplo S/A', data_referencia: '2031-09-05',
    vencimento: '2031-09-05', valor: -3118.42, saldo: -3118.42, pre_marcado: true })];
  if (extratoId === 'mv-2') return [c({ id: 'l-boi', descricao: 'Venda de 118 bois gordos · OC exemplo 118 · parcela 1/2', favorecido: 'Frigorífico Exemplo', data_referencia: '2031-09-06',
    vencimento: '2031-09-06', valor: 410220, saldo: 410220, ambiguo: true }), c({ id: 'l-boi2', descricao: 'Venda de bois · parcela 2/2', valor: 410220, saldo: 410220, score: 90 })];
  return [];
}
