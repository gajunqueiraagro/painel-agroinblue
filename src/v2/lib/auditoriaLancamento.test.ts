/**
 * EVENTO VIRA FRASE, FIXADO — PR-TEST-01.
 *
 * O que este arquivo protege é a lista branca. O trigger grava a linha inteira, e o dia em
 * que `updated_at` ou `ano_mes` escaparem para a frase, a trilha passa a dizer "alterou
 * atualizado em, ano mês e valor" — tecnicamente verdade, e inútil para quem lê.
 */
import { describe, it, expect } from 'vitest';
import {
  fraseDoEvento,
  camposMudados,
  CAMPOS_AUDITAVEIS,
  CAMPOS_INTERNOS,
  type CatalogosAuditoria,
  type EventoAuditoriaBruto,
} from './auditoriaLancamento';
import { primeiroNome } from '@/components/ui/trilha-auditoria';

const CAT: CatalogosAuditoria = {
  fornecedor: (id) => (id === 'forn-1' ? 'Wilson Ferragens' : undefined),
  conta: (id) => (id === 'conta-1' ? 'Bradesco C/C' : undefined),
  fazenda: (id) => (id === 'faz-1' ? 'Santa Luzia' : undefined),
};

function ev(over: Partial<EventoAuditoriaBruto> = {}): EventoAuditoriaBruto {
  return {
    id: 'ev-1',
    acao: 'editou',
    criadoEm: '2026-07-02T14:30:00Z',
    autorId: 'user-1',
    antes: {},
    depois: {},
    ...over,
  };
}

