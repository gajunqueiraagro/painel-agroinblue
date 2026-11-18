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

describe('CONC-CRIAR-COM-NOTA-02 D-f (tela) — o pagamento ANTECIPADO (caso Azulão: vence no mês seguinte, pago antes)', () => {
  it('o adiantado de VALOR EXATO e em aberto entra como "mesmo valor"; valor diferente, já pago ou já conciliado, não', () => {
    const dias = montarMesa(dados, new Set());
    const exato = cand('adi-1', 'f-x', 'Ferragens Exemplo', -6000, '2031-11-10');
    const outroValor = cand('adi-2', 'f-x', 'Ferragens Exemplo', -5999, '2031-11-10');
    const pago = { ...cand('adi-3', 'f-x', 'Ferragens Exemplo', -6000, '2031-11-11'), status_transacao: 'realizado' };
    const conciliado = { ...cand('adi-4', 'f-x', 'Ferragens Exemplo', -6000, '2031-11-12'), ja_conciliado: true };
    /* sem os adiantados (a tela até 18/11): nada de valor exato */
    expect((sugestoesDaMesa(dias, CANDIDATOS).get('ext-1') ?? []).some((s) => s.tipo === 'mesmo_valor')).toBe(false);
    const lista = sugestoesDaMesa(dias, CANDIDATOS, new Map(), [exato, outroValor, pago, conciliado]).get('ext-1') ?? [];
    expect(lista[0].lancamentos.map((c) => c.lancamento_id)).toEqual(['adi-1']);
    expect(lista[0].tipo).toBe('mesmo_valor');
    const ids = lista.flatMap((s) => s.lancamentos.map((c) => c.lancamento_id));
    expect(ids).not.toContain('adi-2');
    expect(ids).not.toContain('adi-3');
    expect(ids).not.toContain('adi-4');
  });
});

describe('CONC-CRIAR-COM-NOTA-02 (homologação 09:37) — o nº da NF chega ao Casar pela sugestão', () => {
  it('levadosDaSugestao leva o numero_documento do candidato ("NF —" era o nº perdido no caminho)', async () => {
    const { levadosDaSugestao } = await import('./EspelhoConciliacaoTab');
    const c = { ...cand('adi-1', 'f-x', 'Ferragens Exemplo', -6000, '2031-11-10'), numero_documento: '000077066' };
    const [lista] = [sugestoesDaMesa(montarMesa(dados, new Set()), CANDIDATOS, new Map(), [c]).get('ext-1') ?? []];
    expect(levadosDaSugestao(lista[0])[0].numero_documento).toBe('000077066');
  });
});
