/**
 * Direto ou compartilhado — AGRI-MODAL-CULTURA-01.
 *
 * ⚠ O QUE ESTES TESTES PROTEGEM não é a frase, é a AMBIGUIDADE que ela resolve: campo vazio
 * significa "rateia", e sem a frase o operador leria como "esqueci de preencher".
 */
import { describe, it, expect } from 'vitest';
import {
  avisoCultura, avisoFase, culturaParaGravar, faseParaGravar,
  CULTURAS_LANCAMENTO, FASES, SEM_CULTURA,
} from './rateioLancamento';

describe('a frase da cultura', () => {
  it('preenchida: verde e direto', () => {
    const a = avisoCultura('amendoim');
    expect(a.texto).toBe('Custo direto de Amendoim — não rateia.');
    expect(a.classe).toBe('text-success');
  });

  it('vazia: âmbar e compartilhado', () => {
    const a = avisoCultura('');
    expect(a.classe).toBe('text-amber-600');
    expect(a.texto).toContain('rateia entre as culturas da safra');
  });

  it('⚠ NOMEIA as culturas da safra quando elas são conhecidas', () => {
    /* "Rateia entre Amendoim e Mandioca" é o que o operador confere; "entre as culturas da
       safra" ele só acredita. */
    const a = avisoCultura(null, ['amendoim', 'mandioca']);
    expect(a.texto).toBe('Compartilhado — rateia entre Amendoim e Mandioca no fechamento.');
  });

  it('safra com uma cultura só também se nomeia — e aí o rateio não muda nada', () => {
    expect(avisoCultura(null, ['amendoim']).texto).toContain('entre Amendoim no fechamento');
  });

  it('cultura fora da lista aparece como veio, sem quebrar a frase', () => {
    expect(avisoCultura('trigo').texto).toBe('Custo direto de trigo — não rateia.');
  });

  it('lista de culturas vazia cai na frase genérica', () => {
    expect(avisoCultura(null, []).texto).toContain('as culturas da safra');
  });
});

describe('a frase da fase', () => {
  it('preenchida: verde e direto', () => {
    expect(avisoFase('engorda').texto).toBe('Custo direto de Engorda — não rateia.');
    expect(avisoFase('engorda').classe).toBe('text-success');
  });

  it('vazia: âmbar e compartilhado', () => {
    expect(avisoFase('').classe).toBe('text-amber-600');
    expect(avisoFase(null).texto).toContain('rateia entre as fases');
  });
});

describe('o que vai no payload', () => {
  it('cultura só existe na lavoura', () => {
    expect(culturaParaGravar('agricultura', 'amendoim')).toBe('amendoim');
    expect(culturaParaGravar('pecuaria', 'amendoim')).toBeNull();
    expect(culturaParaGravar('silvicultura', 'amendoim')).toBeNull();
    expect(culturaParaGravar('administrativo', 'amendoim')).toBeNull();
    expect(culturaParaGravar(null, 'amendoim')).toBeNull();
  });

  it('fase só existe na pecuária', () => {
    expect(faseParaGravar('pecuaria', 'cria')).toBe('cria');
    expect(faseParaGravar('agricultura', 'cria')).toBeNull();
    expect(faseParaGravar('administrativo', 'cria')).toBeNull();
  });

  it('vazio grava NULL — que é o "rateia"', () => {
    expect(culturaParaGravar('agricultura', '')).toBeNull();
    expect(culturaParaGravar('agricultura', '   ')).toBeNull();
    expect(faseParaGravar('pecuaria', '')).toBeNull();
  });
});

describe('as listas', () => {
  it('⚠ eucalipto NÃO entra na lavoura, ainda que o CHECK do banco o aceite', () => {
    /* Ele é silvicultura — outra pílula no card de atividade. Sob "Lavoura" ele produziria
       custo de eucalipto dentro do DRE da lavoura. */
    expect(CULTURAS_LANCAMENTO.some(c => c.valor === 'eucalipto')).toBe(false);
    expect(CULTURAS_LANCAMENTO).toHaveLength(6);
  });

  it('as três fases do CHECK estão na lista', () => {
    expect(FASES.map(f => f.valor)).toEqual(['cria', 'recria', 'engorda']);
  });

  it('a sentinela do "Todas" não colide com nenhum valor real', () => {
    /* Comparação por `string` de propósito: `FASES` é `as const`, e comparar o literal
       direto o TypeScript recusa dizendo que não há sobreposição — que é exatamente o que se
       queria provar, mas como erro de compilação em vez de teste verde. */
    const valores: string[] = [...CULTURAS_LANCAMENTO.map(c => c.valor), ...FASES.map(f => f.valor)];
    expect(valores).not.toContain(SEM_CULTURA);
  });
});
