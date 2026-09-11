/**
 * O que torna uma área plantada gravável — AGRI-AREA-PLANTADA-01.
 *
 * ⚠ ESTES TESTES EXISTEM PORQUE O BANCO NÃO PEGA A METADE DISSO: o CHECK dele exige área
 * positiva e a UNIQUE recusa a cultura repetida, mas nenhum dos dois sabe que o talhão não
 * pode ser maior que o pasto, nem que "96,4" é noventa e seis vírgula quatro.
 */
import { describe, it, expect } from 'vitest';
import {
  validarAreaPlantada, culturaDuplicada, somaAreas, labelDaCultura, CULTURAS_AREA,
  primeiroDiaDoMes, safrasQueCobremOMes, safraInicialDoMes,
  type AreaPlantadaForm,
} from './areaPlantada';

const base: AreaPlantadaForm = {
  id: null, cultura: 'amendoim', areaHa: '96,4', dataPlantio: '', dataColheitaPrevista: '',
};

describe('validarAreaPlantada', () => {
  it('caminho feliz: a área vem em pt-BR e sai número', () => {
    const r = validarAreaPlantada(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.area_plantada_ha).toBe(96.4);
      expect(r.payload.cultura).toBe('amendoim');
      expect(r.payload.data_plantio).toBeNull();
    }
  });

  it('⚠ vírgula decimal não vira NaN — era o defeito clássico do Number()', () => {
    const r = validarAreaPlantada({ ...base, areaHa: '1.234,56' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.area_plantada_ha).toBe(1234.56);
  });

  it('sem cultura não grava', () => {
    expect(validarAreaPlantada({ ...base, cultura: '' }).ok).toBe(false);
  });

  it('cultura fora da lista não grava — o CHECK do banco recusaria de qualquer jeito', () => {
    expect(validarAreaPlantada({ ...base, cultura: 'trigo' }).ok).toBe(false);
  });

  it.each(['', '0', '0,00', 'abc', '-5'])('área %o não é área', (v) => {
    expect(validarAreaPlantada({ ...base, areaHa: v }).ok).toBe(false);
  });

  it('⚠ talhão maior que o pasto é recusado, e é o engano que a sugestão provoca', () => {
    /* A linha nasce com a área produtiva do pasto; ao acrescentar a segunda cultura, somam-se
       dois talhões inteiros num pasto que só tem um. */
    const r = validarAreaPlantada({ ...base, areaHa: '120' }, 96.4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('maior que a área do pasto');
  });

  it('igual à área do pasto passa, e o centésimo de tolerância também', () => {
    expect(validarAreaPlantada({ ...base, areaHa: '96,4' }, 96.4).ok).toBe(true);
    expect(validarAreaPlantada({ ...base, areaHa: '96,41' }, 96.4).ok).toBe(true);
    expect(validarAreaPlantada({ ...base, areaHa: '96,5' }, 96.4).ok).toBe(false);
  });

  it('pasto sem área cadastrada não limita nada — ausência não vira teto zero', () => {
    expect(validarAreaPlantada({ ...base, areaHa: '500' }, null).ok).toBe(true);
    expect(validarAreaPlantada({ ...base, areaHa: '500' }, 0).ok).toBe(true);
  });

  it('colheita antes do plantio é recusada; uma data só é incompleto, não inválido', () => {
    expect(validarAreaPlantada({ ...base, dataPlantio: '2025-11-01', dataColheitaPrevista: '2025-03-01' }).ok)
      .toBe(false);
    expect(validarAreaPlantada({ ...base, dataPlantio: '2025-11-01' }).ok).toBe(true);
    expect(validarAreaPlantada({ ...base, dataColheitaPrevista: '2026-03-01' }).ok).toBe(true);
  });

  it('as datas preenchidas chegam ao payload como vieram', () => {
    const r = validarAreaPlantada({ ...base, dataPlantio: '2025-11-01', dataColheitaPrevista: '2026-03-20' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.data_plantio).toBe('2025-11-01');
      expect(r.payload.data_colheita_prevista).toBe('2026-03-20');
    }
  });
});

describe('culturaDuplicada — o que a UNIQUE do banco recusaria', () => {
  it('acha a repetida e a nomeia', () => {
    expect(culturaDuplicada([base, { ...base, id: null }])).toBe('amendoim');
  });

  it('duas culturas diferentes no mesmo pasto são a safrinha, e passam', () => {
    expect(culturaDuplicada([base, { ...base, cultura: 'milho' }])).toBeNull();
  });

  it('linha ainda em branco não conta como repetição', () => {
    expect(culturaDuplicada([{ ...base, cultura: '' }, { ...base, cultura: '' }])).toBeNull();
  });
});

describe('somaAreas e rótulos', () => {
  it('soma o que está digitado, em pt-BR', () => {
    expect(somaAreas([{ ...base, areaHa: '60,4' }, { ...base, areaHa: '36' }])).toBeCloseTo(96.4, 2);
  });

  it('linha vazia soma zero em vez de quebrar a conta', () => {
    expect(somaAreas([{ ...base, areaHa: '' }])).toBe(0);
  });

  it('rótulo conhecido vira label; desconhecido volta como veio', () => {
    expect(labelDaCultura('mandioca')).toBe('Mandioca');
    expect(labelDaCultura('trigo')).toBe('trigo');
    expect(labelDaCultura(null)).toBe('—');
  });

  it('⚠ eucalipto NÃO está na lista da lavoura, ainda que o CHECK do banco o aceite', () => {
    /* Ele é silvicultura — família própria de tipo_uso desde 19/08/2026 —, e oferecê-lo aqui
       misturaria duas contas que a arquitetura separou de propósito. */
    expect(CULTURAS_AREA.some(c => c.valor === 'eucalipto')).toBe(false);
    expect(CULTURAS_AREA).toHaveLength(6);
  });
});

describe('a safra que cobre o mês — AGRI-AREA-POR-SAFRA-01', () => {
  /* As sete safras de lavoura do NJ, como estão no proto (medido em 11/09/2026): TODAS com
     ordem_exibicao = 0, e três delas cobrindo exatamente a mesma janela. */
  const SAFRAS = [
    { id: 'a23', data_inicio: '2023-07-01', data_fim: '2024-06-30' }, // 23/24-AMD
    { id: 'a24', data_inicio: '2024-07-01', data_fim: '2025-06-30' }, // 24/25-AMD
    { id: 'a25', data_inicio: '2025-07-01', data_fim: '2026-06-30' }, // 25/26-AMD
    { id: 'l25', data_inicio: '2025-07-01', data_fim: '2026-06-30' }, // 25/26-Lav
    { id: 'm25', data_inicio: '2025-07-01', data_fim: '2026-06-30' }, // 25/26-MAND
    { id: 'a26', data_inicio: '2026-07-01', data_fim: '2027-06-30' }, // 26/27-AMD
    { id: 'sem', data_inicio: null, data_fim: null },                 // anterior ao backfill
  ];

  it('o primeiro dia do mês é o que se compara', () => {
    expect(primeiroDiaDoMes('2025-10')).toBe('2025-10-01');
    expect(primeiroDiaDoMes('2025-10-17')).toBe('2025-10-01');
    expect(primeiroDiaDoMes('')).toBeNull();
    expect(primeiroDiaDoMes('outubro')).toBeNull();
  });

  it('out/25 cai nas três safras da mesma janela, e só nelas', () => {
    expect(safrasQueCobremOMes(SAFRAS, '2025-10').map(s => s.id)).toEqual(['a25', 'l25', 'm25']);
  });

  it('⚠ a virada é em julho — jun/26 é 25/26 e jul/26 é 26/27', () => {
    expect(safrasQueCobremOMes(SAFRAS, '2026-06').map(s => s.id)).toEqual(['a25', 'l25', 'm25']);
    expect(safrasQueCobremOMes(SAFRAS, '2026-07').map(s => s.id)).toEqual(['a26']);
  });

  it('os extremos da janela contam: jul/25 e jun/26 pertencem à 25/26', () => {
    expect(safrasQueCobremOMes(SAFRAS, '2025-07').map(s => s.id)).toContain('l25');
    expect(safrasQueCobremOMes(SAFRAS, '2026-06').map(s => s.id)).toContain('l25');
  });

  it('safra sem janela não cobre mês nenhum — ausência não vira palpite', () => {
    expect(safrasQueCobremOMes(SAFRAS, '2025-10').some(s => s.id === 'sem')).toBe(false);
    expect(safrasQueCobremOMes([{ id: 'x', data_inicio: '2025-07-01', data_fim: null }], '2025-10')).toEqual([]);
  });

  it('mês sem safra alguma devolve lista vazia, não a safra mais próxima', () => {
    expect(safrasQueCobremOMes(SAFRAS, '2019-03')).toEqual([]);
  });

  describe('safraInicialDoMes', () => {
    it('⚠ prefere a safra que JÁ tem área deste pasto — o empate das três se resolve pelo dado', () => {
      /* Era o defeito de origem: o painel abria em 23/24 (primeira por nome, com todas as
         ordens em zero) e a área gravada em 25/26-Lav não aparecia em mês nenhum. */
      expect(safraInicialDoMes(SAFRAS, '2025-10', new Set(['l25']))?.id).toBe('l25');
    });

    it('sem dado nenhum, abre na primeira que cobre o mês — nunca na primeira da lista', () => {
      expect(safraInicialDoMes(SAFRAS, '2025-10')?.id).toBe('a25');
      expect(safraInicialDoMes(SAFRAS, '2025-10', new Set())?.id).toBe('a25');
    });

    it('dado numa safra que NÃO cobre o mês não puxa a escolha para fora da janela', () => {
      expect(safraInicialDoMes(SAFRAS, '2026-07', new Set(['l25']))?.id).toBe('a26');
    });

    it('mês fora de qualquer janela devolve null — o painel diz isso em vez de gravar no ano errado', () => {
      expect(safraInicialDoMes(SAFRAS, '2019-03')).toBeNull();
    });
  });
});
