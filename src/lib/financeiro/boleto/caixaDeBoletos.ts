/**
 * BOLETO-DDA-API-01 · D1c (a) — a REGRA DA TELA da caixa de boletos (mock v3, escolhas do Gabriel 14/11 "tudo como recomendado").
 *
 * Só apresentação: o banco decide (candidatos, avisos, "já está no sistema"); aqui se escolhe o SELO e a FRASE de cada linha.
 * ⚠ ABAS: Chegando (os arquivos desta sessão, ainda não gravados) · Na caixa (`novo`) · Sem par (`sem_par`) · Todos.
 * ⚠ "PARECE JÁ PAGO" = selo vermelho aqui; a confirmação fica no LIGAR (fatia b).
 * ⚠ AVISO NUNCA BLOQUEIA: entrar na caixa só depende da linha conferir (a recusa vem do banco).
 * ⚠ Data sempre dd/mm/aaaa; valor em pt-BR com 2 casas; "—" = ausente (nunca zero).
 */
import type {
  AvisoDoBoleto, CandidatoDoBoleto, ItemDaCaixa, LancamentoDaCaixa, ListaDaCaixa, RespostaDeEntrar, SituacaoDoTitulo,
} from './caixaApi';

export type AbaDaCaixa = 'chegando' | 'na_caixa' | 'sem_par' | 'todos';
export const ABAS_DA_CAIXA: readonly { valor: AbaDaCaixa; rotulo: string }[] = [
  { valor: 'chegando', rotulo: 'Chegando' }, { valor: 'na_caixa', rotulo: 'Na caixa' },
  { valor: 'sem_par', rotulo: 'Sem par' }, { valor: 'todos', rotulo: 'Todos' },
];

export type Tom = 'ok' | 'ambar' | 'vermelho' | 'cinza' | 'azul';
export interface Selo { texto: string; tom: Tom }

export const dataBR = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
export const valorBR = (v: number | null | undefined): string =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROTULO_DO_STATUS: Record<string, string> = {
  previsto: 'previsto', programado: 'programado', agendado: 'agendado', realizado: 'pago', conciliado: 'conciliado',
};
/** A SITUAÇÃO À VISTA de um lançamento, lida de hoje: status · conta · agendado para · pago em · programado por. */
export function situacaoAVista(l: LancamentoDaCaixa): string {
  if (l.cancelado) return 'cancelado';
  const partes = [ROTULO_DO_STATUS[l.status ?? ''] ?? (l.status ?? '—')];
  if (l.conta) partes.push(l.conta);
  if (l.agendadoPara && (l.status === 'programado' || l.status === 'agendado')) partes.push(`para ${dataBR(l.agendadoPara)}`);
  if (l.pagamento && (l.status === 'realizado' || l.status === 'conciliado')) partes.push(`pago em ${dataBR(l.pagamento)}`);
  if (l.conciliado && l.status !== 'conciliado') partes.push('conciliado');
  if (l.programadoPor?.nome) partes.push(`por ${l.programadoPor.nome}`);
  return partes.join(' · ');
}

/** Uma frase por aviso do banco (todos só avisam). */
export function fraseDoAviso(a: AvisoDoBoleto): string {
  switch (a.codigo) {
    case 'ja_pago': return 'Um lançamento ligado já está pago.';
    case 'ja_programado': return a.por?.nome ? `Já programado por ${a.por.nome}${a.por.em ? ` em ${dataBR(a.por.em)}` : ''}.` : 'Já programado.';
    case 'soma_diferente': return `Os lançamentos somam ${valorBR(a.soma)}; o boleto é ${valorBR(a.valor)} (diferença ${valorBR(a.diferenca)})${a.explicacao ? ` — ${a.explicacao}` : ''}.`;
    case 'parece_ja_pago': {
      const l = a.lancamentos[0];
      return l ? `Parece já pago: ${l.descricao ?? 'lançamento'} · ${valorBR(l.valor)} · ${situacaoAVista(l)}${a.lancamentos.length > 1 ? ` (+${a.lancamentos.length - 1})` : ''}.` : 'Parece já pago.';
    }
    case 'pagador_de_fora': return 'O pagador do boleto não é titular deste cliente.';
    case 'valor_lido_diferente': return `O valor impresso (${valorBR(a.lido)}) difere do código de barras (${valorBR(a.doCodigo)}); vale o do código.`;
    case 'sem_vencimento': return 'Boleto sem vencimento no código.';
    case 'sem_valor': return 'Boleto sem valor no código.';
  }
}
const SELO_DO_AVISO: Partial<Record<AvisoDoBoleto['codigo'], Selo>> = {
  parece_ja_pago: { texto: 'parece já pago', tom: 'vermelho' },
  ja_pago: { texto: 'já pago', tom: 'vermelho' },
  pagador_de_fora: { texto: 'pagador de fora', tom: 'ambar' },
  valor_lido_diferente: { texto: 'valor diferente', tom: 'ambar' },
  soma_diferente: { texto: 'soma diferente', tom: 'ambar' },
};
export const selosDosAvisos = (as: AvisoDoBoleto[]): Selo[] =>
  as.map((a) => SELO_DO_AVISO[a.codigo]).filter((s): s is Selo => !!s);

