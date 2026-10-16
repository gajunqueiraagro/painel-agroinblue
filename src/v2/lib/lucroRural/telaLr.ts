/**
 * FIN-LR-SYNC-01 passo b — a TELA "Atualizar do Lucro Rural" (mock-lr-sync, aprovado 16/10/2026). Lógica pura: lê o envelope do
 * banco (`fn_lr_sync_comparar`) SEM CAST, diz que ações cada linha aceita (o espelho das permissões de `fn_lr_sync_aplicar`, que
 * confere de novo e recusa o resto), conta pendências e monta as decisões. Nenhuma regra de casamento ou de situação mora aqui:
 * quem decide é o banco.
 *
 * ⚠ "decidir" NÃO TEM PADRÃO: centavos, fatura de cartão, financiamento e vínculo sem lançamento esperam o operador; o gravar só
 *   acende sem pendência. ⚠ Pago no LR nunca vira realizado ("aguarda extrato"). ⚠ Classificação, fornecedor e fazenda do sistema
 *   nunca entram como mudança (só informam).
 */
import type { DecisaoLr } from '@/v2/hooks/useLrSyncAplicar';

export type SituacaoLr = 'nova' | 'mudou' | 'pago_no_lr' | 'decidir' | 'sem_mudanca' | 'ignorada' | 'da_oc';
export type AcaoLr = 'criar_programada' | 'atualizar' | 'manter' | 'vincular' | 'aguardar_extrato' | 'ignorar' | 'nada';

export interface LinhaLrTela {
  chave: string;
  ordem: number;
  tipo: 'p' | 'r';
  situacao: SituacaoLr;
  acaoPadrao: string;
  motivo: string | null;
  lancamentoId: string | null;
  lr: { numero: string; valorC: number | null; vencimento: string | null; pagamento: string | null; contraparte: string | null;
        tipoContas: string | null; competencia: string | null };
  resolvido: { fornecedorId: string | null; fazendaId: string | null; planoContaId: string | null; subcentro: string | null;
               safraId: string | null; contaId: string | null };
  lancamento: { valorC: number | null; vencimento: string | null; status: string | null; descricao: string | null } | null;
  difValor: boolean;
  difVencimento: boolean;
}

export interface SoNoSistema { lancamentoId: string; descricao: string | null; tipo: string; valorC: number; vencimento: string | null }
export interface ContagemLr { qtde: number; valorC: number }
export interface EnvelopeLr {
  sessao: string;
  linhas: LinhaLrTela[];
  soNoSistema: SoNoSistema[];
  resumo: Partial<Record<SituacaoLr | 'so_no_sistema' | 'da_oc_no_sistema', ContagemLr>>;
}

