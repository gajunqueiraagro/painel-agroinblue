/**
 * O CONTRATO DO LEITOR DE NF-e — FIN-NFE-XML-01a. O que `lerNFe` devolve, e as frases das recusas (lista unica).
 *
 * ⚠ DINHEIRO SEMPRE EM CENTAVOS INTEIROS (sufixo `Cent`); quem formata e' a tela.
 * ⚠ DATAS COMO ESCRITAS NO XML ('YYYY-MM-DD', a parte de data de `dhEmi`/`dhSaiEnt`/`dVenc`) — nenhum fuso e' convertido.
 * ⚠ O LEITOR NAO SABE QUEM E' O CLIENTE: `tipoNota` e' do ponto de vista do EMITENTE. Recusar "nota em que o cliente e' o
 *   emitente" e' da tela que chama (decisao do Gabriel), nao daqui.
 */
export type TipoNota = 'entrada' | 'saida';
export type FinalidadeNota = 'normal' | 'complementar' | 'ajuste' | 'devolucao';

export interface EmitenteNFe {
  /** So' digitos: CNPJ (14) ou CPF (11, produtor rural). */
  documento: string;
  nome: string;
  fantasia: string | null;
  /** So' digitos; `null` quando ausente ou "ISENTO". */
  ie: string | null;
}

export interface DestinatarioNFe {
  documento: string | null;
  nome: string | null;
  ie: string | null;
}

export interface DuplicataNFe {
  numero: string;
  /** 'YYYY-MM-DD', como escrito em `dVenc`. */
  vencimento: string;
  valorCent: number;
}

export interface NotaLida {
  /** 44 digitos, so' digitos (de `protNFe/infProt/chNFe`; sem protocolo, de `infNFe@Id` sem o "NFe"). */
  chave: string;
  modelo: '55';
  /** `nNF` e `serie` crus, sem formatar. */
  numero: string;
  serie: string;
  emissao: string;
  saidaEntrada: string | null;
  tipoNota: TipoNota;
  finalidade: FinalidadeNota;
  naturezaOperacao: string;
  emitente: EmitenteNFe;
  destinatario: DestinatarioNFe;
  totais: { produtosCent: number; freteCent: number; descontoCent: number; notaCent: number };
  fatura: { origCent: number; descCent: number; liqCent: number } | null;
  /** `cobr/dup`, na ordem do arquivo. */
  duplicatas: DuplicataNFe[];
  somaDuplicatasCent: number;
  /** `pag/detPag`: o `tPag` cru (o mapa para a forma de pagamento do sistema e' de quem chama). */
  pagamentos: { tPag: string; valorCent: number }[];
  /** `det/prod`: `quantidade` e' o `qCom` como texto (ate' 4 casas no leiaute). */
  itens: { descricao: string; quantidade: string; unidade: string; valorCent: number }[];
  protocolo: { cStat: string; numero: string } | null;
}

/** Nao recusam: a tela mostra. */
export type AvisoNFe = 'sem_protocolo' | 'sem_duplicatas' | 'duplicatas_diferem_da_nota' | 'complementar' | 'devolucao';

export type MotivoRecusa =
  | 'nao_e_xml' | 'grande_demais' | 'cte' | 'evento' | 'lote' | 'nfce' | 'nfse_ou_desconhecido' | 'cancelada_ou_denegada'
  | 'incompleta';

/** O campo que falta numa nota 'incompleta' — entra na frase. */
export type CampoObrigatorioNFe = 'chave de acesso' | 'número' | 'data de emissão' | 'emitente' | 'valor total';

/** ⚠ QUEM CONSOME ESTREITA COM `r.ok === true` / `r.ok === false`: o tsconfig do app tem `strict: false`, e ali `if (!r.ok)`
 *  NAO estreita a uniao (TS2339 em `r.motivo`). */
export type ResultadoNFe =
  | { ok: true; nota: NotaLida; avisos: AvisoNFe[] }
  | { ok: false; motivo: MotivoRecusa; frase: string };

/** AS FRASES, lista unica: uma por motivo. A de 'incompleta' leva o campo (`fraseDaRecusa`). */
export const FRASES_DE_RECUSA: Record<Exclude<MotivoRecusa, 'incompleta'>, string> = {
  nao_e_xml: 'Arquivo não é um XML válido.',
  grande_demais: 'Arquivo grande demais para uma nota (limite 2 MB).',
  cte: 'É um conhecimento de transporte (CT-e), não uma nota.',
  evento: 'É um evento da nota, não a nota.',
  lote: 'Uma nota por arquivo.',
  nfce: 'Cupom (NFC-e) ainda não é lido; preencha à mão.',
  nfse_ou_desconhecido: 'Nota de serviço ou formato não reconhecido; preencha à mão.',
  cancelada_ou_denegada: 'Nota cancelada ou denegada na SEFAZ.',
};

export function fraseDaRecusa(motivo: Exclude<MotivoRecusa, 'incompleta'>): string;
export function fraseDaRecusa(motivo: 'incompleta', campo: CampoObrigatorioNFe): string;
export function fraseDaRecusa(motivo: MotivoRecusa, campo?: CampoObrigatorioNFe): string {
  if (motivo === 'incompleta') return `Nota sem ${campo ?? 'um campo obrigatório'}.`;
  return FRASES_DE_RECUSA[motivo];
}

/** Teto de leitura: uma NF-e tem dezenas de KB; 2 MB ja' e' outra coisa. Checado ANTES de decodificar. */
export const LIMITE_BYTES_NFE = 2 * 1024 * 1024;

/** `cStat` do protocolo que significam "esta nota nao vale": cancelada (101, 135), denegada (110, 301, 302). */
export const CSTAT_CANCELADA_OU_DENEGADA: readonly string[] = ['101', '135', '110', '301', '302'];
