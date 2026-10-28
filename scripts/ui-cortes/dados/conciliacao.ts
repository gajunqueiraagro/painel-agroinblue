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
  { id: 'cc1', nome_conta: 'Banco Exemplo Agro Cooperativa de Crédito Rural - Conta Movimento Principal da Sede', nome_exibicao: null, tipo_conta: 'cc', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 1, ativo: true, cliente_id: 'cli' },
  { id: 'cc2', nome_conta: 'Banco Alfa', nome_exibicao: null, tipo_conta: 'cc', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 1, ativo: true, cliente_id: 'cli' },
  { id: 'inv', nome_conta: 'Invest Exemplo Aplicação Automática', nome_exibicao: null, tipo_conta: 'inv', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 1, ativo: true, cliente_id: 'cli' },
  { id: 'car', nome_conta: 'Cartão Exemplo - Visa Infinite', nome_exibicao: null, tipo_conta: 'cartao', codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: 0, ativo: true, cliente_id: 'cli' },
];

/** P166 — os mesmos papéis com nomes SINTÉTICOS no tamanho real (26 · 10 · 26 · 25 letras). */
export const CONTAS_TAMANHO_REAL = CONTAS.map((c, i) => ({ ...c,
  nome_conta: ['Banco Exemplos PJ Pecuária', 'Banco Alfa', 'Invest-Exemplo PJ Pecuária', 'Cartão Exemplo - Ourocard'][i] }));

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
  const nomes = v === 'nj' ? CONTAS_TAMANHO_REAL : CONTAS;
  const cc1 = linhaConta({ conta_id: 'cc1', conta_nome: nomes[0].nome_conta, tipo_conta: 'cc', status: 'conciliado', saldo_inicial: 1,
    saldo_sistema: -99999999.99, saldo_extrato: -99999999.99, diferenca: 0, entradas: 3060.6, saidas: -100003061.59,
    ...(contaIds?.length === 1 ? { linhas_sistema: LINHAS_SISTEMA } : {}) });
  const cc2 = linhaConta({ conta_id: 'cc2', conta_nome: 'Banco Alfa', tipo_conta: 'cc', status: 'nao_conciliado', saldo_inicial: 1,
    saldo_sistema: 1, saldo_extrato: 1.03, diferenca: -0.03, motivos: [{ motivo: 'saldo_diverge', valor: -0.03 }] });
  const inv = linhaConta({ conta_id: 'inv', conta_nome: nomes[2].nome_conta, tipo_conta: 'inv', status: 'pendente', saldo_inicial: 99999999.99,
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
   PDF na cc1 e no cartão. */
export const IMPORTACOES = [{ conta_bancaria_id: 'cc1', saldo_declarado_data: '2031-09-30' }, { conta_bancaria_id: 'cc2', saldo_declarado_data: '2031-08-31' }];
export const DOCUMENTOS = [{ conta_bancaria_id: 'cc1', ano_mes: '2031-09' }, { conta_bancaria_id: 'car', ano_mes: '2031-09' }];
