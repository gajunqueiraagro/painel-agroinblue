/**
 * FOLHA-RESUMO-CONTADOR-01 — a bancada do resumo do contador ("Extrato Mensal") na Caixa: dado SINTÉTICO (empresas, CAEPF e pessoas
 * inventados). O PIOR CASO: o nome da empresa no teto, o FGTS no teto (9.999.999,99), uma empresa cuja soma dos empregados não fecha e
 * uma sem fazenda (o Prever apagado) — `caso=resumo_ok` tira a pendência; `caso=resumo_aplicado` = o documento já aplicado (o Desfazer).
 */
import type { ResumoLido } from '@/lib/folha/lerResumoDoContador';
import type { ResumoCaixaApi } from '@/lib/folha/folhaCaixaApi';
import type { RespostaDoResumo } from '@/lib/folha/resumoNaCaixa';

export const NOME_DO_RESUMO_DA_BANCADA = 'Extrato Mensal 13 ficticio com nome de arquivo comprido de exemplo.pdf';
const pessoas = (n: number, fgts: number) => Array.from({ length: n }, (_, i) => ({ codigo: String(i + 1), nome: `PESSOA FICTICIA ${i + 1}`, liquido: fgts * 12.5, fgts }));
export const RESUMO_DA_BANCADA: ResumoLido = {
  tipo: '13_1', competencia: '2026-11', totalFgts: 10000271.98,
  empresas: [
    { codigo: '398', empresa: 'PRODUTOR RURAL FICTICIO DE NOME BEM COMPRIDO DE EXEMPLO FAZ BOA VISTA DO CAMPO GRANDE', cei: '11122233300144', fgts: 9999999.99,
      baseFgts: 124999999.88, somaDosEmpregados: 9999999.99, confere: true, empregados: pessoas(16, 624999.999375), paginas: [1, 2, 3, 4] },
    { codigo: '743', empresa: 'PRODUTOR RURAL FICTICIO FAZ SERRA', cei: '11122233300225', fgts: 55.78, baseFgts: 697.25, somaDosEmpregados: 54.78, confere: false,
      empregados: pessoas(1, 54.78), paginas: [5] },
    { codigo: '399', empresa: 'PRODUTOR RURAL FICTICIO FAZ RIO', cei: '11122233300306', fgts: 216.21, baseFgts: 2702.67, somaDosEmpregados: 216.21, confere: true,
      empregados: pessoas(2, 108.105), paginas: [6, 7] },
  ],
};
const previsao = (cei: string, fazenda: string, valor: number) => ({ cei, fazenda, descricao: 'FGTS 13º 1ª parcela 2026', valor, vencimento: '2026-12-18', lancamentoId: null });
export function apiDoResumoDaBancada(caso: string | null): ResumoCaixaApi {
  let aplicado = caso === 'resumo_aplicado';
  const semFazenda = caso !== 'resumo_ok' && caso !== 'resumo_aplicado';
  const resposta = (): RespostaDoResumo => (aplicado ? { jaAplicado: true, previsoes: [], pendencias: [], soma: null } : {
    jaAplicado: false, soma: semFazenda ? 10000055.77 : 10000271.98,
    previsoes: [previsao('11122233300144', 'Fazenda Boa Vista do Campo Grande de Nome Comprido', 9999999.99), previsao('11122233300225', 'Faz. Serra', 55.78),
      ...(semFazenda ? [] : [previsao('11122233300306', 'Faz. Rio', 216.21)])],
    pendencias: semFazenda ? [{ cei: '11122233300306', pendencia: 'sem_fazenda' }] : [],
  });
  return {
    fazendasPorCaepf: async () => ({ ok: true, dados: new Map([['11122233300144', 'faz-a'], ['11122233300225', 'faz-b']]) }),
    prever: async (_c, _d, _i, simular) => { const r = resposta(); if (!simular) aplicado = true; return { ok: true, dados: r }; },
  };
}
