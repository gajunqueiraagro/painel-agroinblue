/**
 * MAPA-ATIVIDADE-LAVOURA-01 — D4: a safra que CONTÉM o mês do mapa; registros da mesma safra se juntam. Dado no formato da Pureza
 * (Ind 03 com a 24/25 e a 26/27; Ind 01 com duas variedades na 25/26).
 */
import { describe, expect, it } from 'vitest';
import { lavouraDoPastoNoMes, rotuloDaLavoura, type RegistroDeLavoura } from './lavouraDoMes';

const S2425 = { safra_id: 's24', safra_nome: 'Safra 24/25 Lavoura', safra_inicio: '2024-07-01', safra_fim: '2025-06-30' };
const S2526 = { safra_id: 's25', safra_nome: 'Safra 25/26 Lavoura', safra_inicio: '2025-07-01', safra_fim: '2026-06-30' };
const S2627 = { safra_id: 's26', safra_nome: 'Safra 26/27 Lavoura', safra_inicio: '2026-07-01', safra_fim: '2027-06-30' };
const vazio = { variedade: null, area_plantada_ha: null, data_plantio: null, data_colheita_prevista: null, data_colheita_real: null, status: null };

const R: RegistroDeLavoura[] = [
  { ...vazio, ...S2425, pasto_id: 'ind03', cultura: 'amendoim', variedade: 'IAC 503', area_plantada_ha: 92.2, data_plantio: '2026-11-10', status: 'plantada' },
  { ...vazio, ...S2627, pasto_id: 'ind03', cultura: 'amendoim', area_plantada_ha: 92.2, status: 'abertura' },
  { ...vazio, ...S2526, pasto_id: 'ind01', cultura: 'amendoim', variedade: 'BRS 421', area_plantada_ha: 16, data_plantio: '2025-12-10',
    data_colheita_prevista: '2026-04-11', status: 'plantada' },
  { ...vazio, ...S2526, pasto_id: 'ind01', cultura: 'amendoim', variedade: 'OL3', area_plantada_ha: 75, data_plantio: '2025-11-10',
    data_colheita_prevista: '2026-03-07', status: 'plantada' },
];

describe('lavouraDoPastoNoMes (D4)', () => {
  it('Ind 03 em set/26: a 26/27 (contém o mês), não a 24/25', () => {
    const l = lavouraDoPastoNoMes(R, 'ind03', '2026-09');
    expect(l).toMatchObject({ safra: 'Safra 26/27 Lavoura', culturas: ['Amendoim'], areaPlantadaHa: 92.2, status: 'Abertura', registros: 1, plantio: null });
  });
  it('Ind 03 em mar/25: a 24/25', () => {
    expect(lavouraDoPastoNoMes(R, 'ind03', '2025-03')?.safra).toBe('Safra 24/25 Lavoura');
  });
  it('a borda do mês conta: jul/26 já é a 26/27, jun/26 ainda não', () => {
    expect(lavouraDoPastoNoMes(R, 'ind03', '2026-07')?.safra).toBe('Safra 26/27 Lavoura');
    expect(lavouraDoPastoNoMes(R, 'ind03', '2026-06')).toBeNull();
  });
  it('Ind 01 em mar/26: as duas variedades da 25/26 juntas (área somada, plantio mais cedo, colheita mais tarde)', () => {
    expect(lavouraDoPastoNoMes(R, 'ind01', '2026-03')).toMatchObject({
      culturas: ['Amendoim'], variedades: ['BRS 421', 'OL3'], areaPlantadaHa: 91, plantio: '2025-11-10', colheitaPrevista: '2026-04-11',
      colheitaReal: null, registros: 2,
    });
  });
  it('nenhuma safra contém o mês = null; o rótulo do mapa', () => {
    expect(lavouraDoPastoNoMes(R, 'ind01', '2026-09')).toBeNull();
    expect(rotuloDaLavoura(null)).toBe('Lavoura');
    expect(rotuloDaLavoura(lavouraDoPastoNoMes(R, 'ind03', '2026-09'))).toBe('Lavoura · Amendoim');
  });
});
