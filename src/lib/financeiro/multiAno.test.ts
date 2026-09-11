/**
 * MULTISSELEÇÃO DE ANOS — FIN-LISTA-MULTIANO-01.
 *
 * ⚠ O QUE ESTES TESTES GUARDAM é que a LISTA e os TOTAIS recortam pelo mesmo período. As duas
 * leituras saem de funções diferentes (`montarPlanoBaseV2` para a consulta, `faixasDoRecorte`
 * para a RPC dos totais), e um filtro novo que chegue a uma e não à outra faz a tela mostrar
 * N linhas e somar outra coisa — sem nada acusar.
 * ⚠ E O PRODUTO CARTESIANO É A REGRA: dois anos com dois meses são QUATRO faixas. Qualquer
 * atalho aqui devolveria um recorte que ninguém pediu.
 */
import { describe, it, expect } from 'vitest';
import { montarPlanoBaseV2, anosDoRecorte, semRecorteDePeriodo, type FiltrosV2 } from './filtrosBaseV2';
import { faixasDoRecorte } from './listaPaginadaV2';

const CLI = 'cli-1';
const plano = (f: FiltrosV2) => montarPlanoBaseV2(CLI, f, { relacao: 'tabela' });

describe('quais anos o recorte tem', () => {
  it('sem nada, nenhum — que é "todos os anos"', () => {
    expect(anosDoRecorte({})).toEqual([]);
    expect(anosDoRecorte({ ano: '__todos__' })).toEqual([]);
  });

  it('um `ano` solto continua valendo — nenhum chamador antigo muda', () => {
    expect(anosDoRecorte({ ano: '2026' })).toEqual([2026]);
  });

  it('`anos` tem precedência sobre `ano`', () => {
    /* Os dois convivem de propósito: `ano` é lido pela exportação e pelo guard da tela. */
    expect(anosDoRecorte({ ano: '2026', anos: ['2024', '2025'] })).toEqual([2024, 2025]);
  });

  it('lista vazia cai para o `ano`, e lixo não vira ano', () => {
    expect(anosDoRecorte({ ano: '2026', anos: [] })).toEqual([2026]);
    expect(anosDoRecorte({ anos: ['', 'abc'] })).toEqual([]);
  });

  it('sem ano e sem mês é o único caso sem recorte de período', () => {
    expect(semRecorteDePeriodo({ anos: [] })).toBe(true);
    expect(semRecorteDePeriodo({ anos: ['2026'] })).toBe(false);
    expect(semRecorteDePeriodo({ meses: ['08'] })).toBe(false);
  });
});

describe('a consulta da lista', () => {
  it('dois anos inteiros viram dois ramos, não uma faixa de ponta a ponta', () => {
    /* ⚠ 2022 e 2026 juntos NÃO podem virar [2022,2027): arrastaria 23, 24 e 25 de brinde. */
    const p = plano({ anos: ['2022', '2026'], dimensao: 'competencia' });
    expect(p.orTemporal).toContain('2022-01-01');
    expect(p.orTemporal).toContain('2023-01-01');
    expect(p.orTemporal).toContain('2026-01-01');
    expect(p.orTemporal).toContain('2027-01-01');
    expect(p.orTemporal).not.toContain('2024-01-01');
  });

  it('dois anos × dois meses = quatro faixas', () => {
    const p = plano({ anos: ['2025', '2026'], meses: ['08', '09'], dimensao: 'competencia' });
    expect((p.orTemporal ?? '').match(/2025-08-01/g)).toHaveLength(1);
    expect((p.orTemporal ?? '').match(/2025-09-01/g)?.length).toBeGreaterThan(0);
    expect((p.orTemporal ?? '').match(/2026-08-01/g)).toHaveLength(1);
    expect((p.orTemporal ?? '').match(/2026-09-01/g)?.length).toBeGreaterThan(0);
  });

  it('um ano só produz o mesmo plano de antes — nada regrediu', () => {
    expect(plano({ anos: ['2026'], dimensao: 'competencia' }).orTemporal)
      .toBe(plano({ ano: '2026', dimensao: 'competencia' }).orTemporal);
  });
});

describe('os totais recortam o MESMO período', () => {
  it('as faixas da RPC acompanham os anos, sem nada novo no banco', () => {
    /* `p_faixas` sempre foi uma LISTA — os meses já podiam ser vários. Anos são mais
       intervalos na mesma lista, e por isso a RPC não mudou. */
    expect(faixasDoRecorte({ anos: ['2025', '2026'] }))
      .toEqual(['[2025-01-01,2026-01-01)', '[2026-01-01,2027-01-01)']);
  });

  it('dois anos × dois meses = quatro faixas, como na consulta', () => {
    expect(faixasDoRecorte({ anos: ['2025', '2026'], meses: ['08', '09'] })).toHaveLength(4);
  });

  it('sem ano nenhum, sem faixa — e aí o recorte é "todos"', () => {
    expect(faixasDoRecorte({ anos: [] })).toBeNull();
  });

  it('um ano só devolve a mesma faixa de antes', () => {
    expect(faixasDoRecorte({ anos: ['2026' ] })).toEqual(faixasDoRecorte({ ano: '2026' }));
  });
});
