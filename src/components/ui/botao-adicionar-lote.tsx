import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Adicionar lote" — o MESMO botão nas três telas — OC-BOITEL-CRIAR-LOTE-01.
 *
 * ⚠ ERAM TRÊS APARÊNCIAS PARA O MESMO ATO. O Abate tinha botão (`Button` na variante
 * `default`, portanto `bg-cta`), a negociação de compra/venda tinha um link `+ Adicionar
 * lote` em 11px `text-primary`, e a venda boitel tinha um `+ criar` de 11px ao lado de um
 * traço de 22px. Três respostas visuais para "como eu crio um lote?", e a do boitel era a
 * menos visível justamente onde o lote é obrigatório e único.
 *
 * ⚠ VERDE POR DECISÃO DE PRODUTO (Gabriel, 24/09/2026), e vale registrar a tensão: o
 * `tailwind.config.ts:48` descreve `success` como "verde-grama, semântico de valor
 * positivo", e criar um lote não é valor. A leitura que prevalece é a do dono — ADICIONAR
 * é o ato positivo da aba, o único que faz a negociação existir. O registro do
 * MOVIMENTACOES-PADRAO-01 já dizia "adicionar lote em verde".
 *
 * ⚠ O TAMANHO NÃO É ESCOLHA LIVRE: 22px de altura com texto 10px é a escala de modal do
 * A18 (docs/PADROES-UI.md), a mesma dos botões do rodapé do `LoteDialog`. Um botão maior
 * empurraria o bloco de topo, que não rola.
 */
export function BotaoAdicionarLote({ onClick, disabled, title, ariaLabel }: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <Button type="button" size="sm" onClick={onClick} disabled={disabled} title={title}
      aria-label={ariaLabel ?? 'Adicionar lote'}
      className="h-[22px] shrink-0 gap-1 px-[9px] text-[10px] font-medium bg-success text-white hover:bg-success/90">
      <Plus className="h-3 w-3" /> Adicionar lote
    </Button>
  );
}
