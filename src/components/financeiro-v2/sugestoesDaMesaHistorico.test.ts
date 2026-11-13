/**
 * CONC-SUGESTOES-FONTE-01 item 4 — a mesa (o "(N)" do menu e o modal, a MESMA lista) recebe o fornecedor do histórico de cada linha pelo
 * termo do `nomeDoHistorico`. Sintético, no formato do caso MECANICA LIDER (BB 08/10).
 */
import { describe, it, expect } from 'vitest';
import { montarMesa, sugestoesDaMesa, type EspelhadosReais } from './EspelhoConciliacaoTab';
import type { EspCandidato } from '@/lib/conciliacao/mesaDoDia';

const dados: EspelhadosReais = {
  escopo: { cliente_id: 'c', conta_id: 'x', ano_mes: '2031-10', nome_conta: 'Banco Exemplo' },
  saldos: { inicial: 0, final_oficial: null, periodo_ini: '2031-10-01', periodo_fim: '2031-10-31', extrato_ini: null, extrato_fim: null },
  versao: 't', gerado_em: 'agora', sistema_completo: [], vinculos: [],
  ofx_completo: [{
    extrato_id: 'ext-1', data: '2031-10-08', historico: 'PIX - ENVIADO - 08/10 15:21 MECANICA LIDER', documento: null, valor: -6000,
    status: 'sem_vinculo', flag_dup: false, flag_investimento: false,
  }],
};
const cand = (id: string, favorecido: string, fornecedor: string, valor: number, venc: string): EspCandidato => ({
  lancamento_id: id, data_vencimento: venc, competencia: '2031-10-01', valor: Math.abs(valor), valor_assinado: valor, sinal: '-1',
  descricao: 'Serviço', centro: null, subcentro: null, status_transacao: 'previsto', cenario: null, cultura: null, numero_documento: null,
  tipo_documento: null, favorecido_id: favorecido, fornecedor, safra_codigo: null, safra_descricao: null, vencido: false,
  ja_conciliado: false, sem_conta: false,
});
const CANDIDATOS = [cand('lid-1', 'f-lid', 'Liderança Exemplo Contábil', -915, '2031-10-20'), cand('ofi-1', 'f-oficina', 'Oficina Exemplo', -1403.35, '2031-10-10')];

describe('a mesa com o fornecedor do histórico', () => {
  it('o termo da linha acha o fornecedor e ele vem primeiro; sem o mapa, a lista de antes', () => {
    const dias = montarMesa(dados, new Set());
    const antes = sugestoesDaMesa(dias, CANDIDATOS).get('ext-1') ?? [];
    expect(antes.map((s) => s.lancamentos[0].lancamento_id)).toEqual(['lid-1']);
    const depois = sugestoesDaMesa(dias, CANDIDATOS, new Map([['MECANICA LIDER', 'f-oficina']])).get('ext-1') ?? [];
    expect(depois.map((s) => s.lancamentos[0].lancamento_id)).toEqual(['ofi-1', 'lid-1']);
  });
});
