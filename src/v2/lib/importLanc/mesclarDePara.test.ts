/**
 * A MEDIÇÃO DO DEFEITO — [ENRIQUECER-DEPARA-ESTADO-01] (133b-b).
 *
 * ⚠ ESTE TESTE EXISTE PORQUE O DEFEITO SÓ APARECIA DEPOIS DE MEIA HORA DE TELA. Gabriel
 * resolveu pendentes de uma planilha de 272 linhas por trinta minutos e a tela devolveu
 * tudo a pendente; a memória tinha gravado (medido no banco), o que se perdeu foi o estado.
 * Reproduzir isso à mão custa a mesma meia hora — aqui a sessão inteira cabe num arquivo, e
 * a contagem de reconstruções é um número, não uma impressão.
 *
 * ⚠ O QUE ESTE TESTE NÃO COBRE: o remount da aba (regra 3) e o efeito do `arquivoInicial`
 * (a raiz), que são de React e não de lógica pura. Os dois estão consertados no componente
 * e anotados lá; aqui fica o que é mensurável sem navegador.
 */
import { describe, it, expect } from 'vitest';
import {
  montarDePara, mesclarDePara, contarPendentes,
  type CatalogosImport, type DeParaCompleto,
} from './importLancamentosView';
import type { LancamentoExcelRow } from '@/v2/lib/excelPreview/parserLancamentos';
import type { Fazenda } from '@/contexts/FazendaContext';

/** Uma linha da planilha com só o que o de-para lê. */
function linha(n: number, over: Partial<LancamentoExcelRow> = {}): LancamentoExcelRow {
  return {
    linha: n,
    data_competencia: '2026-08-10', valor: 100, tipo_operacao: '2-Saídas',
    conta_plano_texto: `Conta ${n}`, fazenda_texto: `Faz ${n}`,
    fornecedor_texto: `Forn ${n}`, conta_bancaria_texto: `Banco ${n}`,
    data_vencimento: null, data_pagamento: null, descricao: null,
    numero_documento: null, tipo_documento: null, forma_pagamento: null,
    observacao: null, status: null, safra_texto: `Safra ${n}`, id_lancamento: null,
    ...over,
  };
}

const CAT_VAZIO: CatalogosImport = {
  classificacoes: [], fazendas: [], fornecedores: [], contas: [],
  aliasesSubcentro: [], aliasesFornecedor: {}, fechados: new Set(), safras: [],
  aliasesFazenda: {}, aliasesSafra: {},
};

/** Simula o gesto do operador: resolver um valor à mão. */
function resolver(dp: DeParaCompleto, campo: keyof DeParaCompleto, texto: string, valor: string): DeParaCompleto {
  const item = dp[campo][texto];
  return { ...dp, [campo]: { ...dp[campo], [texto]: { ...item, valor, rotulo: valor, origem: 'manual' as const } } };
}

