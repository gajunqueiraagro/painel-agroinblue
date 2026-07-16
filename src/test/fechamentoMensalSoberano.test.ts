import { describe, expect, it } from 'vitest';
import {
  buildCardsExistentes,
  buildLinhasDaTela,
  buildSugeridosSemCard,
  computeFechamentoMensalFingerprint,
  type ComponenteMensal,
  type ComposicaoCategoriaMensal,
  type LocalSugeridoMensal,
  type PendenciaMensal,
} from '@/lib/fechamentoMensalSoberano';

// ── fábricas sintéticas ──
function comp(over: Partial<ComponenteMensal> & { fechamento_pasto_id: string; pasto_id: string; nome_exibicao: string }): ComponenteMensal {
  return {
    cliente_id: 'cli', fazenda_id: 'faz', ano_mes: '2026-05', status: 'fechado',
    quantidade_total: 0, peso_total_kg: 0, possui_itens: false, tipo_uso_mes: 'recria',
    uso_operacional: 'recria', uso_operacional_origem: null, tipo_entidade: 'local_fisico',
    natureza_patrimonial: 'pecuaria_produtiva', eh_ajuste: false, ...over,
  };
}
function pend(over: Partial<PendenciaMensal> & { fechamento_pasto_id: string; pasto_id: string; nome_exibicao: string }): PendenciaMensal {
  return {
    cliente_id: 'cli', fazenda_id: 'faz', ano_mes: '2026-05', status: 'rascunho', tipo_uso_mes: 'recria',
    uso_operacional: 'recria', uso_operacional_origem: null, tipo_entidade: 'local_fisico',
    natureza_patrimonial: 'pecuaria_produtiva', eh_ajuste: false, ...over,
  };
}
function loc(over: Partial<LocalSugeridoMensal> & { pasto_id: string; nome_exibicao: string }): LocalSugeridoMensal {
  return {
    cliente_id: 'cli', fazenda_id: 'faz', ano_mes: '2026-05', tipo_uso: 'recria', entra_conciliacao: true,
    data_inicio: null, natureza_patrimonial: 'pecuaria_produtiva', sugerir_no_fechamento: true, ...over,
  };
}

describe('D.0B-i — união soberana', () => {
  it('cardsExistentes = componentes + pendências (dedup por fechamento_pasto_id)', () => {
    const componentes = [comp({ fechamento_pasto_id: 'c1', pasto_id: 'p1', nome_exibicao: 'A' })];
    const pendencias = [pend({ fechamento_pasto_id: 'c2', pasto_id: 'p2', nome_exibicao: 'B' })];
    const cards = buildCardsExistentes(componentes, pendencias);
    expect(cards.map(c => c.fechamento_pasto_id).sort()).toEqual(['c1', 'c2']);
    expect(cards.find(c => c.fechamento_pasto_id === 'c1')?.origem).toBe('componente');
    expect(cards.find(c => c.fechamento_pasto_id === 'c2')?.origem).toBe('pendencia');
  });

  it('sugeridosSemCard exclui pastos que já têm card (por pasto_id)', () => {
    const cards = buildCardsExistentes([comp({ fechamento_pasto_id: 'c1', pasto_id: 'p1', nome_exibicao: 'A' })], []);
    const sugeridos = [loc({ pasto_id: 'p1', nome_exibicao: 'A' }), loc({ pasto_id: 'p9', nome_exibicao: 'Z' })];
    const semCard = buildSugeridosSemCard(sugeridos, cards);
    expect(semCard.map(s => s.pasto_id)).toEqual(['p9']);
  });

  it('INVARIANTE: card existente cujo pasto NÃO está entre os sugeridos NÃO desaparece', () => {
    // p_hist tem card fechado, mas não aparece em locaisSugeridos (pasto encerrado / perdeu entra_conciliacao)
    const componentes = [comp({ fechamento_pasto_id: 'cH', pasto_id: 'p_hist', nome_exibicao: 'Historico' })];
    const cards = buildCardsExistentes(componentes, []);
    const sugeridos = [loc({ pasto_id: 'p_novo', nome_exibicao: 'Novo' })]; // p_hist ausente
    const semCard = buildSugeridosSemCard(sugeridos, cards);
    const linhas = buildLinhasDaTela(cards, semCard);
    expect(linhas.map(l => l.pasto_id)).toContain('p_hist');   // não sumiu
    expect(linhas.map(l => l.pasto_id)).toContain('p_novo');
  });

  it('sugerido com card existente não aparece duplicado em linhasDaTela', () => {
    const cards = buildCardsExistentes([comp({ fechamento_pasto_id: 'c1', pasto_id: 'p1', nome_exibicao: 'A' })], []);
    const sugeridos = [loc({ pasto_id: 'p1', nome_exibicao: 'A' })];
    const linhas = buildLinhasDaTela(cards, buildSugeridosSemCard(sugeridos, cards));
    expect(linhas.filter(l => l.pasto_id === 'p1')).toHaveLength(1);
    expect(linhas.find(l => l.pasto_id === 'p1')?.tipo).toBe('card');
  });

  it('ordenação: ajustes (eh_ajuste) sempre no fim; normais primeiro; dentro do grupo por nome', () => {
    const componentes = [
      comp({ fechamento_pasto_id: 'c_div_f', pasto_id: 'pDF', nome_exibicao: 'Divergencia Fechada', eh_ajuste: true, tipo_entidade: 'ajuste_conciliacao' }),
      comp({ fechamento_pasto_id: 'c_z', pasto_id: 'pZ', nome_exibicao: 'Zebu' }),
    ];
    const pendencias = [
      pend({ fechamento_pasto_id: 'c_div_p', pasto_id: 'pDP', nome_exibicao: 'Divergencia Pendente', eh_ajuste: true, tipo_entidade: 'ajuste_conciliacao' }),
      pend({ fechamento_pasto_id: 'c_a', pasto_id: 'pA', nome_exibicao: 'Angus' }),
    ];
    const cards = buildCardsExistentes(componentes, pendencias);
    const linhas = buildLinhasDaTela(cards, []);
    // normais por nome (Angus, Zebu), depois ajustes por nome (Divergencia Fechada, Divergencia Pendente)
    expect(linhas.map(l => l.nome_exibicao)).toEqual(['Angus', 'Zebu', 'Divergencia Fechada', 'Divergencia Pendente']);
    // os dois últimos são ajustes (inclui a pendência de divergência, via eh_ajuste do envelope)
    expect(linhas.slice(-2).every(l => l.eh_ajuste)).toBe(true);
  });

  it('sugeridos entram como normais (eh_ajuste=false), antes dos ajustes', () => {
    const cards = buildCardsExistentes(
      [comp({ fechamento_pasto_id: 'c_div', pasto_id: 'pD', nome_exibicao: 'Divergencia', eh_ajuste: true })],
      [],
    );
    const sugeridos = [loc({ pasto_id: 'pS', nome_exibicao: 'Sugerido' })];
    const linhas = buildLinhasDaTela(cards, sugeridos);
    expect(linhas.map(l => l.nome_exibicao)).toEqual(['Sugerido', 'Divergencia']);
    expect(linhas[0].eh_ajuste).toBe(false);
    expect(linhas[1].eh_ajuste).toBe(true);
  });
});

