import { describe, it, expect } from 'vitest';
import { valorComumDasParcelas, textoDasParcelas, VARIA_ENTRE_AS_PARCELAS } from './valorDasParcelas';

describe('valorComumDasParcelas — o que as parcelas dizem de um campo que é delas', () => {
  it('sem parcela lida: sem_parcelas', () => {
    expect(valorComumDasParcelas([])).toEqual({ tipo: 'sem_parcelas' });
  });
  it('todas iguais: o valor', () => {
    expect(valorComumDasParcelas(['Boleto', 'Boleto', 'Boleto'])).toEqual({ tipo: 'igual', valor: 'Boleto' });
  });
  it('nulo, indefinido e vazio são a MESMA ausência', () => {
    expect(valorComumDasParcelas([null, undefined, '', '  '])).toEqual({ tipo: 'igual', valor: '' });
  });
  it('uma diferente: varia', () => {
    expect(valorComumDasParcelas(['Boleto', 'PIX'])).toEqual({ tipo: 'varia' });
    expect(valorComumDasParcelas(['Boleto', null])).toEqual({ tipo: 'varia' });
  });
});

describe('textoDasParcelas — o que o campo em leitura mostra', () => {
  it('"—" só para dado ausente; "todas sem o dado" é a palavra da casa', () => {
    expect(textoDasParcelas({ tipo: 'sem_parcelas' }, 'Nenhuma')).toBe('—');
    expect(textoDasParcelas({ tipo: 'igual', valor: '' }, 'Nenhuma')).toBe('Nenhuma');
  });
  it('varia: a frase única', () => {
    expect(textoDasParcelas({ tipo: 'varia' }, 'Nenhuma')).toBe(VARIA_ENTRE_AS_PARCELAS);
    expect(VARIA_ENTRE_AS_PARCELAS).toBe('varia entre as parcelas');
  });
  it('igual: o valor, traduzido pelo rótulo quando há', () => {
    expect(textoDasParcelas({ tipo: 'igual', valor: 'Boleto' }, 'Nenhuma')).toBe('Boleto');
    expect(textoDasParcelas({ tipo: 'igual', valor: 'cria' }, 'Todas (rateia)', (v) => v.toUpperCase())).toBe('CRIA');
  });
});
