/**
 * REBANHO-ORGAO-01 (F3) — um Comprovante de Saldo e um Extrato da IAGRO INVENTADOS, já em linhas (o que o `montarLinhas` devolve do PDF),
 * para o teste da tela e a bancada do gate. Nomes, fichas e números fictícios: dado de cliente nunca entra aqui.
 */
export const COMPROVANTE_FICTICIO: readonly string[] = [
  'GOVERNO DO ESTADO DE MATO GROSSO DO SUL', 'AGÊNCIA ESTADUAL DE DEFESA SANITÁRIA ANIMAL E VEGETAL - IAGRO', 'Comprovante de Saldo',
  'Produtor: | PRODUTOR FICTICIO | Situação: | ATIVO', 'Propriedade: | FAZENDA EXEMPLO | PGA: | 500000000000001',
  'Inscrição: | 111111111 | Vacina Aftosa:', 'Município: | CIDADE EXEMPLO | Vacina Aftosa:', 'Região/ZF: | PLANALTO | Vacina Brucelose: | 06/06/2026',
  'Espécie: | TODAS - COM SALDO', 'Fêmeas 0012 sem vacinação contra brucelose: | 0',
  'Espécie | Sexo | Faixa | Saldo Disponivel | Saldo a Confirmar | Saldo Total',
  '0 A 12 MESES | 10 | 5 | 15', '13 A 24 MESES | 20 | 0 | 20', 'FÊMEA', '25 A 36 MESES | 30 | 0 | 30', 'ACIMA DE 36 MESES | 40 | 0 | 40',
  'BOVINO | 0 A 12 MESES | 11 | 0 | 11', '13 A 24 MESES | 2 | 0 | 2', 'MACHO', '25 A 36 MESES | 3 | 0 | 3', 'ACIMA DE 36 MESES | 4 | 0 | 4', 'Total: | 125',
  'Saldo constante em | 23/11/2026 11:37:31', 'Total Geral: 125', 'Data e Hora de Emissão: | 23/11/2026 11:37 | Páginas: | 1 de 1',
];
/** O que não é nem comprovante nem extrato (a tela recusa e nada grava). */
export const PDF_QUALQUER: readonly string[] = ['NOTA FISCAL ELETRÔNICA', 'Emitente: | QUALQUER LTDA'];