describe('D.0B-i — fingerprint', () => {
  it('produz contagens e quantidadePorCategoria coerentes', () => {
    const componentes = [comp({ fechamento_pasto_id: 'c1', pasto_id: 'p1', nome_exibicao: 'A' })];
    const pendencias = [pend({ fechamento_pasto_id: 'c2', pasto_id: 'p2', nome_exibicao: 'B', eh_ajuste: true })];
    const locaisSugeridos = [loc({ pasto_id: 'p9', nome_exibicao: 'Z' })];
    const composicaoPorCategoria: ComposicaoCategoriaMensal[] = [
      { cliente_id: 'cli', fazenda_id: 'faz', ano_mes: '2026-05', fechamento_pasto_id: 'c1', pasto_id: 'p1', nome_exibicao: 'A', categoria_id: 'cat1', categoria_codigo: 'vacas', quantidade: 10, peso_total_kg: 4000, peso_medio_kg: 400, status: 'fechado', tipo_uso_mes: 'recria', uso_operacional: 'recria', uso_operacional_origem: null, tipo_entidade: 'local_fisico', natureza_patrimonial: 'pecuaria_produtiva', eh_ajuste: false },
      { cliente_id: 'cli', fazenda_id: 'faz', ano_mes: '2026-05', fechamento_pasto_id: 'c1', pasto_id: 'p1', nome_exibicao: 'A', categoria_id: 'cat1b', categoria_codigo: 'vacas', quantidade: 5, peso_total_kg: 2000, peso_medio_kg: 400, status: 'fechado', tipo_uso_mes: 'recria', uso_operacional: 'recria', uso_operacional_origem: null, tipo_entidade: 'local_fisico', natureza_patrimonial: 'pecuaria_produtiva', eh_ajuste: false },
    ];
    const cardsExistentes = buildCardsExistentes(componentes, pendencias);
    const sugeridosSemCard = buildSugeridosSemCard(locaisSugeridos, cardsExistentes);
    const linhasDaTela = buildLinhasDaTela(cardsExistentes, sugeridosSemCard);
    const fp = computeFechamentoMensalFingerprint({ componentes, pendencias, locaisSugeridos, composicaoPorCategoria, cardsExistentes, sugeridosSemCard, linhasDaTela });

    expect(fp.componentesCount).toBe(1);
    expect(fp.pendenciasCount).toBe(1);
    expect(fp.sugeridosCount).toBe(1);
    expect(fp.ajustesFechadosCount).toBe(0);
    expect(fp.ajustesPendentesCount).toBe(1);
    expect(fp.cardsExistentesIds).toEqual(['c1', 'c2']);
    expect(fp.sugeridosSemCardIds).toEqual(['p9']);
    expect(fp.quantidadePorCategoria).toEqual({ vacas: 15 });
    // linhasPastoIds preserva ordem (normais por nome, ajuste ao fim): A(p1), Z(p9), B(p2, ajuste)
    expect(fp.linhasPastoIds).toEqual(['p1', 'p9', 'p2']);
  });
});
