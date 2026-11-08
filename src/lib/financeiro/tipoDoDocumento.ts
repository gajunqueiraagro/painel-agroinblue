/**
 * O TIPO DO DOCUMENTO NO SELO — DOC-ANEXO-E-IMPORT-01 D3 (mock `ui-validar/doc-anexo-mock.html`, aprovado 05/11 17:41). PURO.
 * Os 8 selos: NF · NFS-e · Boleto · Guia de imposto · Recibo · Comprovante · Contrato · Outro. Toda tela que mostra o tipo de um documento
 * (o popover do clipe, a aba Documentos, …) pergunta AQUI e desenha pelo `SeloDoTipo` — nenhuma segunda tabela de rótulos ou cores.
 * ⚠ As espécies NOVAS do lançamento (`nfse`, `guia`, `contrato`) chegam com a F3 (migration); até lá a NFS-e gravada como "nf" se
 *   reconhece pela chave de 50 dígitos (são 7 no proto, medido na FASE 0). As da OC entram pelo vocabulário dela.
 */
export type TipoDoSelo = 'nf' | 'nfse' | 'boleto' | 'guia' | 'recibo' | 'comprovante' | 'contrato' | 'outro';

export const TIPOS_DO_SELO: readonly TipoDoSelo[] = ['nf', 'nfse', 'boleto', 'guia', 'recibo', 'comprovante', 'contrato', 'outro'];

export const ROTULO_DO_SELO: Readonly<Record<TipoDoSelo, string>> = {
  nf: 'NF', nfse: 'NFS-e', boleto: 'Boleto', guia: 'Guia de imposto', recibo: 'Recibo', comprovante: 'Comprovante', contrato: 'Contrato', outro: 'Outro',
};

/* as espécies da OC (`zoo_operacao_documentos`) que são nota fiscal */
const NF_DA_OC: readonly string[] = ['nf_principal', 'nf_complementar', 'nf_produtor', 'nf_entrada'];
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** O selo de um documento: a espécie gravada (do lançamento ou, na OC, a dela); a NF com chave de 50 dígitos é NFS-e. */
export function tipoDoSelo(d: { especie: string | null | undefined; especieOC?: string | null; chaveAcesso?: string | null }): TipoDoSelo {
  const e = d.especieOC ?? d.especie ?? '';
  if (e === 'nfse') return 'nfse';
  if (e === 'nf' || NF_DA_OC.includes(e)) return digitos(d.chaveAcesso).length === 50 ? 'nfse' : 'nf';
  if (e === 'guia' || e === 'boleto' || e === 'recibo' || e === 'comprovante' || e === 'contrato') return e;
  return 'outro';
}
