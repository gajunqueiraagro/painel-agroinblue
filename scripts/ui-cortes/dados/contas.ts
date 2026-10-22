/* CAD-CONTAS-BANCARIAS-01 — as contas bancarias da bancada: SINTETICAS (nomes, numeros e pessoas inventados), no desenho do mock aprovado
   (5 correntes com o caixa fisico, 1 investimento) + o pior caso (`&n=longo`): nome, banco, gerente e telefone maiores que os reais, uma
   conta inativa, um cartao e o saldo de 999.999.999,99. */
const base = { cliente_id: 'cli', fazenda_id: 'f1', ativa: true, sem_extrato_bancario: false, conta_digito: null, aliases: null,
  consolida_em_conta_id: null, mes_inicio: '2024-01', saldo_inicial_oficial: 0, updated_at: '2026-10-18T12:00:00Z' };
export const CONTAS = [
  { ...base, id: 'k1', codigo_conta: '01', tipo_conta: 'cc', nome_conta: 'Banco Exemplo Prime', banco: 'Itaú', agencia: '5596', numero_conta: '03722',
    conta_digito: '5', gerente_nome: 'Gerente Exemplo Silva', gerente_celular: '(18) 99712-4410', gerente_telefone: '(18) 3221-0450',
    gerente_email: 'gerente.exemplo@banco.exemplo.com.br', gerente_desde: '2025-03-15', titular_nome: 'Titular Exemplo', titular_documento: '000.000.000-00',
    chave_pix: 'e-mail cadastrado', observacao: 'Conta principal; folha e fornecedores saem daqui.', agencia_endereco: 'Av. Exemplo, 1200 · Centro',
    agencia_cidade_uf: 'Cidade Exemplo · SP', agencia_telefone: '(18) 3221-0400', agencia_outro_contato: 'Assistente: ramal 212',
    agencia_observacao: 'Mandar comprovante de TED acima de R$ 50.000,00 por e-mail antes das 15h.', formato_extrato: 'ofx',
    aliases: ['BANCO EXEMPLO PRIME', 'Exemplo 5596/03722-5', 'Prime ADM'], saldo_inicial_oficial: 48210.37 },
  { ...base, id: 'k2', codigo_conta: '02', tipo_conta: 'cc', nome_conta: 'Conta Fazenda', banco: 'Bradesco', agencia: null, numero_conta: null },
  { ...base, id: 'k3', codigo_conta: '03', tipo_conta: 'cc', nome_conta: 'Corretora Exemplo', banco: 'BTG', agencia: null, numero_conta: null },
  { ...base, id: 'k4', codigo_conta: '04', tipo_conta: 'cc', nome_conta: 'Dinheiro', banco: 'Dinheiro', agencia: null, numero_conta: null, sem_extrato_bancario: true },
  { ...base, id: 'k5', codigo_conta: '05', tipo_conta: 'cc', nome_conta: 'Bradesco Pessoal', banco: 'Bradesco', agencia: null, numero_conta: null,
    mes_inicio: null, saldo_inicial_oficial: null },
  { ...base, id: 'k6', codigo_conta: '01', tipo_conta: 'inv', nome_conta: 'Exemplo CDI', banco: 'Itaú', agencia: '5596', numero_conta: '03722', conta_digito: '5',
    gerente_nome: 'Gerente Exemplo Silva', gerente_celular: '(18) 99712-4410', saldo_inicial_oficial: 286904.12, consolida_em_conta_id: 'k1' },
];
export const CONTAS_LONGAS = [
  ...CONTAS,
  { ...base, id: 'k7', codigo_conta: '06', tipo_conta: 'cc', nome_conta: 'Conta Movimento Exemplo da Fazenda Santa Maria do Retiro Grande',
    banco: 'Banco Cooperativo Exemplo de Credito Rural', agencia: '12345', numero_conta: '1234567890', conta_digito: 'X',
    gerente_nome: 'Maria Aparecida dos Santos Pereira de Albuquerque', gerente_celular: '(18) 99999-9999', saldo_inicial_oficial: 999999999.99 },
  { ...base, id: 'k8', codigo_conta: '07', tipo_conta: 'cc', nome_conta: 'Conta Antiga Encerrada', banco: 'Bradesco', agencia: '0001', numero_conta: '99', ativa: false },
  { ...base, id: 'k9', codigo_conta: '01', tipo_conta: 'cartao', nome_conta: 'Cartão Corporativo Exemplo', banco: 'Itaú', agencia: null, numero_conta: null },
];
export const BANCOS = [
  { codigo_banco: '001', nome_banco: 'Banco do Brasil', nome_curto: 'BB' }, { codigo_banco: '341', nome_banco: 'Itaú Unibanco', nome_curto: 'Itaú' },
  { codigo_banco: '237', nome_banco: 'Bradesco', nome_curto: 'Bradesco' }, { codigo_banco: '208', nome_banco: 'BTG Pactual', nome_curto: 'BTG' },
  { codigo_banco: '000', nome_banco: 'Dinheiro/Caixa', nome_curto: 'Dinheiro' },
];
export const PAINEL = {
  extratos: { quantos: 32, primeiro: '2024-01-01', ultimo: '2026-08-31' }, lancamentos: { quantos: 1284, primeiro: '2024-01-03', ultimo: '2026-09-30' },
  recorrencias: { quantos: 9, primeiro: '2024-02-01', ultimo: '2026-10-01' }, ultima_alteracao: { em: '2026-10-18T12:00:00Z', por: 'u1' },
};
/* a régua do ano da Conciliação para a conta k1: 21 meses conciliados até 08/2026 */
export const reguaDoAno = (ano: number) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
  .filter(m => m >= '2024-01' && m <= '2026-08').slice(ano === 2024 ? 3 : 0)
  .map(m => ({ ano_mes: m, nivel: 'conta', conta_id: 'k1', conta_nome: 'Banco Exemplo Prime', status: 'conciliado', motivos: [], avisos: [] }));
