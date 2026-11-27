/**
 * NOTAS-RECEITA-CARD-SEMPRE-01 (mock aprovado pelo Gabriel 27/11, md5 0ce0487c…) — o ESTADO da busca da Receita do cliente, para o card que
 * nunca some ("Novo a partir da nota" e o menu "+ Novo"). Uma regra só, PURA; quem lê o banco é o `useEstadoDaReceita`.
 *
 * A ordem (a do mock + AGENDA-01, Gabriel 27/11: (b′) só 15 min; parada = 3 h sem busca boa):
 *   sem certificado ativo                                   → (a) 'sem_certificado'
 *   certificado vencido, pausa da agenda, última busca com erro, nunca buscou depois de 15 min ou 3 h sem busca boa → (d) 'parada'
 *   certificado novo, nos primeiros 15 min sem busca        → (b′) 'sem_busca'
 *   notas a lançar                                          → (c) 'com_notas'
 *   senão                                                   → (b) 'sem_novas'
 * ⚠ O motivo nunca leva chave, certificado, CPF/CNPJ ou o texto cru da Receita: só a frase daqui.
 */

export interface CertificadoDaReceita { situacao: string; validoAte: string | null; enviadoEm: string | null }
export interface ControleDaReceita { ultimaBuscaEm: string | null; naoAntesDe: string | null }
/** a última linha de `fiscal_dfe_buscas`: só o código e o motivo da recusa (nunca o detalhe inteiro) */
export interface UltimaBuscaDaReceita { em: string; cstat: string | null; recusa: string | null }
/** a pausa que a agenda do servidor pôs (`fiscal_dfe_pausa`, AGENDA-01 F2) */
export interface PausaDaReceita { motivo: string; desde: string; ate: string | null }

export type MotivoDaParada = 'vencido' | 'bloqueio' | 'sem_resposta' | 'cadeia' | 'certificado' | 'ponte' | 'nunca_buscou' | 'atrasada' | 'outro';

export type EstadoDaReceita =
  | { tipo: 'carregando' }
  | { tipo: 'sem_certificado' }
  | { tipo: 'parada'; motivo: MotivoDaParada; desde: string | null; voltaEm: string | null; validoAte: string | null }
  | { tipo: 'sem_busca' }
  | { tipo: 'com_notas'; notas: number; ultimaBusca: string | null }
  | { tipo: 'sem_novas'; ultimaBusca: string | null };

/** os códigos que querem dizer "a busca passou" (137 nada novo, 138 com documentos) */
const BUSCA_OK = new Set(['137', '138']);
/** (b′) só nos primeiros minutos depois do cadastro; passou disso sem busca = parada (Gabriel 27/11) */
export const PRIMEIRA_BUSCA_MS = 15 * 60_000;
/** "parada" = sem busca boa há mais de 3 h (Gabriel 27/11) */
export const ATRASADA_MS = 3 * 3600_000;

export function motivoDaBusca(b: UltimaBuscaDaReceita): MotivoDaParada | null {
  const cstat = (b.cstat ?? '').trim();
  if (BUSCA_OK.has(cstat)) return null;
  if (cstat === '656') return 'bloqueio';
  if (cstat === 'sem_resposta') return 'sem_resposta';
  if (b.recusa === 'cadeia') return 'cadeia';
  if (b.recusa === 'certificado' || b.recusa === 'impressao_diferente') return 'certificado';
  /* a busca que o banco segurou (espera de 1 h, pedido em andamento) não é parada */
  if (b.recusa === 'espera' || b.recusa === 'em_andamento') return null;
  return 'outro';
}

const motivoDaPausa = (m: string): MotivoDaParada =>
  m === 'cadeia' ? 'cadeia' : m === 'certificado' ? 'certificado' : m === 'lambda_tempo' ? 'ponte' : m === 'sem_resposta' ? 'sem_resposta' : 'outro';
const ultimo = (xs: (string | null)[]) => xs.filter((v): v is string => !!v).sort().at(-1) ?? null;

export function decidirEstado(e: {
  carregando: boolean;
  certificados: readonly CertificadoDaReceita[];
  controle: readonly ControleDaReceita[];
  ultimaBusca: UltimaBuscaDaReceita | null;
  pausas?: readonly PausaDaReceita[];
  notasALancar: number;
  agora?: Date;
}): EstadoDaReceita {
  if (e.carregando) return { tipo: 'carregando' };
  const agora = (e.agora ?? new Date()).getTime();
  const ativos = e.certificados.filter((c) => c.situacao === 'ativo');
  if (ativos.length === 0) return { tipo: 'sem_certificado' };
  const validoAte = ultimo(ativos.map((c) => c.validoAte));
  if (validoAte && Date.parse(validoAte) < agora) return { tipo: 'parada', motivo: 'vencido', desde: validoAte, voltaEm: null, validoAte };
  const pausa = (e.pausas ?? []).find((p) => !p.ate || Date.parse(p.ate) > agora);
  if (pausa) return { tipo: 'parada', motivo: motivoDaPausa(pausa.motivo), desde: pausa.desde, voltaEm: pausa.ate, validoAte };
  const naoAntes = ultimo(e.controle.map((c) => c.naoAntesDe));
  const motivo = e.ultimaBusca ? motivoDaBusca(e.ultimaBusca) : null;
  if (e.ultimaBusca && motivo) {
    return { tipo: 'parada', motivo, desde: e.ultimaBusca.em, voltaEm: motivo === 'bloqueio' && naoAntes && Date.parse(naoAntes) > agora ? naoAntes : null, validoAte };
  }
  const ultimaBusca = ultimo(e.controle.map((c) => c.ultimaBuscaEm));
  if (!ultimaBusca) {
    const enviado = ultimo(ativos.map((c) => c.enviadoEm));
    if (enviado && agora - Date.parse(enviado) <= PRIMEIRA_BUSCA_MS) return { tipo: 'sem_busca' };
    return { tipo: 'parada', motivo: 'nunca_buscou', desde: enviado, voltaEm: null, validoAte };
  }
  if (agora - Date.parse(ultimaBusca) > ATRASADA_MS) return { tipo: 'parada', motivo: 'atrasada', desde: ultimaBusca, voltaEm: null, validoAte };
  if (e.notasALancar > 0) return { tipo: 'com_notas', notas: e.notasALancar, ultimaBusca };
  return { tipo: 'sem_novas', ultimaBusca };
}

