/**
 * NOTAS-RECEITA-A1-01 · F2 — as regras PURAS da aba "Certificado" da ficha do produtor. A tela nunca lê o certificado: ela mostra os
 * METADADOS que o banco tem (`fiscal_certificados`, RLS do cliente) e a trilha, e manda arquivo + senha DIRETO à borda
 * `fiscal-certificado-subir`. Aqui: ler as linhas sem cast, a validade (aviso 30 dias antes — S5), a impressão digital legível, a frase de
 * cada passo da trilha e o que a borda respondeu (em erro, o corpo mora em `error.context`, um `Response` — a lição do ACESSOS-TELA-01).
 */
import { dataBR } from '@/lib/datas/dataBR';
export { FRASE_A3_NAO_SERVE } from '../../../supabase/functions/_shared/certificadoA1';

export type SituacaoDoCertificado = 'ativo' | 'substituido' | 'revogado' | 'vencido' | 'recusado_sefaz';
export interface CertificadoDaTela {
  id: string; situacao: SituacaoDoCertificado; documento: string; emissor: string | null; numeroSerie: string | null;
  impressaoDigital: string; validoDe: string; validoAte: string; enviadoEm: string;
}
export interface PassoDaTrilha { id: string; acao: string; em: string; motivo: string | null }

const SITUACOES: readonly SituacaoDoCertificado[] = ['ativo', 'substituido', 'revogado', 'vencido', 'recusado_sefaz'];
const texto = (o: unknown, k: string): string | null => {
  const v: unknown = o && typeof o === 'object' ? Reflect.get(o, k) : null;
  return typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null;
};
const ehSituacao = (s: string | null): s is SituacaoDoCertificado => s !== null && SITUACOES.some((x) => x === s);

/** as linhas de `fiscal_certificados` como a tela usa; linha torta (sem id, situação ou validade) fica de fora */
export function lerCertificados(linhas: unknown): CertificadoDaTela[] {
  if (!Array.isArray(linhas)) return [];
  return linhas.flatMap((l) => {
    const id = texto(l, 'id'); const situacao = texto(l, 'situacao'); const de = texto(l, 'valido_de'); const ate = texto(l, 'valido_ate');
    if (!id || !ehSituacao(situacao) || !de || !ate) return [];
    return [{ id, situacao, documento: texto(l, 'documento') ?? '', emissor: texto(l, 'emissor'), numeroSerie: texto(l, 'numero_serie'),
      impressaoDigital: texto(l, 'impressao_digital') ?? '', validoDe: de, validoAte: ate, enviadoEm: texto(l, 'enviado_em') ?? de }];
  });
}
export function lerTrilha(linhas: unknown): PassoDaTrilha[] {
  if (!Array.isArray(linhas)) return [];
  return linhas.flatMap((l) => {
    const id = texto(l, 'id'); const acao = texto(l, 'acao'); const em = texto(l, 'em');
    return id && acao && em ? [{ id, acao, em, motivo: texto(l, 'motivo') }] : [];
  });
}

/** o ativo; sem ativo, o mais recente (para dizer "revogado em…" / "substituído") */
export const certificadoDaFicha = (lista: readonly CertificadoDaTela[]): CertificadoDaTela | null =>
  lista.find((c) => c.situacao === 'ativo') ?? [...lista].sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))[0] ?? null;

export type EstadoDaValidade = { tom: 'ok' | 'aviso' | 'vencido'; frase: string };
/** S5: aviso 30 dias antes de vencer; vencido para a busca. `hoje` em ISO (aaaa-mm-dd), o `hojeLocal()` da casa. */
export function estadoDaValidade(validoAte: string, hoje: string): EstadoDaValidade {
  const ate = validoAte.slice(0, 10);
  const dias = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000);
  if (dias < 0) return { tom: 'vencido', frase: `vencido em ${dataBR(ate)} — suba o novo` };
  if (dias <= 30) return { tom: 'aviso', frase: dias === 0 ? `vence hoje (${dataBR(ate)})` : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'} (${dataBR(ate)})` };
  return { tom: 'ok', frase: `válido até ${dataBR(ate)}` };
}

/** a impressão digital legível: os 16 primeiros caracteres em grupos de 4 (o inteiro vai no `title`) */
export const impressaoCurta = (hex: string): string => (hex.slice(0, 16).match(/.{1,4}/g) ?? []).join(' ').toUpperCase();

export const ROTULO_DA_SITUACAO: Record<SituacaoDoCertificado, string> = {
  ativo: 'ativo', substituido: 'substituído', revogado: 'revogado', vencido: 'vencido', recusado_sefaz: 'recusado pela SEFAZ',
};
const ROTULO_DO_PASSO: Record<string, string> = {
  subiu: 'certificado enviado', trocou: 'certificado trocado (o anterior ficou substituído)', revogou: 'certificado revogado',
  venceu: 'certificado venceu', recusado_sefaz: 'recusado pela SEFAZ', recusado_upload: 'envio recusado',
};
const ROTULO_DA_RECUSA: Record<string, string> = {
  senha: 'senha errada', nao_a1: 'não é A1', arquivo_grande: 'não é A1', arquivo_ilegivel: 'arquivo ilegível',
  documento_diferente: 'de outro CPF/CNPJ', sem_documento: 'sem CPF/CNPJ', vencido: 'vencido', ainda_nao_vale: 'ainda não vale',
};
export function fraseDoPasso(p: PassoDaTrilha): string {
  const base = ROTULO_DO_PASSO[p.acao] ?? p.acao;
  const motivo = p.motivo ? (p.acao === 'recusado_upload' ? ROTULO_DA_RECUSA[p.motivo] ?? p.motivo : p.motivo) : null;
  return motivo ? `${base}: ${motivo}` : base;
}

