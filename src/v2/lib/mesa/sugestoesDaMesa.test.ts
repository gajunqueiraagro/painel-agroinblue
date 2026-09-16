/**
 * O que este teste trava — a ÚNICA heurística nova do PR-MESA-SUGESTOES-01.
 *
 * ⚠ AS OUTRAS DUAS PORTAS DA TRANSFERÊNCIA SÃO DADO, não palpite: a planilha dizendo o tipo, e o
 * subcentro resolvido sendo a 18010. Elas não precisam de teste próprio porque não decidem nada —
 * repassam o que já está gravado. O TEXTO é a única que adivinha, e por isso é a única que pode
 * errar de um jeito que ninguém percebe.
 * ⚠ E É POR ISSO QUE O RESULTADO DELA É ÂMBAR, NUNCA GRAVAÇÃO: "Aplicação de recursos em
 * fertilizante" casa aqui e não é transferência nenhuma. O caso está escrito abaixo, e ele não é
 * um bug a consertar — é o motivo de a proposta precisar do clique do operador.
 *
 * ⚠ O QUE ESTE ARQUIVO NÃO COBRE, e fica dito: a composição dentro do `toRowVM` (safra sugerida e
 * as três portas juntas). A linha crua da view tem 87 campos obrigatórios e nenhum teste da casa
 * monta uma; as peças que ela compõe — `safraSugerida`, `escopoDoSubcentro` e
 * `subcentroDeTransferencia` — têm testes próprios. A ligação entre elas é homologação.
 */
import { describe, it, expect } from 'vitest';
import { textoSugereTransferencia } from '@/v2/lib/mesa/enriquecimentoView';

describe('o texto que denuncia uma transferência', () => {
  it('pega as grafias que o extrato traz de verdade', () => {
    /* ⚠ RADICAL, NÃO PALAVRA INTEIRA: é o que faz "aplicação", "aplicacao" e "aplicou" caírem no
       mesmo `aplica`. Casar palavra inteira deixaria metade das grafias de fora. */
    for (const t of [
      'Aplicação BB Rende Fácil',
      'APLICACAO AUTOMATICA',
      'Resgate aplicação CDB',
      'RESGATOU INVESTIMENTO',
      'Transferência entre contas',
      'TRANSF ONLINE',
      'transferencia recebida',
    ]) {
      expect(textoSugereTransferencia(t), t).toBe(true);
    }
  });

  it('não pega o que não é', () => {
    for (const t of [
      'Pagamento fornecedor',
      'Compra de fertilizante',
      'Folha de pagamento',
      'DARF',
      null,
      undefined,
      '',
    ]) {
      expect(textoSugereTransferencia(t), String(t)).toBe(false);
    }
  });

  it('olha todos os textos que recebe, e basta um casar', () => {
    expect(textoSugereTransferencia(null, 'Resgate CDB')).toBe(true);
    expect(textoSugereTransferencia('Compra', null)).toBe(false);
  });

  /**
   * ⚠ O FALSO POSITIVO ESTÁ AQUI DE PROPÓSITO, e trava a decisão de produto: este teste AFIRMA
   * que "Aplicação de recursos em fertilizante" casa. Não é defeito — é a razão de a sugestão ser
   * proposta em âmbar e não gravação. Se alguém um dia fizer a heurística gravar sozinha, é este
   * caso que mostra o estrago.
   */
  it('casa texto que NÃO é transferência — por isso a proposta é âmbar, não gravação', () => {
    expect(textoSugereTransferencia('Aplicação de recursos em fertilizante')).toBe(true);
  });
});
