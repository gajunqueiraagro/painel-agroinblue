/* FIN-MODAL-FAZENDA-TRAVA-01 — o VOLUME do NJ em 21/10/2026, SINTÉTICO (nenhum nome real): 2.356 fornecedores ativos + 861
   mesclados (com fantasia, documento e apelidos), 5 fazendas e ~3.000 lançamentos. Mede o modal do lançamento por cima da lista. */
const PAL = ['Agro', 'Comercial', 'Transportes', 'Cooperativa', 'Posto', 'Mecânica', 'Veterinária', 'Insumos', 'Rural', 'Pecuária'];
export function volumeNJ() {
  const fornecedores = Array.from({ length: 2356 + 861 }, (_, i) => {
    const mescl = i >= 2356;
    return { id: `fv${i}`, cliente_id: 'cli', nome: `${PAL[i % 10]} Exemplo ${PAL[(i * 7) % 10]} ${i} Ltda`, nome_fantasia: i % 3 ? `Fantasia ${i}` : null,
      cpf_cnpj: i % 4 ? String(10000000000000 + i * 7919).slice(0, 14) : null, fazenda_id: null, ativo: !mescl,
      fundido_em_id: mescl ? `fv${i % 2356}` : null, tipo_recebimento: null,
      aliases: i % 5 ? [`APELIDO ${i}`, `OUTRO NOME ${i}`] : [], aliases_norm: i % 5 ? [`apelido ${i}`, `outro nome ${i}`] : [] };
  });
  const fazendas = [{ id: 'f-pur', nome: 'Faz. Pureza' }, { id: 'f-exp', nome: 'Faz. Sto. Expedito' }, { id: 'f-ter', nome: 'Faz. Sta. Tereza' },
    { id: 'f-ret', nome: 'Retiro Agricultura' }, { id: 'f-adm', nome: 'Administrativo' }].map((f) => ({ ...f, cliente_id: 'cli' }));
  const lancamentos = Array.from({ length: Number((globalThis as any).__nLanc ?? 3000) }, (_, i) => {
    const dia = String(1 + (i % 28)).padStart(2, '0'); const mes = String(1 + (i % 10)).padStart(2, '0');
    const status = ['previsto', 'programado', 'agendado', 'realizado'][i % 4];
    return { id: `lv${i}`, cliente_id: 'cli', fazenda_id: fazendas[i % 5].id, ano_mes: `2026-${mes}`, cancelado: false, cenario: 'realizado', origem_lancamento: 'manual',
      tipo_operacao: i % 5 === 4 ? '1-Entradas' : '2-Saídas', sinal: i % 5 === 4 ? 1 : -1, valor: 100 + (i * 37) % 9000,
      status_transacao: status, data_competencia: `2026-${mes}-${dia}`, data_vencimento: `2026-${mes}-${dia}`, data_pagamento: status === 'realizado' ? `2026-${mes}-${dia}` : null,
      descricao: `Lançamento exemplo ${i}`, favorecido_id: `fv${i % 2356}`, macro_custo: 'Custeio Produtivo', grupo_custo: 'Nutrição', centro_custo: 'Suplementação',
      subcentro: 'Nutrição Engorda', escopo_negocio: 'pecuaria', numero_documento: i % 3 ? null : String(1000 + i), tipo_documento: i % 3 ? null : 'Nota Fiscal',
      conta_bancaria_id: 'bb', conta_destino_id: null, sem_movimentacao_caixa: false, compoe_dre: true, created_at: '2026-10-01T12:00:00Z' };
  });
  return { fornecedores, fazendas, lancamentos };
}