/* ── leitores sem cast ── */
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (o: Record<string, unknown>, k: string): string | null => { const v = o[k]; return typeof v === 'string' && v !== '' ? v : null; };
const num = (o: Record<string, unknown>, k: string): number | null => { const v = o[k]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
const sub = (o: Record<string, unknown>, k: string): Record<string, unknown> => { const v = o[k]; return ehObj(v) ? v : {}; };
const SITUACOES: readonly SituacaoLr[] = ['nova', 'mudou', 'pago_no_lr', 'decidir', 'sem_mudanca', 'ignorada', 'da_oc'];

/** O envelope do banco, ou nulo se a peça vier torta (nunca uma tela meio montada). */
export function lerEnvelopeLr(v: unknown): EnvelopeLr | null {
  if (!ehObj(v) || !Array.isArray(v.linhas)) return null;
  const linhas: LinhaLrTela[] = [];
  for (const x of v.linhas) {
    if (!ehObj(x)) return null;
    const chave = txt(x, 'chave'); const situacao = SITUACOES.find(s => s === x.situacao);
    if (!chave || !situacao) return null;
    const lr = sub(x, 'lr'); const res = sub(x, 'resolvido'); const lanc = ehObj(x.lancamento) ? x.lancamento : null;
    const difs = Array.isArray(x.diferencas) ? x.diferencas.filter(ehObj) : [];
    linhas.push({
      chave, ordem: num(x, 'ordem') ?? 0, tipo: x.tipo === 'r' ? 'r' : 'p', situacao,
      acaoPadrao: txt(x, 'acao_padrao') ?? 'nada', motivo: txt(x, 'motivo'), lancamentoId: txt(x, 'lancamento_id'),
      lr: { numero: txt(lr, 'numero') ?? '', valorC: num(lr, 'valor_c'), vencimento: txt(lr, 'vencimento'), pagamento: txt(lr, 'pagamento'),
            contraparte: txt(lr, 'contraparte'), tipoContas: txt(lr, 'tipo_contas'), competencia: txt(lr, 'competencia') },
      resolvido: { fornecedorId: txt(res, 'fornecedor_id'), fazendaId: txt(res, 'fazenda_id'), planoContaId: txt(res, 'plano_conta_id'),
                   subcentro: txt(res, 'subcentro'), safraId: txt(res, 'safra_id'), contaId: txt(res, 'conta_id') },
      lancamento: lanc ? { valorC: num(lanc, 'valor_c'), vencimento: txt(lanc, 'vencimento'), status: txt(lanc, 'status'), descricao: txt(lanc, 'descricao') } : null,
      difValor: difs.some(d => d.campo === 'valor'),
      difVencimento: difs.some(d => d.campo === 'vencimento'),
    });
  }
  const soNoSistema: SoNoSistema[] = [];
  for (const s of Array.isArray(v.so_no_sistema) ? v.so_no_sistema : []) {
    if (!ehObj(s)) continue;
    const id = txt(s, 'lancamento_id');
    if (id) soNoSistema.push({ lancamentoId: id, descricao: txt(s, 'descricao'), tipo: txt(s, 'tipo') ?? '', valorC: num(s, 'valor_c') ?? 0, vencimento: txt(s, 'vencimento') });
  }
  const resumo: EnvelopeLr['resumo'] = {};
  const r = ehObj(v.resumo) ? v.resumo : {};
  const chaves: readonly (SituacaoLr | 'so_no_sistema' | 'da_oc_no_sistema')[] = [...SITUACOES, 'so_no_sistema', 'da_oc_no_sistema'];
  for (const k of chaves) {
    const c = r[k];
    if (ehObj(c)) resumo[k] = { qtde: num(c, 'qtde') ?? 0, valorC: num(c, 'valor_c') ?? 0 };
  }
  return { sessao: txt(v, 'sessao') ?? '', linhas, soNoSistema, resumo };
}

/* ── ações ── */
export const ROTULO_ACAO: Record<AcaoLr, string> = {
  criar_programada: 'Criar programada', atualizar: 'Atualizar', manter: 'Fica como está', vincular: 'Vincular a este lançamento',
  aguardar_extrato: 'Aguardar extrato', ignorar: 'Ignorar', nada: 'Nada',
};

/** O que o ▾ oferece (espelho das permissões do aplicar). "da OC" e "ignorada": só nada. */
export function acoesDaLinha(l: LinhaLrTela): AcaoLr[] {
  switch (l.situacao) {
    case 'nova': return ['criar_programada', 'vincular', 'ignorar', 'nada'];
    case 'sem_mudanca': return ['nada', 'vincular', 'ignorar'];
    case 'mudou': return ['atualizar', 'manter', 'vincular', 'ignorar', 'nada'];
    case 'pago_no_lr': return ['aguardar_extrato', 'vincular', 'ignorar', 'nada'];
    case 'decidir':
      if (l.acaoPadrao === 'nao_importar_fatura') return ['ignorar', 'vincular', 'nada'];
      if (l.motivo === 'financiamento') return ['vincular', 'ignorar', 'nada'];
      if (l.motivo === 'vinculo_sem_lancamento') return ['vincular', 'criar_programada', 'ignorar', 'nada'];
      return ['atualizar', 'vincular', 'ignorar', 'nada'];
    default: return ['nada'];
  }
}

const ACOES_DE_DECISAO = new Set(['decidir', 'decidir_centavos', 'nao_importar_fatura']);

/** A ação com que a linha nasce: a padrão do banco; "decidir" nasce SEM ação (o operador escolhe). */
export function acaoInicial(l: LinhaLrTela): AcaoLr | null {
  if (l.situacao === 'decidir' || ACOES_DE_DECISAO.has(l.acaoPadrao)) return null;
  const ok = acoesDaLinha(l).find(a => a === l.acaoPadrao);
  return ok ?? 'nada';
}

/** O texto do ▾ quando ainda falta decidir (vermelho). */
export function textoDeDecisao(l: LinhaLrTela): string {
  if (l.acaoPadrao === 'decidir_centavos') {
    const c = l.lancamento?.valorC != null && l.lr.valorC != null ? Math.abs(l.lancamento.valorC - l.lr.valorC) : null;
    return c === 1 ? 'Decidir: 1 centavo' : c != null ? `Decidir: ${c} centavos` : 'Decidir: centavos';
  }
  if (l.acaoPadrao === 'nao_importar_fatura') return 'Decidir: fatura de cartão';
  if (l.motivo === 'financiamento') return 'Decidir: financiamento';
  if (l.motivo === 'vinculo_sem_lancamento') return 'Decidir: vínculo sem lançamento';
  return 'Decidir';
}

export interface ClassificacaoEscolhida { planoContaId: string; subcentro: string; fazendaId: string; favorecidoId: string }
export interface EscolhaDaLinha { acao: AcaoLr | null; lancamentoId?: string | null; classificacao?: ClassificacaoEscolhida | null }

/** Falta classificar: criar programada sem conta do plano, fazenda ou fornecedor (resolvidos ou escolhidos). */
export function faltaClassificar(l: LinhaLrTela, e: EscolhaDaLinha): boolean {
  if (e.acao !== 'criar_programada') return false;
  const c = e.classificacao;
  return !(c?.planoContaId ?? l.resolvido.planoContaId) || !(c?.fazendaId ?? l.resolvido.fazendaId) || !(c?.favorecidoId ?? l.resolvido.fornecedorId);
}

/** Falta decidir: sem ação, ou vincular sem lançamento-alvo. */
export function faltaDecidir(l: LinhaLrTela, e: EscolhaDaLinha): boolean {
  if (e.acao === null) return true;
  return e.acao === 'vincular' && !(e.lancamentoId ?? l.lancamentoId);
}

export interface Pendencias { decisoes: number; classificacoes: number }
export function pendencias(linhas: readonly LinhaLrTela[], escolhas: ReadonlyMap<string, EscolhaDaLinha>): Pendencias {
  let decisoes = 0, classificacoes = 0;
  for (const l of linhas) {
    const e = escolhas.get(l.chave) ?? { acao: acaoInicial(l) };
    if (faltaDecidir(l, e)) decisoes++;
    else if (faltaClassificar(l, e)) classificacoes++;
  }
  return { decisoes, classificacoes };
}

export function frasePendencias(p: Pendencias): string | null {
  if (p.decisoes === 0 && p.classificacoes === 0) return null;
  const d = p.decisoes === 1 ? '1 decisão' : `${p.decisoes} decisões`;
  const c = p.classificacoes === 1 ? '1 classificação' : `${p.classificacoes} classificações`;
  return `Faltam ${d} e ${c}`;
}

/** As decisões que vão ao banco ('nada' não vai). */
export function decisoesParaGravar(linhas: readonly LinhaLrTela[], escolhas: ReadonlyMap<string, EscolhaDaLinha>): DecisaoLr[] {
  const out: DecisaoLr[] = [];
  for (const l of linhas) {
    const e = escolhas.get(l.chave) ?? { acao: acaoInicial(l) };
    if (!e.acao || e.acao === 'nada') continue;
    const d: DecisaoLr = { chave: l.chave, acao: e.acao, situacao: l.situacao, lancamento_visto: l.lancamentoId };
    if (e.acao === 'vincular' && e.lancamentoId) d.lancamento_id = e.lancamentoId;
    if (e.acao === 'criar_programada' && e.classificacao) {
      d.classificacao = { plano_conta_id: e.classificacao.planoContaId, fazenda_id: e.classificacao.fazendaId, favorecido_id: e.classificacao.favorecidoId };
    }
    out.push(d);
  }
  return out;
}

/** "Gravar · N novas · N atualizam · N vínculos · N aguardam extrato". */
export function textoDoGravar(linhas: readonly LinhaLrTela[], escolhas: ReadonlyMap<string, EscolhaDaLinha>): string {
  const n = { criar: 0, atualizar: 0, vinculo: 0, aguardar: 0 };
  for (const l of linhas) {
    const a = (escolhas.get(l.chave) ?? { acao: acaoInicial(l) }).acao;
    if (a === 'criar_programada') n.criar++;
    else if (a === 'atualizar') n.atualizar++;
    else if (a === 'vincular' || a === 'manter') n.vinculo++;
    else if (a === 'aguardar_extrato') n.aguardar++;
  }
  return `Gravar · ${n.criar} novas · ${n.atualizar} atualizam · ${n.vinculo} vínculos · ${n.aguardar} aguardam extrato`;
}

/**
 * A conta nova nasce SEM SAFRA? (a regra do aplicar, FIN-LR-SYNC-01a2: a safra só entra se for da mesma atividade da conta do
 * plano). Nulo = não é conta a criar. 'sem_safra_no_lr' ou 'outra_atividade' = nasce sem safra, com o porquê.
 */
export function nasceSemSafra(
  l: LinhaLrTela, e: EscolhaDaLinha, escopoDoPlano: (id: string) => string | null | undefined, escopoDaSafra: (id: string) => string | null | undefined,
): 'sem_safra_no_lr' | 'outra_atividade' | null {
  if (e.acao !== 'criar_programada') return null;
  const plano = e.classificacao?.planoContaId ?? l.resolvido.planoContaId;
  if (!l.resolvido.safraId) return 'sem_safra_no_lr';
  if (!plano) return null;
  return escopoDaSafra(l.resolvido.safraId) === escopoDoPlano(plano) ? null : 'outra_atividade';
}

export const FRASE_SEM_SAFRA: Record<'sem_safra_no_lr' | 'outra_atividade', string> = {
  sem_safra_no_lr: 'sem safra: o LR não diz a safra',
  outra_atividade: 'sem safra: a safra do LR é de outra atividade (a conta nasce sem safra)',
};

/** O motivo da recusa, em português (as chaves de `fn_lr_sync_aplicar` / `fn_lr_sync_desfazer`). */
export const FRASE_MOTIVO: Record<string, string> = {
  mudou_desde_a_comparacao: 'mudou desde a comparação — compare de novo',
  decisao_do_operador: 'precisa de decisão',
  acao_nao_permitida: 'ação não permitida para esta situação',
  falta_classificar: 'falta classificar',
  ja_realizado: 'o lançamento já está realizado ou conciliado',
  parte_viva_de_oc: 'lançamento de operação comercial',
  parcela_de_contrato: 'parcela de contrato: altere pelo contrato',
  importacao_historica: 'importação histórica (só o administrador)',
  mes_fechado: 'mês fechado',
  lancamento_cancelado: 'lançamento cancelado',
  direcao_diferente: 'o lançamento é de outra direção',
  lancamento_ja_vinculado: 'o lançamento já está vinculado a outra conta do LR',
  sem_lancamento: 'sem lançamento para vincular',
  lancamento_inexistente: 'lançamento não encontrado',
  classificacao_invalida: 'classificação inválida para a direção',
  cadastro_de_outro_cliente: 'cadastro de outro cliente',
  sem_vencimento_ou_valor: 'sem vencimento ou valor no LR',
  chave_inexistente: 'a conta não está mais no LR',
  chave_repetida: 'decisão repetida',
  editado_depois: 'editado depois da atualização',
  pago_ou_conciliado_depois: 'pago ou conciliado depois da atualização',
};
export const fraseDoMotivo = (m: string | null | undefined): string => (m ? FRASE_MOTIVO[m] ?? m : '');

/** Itens recusados (ou não desfeitos) do retorno do banco, sem cast. */
export interface ItemDoRetorno { chave: string | null; acao: string; status: string; motivo: string | null }
export function itensDoRetorno(v: unknown): { itens: ItemDoRetorno[]; resumo: Record<string, unknown> } | null {
  if (!ehObj(v) || !Array.isArray(v.itens)) return null;
  const itens: ItemDoRetorno[] = [];
  for (const x of v.itens) if (ehObj(x)) itens.push({ chave: txt(x, 'chave'), acao: txt(x, 'acao') ?? '', status: txt(x, 'status') ?? '', motivo: txt(x, 'motivo') });
  return { itens, resumo: ehObj(v.resumo) ? v.resumo : {} };
}

/** "vencimentos out/26 → mar/27" pelas datas do LR. */
export function faixaDeVencimentos(linhas: readonly LinhaLrTela[]): string | null {
  const ds = linhas.map(l => l.lr.vencimento).filter((d): d is string => !!d).sort();
  if (ds.length === 0) return null;
  const m = (d: string) => `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;
  return `vencimentos ${m(ds[0])} → ${m(ds[ds.length - 1])}`;
}