/** "27/11 07:23" no fuso de quem olha */
export function diaHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const diaMesAno = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** a linha do card (uma só) */
export function fraseDoCard(e: EstadoDaReceita): string {
  switch (e.tipo) {
    case 'carregando': return 'Notas da Receita · lendo…';
    case 'sem_certificado': return 'Notas da Receita · sem certificado digital';
    case 'parada': return 'Busca parada · Notas da Receita';
    case 'sem_busca': return 'Notas da Receita · certificado ok · primeira busca ainda não rodou';
    case 'com_notas': return `${e.notas > 99 ? '99+' : e.notas} ${e.notas === 1 ? 'nota' : 'notas'} da Receita a lançar · busca ${diaHora(e.ultimaBusca)}`;
    case 'sem_novas': return `Nenhuma nota nova da Receita · última busca ${diaHora(e.ultimaBusca)}`;
  }
}

/** o que o item "Da nota fiscal" do menu "+ Novo" diz na linha de cima (null = nada) */
export function fraseDoMenu(e: EstadoDaReceita): { texto: string; tom: 'azul' | 'vermelho' | 'apagado' } | null {
  switch (e.tipo) {
    case 'carregando': return null;
    case 'sem_certificado': return { texto: 'sem certificado', tom: 'apagado' };
    case 'parada': return { texto: 'busca da Receita parada', tom: 'vermelho' };
    case 'sem_busca': return { texto: 'primeira busca ainda não rodou', tom: 'apagado' };
    case 'com_notas': return { texto: `${e.notas > 99 ? '99+' : e.notas} chegaram da Receita`, tom: 'azul' };
    case 'sem_novas': return { texto: 'nenhuma nova da Receita', tom: 'apagado' };
  }
}

/** o minimodal "ver motivo": motivo, desde quando e o que fazer — em português, sem nada de segredo */
export function explicacaoDaParada(e: Extract<EstadoDaReceita, { tipo: 'parada' }>): { motivo: string; desde: string | null; fazer: string; cadastrar: boolean } {
  switch (e.motivo) {
    case 'vencido': return { motivo: `O certificado digital venceu em ${diaMesAno(e.validoAte)}.`, desde: null,
      fazer: 'Suba o certificado novo em Cadastros › Produtores › Certificado.', cadastrar: true };
    case 'bloqueio': return { motivo: 'A Receita bloqueou a consulta por 1 hora (pedido repetido).', desde: diaHora(e.desde),
      fazer: e.voltaEm ? `Nada: a busca volta sozinha a partir de ${diaHora(e.voltaEm)}.` : 'Nada: a próxima busca tenta de novo.', cadastrar: false };
    case 'sem_resposta': return { motivo: 'A Receita não respondeu na última busca.', desde: diaHora(e.desde),
      fazer: 'Nada: a próxima busca tenta de novo. Se repetir, avise o suporte.', cadastrar: false };
    case 'cadeia': return { motivo: 'O certificado veio sem a cadeia da certificadora (falta a AC que o emitiu).', desde: diaHora(e.desde),
      fazer: 'Peça à certificadora o arquivo .pfx com a cadeia completa e suba de novo em Cadastros › Produtores › Certificado.', cadastrar: true };
    case 'certificado': return { motivo: 'O certificado guardado não abriu na última busca.', desde: diaHora(e.desde),
      fazer: 'Suba o certificado de novo em Cadastros › Produtores › Certificado.', cadastrar: true };
    case 'ponte': return { motivo: 'A ponte até a Receita passou do tempo; a busca foi pausada por 6 horas.', desde: diaHora(e.desde),
      fazer: e.voltaEm ? `Nada: volta sozinha a partir de ${diaHora(e.voltaEm)}.` : 'Nada: volta sozinha.', cadastrar: false };
    case 'nunca_buscou': return { motivo: 'O certificado está ok, mas a primeira busca não rodou.', desde: diaHora(e.desde),
      fazer: 'Avise o suporte: a agenda da Receita devia ter buscado em até 15 minutos.', cadastrar: false };
    case 'atrasada': return { motivo: 'A Receita não é consultada há mais de 3 horas.', desde: diaHora(e.desde),
      fazer: 'Avise o suporte: a agenda da Receita parou.', cadastrar: false };
    case 'outro': return { motivo: 'A última busca da Receita não terminou.', desde: diaHora(e.desde),
      fazer: 'A próxima busca tenta de novo. Se repetir, avise o suporte.', cadastrar: false };
  }
}
