/** O prefixo CURTO da espécie do documento da OC na identidade da linha ("NF 007.086.649"); movido verbatim de `AbaDocumentosOC`. */
import type { EspecieDoc } from '@/hooks/useOperacaoDocumentos';

export const PREFIXO_ESPECIE: Record<EspecieDoc, string> = {
  nf_principal: 'NF', nf_complementar: 'NF compl.', recibo: 'Recibo', outro: 'Doc.',
  npr: 'NPR', acerto: 'Acerto', romaneio: 'Romaneio',
  nf_produtor: 'NF prod.', gta: 'GTA', guia: 'Guia', declaracao: 'Decl.',
  contrato: 'Contrato', nf_entrada: 'NF entrada', comprovante: 'Comprov.',
};
