import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { acceptDaRegra, resumoDaRegra, type RegraDeAceite, type VereditoDoArquivo } from '@/lib/arquivo/aceitarArquivo';
import { useSoltarArquivo } from '@/lib/arquivo/useSoltarArquivo';

/**
 * A ÁREA QUE RECEBE ARQUIVO — UI-ARRASTAR-ARQUIVO-01a (regra do Gabriel, 05/10/2026): todo campo de arquivo aceita CLICAR e
 * ARRASTAR, com realce verde enquanto o arquivo passa por cima.
 *
 * ⚠ UM COMPONENTE, UMA REGRA: quem decide se o arquivo serve é `aceitarArquivo` (`src/lib/arquivo/aceitarArquivo.ts`); aqui só
 *   mora o gesto. O que a tela FAZ com o arquivo aceito (anexar, ler o PDF, ler o XML) é de quem usa.
 * ⚠ DOIS MODOS: "um" (padrão) recusa NA ÁREA, em vermelho, e não chama o destino; "lote" entrega TODOS os arquivos com o
 *   veredito de cada um, e a tela mostra por linha (boletos, XML).
 * ⚠ UMA LINHA, ALTURA DE QUEM USA: o texto corta com o inteiro no `title`; a altura vem do `className` do hospedeiro e não
 *   muda com arquivo, recusa ou realce (modal de tamanho fixo é regra).
 * ⚠ O GESTO DE ARRASTAR MORA NO HOOK `useSoltarArquivo` (o mesmo que a linha de parcela usa): contador de entradas para o
 *   realce não piscar, "só arquivo", e o aceite pela regra. Aqui só mora o desenho.
 * ⚠ `motivoExterno`: a recusa que só o HOSPEDEIRO sabe dar DEPOIS do aceite (o detector do "Importar Banco" lê o conteúdo do
 *   arquivo). Aparece no mesmo lugar e do mesmo jeito da recusa do dono; o componente não conhece a regra de quem a mandou.
 */

export interface AreaDeArquivoProps {
  regra: RegraDeAceite;
  modo?: 'um' | 'lote';
  /** "um": só os aceitos (um, ou vários se a regra permite). "lote": todos, com o veredito de cada um. */
  onArquivos: (arquivos: File[], porArquivo: VereditoDoArquivo[]) => void;
  /** O convite. Padrão: "Clique ou arraste o arquivo". O resumo da regra (tipos, limite) vem depois, com "·". */
  convite?: string;
  /** Substitui o resumo da regra depois do "·" (ex.: "NF-e (modelo 55) · um arquivo por nota"). Vazio = só o convite. */
  detalhe?: string;
  /** O que ocupa a linha no lugar do convite: o nome do arquivo escolhido, "arquivo anexado · substituir"… */
  conteudo?: React.ReactNode;
  /** O texto inteiro de `conteudo`, para o `title` (nome de arquivo longo corta na tela). */
  tituloDoConteudo?: string;
  /** Segunda informação curta, à direita do texto, que nunca corta (tamanho do arquivo, contagem). */
  fixo?: string;
  /** Mostra "remover" à direita e o chama. */
  onRemover?: () => void;
  /** Um botão à direita que abre o seletor ("Escolher arquivos"). A área inteira continua clicável. */
  rotuloDoBotao?: string;
  desabilitado?: boolean;
  /** Por que está apagada — escrito na área, no lugar do convite. */
  motivoDesabilitado?: string;
  /** Recusa dada pelo hospedeiro depois do aceite (conteúdo do arquivo). Nula = nada a dizer. */
  motivoExterno?: string | null;
  className?: string;
  testId?: string;
  inputTestId?: string;
}

export function AreaDeArquivo({
  regra, modo = 'um', onArquivos, convite = 'Clique ou arraste o arquivo', detalhe, conteudo, tituloDoConteudo, fixo,
  onRemover, rotuloDoBotao, desabilitado = false, motivoDesabilitado, motivoExterno = null, className, testId, inputTestId,
}: AreaDeArquivoProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { sobre, recusa: recusaDoDono, limparRecusa, receber, alvo } = useSoltarArquivo({ regra, modo, desabilitado, onArquivos });
  const recusa = recusaDoDono ?? (motivoExterno && motivoExterno.trim() ? motivoExterno : null);

  const abrir = () => { if (!desabilitado) inputRef.current?.click(); };

  /* `detalhe=""`: só o convite (quem usa já diz os formatos ao lado, e a linha é curta). */
  const resumo = detalhe ?? resumoDaRegra(regra);
  const convitePadrao = resumo ? `${convite} · ${resumo}` : convite;
  const apagado = desabilitado ? (motivoDesabilitado ?? convitePadrao) : null;
  const texto = recusa ?? apagado ?? null;
  const titulo = recusa ?? apagado ?? (conteudo != null ? (tituloDoConteudo ?? undefined) : convitePadrao);

  return (
    <div
      role="button"
      tabIndex={desabilitado ? -1 : 0}
      aria-disabled={desabilitado || undefined}
      data-testid={testId}
      data-area-de-arquivo=""
      data-sobre={sobre ? 'sim' : undefined}
      title={titulo}
      onClick={abrir}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); } }}
      {...alvo}
      className={cn(
        /* `relative`: o seletor escondido (posição absoluta) fica PRESO na área — solto, ele vazava da rolagem do hospedeiro. */
        'relative flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md border border-dashed px-3 text-[11px] leading-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40',
        desabilitado
          ? 'cursor-not-allowed border-muted-foreground/30 bg-muted/20 text-muted-foreground'
          : sobre
            ? 'cursor-copy border-success bg-success/25 text-success ring-2 ring-success/40'
            : 'cursor-pointer border-success bg-success/10 text-success hover:bg-success/15',
        className,
      )}
    >
      <Upload className="h-3.5 w-3.5 shrink-0" />
      {texto != null ? (
        <span className={cn('min-w-0 flex-1 truncate font-medium', recusa && 'text-destructive')}
          role={recusa ? 'alert' : undefined} data-testid={recusa ? 'area-de-arquivo-recusa' : desabilitado ? 'area-de-arquivo-motivo' : undefined}>
          {texto}
        </span>
      ) : conteudo != null ? (
        <span className="min-w-0 flex-1 truncate font-medium">{conteudo}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate font-medium">{convitePadrao}</span>
      )}
      {fixo && <span className="shrink-0 tabular-nums text-muted-foreground">{fixo}</span>}
      {onRemover && !desabilitado && (
        <button type="button" className="shrink-0 underline underline-offset-2"
          onClick={(e) => { e.stopPropagation(); limparRecusa(); onRemover(); }}>
          remover
        </button>
      )}
      {rotuloDoBotao && (
        <Button type="button" size="sm" variant="outline" className="h-[22px] shrink-0 px-[9px] text-[10px] text-foreground"
          disabled={desabilitado} tabIndex={-1} onClick={(e) => { e.stopPropagation(); abrir(); }}>
          {rotuloDoBotao}
        </Button>
      )}
      <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} data-testid={inputTestId}
        accept={acceptDaRegra(regra)} multiple={!!regra.varios} disabled={desabilitado}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; receber(fs); }} />
    </div>
  );
}