describe('fraseDoEvento — edições', () => {
  it('um campo mostra o antes → depois na própria linha', () => {
    const r = fraseDoEvento(ev({
      antes: { data_pagamento: '2026-07-01' },
      depois: { data_pagamento: '2026-07-02' },
    }), CAT);
    expect(r.frase).toBe('alterou o pagamento');
    expect(r.detalhe).toBe('01/07/26 → 02/07/26');
  });

  it('três campos viram só os nomes, enumerados em português', () => {
    const r = fraseDoEvento(ev({
      antes: { data_pagamento: '2026-07-01', valor: 100, favorecido_id: null },
      depois: { data_pagamento: '2026-07-02', valor: 250.5, favorecido_id: 'forn-1' },
    }), CAT);
    expect(r.frase).toBe('alterou pagamento, valor e fornecedor');
    /* ⚠ SEM DETALHE COM 2+: seis valores não cabem na linha, e a trilha existe para varrer.
       Quem quer os valores clica — o detalhe técnico tem todos. */
    expect(r.detalhe).toBeNull();
  });

  it('dois campos usam "e", sem vírgula', () => {
    const r = fraseDoEvento(ev({
      antes: { valor: 10, descricao: 'a' },
      depois: { valor: 20, descricao: 'b' },
    }), CAT);
    expect(r.frase).toBe('alterou valor e descrição');
  });

  it('P116 — campo fora da lista branca diz o PRÓPRIO nome (antes → depois), nunca "ajuste técnico"', () => {
    const r = fraseDoEvento(ev({
      antes: { updated_at: '2026-07-01T00:00:00Z', nivel_duplicidade: 0 },
      depois: { updated_at: '2026-07-02T00:00:00Z', nivel_duplicidade: 2 },
    }), CAT);
    expect(r.frase).toBe('alterou marca de duplicidade');
    expect(r.detalhe).toBe('0 → 2');
    expect(r.tecnico).toBe(true);
    expect(r.oculto).toBe(false);
  });

  it('P116 — o Salvar sem mudança (só campo interno) NÃO aparece', () => {
    const r = fraseDoEvento(ev({
      antes: { updated_at: '2026-10-23T15:16:35Z', hash_importacao: 'a', valor_do_mes_em: null, editado_manual: null, valor: 821.22 },
      depois: { updated_at: '2026-10-23T15:16:55Z', hash_importacao: 'b', valor_do_mes_em: '2026-10-01', editado_manual: true, valor: 821.22 },
    }), CAT);
    expect(r.oculto).toBe(true);
    expect(r.frase).not.toBe('ajuste técnico');
  });

  it('P116 — o caso do Agnaldo: pagamento e situação, com as marcas internas ao lado', () => {
    const r = fraseDoEvento(ev({
      antes: { data_pagamento: null, status_transacao: 'programado', updated_by: null, editado_manual: null, updated_at: 'x' },
      depois: { data_pagamento: '2026-09-10', status_transacao: 'realizado', updated_by: 'u', editado_manual: true, updated_at: 'y' },
    }), CAT);
    expect(r.frase).toBe('alterou pagamento e situação');
    expect(r.oculto).toBe(false);
  });

  it('P116 — classificação, safra, forma, documento e DRE entram na frase', () => {
    const cat: CatalogosAuditoria = { ...CAT, classificacao: (id) => (id === 'pl-1' ? 'Vacinas e Vermífugos' : undefined), safra: (id) => (id === 's-1' ? 'Safra 26/27' : undefined) };
    const um = (antes: Record<string, unknown>, depois: Record<string, unknown>) => fraseDoEvento(ev({ antes, depois }), cat);
    expect(um({ plano_conta_id: null, subcentro: 'Sal Mineral' }, { plano_conta_id: 'pl-1', subcentro: 'Vacinas e Vermífugos' }))
      .toMatchObject({ frase: 'alterou a classificação', detalhe: 'Sal Mineral → Vacinas e Vermífugos' });
    expect(um({ safra_id: null }, { safra_id: 's-1' })).toMatchObject({ frase: 'alterou a safra', detalhe: '— → Safra 26/27' });
    expect(um({ forma_pagamento: 'Pix' }, { forma_pagamento: 'Cartão' })).toMatchObject({ frase: 'alterou a forma de pagamento', detalhe: 'Pix → Cartão' });
    expect(um({ tipo_documento: null }, { tipo_documento: 'Nota Fiscal' })).toMatchObject({ frase: 'alterou o tipo do documento' });
    expect(um({ numero_documento: '1' }, { numero_documento: '2' })).toMatchObject({ frase: 'alterou o número do documento', detalhe: '1 → 2' });
    expect(um({ compoe_dre: true }, { compoe_dre: false })).toMatchObject({ frase: 'alterou "entra no DRE"', detalhe: 'sim → não' });
    for (const r of [um({ forma_pagamento: 'Pix' }, { forma_pagamento: 'Cartão' }), um({ compoe_dre: true }, { compoe_dre: false })]) expect(r.tecnico).toBe(false);
  });

  it('P116 — ligar a chave do plano ao MESMO texto não é mudança (a classificação é dita uma vez)', () => {
    const cat: CatalogosAuditoria = { ...CAT, classificacao: (id) => (id === 'pl-1' ? 'Sal Mineral' : undefined) };
    const r = fraseDoEvento(ev({ antes: { plano_conta_id: null, subcentro: 'Sal Mineral' }, depois: { plano_conta_id: 'pl-1', subcentro: 'Sal Mineral' } }), cat);
    expect(r.oculto).toBe(true);
  });

  it('P116 — UUID de campo técnico vira "vinculado", nunca o id', () => {
    const r = fraseDoEvento(ev({ antes: { financiamento_id: null }, depois: { financiamento_id: '9f3c1e77-0000-4000-8000-000000000000' } }), CAT);
    expect(r.frase).toBe('alterou parcelamento');
    expect(r.detalhe).toBe('— → vinculado');
  });

  it('a ordem da frase é a da lista branca, não a do payload', () => {
    const r = fraseDoEvento(ev({
      antes: { valor: 1, data_competencia: '2026-06-01' },
      depois: { valor: 2, data_competencia: '2026-07-01' },
    }), CAT);
    expect(r.frase).toBe('alterou competência e valor');
  });
});

describe('fraseDoEvento — demais ações', () => {
  it('P116 — o "criou" do gatilho traz a descrição gravada na criação', () => {
    const r = fraseDoEvento(ev({ acao: 'criou', antes: null, depois: { descricao: 'PRODUCE FR 1 L · 10 itens 1/4' } }), CAT);
    expect(r).toMatchObject({ frase: 'criou', detalhe: 'PRODUCE FR 1 L · 10 itens 1/4', oculto: false });
  });

  it('cancelou traz o motivo gravado no próprio registro', () => {
    const r = fraseDoEvento(ev({
      acao: 'cancelou', motivo: 'duplicado na importação',
    }), CAT);
    expect(r.frase).toBe('cancelou');
    expect(r.detalhe).toBe('motivo: duplicado na importação');
  });

  it('conciliação criada nomeia a data do extrato', () => {
    const r = fraseDoEvento(ev({ acao: 'conciliacao_criada', dataExtrato: '2026-07-11' }), CAT);
    expect(r.frase).toBe('conciliou com o extrato');
    expect(r.detalhe).toBe('de 11/07/26');
  });

  it('conciliação desfeita traz o motivo', () => {
    const r = fraseDoEvento(ev({ acao: 'conciliacao_desfeita', motivo: 'desfeito_no_financeiro' }), CAT);
    expect(r.frase).toBe('desfez a conciliação');
    expect(r.detalhe).toBe('desfeito_no_financeiro');
  });

  it('ação sem tradução vira texto literal legível, não "desconhecido"', () => {
    const r = fraseDoEvento(ev({ acao: 'warning_mes_fechado' }), CAT);
    expect(r.frase).toBe('warning mes fechado');
    expect(r.tecnico).toBe(true);
  });
});

