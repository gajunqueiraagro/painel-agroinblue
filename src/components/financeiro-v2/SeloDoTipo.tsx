/**
 * O SELO DO TIPO DO DOCUMENTO — DOC-ANEXO-E-IMPORT-01 D3 (mock `ui-validar/doc-anexo-mock.html`, cores aprovadas 05/11 17:41).
 * ⚠ COMPONENTE ÚNICO: o popover do clipe da lista, a aba Documentos e toda tela que mostra o tipo de um documento desenham ESTE; o tipo
 *   sai de `tipoDoSelo` (lib) — nenhuma segunda tabela de rótulos ou cores. Largura FIXA (nada se desloca com o rótulo: "NF" e
 *   "Guia de imposto" ocupam o mesmo lugar); o rótulo inteiro fica no `title`.
 */
import { cn } from '@/lib/utils';
import { ROTULO_DO_SELO, type TipoDoSelo } from '@/lib/financeiro/tipoDoDocumento';

const COR: Readonly<Record<TipoDoSelo, string>> = {
  nf: 'bg-[#e3edfb] text-[#24508f]', nfse: 'bg-[#e6f0f7] text-[#245d78]', boleto: 'bg-[#fdf1e3] text-[#8a5212]',
  guia: 'bg-[#f8e7e4] text-[#9b3a2d]', recibo: 'bg-[#e8f5ec] text-[#22693f]', comprovante: 'bg-[#eceff4] text-[#3c4a60]',
  contrato: 'bg-[#f0e9f8] text-[#5b3c8a]', outro: 'bg-[#f3f4f6] text-[#6b7280]',
};

/** `popover` = 84px a 9,5px (o mock D1); `lista` = 74px a 8,5px (a aba Documentos, D2 v4). */
export const TAMANHO_DO_SELO = { popover: 'w-[84px] text-[9.5px]', lista: 'w-[74px] text-[8.5px]' } as const;

export function SeloDoTipo({ tipo, tamanho = 'popover', className }: { tipo: TipoDoSelo; tamanho?: keyof typeof TAMANHO_DO_SELO; className?: string }) {
  const rotulo = ROTULO_DO_SELO[tipo];
  return (
    <span title={rotulo} data-testid="selo-do-tipo" data-tipo={tipo}
      className={cn('inline-block flex-none overflow-hidden text-ellipsis whitespace-nowrap rounded px-0.5 py-px text-center font-semibold leading-[13px]',
        TAMANHO_DO_SELO[tamanho], COR[tipo], className)}>
      {rotulo}
    </span>
  );
}
