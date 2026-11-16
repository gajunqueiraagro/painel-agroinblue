/* LANC-PATRIMONIO-VINCULO-01 — a bancada do "Patrimônio" do rodapé do Editar lançamento: a API em memória (dado SINTÉTICO), por caso
   (`caso=` na URL): sem_bem · ligado · ligado_longo · previsto · contrato · recusa · sem_categoria · repetida. Nada grava. */
import type { PatrimonioDoLancamentoApi } from '@/lib/patrimonio/patrimonioDoLancamentoApi';
import type { CategoriaComContas, ParteDoLancamento, PatrimonioDoLancamentoLido } from '@/lib/patrimonio/patrimonioDoLancamento';
import type { BemDaLista } from '@/lib/patrimonio/patrimonio';
import type { PreviaLigar } from '@/lib/patrimonio/patrimonioApi';

const parte = (o: Partial<ParteDoLancamento> = {}): ParteDoLancamento => ({
  parte_ordem: 1, partes_total: 1, valor: 3480, plano_conta_id: 'c-inst', macro_custo: 'Investimento na Fazenda', centro_custo: 'Pecuária',
  subcentro: 'Investimento em Instalações Pecuária', escopo_negocio: 'pecuaria', status_transacao: 'realizado', cancelado: false, fazenda_id: 'f1',
  data_pagamento: '2026-11-08', data_competencia: '2026-11-08', descricao: 'Inversor 2000W Curral Pasto 23', de_contrato: false, ...o,
});
const bem = (o: Partial<BemDaLista>): BemDaLista => ({
  bem_id: 'b1', fazenda_id: 'f1', fazenda_codigo: 'FAZ-A', categoria_id: 'k-ins', categoria_codigo: 'instalacoes', categoria_nome: 'Instalações', deprecia: true,
  tem_mercado: false, tem_pastos: false, codigo: 'INS-031', descricao: 'Energia solar Curral Pasto 23', marca: null, modelo: null, identificacao: null,
  numero_proprio: null, placa: null, chassi: null, numero_serie: null, renavam: null, situacao: 'em_uso', em_uso_desde: null, baixado_em: null,
  atividade: 'pecuaria', origem_valor: 'lancamentos', valor_extra: 0, valor_lancamentos: 0, aquisicao: 18650, a_realizar: 0, n_lancamentos: 1,
  n_a_realizar: 0, n_a_conferir: 0, n_selo: 0, n_repetidas: 0, primeira_data: null, vida_util_meses: 240, residual_pct: 0, depreciacao_acumulada: 0,
  depreciacao_no_ano: 0, valor_contabil: 0, mercado_valor: null, mercado_data: null, mercado_base: null, area_pastos_ha: null, versao: 1, ...o,
});
const BENS: BemDaLista[] = [
  bem({}),
  bem({ bem_id: 'b2', codigo: 'INS-012', descricao: 'Curral de manejo Pasto 23', aquisicao: 96400 }),
  bem({ bem_id: 'b3', codigo: 'EQP-007', categoria_id: 'k-eqp', fazenda_id: 'f9', fazenda_codigo: 'ADM', descricao: 'Inversor reserva da sede', aquisicao: 2900 }),
  bem({ bem_id: 'b4', codigo: 'BEN-118', categoria_id: 'k-ben', descricao: 'Galpão de máquinas com cobertura metálica, piso de concreto armado e instalação elétrica trifásica completa', aquisicao: 99999999.99 }),
  ...Array.from({ length: 14 }, (_, i) => bem({ bem_id: `bx${i}`, codigo: `CER-${String(i + 1).padStart(3, '0')}`, categoria_id: 'k-cer', descricao: `Cerca do pasto ${i + 1}`, aquisicao: 1200 + i * 37 })),
];
const CATEGORIAS: CategoriaComContas[] = [
  { id: 'k-ins', cliente_id: null, codigo: 'instalacoes', nome: 'Instalações', vida_util_anos: 20, residual_pct: 0, deprecia: true, tem_mercado: false,
    base_mercado: null, tem_pastos: false, ordem: 1, ativo: true, prefixo: 'INS', contas_sugeridas: ['c-inst'] },
  { id: 'k-eqp', cliente_id: null, codigo: 'equipamentos', nome: 'Equipamentos', vida_util_anos: 10, residual_pct: 10, deprecia: true, tem_mercado: false,
    base_mercado: null, tem_pastos: false, ordem: 2, ativo: true, prefixo: 'EQP', contas_sugeridas: [] },
];
const previa = (o: Partial<PreviaLigar> = {}): PreviaLigar => ({ ok: true, soma: 3480, n_ligar: 1, n_recusas: 0, n_repetidas: 0, itens: [], contratos: [], ...o });

export function apiDaBancada(caso: string): PatrimonioDoLancamentoApi {
  const lido: PatrimonioDoLancamentoLido = {
    partes: [parte(caso === 'previsto' ? { status_transacao: 'previsto' } : caso === 'contrato' ? { status_transacao: 'previsto', de_contrato: true, valor: 42000 }
      : caso === 'sem_categoria' ? { plano_conta_id: 'c-solo' } : {})],
    vinculos: caso === 'ligado' ? [{ bem_id: 'b9', codigo: 'IMP-014', descricao: 'Roçadeira hidráulica', parte_ordem: 1 }]
      : caso === 'ligado_longo' ? [{ bem_id: 'b4', codigo: 'BEN-118', descricao: BENS[3].descricao, parte_ordem: 1 }] : [],
  };
  const daPrevia = (itens: number): PreviaLigar => caso === 'recusa'
    ? previa({ ok: false, n_recusas: 1, itens: [{ lancamento_id: 'L1', parte_ordem: 1, situacao: 'recusa', motivo: 'Já está em EQP-007 desde 02/10/2026 — desligue lá primeiro.', repetida: false, valor: null, descricao: null }] })
    : caso === 'contrato' && itens === 1
      ? previa({ contratos: [{ financiamento_id: 'f', descricao: 'Compra Caminhonete', n_parcelas: 5, n_faltam: 4, valor_total: 210000,
        faltam: [2, 3, 4, 5].map((k) => ({ lancamento_id: `L${k}`, parte_ordem: 1 })) }] })
      : caso === 'contrato' ? previa({ soma: 210000, n_ligar: 5 })
        : caso === 'repetida' ? previa({ n_repetidas: 1 }) : previa();
  return {
    ler: async () => ({ ok: true, dados: lido }),
    bens: async () => ({ ok: true, dados: BENS }),
    categorias: async () => CATEGORIAS,
    ligar: async (_b, itens) => ({ ok: true, dados: daPrevia(itens.length) }),
    desligar: async () => ({ ok: true, dados: {} }),
    criarELigar: async (_b, itens) => ({ ok: true, dados: { ok: caso !== 'recusa', codigo: 'INS-032', id: null, ligar: daPrevia(itens.length), vida_util_meses: 240, residual_pct: 0 } }),
  };
}