/** O selo do que o banco ACHOU para o boleto (o 1º grupo de candidatos decide: os tipos não se misturam). */
export function seloDoAchado(candidatos: CandidatoDoBoleto[]): Selo {
  const c = candidatos[0];
  if (!c) return { texto: 'sem par', tom: 'cinza' };
  if (c.tipo === 'exato') return candidatos.length > 1 ? { texto: `${candidatos.length} exatos · escolha`, tom: 'ambar' } : { texto: 'exato', tom: 'ok' };
  if (c.tipo === 'soma') return { texto: `soma de ${c.lancamentos.length}`, tom: 'azul' };
  return { texto: 'por nome · confira', tom: 'cinza' };
}
/** O texto do achado ao lado do selo: o(s) lançamento(s) do 1º candidato, com a situação à vista. */
export function textoDoAchado(candidatos: CandidatoDoBoleto[]): string {
  const c = candidatos[0];
  if (!c) return 'nenhuma parcela em aberto do mesmo CNPJ e valor perto do vencimento';
  if (c.tipo === 'soma') return c.lancamentos.map((l) => `${l.descricao ?? '—'} (${valorBR(l.valor)})`).join(' + ');
  const l = c.lancamentos[0];
  return l ? `${l.descricao ?? '—'} · ${dataBR(l.vencimento)} · ${situacaoAVista(l)}` : '—';
}

/** A prévia de UM arquivo, como a linha de "Chegando" a mostra. */
export interface AchadoDaPrevia { selos: Selo[]; texto: string; podeEntrar: boolean; entraPorPadrao: boolean }
export function achadoDaPrevia(r: RespostaDeEntrar): AchadoDaPrevia {
  if (r.ok === false) return { selos: [{ texto: 'não confere', tom: 'vermelho' }], texto: r.frase, podeEntrar: false, entraPorPadrao: false };
  if (r.jaExiste) {
    const l = r.situacao.lancamentos[0];
    const texto = `${r.frase ?? 'Já está no sistema.'}${l ? ` Ligado a ${l.descricao ?? 'lançamento'} · ${situacaoAVista(l)}.` : ` ${rotuloDaSituacao(r.boleto.situacao)}.`}`;
    return { selos: [{ texto: 'já está no sistema', tom: 'ambar' }, ...selosDosAvisos(r.situacao.avisos)], texto, podeEntrar: false, entraPorPadrao: false };
  }
  return {
    selos: [seloDoAchado(r.candidatos), ...selosDosAvisos([...r.avisos, ...r.situacao.avisos])],
    texto: textoDoAchado(r.candidatos), podeEntrar: true, entraPorPadrao: true,
  };
}

const ROTULO_DA_SITUACAO: Record<SituacaoDoTitulo, string> = {
  novo: 'Na caixa', ligado: 'Ligado', sem_par: 'Sem par', descartado: 'Descartado', substituido: 'Substituído',
};
export const rotuloDaSituacao = (s: SituacaoDoTitulo): string => ROTULO_DA_SITUACAO[s];

/** Os itens gravados que cada aba mostra (Chegando é dos arquivos desta sessão, não da lista). */
export function itensDaAba(lista: ListaDaCaixa | null, aba: AbaDaCaixa): ItemDaCaixa[] {
  if (!lista || aba === 'chegando') return [];
  if (aba === 'todos') return lista.itens;
  const s: SituacaoDoTitulo = aba === 'na_caixa' ? 'novo' : 'sem_par';
  return lista.itens.filter((i) => i.boleto.situacao === s);
}
/** O contador da porta: o que pede ação (na caixa + sem par). */
export const contadorDaPorta = (lista: ListaDaCaixa | null): number | null =>
  lista ? lista.contadores.novo + lista.contadores.sem_par : null;
