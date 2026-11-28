/* REBANHO-ORGAO-01 F3 v3 — a bancada da "Declaração ao órgão": a API em memória e o leitor do PDF falso (dado SINTÉTICO; o comprovante é o
   fixture fictício). `vazia` = nenhum PDF lido ainda (órgão "—", marcar apagado); senão a fazenda 1 já tem o comprovante lido e uma célula
   editada (amarelo + ↺), e o sistema tem novilhas/vacas (o bloco que não se separa) e uma divergência com causa (o ajuste de contagem).
   v3: a fazenda sem gado (o "sem rebanho"), a etapa de maio já encerrada (só leitura) e o comprovante que abre. */
import { COMPROVANTE_FICTICIO } from '@/lib/rebanho/orgao/__fixtures__/iagroFicticio';
import { declaracaoDaLinha, type DeclaracaoApi } from '@/lib/rebanho/orgao/declaracaoApi';
import type { LerLinhasDoPdf } from '@/hooks/useDeclaracaoOrgao';

export const HOJE_DA_DECLARACAO = '2026-11-24';
const ETAPAS = [
  { id: 'et-mai', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-05-01', fim: '2026-05-31', prorrogado_ate: '2026-06-02', ativo: true },
  { id: 'et-nov', uf: 'MS', orgao: 'IAGRO', tipo: 'declaracao', inicio: '2026-11-01', fim: '2026-11-30', prorrogado_ate: null, ativo: true },
  { id: 'et-bru', uf: 'MS', orgao: 'IAGRO', tipo: 'brucelose', inicio: '2026-07-01', fim: '2026-12-31', prorrogado_ate: null, ativo: true },
];
const nasc = (fazenda_id: string, data: string, categoria: string, cab: number) => ({ id: `${fazenda_id}${data}${categoria}`, fazenda_id, data, categoria, cab });
const FATOS = {
  cliente_id: 'cli', desde: '2026-05-04', ate: '2026-11-30',
  fazendas: [{ id: 'fz1', nome: 'Fazenda Sintética Um', uf: 'MS' }, { id: 'fz2', nome: 'Fazenda Sintética Dois com Nome Comprido', uf: 'MS' }],
  nascimentos: [nasc('fz1', '2026-07-01', 'mamotes_f', 6), nasc('fz1', '2026-07-01', 'mamotes_m', 5), nasc('fz1', '2025-08-01', 'mamotes_f', 14),
    nasc('fz1', '2025-08-01', 'mamotes_m', 9), nasc('fz2', '2026-08-01', 'mamotes_f', 3)],
  reclassificacoes: [],
  mortes_consumo: [{ id: 'm1', fazenda_id: 'fz1', data: '2026-06-10', tipo: 'morte', categoria: 'vacas', cab: 2 }],
  ajustes: [{ id: 'a1', fazenda_id: 'fz1', data: '2026-09-10', sentido: 'entrada', categoria: 'vacas', cab: 1 }],
  movimentos: [],
  rebanho_hoje: [
    { fazenda_id: 'fz1', ano_mes: '2026-11', categoria: 'mamotes_f', cab: 21 }, { fazenda_id: 'fz1', ano_mes: '2026-11', categoria: 'novilhas', cab: 18 },
    { fazenda_id: 'fz1', ano_mes: '2026-11', categoria: 'vacas', cab: 75 }, { fazenda_id: 'fz1', ano_mes: '2026-11', categoria: 'mamotes_m', cab: 16 },
    { fazenda_id: 'fz1', ano_mes: '2026-11', categoria: 'garrotes', cab: 5 }, { fazenda_id: 'fz1', ano_mes: '2026-11', categoria: 'touros', cab: 4 },
  ],
};

export function apiDaDeclaracao(vazia: boolean): DeclaracaoApi {
  const linhas: Record<string, unknown>[] = vazia ? [] : [{
    id: 'd-fz1', fazenda_id: 'fz1', etapa_id: 'et-nov', status: 'rascunho', saldo: { linhas: [...COMPROVANTE_FICTICIO] },
    saldo_arquivo: 'cli/orgao/et-nov/fz1/saldo.pdf', editados: { M: { passa: { 1: 1 } } }, versao: 2,
  }];
  return {
    etapas: async () => ({ ok: true, dados: ETAPAS }),
    fazendas: async () => ({ ok: true, dados: [{ id: 'fz1', nome: 'Fazenda Sintética Um', uf: 'MS', temPecuaria: true },
      { id: 'fz2', nome: 'Fazenda Sintética Dois com Nome Comprido', uf: 'MS', temPecuaria: true }, { id: 'fz3', nome: 'Fazenda Sem UF', uf: null, temPecuaria: true },
      { id: 'fz4', nome: 'Fazenda Sem Gado', uf: 'MS', temPecuaria: false }] }),
    declaracoes: async () => ({ ok: true, dados: { desta: linhas.flatMap((l) => { const d = declaracaoDaLinha(l); return d ? [d] : []; }), ultimaDeclarada: '2026-05-04' } }),
    fatos: async () => ({ ok: true, dados: FATOS }),
    gravar: async (fazendaId, etapaId, campos) => {
      let l = linhas.find((x) => x.fazenda_id === fazendaId);
      if (!l) { l = { id: `d-${fazendaId}`, fazenda_id: fazendaId, etapa_id: etapaId, status: 'rascunho', editados: {}, versao: 0 }; linhas.push(l); }
      Object.assign(l, campos, { versao: Number(l.versao) + 1 });
      return { ok: true, dados: { id: String(l.id), versao: Number(l.versao) } };
    },
    declarar: async (id, proposta, comprovante) => {
      const l = linhas.find((x) => x.id === id);
      if (l) Object.assign(l, { status: 'declarada', proposta, comprovante_arquivo: comprovante, declarada_em: '2026-11-24T12:00:00Z', versao: Number(l.versao) + 1 });
      return { ok: true, dados: { versao: Number(l?.versao ?? 0) } };
    },
    desfazer: async () => ({ ok: true, dados: true }),
    egtas: async () => ({ ok: true, dados: { grava: 0, jaEstava: 0, recusa: [] } }),
    subirPdf: async () => ({ ok: true, dados: true }),
    urlDoArquivo: async () => ({ ok: true, dados: 'about:blank' }),
  };
}
export const LER_PDF_DA_BANCADA: LerLinhasDoPdf = async () => [...COMPROVANTE_FICTICIO];