export type RespostaDoSubir = { ok: true; acao: string; avisos: string[] } | { ok: false; frase: string };
/** o que a borda respondeu; em erro (não-2xx) o corpo está em `error.context` (um `Response`) */
export async function lerRespostaDoSubir(res: { data: unknown; error: unknown }): Promise<RespostaDoSubir> {
  let corpo: unknown = res.data;
  if (res.error != null) {
    const contexto: unknown = typeof res.error === 'object' ? Reflect.get(res.error, 'context') : null;
    corpo = null;
    if (contexto instanceof Response) { try { corpo = await contexto.clone().json(); } catch { corpo = null; } }
  }
  const ok: unknown = corpo && typeof corpo === 'object' ? Reflect.get(corpo, 'ok') : null;
  if (res.error == null && ok === true) {
    const avisos: unknown = corpo && typeof corpo === 'object' ? Reflect.get(corpo, 'avisos') : null;
    return { ok: true, acao: texto(corpo, 'acao') ?? 'subiu', avisos: Array.isArray(avisos) ? avisos.filter((a): a is string => typeof a === 'string') : [] };
  }
  return { ok: false, frase: texto(corpo, 'frase') ?? 'Não consegui enviar o certificado. Nada foi gravado; tente de novo.' };
}

/* ── "Testar certificado" (só admin): o ENSAIO da borda `fiscal-dfe-buscar` (`ensaio: true`) — abre o A1 do cofre, confere titular,
   validade e a CADEIA ICP, e NÃO chama a Receita nem grava nada. O 1º passo do caminho é o próprio certificado ("NOME:CPF", validade). ── */
export const CORPO_DO_TESTE = (titularId: string) => ({ titular_id: titularId, ambiente: 'producao', ensaio: true });
export type ResultadoDoTeste =
  | { ok: true; titular: string; validade: string; cadeia: string }
  | { ok: false; frase: string; cadeia: string | null };

const cpfOuCnpj = (d: string) => (d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d);
function lerCaminho(cadeia: unknown): { nome: string; ate: string }[] {
  const c: unknown = cadeia && typeof cadeia === 'object' ? Reflect.get(cadeia, 'caminho') : null;
  if (!Array.isArray(c)) return [];
  return c.flatMap((p) => { const nome = texto(p, 'nome'); const ate = texto(p, 'ate'); return nome && ate ? [{ nome, ate }] : []; });
}
const MOTIVO_DA_CADEIA: Record<string, string> = {
  sem_intermediaria: 'falta a AC no arquivo', assinatura: 'assinatura não confere', ac_vencida: 'AC vencida', nao_e_ac: 'não é AC',
  raiz_desconhecida: 'não chega a uma raiz da ICP-Brasil', longa_demais: 'longa demais',
};

export async function lerRespostaDoTeste(res: { data: unknown; error: unknown }): Promise<ResultadoDoTeste> {
  let corpo: unknown = res.data;
  if (res.error != null) {
    const contexto: unknown = typeof res.error === 'object' ? Reflect.get(res.error, 'context') : null;
    corpo = null;
    if (contexto instanceof Response) { try { corpo = await contexto.clone().json(); } catch { corpo = null; } }
  }
  const cadeia: unknown = corpo && typeof corpo === 'object' ? Reflect.get(corpo, 'cadeia') : null;
  const caminho = lerCaminho(cadeia);
  const okCadeia: unknown = cadeia && typeof cadeia === 'object' ? Reflect.get(cadeia, 'ok') : null;
  const acs = caminho.slice(1).map((p) => p.nome).join(' → ');
  const ensaio: unknown = corpo && typeof corpo === 'object' ? Reflect.get(corpo, 'ensaio') : null;
  if (res.error == null && ensaio === true && okCadeia === true && caminho.length >= 2) {
    const [nome, doc] = caminho[0].nome.split(/:(?=\d{11}$|\d{14}$)/);
    return { ok: true, titular: doc ? `${nome} · ${cpfOuCnpj(doc)}` : nome, validade: `até ${dataBR(caminho[0].ate.slice(0, 10))}`,
      cadeia: `${acs} ✓ ICP-Brasil` };
  }
  const motivo = cadeia && typeof cadeia === 'object' ? texto(cadeia, 'motivo') : null;
  return { ok: false, frase: texto(corpo, 'frase') ?? 'Não consegui testar o certificado. Nada foi pedido à Receita.',
    cadeia: caminho.length > 0 ? `${caminho.map((p) => p.nome).join(' → ')}${motivo ? ` ✗ ${MOTIVO_DA_CADEIA[motivo] ?? motivo}` : ''}` : null };
}
