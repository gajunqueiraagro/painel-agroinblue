/**
 * MAPA-LOTES-01 (C2) — o Fechamento de pastos em duas vistas: "Cards" (a grade de sempre) e "Mapa" (os polígonos da fazenda pintados
 * pela MESMA situação dos cards). A escolha fica no navegador; sem ela (ou sem acesso ao armazenamento) abre em Cards.
 */
export type VistaDoFechamento = 'cards' | 'mapa';
export type SituacaoDoCard = 'nao_iniciado' | 'em_edicao' | 'inconsistente' | 'conciliado' | 'fechado';

export const CHAVE_DA_VISTA = 'fechamento-pastos:vista';

export function lerVista(ler: () => string | null): VistaDoFechamento {
  try { return ler() === 'mapa' ? 'mapa' : 'cards'; } catch { return 'cards'; }
}
export function gravarVista(gravar: () => void): void {
  try { gravar(); } catch { /* sem armazenamento: a escolha vale só nesta tela */ }
}

/** a cor do polígono = a borda do card da mesma situação (STATUS_CARD_CLASSES do FechamentoTab): a mesma marca nas duas vistas */
export const COR_DA_SITUACAO: Record<SituacaoDoCard, string> = {
  nao_iniciado: '#CBD5E1',
  em_edicao: '#93C5FD',
  inconsistente: '#FB923C',
  conciliado: '#FCD34D',
  fechado: '#10B981',
};
export const NOME_DA_SITUACAO: Record<SituacaoDoCard, string> = {
  nao_iniciado: 'Não iniciado',
  em_edicao: 'Em edição',
  inconsistente: 'Inconsistente',
  conciliado: 'Conciliado',
  fechado: 'Fechado',
};
export const ORDEM_DA_LEGENDA: readonly SituacaoDoCard[] = ['fechado', 'conciliado', 'inconsistente', 'em_edicao', 'nao_iniciado'];

/** os pastos do mês que não têm polígono de pasto no mapa da fazenda: vão para a faixa "sem desenho", cada um abre o seu card */
export function pastosSemDesenho<P extends { id: string }>(
  pastos: readonly P[], geometrias: readonly { tipo: string; pasto_id: string | null }[],
): P[] {
  const desenhados = new Set(geometrias.filter(g => g.tipo === 'pasto' && g.pasto_id).map(g => g.pasto_id));
  return pastos.filter(p => !desenhados.has(p.id));
}
