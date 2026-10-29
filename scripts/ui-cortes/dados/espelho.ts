/* P159a (CONC-TELAS-01) — o Espelho da cc1 na bancada (`fn_extratos_espelhados`), SINTÉTICO e no pior caso: históricos longos com a
 * moldura do banco ("PIX - ENVIADO - dd/mm hh:mm"), valores no teto, o sem par, o agrupado com o aviso "lançado em", o N:1, o candidato
 * com documento e o vencido de outro mês. Serve à Conferência (modal), ao Extrato (banco) e às abas Sistema/Evolução do Casar.
 * `&v=poucos`: só o dia 01 (o mês curto: a lista não enche a tela). */
const NOME = 'FORNECEDOR SINTÉTICO COM O NOME BEM COMPRIDO DE EXEMPLO AGROPECUÁRIA LTDA';
const ofx = (extrato_id: string, data: string, valor: number, status: string, historico: string, documento: string | null = null) =>
  ({ extrato_id, data, historico, documento, valor, status, flag_dup: false, flag_investimento: false });
const sis = (lancamento_id: string, data: string, valor_assinado: number, o: Record<string, unknown> = {}) => ({
  lancamento_id, data, descricao: 'Compra de Insumos para Suplementação do Rebanho de Engorda · Pedido 4521', centro: 'Pecuária Engorda',
  subcentro: 'Nutrição Engorda Suplementação Mineral e Proteinada', valor_assinado, sinal: valor_assinado < 0 ? '-1' : '1', status: 'conciliado',
  fornecedor: 'Cooperativa Agropecuária Exemplo dos Produtores Rurais do Vale Ltda', origem_lancamento: 'manual', competencia: '2031-09-01', ...o,
});
const cand = (lancamento_id: string, data_vencimento: string, valor_assinado: number, o: Record<string, unknown> = {}) => ({
  lancamento_id, data_vencimento, competencia: data_vencimento.slice(0, 8) + '01', valor: Math.abs(valor_assinado), valor_assinado,
  sinal: '-1', descricao: 'Folha de Pagamento · Colaborador Sintético com o Nome Bem Comprido de Exemplo', centro: 'Mão de Obra',
  subcentro: 'Salários e Encargos Sociais da Pecuária', status_transacao: 'programado', cenario: 'realizado', cultura: null,
  numero_documento: '000.544.330', tipo_documento: 'Nota Fiscal', favorecido_id: 'f1', fornecedor: 'Colaborador Sintético com o Nome Bem Comprido',
  safra_codigo: null, safra_descricao: null, vencido: false, ja_conciliado: false, sem_conta: false, ...o,
});

export function espelho(v: string | null) {
  const poucos = v === 'poucos';
  const ofxs = [
    ofx('e1', '2031-09-01', -99999999.99, 'conciliado', `PIX - ENVIADO - 01/09 08:46 ${NOME}`, '2031090100001'),
    ofx('e2', '2031-09-01', -175, 'sem_vinculo', 'PAGAMENTO DE BOLETO -  EMPRESA SINTÉTICA DE SERVIÇOS RURAIS E TRANSPORTES S A'),
    ofx('e3', '2031-09-01', 1234.56, 'conciliado', 'Pix - Recebido - 01/09 14:02 Comprador Sintético de Bezerros'),
    ...(poucos ? [] : [
      ofx('e4', '2031-09-02', -12500, 'conciliado', 'Pix - Agendamento - 28/08 10:15 Prestador Sintético de Serviços de Cerca'),
      ofx('e5', '2031-09-02', -50000, 'conciliado', 'TED-CRÉDITO EM CONTA -  TRANSFERÊNCIA SINTÉTICA PARTE 1'),
      ofx('e6', '2031-09-02', -50000, 'conciliado', 'TED-CRÉDITO EM CONTA -  TRANSFERÊNCIA SINTÉTICA PARTE 2'),
      ofx('e7', '2031-09-03', -3.97, 'sem_vinculo', 'COBRANÇA DE I.O.F. - IOF SALDO DEVEDOR CONTA'),
    ]),
  ];
  const sistema = [
    sis('s1', '2031-09-01', -99999999.99, { competencia: '2031-08-01' }),
    sis('s3', '2031-09-01', 1234.56, { descricao: 'Venda de Bezerros Desmamados', subcentro: 'Venda de Animais', fornecedor: 'Comprador Sintético de Bezerros' }),
    ...(poucos ? [] : [
      sis('s4a', '2031-08-29', -7500, { descricao: 'Manutenção de Cercas · Parte 1' }),
      sis('s4b', '2031-09-02', -5000, { descricao: 'Manutenção de Cercas · Parte 2' }),
      sis('s5', '2031-09-02', -100000, { descricao: 'Transferência Sintética entre Contas', centro: 'Bancário', subcentro: 'Transferência entre Contas Bancárias' }),
      sis('s8', '2031-09-03', -2561.6, { status: 'sem_vinculo', descricao: 'Parcela do Contrato Sintético de Custeio Agrícola' }),
    ]),
  ];
  const vinculos = [
    { extrato_id: 'e1', lancamento_id: 's1', valor_aplicado: 99999999.99, tipo_aprovacao: 'manual', grupo_id: null },
    { extrato_id: 'e3', lancamento_id: 's3', valor_aplicado: 1234.56, tipo_aprovacao: 'enriquecido', grupo_id: null },
    ...(poucos ? [] : [
      { extrato_id: 'e4', lancamento_id: 's4a', valor_aplicado: 7500, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g1' },
      { extrato_id: 'e4', lancamento_id: 's4b', valor_aplicado: 5000, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g1' },
      { extrato_id: 'e5', lancamento_id: 's5', valor_aplicado: 50000, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g2' },
      { extrato_id: 'e6', lancamento_id: 's5', valor_aplicado: 50000, tipo_aprovacao: 'agrupamento_manual', grupo_id: 'g2' },
    ]),
  ];
  const candidatos = [
    cand('c1', '2031-09-01', -1234.56),
    ...(poucos ? [] : [cand('c2', '2031-07-10', -99999999.99, { vencido: true, status_transacao: 'agendado' })]),
  ];
  return {
    escopo: { cliente_id: 'cli', conta_id: 'cc1', ano_mes: '2031-09', nome_conta: 'Banco Exemplo Agro Cooperativa de Crédito Rural - Conta Movimento Principal da Sede' },
    saldos: { inicial: 1, final_oficial: -99999999.99, periodo_ini: '2031-09-01', periodo_fim: '2031-09-30', extrato_ini: '2031-09-01', extrato_fim: '2031-09-30' },
    ofx_completo: ofxs, sistema_completo: sistema, vinculos, sistema_candidatos: candidatos, versao: 'bancada', gerado_em: 'bancada',
  };
}
