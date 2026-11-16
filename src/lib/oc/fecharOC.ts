/**
 * OC-SALVAR-RODAPE-01 (D1–D4, Gabriel 14/11) — fechar a OC com algo pendente PERGUNTA sempre: "Salvar e fechar" · "Fechar sem
 * salvar" · "Voltar". O "Salvar e fechar" grava TUDO o que está pendente, na ordem dados → negociação, pelos gravadores de hoje, e
 * para na 1ª recusa (a OC não fecha). Nada de salvar calado ao fechar.
 */
export type PassoSalvarOC = 'dados' | 'negociacao';

export interface PendenciaOC {
  status: string | null;
  dadosSujos: boolean;
  negociacaoSuja: boolean;
}

/** O que o "Salvar e fechar" grava, na ordem. Cancelada não grava nada; fechada só os cadastrais (a negociação está congelada). */
export function passosPendentes(p: PendenciaOC): PassoSalvarOC[] {
  if (p.status === 'cancelada') return [];
  const passos: PassoSalvarOC[] = [];
  if (p.dadosSujos) passos.push('dados');
  if (p.negociacaoSuja && p.status !== 'fechada') passos.push('negociacao');
  return passos;
}

/** Há o que perguntar ao fechar? */
export const temPendencia = (p: PendenciaOC): boolean => passosPendentes(p).length > 0;

/**
 * Grava os passos em ordem. Cada executor devolve a VERSÃO nova (número), `true` (gravou, versão no estado) ou `false`/`null` (recusou:
 * a recusa já foi mostrada por quem grava). A versão devolvida por um passo entra no seguinte — o estado só muda no próximo render.
 */
export async function salvarEmOrdem(
  passos: readonly PassoSalvarOC[],
  executar: (passo: PassoSalvarOC, versao: number | undefined) => Promise<number | boolean | null>,
): Promise<{ ok: true } | { ok: false; parouEm: PassoSalvarOC }> {
  let versao: number | undefined;
  for (const passo of passos) {
    const r = await executar(passo, versao);
    if (r === false || r === null) return { ok: false, parouEm: passo };
    if (typeof r === 'number') versao = r;
  }
  return { ok: true };
}

/** O estado do rodapé: pendente manda; sem pendência, a hora do último salvar desta abertura. */
export function estadoDoRodape(pendente: boolean, salvoAs: string | null): { texto: string; tom: 'pendente' | 'salvo' | 'neutro' } {
  if (pendente) return { texto: 'Alterações não salvas', tom: 'pendente' };
  if (salvoAs) return { texto: `Salvo às ${salvoAs}`, tom: 'salvo' };
  return { texto: 'Sem alterações', tom: 'neutro' };
}

/* ─── OS DADOS DO ABATE ─────────────────────────────────────────────────────────────────────────────────────────────────
   A base contra a qual o "pendente" dos dados do abate se mede: frigorífico, data, fazenda, observação e NF. */
export interface DadosDoAbate { frigorifico: string; data: string; fazenda: string; observacao: string; notaFiscal: string }

export const assinaturaDosDadosDoAbate = (d: DadosDoAbate): string =>
  JSON.stringify([d.frigorifico, d.data, d.fazenda, d.observacao, d.notaFiscal]);

const hojeISO = (agora: Date): string =>
  `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

/** OC nova: o que a tela mostra ao abrir (a data de hoje, o resto vazio) — o mesmo do `resetContextoAbateOC` */
export const dadosDoAbateNovo = (agora: Date = new Date()): string =>
  assinaturaDosDadosDoAbate({ frigorifico: '', data: hojeISO(agora), fazenda: '', observacao: '', notaFiscal: '' });

/** OC aberta do banco: o que a hidratação põe na tela */
export function dadosDoAbateDaOperacao(op: {
  contraparte_id?: string | null; data_operacao?: string | null; fazenda_id?: string | null; observacoes?: string | null; numero_documento?: string | null;
}, agora: Date = new Date()): string {
  return assinaturaDosDadosDoAbate({
    frigorifico: op.contraparte_id ?? '', data: op.data_operacao ?? hojeISO(agora), fazenda: op.fazenda_id ?? '',
    observacao: op.observacoes ?? '', notaFiscal: op.numero_documento ?? '',
  });
}
