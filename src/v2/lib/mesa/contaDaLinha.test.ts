/**
 * O que este teste trava — as duas regras que, somadas, apagaram vinte contas.
 *
 * ⚠ ELE NASCE DE DADO, não de hipótese: em 16/09/2026 a Mesa zerou `conta_destino_id` de 20
 * entradas do Santa Rita já conciliadas ao OFX (Bradesco 11, BB 5, Itaú 4). O cabeçalho do Espelho
 * divergia em 3.513,91, 1.376.903,25 e 5,93 — as três diferenças eram o mesmo defeito.
 * ⚠ A CAUSA MAIOR ERA DA RPC (`ELSE NULL` incondicional, corrigido na 20261027121700). Estas duas
 * regras do front são a outra metade: a Mesa procurava a conta na coluna errada do Excel e a
 * gravava na coluna errada do lançamento.
 */
import { describe, it, expect } from 'vitest';
import { contaDaLinha, patchDaConta } from '@/v2/lib/mesa/contaDaLinha';
import type { ContaResolvivel } from '@/v2/lib/mesa/resolverConta';

/* ⚠ OS APELIDOS SÃO OS DO CADASTRO REAL, com acento: é assim que eles estão em
   `financeiro_contas_bancarias.aliases`, e é assim que a planilha os escreve. O resolvedor
   normaliza acento dos dois lados — o teste usa o texto de verdade para não provar o contrário. */
const CONTAS: ContaResolvivel[] = [
  { id: 'bb', nome_conta: 'Banco do Brasil', nome_exibicao: null, banco: 'BB',
    agencia: null, numero_conta: null, aliases: ['cc-001 | banco do brasil pecuária'] },
  { id: 'bradesco', nome_conta: 'Banco Bradesco', nome_exibicao: null, banco: 'Bradesco',
    agencia: null, numero_conta: null, aliases: ['cc-002 | bradesco pecuária'] },
];

const ORIGEM_BB = 'cc-001 | banco do brasil pecuária';
const DESTINO_BRADESCO = 'cc-002 | bradesco pecuária';
/** O que a planilha põe no destino de uma ENTRADA: não é conta de ninguém. */
const TERCEIROS = 'terceiros | . .';

describe('qual coluna do Excel é a conta', () => {
  it('origem resolve e destino não — a conta é a origem', () => {
    /* ⚠ É O CASO DA ENTRADA, e o que a Mesa não enxergava: ela lia só o destino, que aqui é
       "terceiros". Medido no staging: 2.438 linhas do cliente com esse destino. */
    const r = contaDaLinha(ORIGEM_BB, TERCEIROS, CONTAS);
    expect(r.contaId).toBe('bb');
    expect(r.ehTransferencia).toBe(false);
    expect(r.textoNaoReconhecido).toBeNull();
  });

  it('origem não resolve e destino sim — a conta é o destino', () => {
    const r = contaDaLinha('fornecedor qualquer', DESTINO_BRADESCO, CONTAS);
    expect(r.contaId).toBe('bradesco');
    expect(r.ehTransferencia).toBe(false);
  });

  it('as duas resolvem — é transferência, e o par se preserva', () => {
    const r = contaDaLinha(ORIGEM_BB, DESTINO_BRADESCO, CONTAS);
    expect(r.ehTransferencia).toBe(true);
    expect(r.origemId).toBe('bb');
    expect(r.destinoId).toBe('bradesco');
    /* ⚠ `contaId` FICA NULO NUMA TRANSFERÊNCIA: ali não existe "a conta", existem duas. Devolver
       uma delas faria quem lê escolher a errada metade das vezes. */
    expect(r.contaId).toBeNull();
  });

  it('nenhuma resolve — sem proposta, e o texto sobrevive para o aviso', () => {
    /* ⚠ O CASO REAL DAS 95 LINHAS: `cc-001` foi movido para o BB em 15/09 e a planilha continuou
       dizendo Bradesco. O texto não casa com apelido nenhum — e é isso que o operador precisa
       LER, em vez do "—" silencioso que o fez salvar por cima. */
    const r = contaDaLinha('cc-001 | bradesco pecuária', TERCEIROS, CONTAS);
    expect(r.contaId).toBeNull();
    expect(r.ehTransferencia).toBe(false);
    expect(r.textoNaoReconhecido).toBe('cc-001 | bradesco pecuária');
  });

  it('sem texto nenhum não há o que avisar', () => {
    /* "Não reconhecida" é sobre um texto que EXISTE e não casa; ausência não vira aviso. */
    expect(contaDaLinha(null, null, CONTAS).textoNaoReconhecido).toBeNull();
    expect(contaDaLinha('', '   ', CONTAS).textoNaoReconhecido).toBeNull();
  });
});

describe('em qual coluna do lançamento a conta se grava', () => {
  it('entrada grava no destino, e não toca a conta bancária', () => {
    const p = patchDaConta('1-Entradas', 'bb');
    expect(p).toEqual({ conta_destino_id: 'bb' });
    expect('conta_bancaria_id' in p).toBe(false);
  });

  it('saída grava na conta bancária, e não toca o destino', () => {
    const p = patchDaConta('2-Saídas', 'bb');
    expect(p).toEqual({ conta_bancaria_id: 'bb' });
    expect('conta_destino_id' in p).toBe(false);
  });

  /**
   * ⚠ O CASO QUE JUSTIFICA O ARQUIVO. O editor mandava `conta_bancaria_id: id || null`: Resultado
   * vazio propunha APAGAR. Vazio é "não tenho proposta", nunca "apague o que está lá" — e foi
   * essa leitura que deixou vinte contas conciliadas serem apagadas sem ninguém perceber.
   */
  it('Resultado vazio não escreve nenhuma das duas chaves', () => {
    for (const vazio of [null, undefined, '', '   ']) {
      const p = patchDaConta('1-Entradas', vazio);
      expect(p, String(vazio)).toEqual({});
    }
    expect(patchDaConta('2-Saídas', null)).toEqual({});
  });

  it('transferência continua gravando a origem neste campo', () => {
    /* O destino tem campo próprio; mexer aqui mudaria um fluxo que funciona. */
    expect(patchDaConta('3-Transferências', 'bb')).toEqual({ conta_bancaria_id: 'bb' });
  });
});
