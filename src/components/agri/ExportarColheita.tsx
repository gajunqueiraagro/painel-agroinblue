/**
 * O BOTÃO DE EXPORTAR DA COLHEITA — PR-AGRI-COLHEITA-EXPORT-15.
 *
 * ⚠ O CARD TEM LARGURA FIXA (lei do projeto): marcar ou desmarcar o toggle não pode fazer o
 * painel respirar. `w-[260px]` e pronto.
 * ⚠ ELE NUNCA SOME. Mesmo sem carga lançada o botão fica, desabilitado e com o motivo escrito
 * — um "Exportar" que aparece e desaparece conforme o dado faz o operador procurar um botão
 * que ele jura ter visto (A23, e o defeito já pago no ExportMenu do Financeiro).
 * ⚠ QUEM MONTA OS DADOS É A TELA, não este componente: ele recebe a função que já sabe o
 * recorte. Buscar de novo aqui abriria a porta para o papel divergir do que está à vista.
 */
import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function ExportarColheita({ desabilitado, motivo, onExportar, classeGatilho }: {
  desabilitado?: boolean;
  /** Por que não dá para exportar — escrito, não só no `title` (regra da OC). */
  motivo?: string;
  onExportar: (formato: 'xlsx' | 'pdf', comAnalise: boolean) => void | Promise<void>;
  /**
   * Classe do BOTÃO, para quem o monta sobre fundo escuro.
   *
   * ⚠ NASCEU DE UM DEFEITO REAL: o `variant="outline"` não declara cor de texto, então dentro de
   * uma faixa `bg-primary text-primary-foreground` — o cabeçalho dos modais do barter — ele
   * herdava BRANCO sobre o `bg-background` branco do próprio botão. O "Exportar" existia,
   * ocupava espaço e era invisível. Na colheita, que o monta sobre fundo claro, nada muda.
   */
  classeGatilho?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [comAnalise, setComAnalise] = useState(true);
  const [gerando, setGerando] = useState<'xlsx' | 'pdf' | null>(null);

  const exportar = async (formato: 'xlsx' | 'pdf') => {
    setGerando(formato);
    try {
      await onExportar(formato, comAnalise);
      setAberto(false);
    } catch (e) {
      /* ⚠ O ERRO APARECE. Um download que não acontece e não avisa deixa o operador clicando
         de novo, achando que errou a mira. */
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setGerando(null);
    }
  };

  return (
    /**
     * ⚠ O MOTIVO OCUPA ALTURA, NUNCA LARGURA — lei de estabilidade visual.
     * Ele ficava numa linha, ANTES do botão, montado por condicional: ao trocar para uma safra
     * sem carga, o texto "sem carga para exportar" entrava no fluxo e EMPURRAVA o botão — e,
     * como o bloco inteiro vive num `justify-between`, empurrava a barra de seletores junto.
     * Trocar de safra mexia a tela toda.
     * ⚠ E ELE SAI DO FLUXO POR INTEIRO (`absolute`), não só desce de linha. Medido: com o texto
     * em fluxo abaixo do botão, o CONTÊINER ainda crescia na largura — "sem carga para exportar"
     * é mais largo que "Exportar" — e empurrava os seletores de Safra e Cultura 46px para a
     * esquerda. Metade do defeito tinha sobrado.
     * ⚠ O ESPAÇO DE BAIXO É RESERVADO POR `mb`, sempre: fora do fluxo, o texto não empurraria
     * nada, mas sobreporia o que vem abaixo. A margem o acomoda com ou sem texto.
     * ⚠ E CONTINUA ESCRITO, não só no `title` — a regra da OC é que o botão desabilitado diga por
     * quê. Mudou de "ao lado" para "abaixo"; não deixou de dizer.
     */
    <div className="relative mb-[13px] flex items-center">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm"
            className={cn('h-8 gap-1 text-[11px]', classeGatilho)} disabled={desabilitado}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[260px] p-3">
          <div className="text-[11px] font-bold text-foreground">Exportar a colheita</div>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Sai o que está na tela: a safra, a cultura e o talhão escolhidos.
          </p>

          <label className="mt-2.5 flex cursor-pointer items-start gap-2">
            <Checkbox checked={comAnalise} onCheckedChange={v => setComAnalise(v === true)}
              className="mt-0.5" />
            <Label className="cursor-pointer text-[10px] font-normal leading-snug">
              Incluir a análise de produção e a classificação por faixa
            </Label>
          </label>

          <div className="mt-3 grid gap-1.5">
            <Button variant="outline" size="sm" className="h-8 justify-start gap-2 text-[11px]"
              disabled={!!gerando} onClick={() => { void exportar('xlsx'); }}>
              {gerando === 'xlsx'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}
              Excel (.xlsx)
            </Button>
            <Button variant="outline" size="sm" className="h-8 justify-start gap-2 text-[11px]"
              disabled={!!gerando} onClick={() => { void exportar('pdf'); }}>
              {gerando === 'pdf'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileText className="h-3.5 w-3.5 text-rose-600" />}
              PDF (relatório)
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <span className="pointer-events-none absolute right-0 top-[calc(100%+2px)] w-[170px]
        text-right text-[10px] leading-none text-muted-foreground">
        {desabilitado && motivo ? motivo : ''}
      </span>
    </div>
  );
}
