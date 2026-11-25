/* CARTAO-FATURA-IMPORT-01 — a fatura do cartão na bancada (`&v=fatura`): linhas de PDF SINTÉTICAS no leiaute Ourocard (nomes e valores
   inventados; os nomes compridos são o pior caso das colunas), os lançamentos que já estão no sistema (um em cada grupo do mock) e o
   histórico de 12 meses (sugestão; o "Mercado Pago" misto = classificar). Nada disto é dado de cliente. */
export const FATURA_BANCADA = [
  'Titular Exemplo', 'OUROCARD VISA | Final 1234', 'Vencimento', '16/10/2031 | Pagamentos/Créditos | R$ -1.018,00',
  'Fatura fechada em | 05/10/2031', 'Titular Exemplo (Cartão 1234)', 'Data | Descrição | País | Valor',
  'SALDO FATURA ANTERIOR | BR | R$ 1.000,00',
  'Pagamentos/Créditos',
  '16/09 | PGTO DEBITO CONTA 0001 000000001 200 | BR | R$ -1.000,00',
  '02/10 | DESC AUTOMATICO ANUD. TIT-PARC 06/12 | BR | R$ -18,00',
  'Serviços',
  '03/09 | POSTO DE COMBUSTIVEL EXEMPLO DA RODOVIA | CAMPO GRANDE | BR | R$ 1.290,21',
  '05/09 | DISTRIBUIDORA DE PECAS AGRICOLAS EXEMPLO | CAMPO GRANDE | BR | R$ 730,00',
  '06/09 | FERRAGEM CENTRAL EXEMPLO | CAMPO GRANDE | BR | R$ 299,69',
  '08/09 | SUPERMERCADO EXEMPLO LOJA 80 | CAMPO GRANDE | BR | R$ 412,90',
  '09/09 | NUTRICAO ANIMAL EXEMPLO | CAMPO GRANDE | BR | R$ 1.080,00',
  '10/09 | MERCADOPAGO*LOJAVIRTUALEXEMPLOCOMPRIDA | OSASCO | BR | R$ 184,10',
  '12/09 | AUTO ELETRICA EXEMPLO | CAMPO GRANDE | BR | R$ 95,00',
  '14/09 | TRANSPORTE POR APLICATIVO | SAO PAULO | BR | R$ 22,37',
  '15/09 | TRANSPORTE POR APLICATIVO | SAO PAULO | BR | R$ 10,66',
  'Outros lançamentos',
  '22/09 | IOF - COMPRA NO EXTERIOR | R$ 17,50',
  '02/10 | ANUIDADE DIFERENCIADA TIT-PARC 06/12 | BR | R$ 18,00',
  'Compras parceladas',
  '02/05 | MAQUINAS EXEMPLO PARC 03/04 CAMPO GRANDE | BR | R$ 860,00',
  '20/08 | REVESTIMENTOS EXEMPLO PARC 02/03 CAMPO GRANDE | BR | R$ 708,26',
  '10/07 | ENERGIA SOLAR EXEMPLO PARC 04/06 CAMPO GRANDE | BR | R$ 430,21',
  'Total da Fatura | R$ 6.140,90',
];