describe('mesclarDePara — o de-para não perde o que o operador escolheu', () => {
  const rows = Array.from({ length: 20 }, (_, i) => linha(i + 2));

  it('MEDIÇÃO: 20 escolhas sobrevivem a 20 chegadas de catálogo', () => {
    let dp = montarDePara(rows, CAT_VAZIO);
    expect(contarPendentes(dp).subcentro).toBe(20);

    /* Uma escolha, uma chegada de catálogo — o padrão real: cada apelido gravado muda o
       catálogo em memória, e era isso que redisparava a reconstrução. */
    let reconstrucoes = 0;
    for (let i = 0; i < 20; i++) {
      dp = resolver(dp, 'subcentro', `Conta ${i + 2}`, `Sub ${i}`);
      const base = montarDePara(rows, CAT_VAZIO);
      reconstrucoes++;
      dp = mesclarDePara(dp, base);
    }

    expect(reconstrucoes).toBe(20);
    /* ANTES: as 20 sobreviviam (a regra do `valor` já existia) — é o caso que já estava
       certo, e o teste o prende para que a próxima mudança na mesclagem não o quebre. */
    expect(contarPendentes(dp).subcentro).toBe(0);
  });

  it('REGRESSÃO: "entra sem classificação" era perdido a cada chegada de catálogo', () => {
    let dp = montarDePara(rows, CAT_VAZIO);
    dp = {
      ...dp,
      subcentro: {
        ...dp.subcentro,
        'Conta 2': { ...dp.subcentro['Conta 2'], semClassificacao: true },
      },
    };
    expect(dp.subcentro['Conta 2'].semClassificacao).toBe(true);
    /* A versão anterior só preservava `valor` e `descartado`: a quarta saída do B-40 —
       decisão tão explícita quanto as outras — voltava a pendente na primeira chegada de
       catálogo, e o operador a refazia sem entender por quê. */
    dp = mesclarDePara(dp, montarDePara(rows, CAT_VAZIO));
    expect(dp.subcentro['Conta 2'].semClassificacao).toBe(true);
    expect(contarPendentes(dp).subcentro).toBe(19);
  });

  it('descarte e resolução também sobrevivem, nos cinco campos', () => {
    let dp = montarDePara(rows, CAT_VAZIO);
    dp = resolver(dp, 'fazenda', 'Faz 2', 'id-faz');
    dp = resolver(dp, 'safra', 'Safra 2', 'id-safra');
    dp = {
      ...dp,
      conta: { ...dp.conta, 'Banco 2': { ...dp.conta['Banco 2'], descartado: true } },
    };
    dp = mesclarDePara(dp, montarDePara(rows, CAT_VAZIO));
    expect(dp.fazenda['Faz 2'].valor).toBe('id-faz');
    expect(dp.safra['Safra 2'].valor).toBe('id-safra');
    expect(dp.conta['Banco 2'].descartado).toBe(true);
  });

  /* PR-CONC-EXCEL-SESSAO-E-DEPARA-01: quem resolve a fazenda é o BANCO (`fn_classificacao_depara_resolver`), não o catálogo
     do front — o contrato mudou, e o caso acompanha: a resposta que chega DEPOIS do parse preenche o que está vazio. */
  it('a resposta do banco que chega DEPOIS preenche o que ainda está vazio', () => {
    const dp0 = montarDePara(rows, CAT_VAZIO);
    expect(dp0.fazenda['Faz 2'].valor).toBeNull();

    const dp1 = mesclarDePara(dp0, montarDePara(rows, CAT_VAZIO,
      { fazenda: { 'Faz 2': { valor: 'f1', origem: 'cadastro', rotulo: 'Faz 2' } } }));
    expect(dp1.fazenda['Faz 2'].valor).toBe('f1');
    expect(dp1.fazenda['Faz 2'].origem).toBe('cadastro');
  });

  it('escolha do operador GANHA do catálogo que chega depois', () => {
    let dp = montarDePara(rows, CAT_VAZIO);
    dp = resolver(dp, 'fazenda', 'Faz 2', 'escolhida-a-mao');
    const comOutra: CatalogosImport = {
      ...CAT_VAZIO,
      fazendas: [{ id: 'outra', nome: 'Faz 2' } as CatalogosImport['fazendas'][number]],
    };
    dp = mesclarDePara(dp, montarDePara(rows, comOutra));
    /* O cadastro é inferência nossa; a escolha é declaração do operador. Declaração vence. */
    expect(dp.fazenda['Faz 2'].valor).toBe('escolhida-a-mao');
  });
});

/* PR-CONC-EXCEL-SESSAO-E-DEPARA-01: a memória de fazenda e safra (133b-b item 5) passou a ser lida pelo BANCO
   (`fn_classificacao_depara_resolver` → `_fn_classificacao_resolver_fazenda_det/_safra_det`). A regra "o apelido vence o
   cadastro" mora lá e foi provada contra o resolvedor de antes em 1.222 textos reais. Aqui fica o contrato do front: ele
   usa a resposta do banco, com a origem dela, e o catálogo dele NÃO resolve mais (um resolvedor só). */
describe('memória de fazenda e safra — lida pelo banco', () => {
  const FAZ_PUREZA: Fazenda = { id: 'faz-1', nome: 'Faz. Pureza', codigo_importacao: null, owner_id: 'o', cliente_id: 'nj' };
  const rows = [linha(2, { fazenda_texto: 'Faz Pureza', safra_texto: 'Pecuária 2025/2026' })];

  it('fazenda e safra vêm da resposta do banco, com a origem dela', () => {
    const dp = montarDePara(rows, CAT_VAZIO, {
      fazenda: { 'Faz Pureza': { valor: 'faz-1', origem: 'alias', rotulo: 'Faz. Pureza' } },
      safra: { 'Pecuária 2025/2026': { valor: 'saf-1', origem: 'alias', rotulo: 'Safra 25/26 Pecuária' } },
    });
    expect(dp.fazenda['Faz Pureza']).toMatchObject({ valor: 'faz-1', origem: 'alias' });
    expect(dp.safra['Pecuária 2025/2026']).toMatchObject({ valor: 'saf-1', origem: 'alias' });
  });

  it('o catálogo do front, mesmo com o apelido, não responde mais pelo banco', () => {
    const cat: CatalogosImport = {
      ...CAT_VAZIO,
      fazendas: [FAZ_PUREZA],
      aliasesFazenda: { 'faz-1': ['Faz Pureza'] },
      safras: [{ id: 'saf-1', nome: 'Safra 25/26 Pecuária', codigo: '25/26-Pec' }],
      aliasesSafra: { 'saf-1': ['Pecuária 2025/2026'] },
    };
    const dp = montarDePara(rows, cat);
    expect(dp.fazenda['Faz Pureza'].valor).toBeNull();
    expect(dp.safra['Pecuária 2025/2026'].valor).toBeNull();
  });
});
