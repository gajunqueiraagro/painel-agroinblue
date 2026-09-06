/**
 * As formas de pagamento oferecidas nas telas da OC — OC-VENCIMENTO-EDITAVEL (125).
 *
 * ⚠ MOVIDA VERBATIM de `DialogoGerarCompromissos`, onde nasceu privada. A linha da parcela
 * passou a oferecer as mesmas opções, e duas listas iguais em arquivos diferentes divergem
 * na primeira vez que alguém acrescenta uma forma num só lugar — e aí a parcela gerada pelo
 * diálogo não caberia no select que a edita.
 * ⚠ TEXTO LIVRE NO BANCO: `zoo_operacao_parcelas_programacao.forma` é `text` sem CHECK.
 * Esta lista é o vocabulário da tela, não uma restrição do dado — uma parcela antiga pode
 * ter forma fora dela, e o select precisa mostrar o que está gravado em vez de apagá-lo.
 */
export const FORMAS_PAGAMENTO = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cheque'];