describe('valores dentro da frase', () => {
  it('A19 — dinheiro nunca cru: R$ e duas casas', () => {
    const [m] = camposMudados({ valor: 1234.5 }, { valor: 1234.56 }, CAT);
    expect(m.de).toContain('R$');
    expect(m.de).toContain('1.234,50');
    expect(m.para).toContain('1.234,56');
  });

  it('fornecedor sem nome no catálogo vira "—", NUNCA o UUID', () => {
    const [m] = camposMudados(
      { favorecido_id: 'forn-1' },
      { favorecido_id: '9f3c1e77-0000-4000-8000-000000000000' },
      CAT,
    );
    expect(m.de).toBe('Wilson Ferragens');
    expect(m.para).toBe('—');
    expect(m.para).not.toContain('9f3c');
  });

  it('conta e fazenda também saem por nome', () => {
    const [conta] = camposMudados({ conta_bancaria_id: null }, { conta_bancaria_id: 'conta-1' }, CAT);
    expect(conta.para).toBe('Bradesco C/C');
    const [faz] = camposMudados({ fazenda_id: null }, { fazenda_id: 'faz-1' }, CAT);
    expect(faz.para).toBe('Santa Luzia');
  });

  it('booleano vira sim/não, não "true"', () => {
    const [m] = camposMudados({ cancelado: false }, { cancelado: true }, CAT);
    expect(m.de).toBe('não');
    expect(m.para).toBe('sim');
  });

  it('mesma data em formatos diferentes NÃO é mudança', () => {
    expect(camposMudados(
      { data_pagamento: '2026-07-01' },
      { data_pagamento: '2026-07-01T00:00:00+00:00' },
      CAT,
    )).toHaveLength(0);
  });

  it('campo ausente do "depois" não é comparado; campo que APARECE é mudança', () => {
    /* O trigger grava só o que a gravação tocou. `valor` não está no depois — logo ninguém
       mexeu nele e ele não vira frase. `descricao` está, vinda de nada: isso é mudança, e
       o "—" à esquerda é a ausência anterior, não um valor inventado. */
    const r = camposMudados({ valor: 10 }, { descricao: 'x' }, CAT);
    expect(r.map((m) => m.campo)).toEqual(['descricao']);
    expect(r[0].de).toBe('—');
    expect(r[0].para).toBe('x');
  });

  it('payload nulo não quebra', () => {
    expect(camposMudados(null, null, CAT)).toEqual([]);
    expect(fraseDoEvento(ev({ antes: null, depois: null }), CAT).oculto).toBe(true);
  });
});

describe('lista branca', () => {
  it('tem os 20 campos que uma pessoa decide (P116: +classificação, safra, forma, tipo/número do documento, DRE), sem duplicata', () => {
    expect(CAMPOS_AUDITAVEIS).toHaveLength(20);
    expect(new Set(CAMPOS_AUDITAVEIS.map((c) => c.campo)).size).toBe(20);
  });

  it('nenhum campo é ao mesmo tempo decidido e interno', () => {
    expect(CAMPOS_AUDITAVEIS.filter((c) => CAMPOS_INTERNOS.has(c.campo))).toEqual([]);
  });

  it.each(['updated_at', 'updated_by', 'ano_mes', 'nivel_duplicidade', 'importado_duplicado', 'editado_manual'])(
    '%s fica FORA da frase', (campo) => {
      expect(CAMPOS_AUDITAVEIS.some((c) => c.campo === campo)).toBe(false);
    });
});

describe('autor', () => {
  it('nome completo vira primeiro nome — a coluna tem 62px', () => {
    expect(primeiroNome('Gabriel Junqueira')).toBe('Gabriel');
    expect(primeiroNome('  Ana  Paula Souza ')).toBe('Ana');
  });

  /* ⚠ O "sistema" NÃO ESTÁ AQUI: o mapeamento de autor nulo mora em
     `AbaAuditoriaLancamento` (`autorDe`), dentro do componente, e sai junto dos nomes vindos
     de `profiles`. Fixá-lo exigiria extraí-lo — mudança de produção que este PR não faz. */
});