/* CARTAO-FATURA-GRAVAR: a hora da leitura (`updated_at`, o `lido_em` do mover/ajustar) e a fazenda do histórico (a sugestão do D1) */
const L = (id: string, conta: string, venc: string, comp: string, valor: number, descricao: string, plano: string | null = null, status = 'programado',
  fazenda: string | null = null) => ({
  id, conta_bancaria_id: conta, data_vencimento: venc, data_competencia: comp, valor, descricao, favorecido_id: null, status_transacao: status,
  tipo_operacao: '2-Saídas', plano_conta_id: plano, updated_at: '2031-10-01T10:00:00.123456+00:00', fazenda_id: fazenda,
});
/* os já lançados (um por grupo) e o histórico (vencimento antigo: fora da janela de casar) — a bancada devolve as duas leituras juntas */
export const LANCAMENTOS_DA_FATURA = [
  L('f-ja', 'car', '2031-10-16', '2031-09-03', 1290.21, 'Posto de combustível exemplo da rodovia'),
  L('f-mover-cc', 'cc1', '2031-09-05', '2031-09-05', 730, 'Distribuidora de peças agrícolas exemplo', null, 'realizado'),
  L('f-mover-cc2', 'cc2', '2031-10-06', '2031-09-06', 299.69, 'Ferragem central exemplo'),
  { ...L('f-parc', 'car', '2031-10-16', '2031-05-02', 860, 'Maquinas Exemplo 3/4'), financiamento_id: 'fin-exemplo' },
  L('f-dif', 'car', '2031-10-16', '2031-08-20', 448.25, 'Revestimentos Exemplo 2/3'),
  L('h1', 'car', '2031-03-16', '2031-03-02', 401.11, 'Supermercado exemplo', 'pl-ali', 'realizado', 'faz-a'),
  L('h2', 'car', '2031-04-16', '2031-04-02', 402.22, 'Supermercado exemplo', 'pl-ali', 'realizado', 'faz-a'),
  L('h3', 'cc1', '2031-02-10', '2031-02-10', 1001.33, 'Nutrição animal exemplo', 'pl-nut', 'realizado', 'faz-b'),
  /* o transporte sem fazenda no histórico: a sugestão traz a conta e a linha fica "falta fazenda" (D1) */
  L('h4', 'car', '2031-03-16', '2031-03-01', 21.44, 'Transporte por aplicativo', 'pl-comb', 'realizado'),
  L('h5', 'car', '2031-03-16', '2031-03-05', 11.55, 'Transporte por aplicativo', 'pl-comb', 'realizado'),
  L('h6', 'car', '2031-03-16', '2031-03-06', 150.01, 'MercadoPago*lojavirtualexemplocomprida', 'pl-ali', 'realizado'),
  L('h7', 'car', '2031-04-16', '2031-04-06', 160.02, 'MercadoPago*lojavirtualexemplocomprida', 'pl-pec', 'realizado'),
];
const P = (id: string, subcentro: string, escopo: string | null = null, tipo = '2-Saídas') => ({ id, cliente_id: 'cli', tipo_operacao: tipo, macro_custo: 'Custeio',
  grupo_custo: null, centro_custo: 'Exemplo', subcentro, escopo_negocio: escopo, ativo: true, ordem_exibicao: 1, compoe_dre: true });
/* D5: "Despesas Financeiras Administrativo" (administrativa → a fazenda Administrativo, forçada) recebe os encargos sem histórico */
export const PLANO_DA_FATURA = [P('pl-ali', 'Alimentação e cantina da sede'), P('pl-nut', 'Nutrição'), P('pl-comb', 'Combustível veículos administrativos'), P('pl-pec', 'Peças'),
  P('pl-dfa', 'Despesas Financeiras Administrativo', 'administrativo'), P('pl-est', 'Estornos e devoluções de compras', null, '1-Entradas')];

/* CARTAO-FATURA-GRAVAR — as fazendas (o nome mais comprido é o pior caso do seletor) e as respostas do banco, no TETO:
   `&v=fatura` a prévia limpa; `&v=fatura-recusa` a 1ª prévia recusa o mover (realizado), a 2ª passa sem ele; `&v=fatura-gravada` a fatura
   já gravada (o "Desfazer gravação": 15 voltam, 1 fica). */
export const FAZENDAS_DA_FATURA = [{ id: 'faz-a', nome: 'Fazenda Boa Vista do Campo Grande', cliente_id: 'cli' },
  { id: 'faz-b', nome: 'Faz. Serra Exemplo', cliente_id: 'cli' }, { id: 'faz-adm', nome: 'Administrativo', cliente_id: 'cli' }];
export const GRAVACAO_DA_FATURA = [{ id: 'grav-1', feita_em: '2031-10-20T13:00:00+00:00' }];
let prevista = 0;
export function gravarDaBancada(v: string, a: { p_simular?: boolean; p_itens?: { ordem: number; gesto: string }[] }) {
  const itens = a.p_itens ?? [];
  if (v === 'fatura-recusa' && a.p_simular && prevista++ === 0) {
    return { ok: false, simulado: true, recusadas: 1, itens: itens.map((i) => ({ ordem: i.ordem, gesto: i.gesto,
      recusa: i.gesto === 'mover' ? { motivo: 'realizado', frase: 'Já está realizado: resolva no Editar.' } : null })) };
  }
  const n = (g: string) => itens.filter((i) => i.gesto === g).length;
  return { ok: true, simulado: !!a.p_simular, gravacao_id: a.p_simular ? null : 'grav-1', lancar: n('lancar'), mover: n('mover'), ajustar: n('ajustar'),
    soma: 9999999.99, itens: [] };
}
export const desfazerDaBancada = (a: { p_simular?: boolean }) => ({ ok: true, simulado: !!a.p_simular, voltaram: 15,
  ficaram: [{ ordem: 4, gesto: 'lancar', motivo: 'mudou', frase: 'O lançamento mudou depois da gravação: fica (resolva no Editar).' }] });
