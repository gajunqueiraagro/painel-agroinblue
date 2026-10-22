/**
 * CAD-CONTAS-BANCARIAS-01 — o aviso "esta conta mudou": quem ouve o cliente recebe o id salvo; outro cliente nao; cancelar para de ouvir.
 */
import { describe, it, expect } from 'vitest';
import { avisarContaBancariaMudou, ouvirContasBancarias } from './canalContasBancarias';

describe('CAD-CONTAS-BANCARIAS-01 — o canal das contas', () => {
  it('C1 so o cliente certo, ate cancelar', () => {
    const a: string[] = []; const b: string[] = [];
    const parar = ouvirContasBancarias('cli', id => a.push(id));
    ouvirContasBancarias('outro', id => b.push(id));
    avisarContaBancariaMudou('cli', 'c1');
    parar();
    avisarContaBancariaMudou('cli', 'c2');
    expect(a).toEqual(['c1']);
    expect(b).toEqual([]);
  });
});
