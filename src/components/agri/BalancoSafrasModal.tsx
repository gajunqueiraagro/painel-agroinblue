/**
 * BALANÇO PLURIANUAL DE GRÃO — o extrato de uma cultura, safra a safra.
 *
 * A PERGUNTA QUE ELE RESPONDE: a tela de Estoque de Grãos diz quanto sobrou DA SAFRA que se está
 * olhando. Ninguém guarda grão por safra — guarda no armazém. Este balanço mostra o caminho: o
 * que cada safra produziu, o que saiu por venda e por barter, e o que atravessou para a seguinte.
 *
 * ⚠ AS SACAS ENCADEIAM, O VALOR NÃO. O `final` de uma safra é o `inicial` da próxima, então as
 * linhas descrevem MOVIMENTO e podem ser lidas de cima para baixo. O valor a mercado é UM número,
 * no cartão, e é INVENTÁRIO de hoje: avaliar cada linha e somar contaria o mesmo grão duas vezes
 * — as 3.219,64 sacas que sobraram da 23/24 estão dentro do final da 24/25 também.
 * ⚠ POR ISSO NÃO HÁ COLUNA DE VALOR. A ausência é a regra, não uma pendência.
 * ⚠ E OS CARTÕES DIZEM O ESCOPO: "todas as safras", porque os cartões da tela atrás dizem outro
 * número para a mesma frase — lá é a safra escolhida, aqui é a cultura inteira. Os dois estão
 * certos; o rótulo é o que impede o operador de achar que um deles está errado.
 */
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { formatIsoToBr } from '@/components/ui/date-picker';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeDaCultura, rotuloCulturaUnidade } from '@/lib/agri/colheita';
import { TH_CINZA as TH } from '@/lib/idiomaVisual';
import { Cartao } from '@/components/ui/cartao';
import { useEstoqueGraosBalanco } from '@/hooks/useEstoqueGraos';

export function BalancoSafrasModal({
  aberto, onFechar, clienteId, cultura, dataCotacao,
}: {
  aberto: boolean;
  onFechar: () => void;
  clienteId: string | null;
  /** A cultura escolhida na tela. O balanço não existe para "Todas". */
  cultura: string;
  /**
   * A data da cotação mais recente em uso, para o rodapé.
   *
   * ⚠ ELA VEM DA TELA, NÃO DA RPC DO BALANÇO: `fn_estoque_graos_balanco` não devolve data, e a
   * tela já tem a mais recente entre as classes (`totaisDoEstoque.dataMercado`), calculada sobre
   * uma consulta que NÃO filtra cotação por safra. `null` quando nunca se cotou — e aí o rodapé
   * some, em vez de inventar uma data.
   */
  dataCotacao: string | null;
}) {
  const { linhas, valorMercadoTotal, carregando, erro } =
    useEstoqueGraosBalanco(clienteId, cultura || null, aberto);

  const unidade = unidadeDaCultura(cultura);
  const rotuloUnidade = unidade.unidadeTotal === 'sacas' ? 'sc' : 't';
  /* ⚠ O ESTOQUE DE HOJE É O `final` DA ÚLTIMA LINHA, não uma soma: as linhas encadeiam, e somar
     os finais contaria o grão uma vez por safra que ele atravessou. */
  const emEstoque = linhas.length > 0 ? linhas[linhas.length - 1].final : 0;

  /* ⚠ "—" É AUSÊNCIA DE MOVIMENTO, NUNCA ZERO CALCULADO. O `inicial` da primeira safra e as
     colunas de venda e quebra — hoje zeradas no Proto inteiro — não são "zero sacas", são "não
     houve". Um "0,00" ali convidaria a procurar o lançamento que nunca existiu. */
  const mov = (v: number, cor?: string) => (v === 0
    ? <span className="text-muted-foreground">—</span>
    : <span className={cor}>{formatNum(v, 2)}</span>);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Balanço por safra · {labelDaCultura(cultura)}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              O que cada safra produziu, o que saiu e o que atravessou para a seguinte.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 px-3 py-2">
          {/* ⚠ OS DOIS CARTÕES SOMAM O MESMO PAYLOAD QUE A TABELA MOSTRA — o estoque é o `final`
              da última linha e o valor vem da RPC. Nenhuma segunda consulta: cartão e tabela não
              podem discordar. */}
          <div className="grid gap-1.5 md:grid-cols-2">
            {/* ⚠ O ESCOPO NA SEGUNDA LINHA, a mesma forma que os cartões da tela atrás passaram a
                usar: enquanto um dizia "— todas as safras" inline e o outro "esta safra" embaixo,
                a mesma ideia tinha duas caras entre telas vizinhas. */}
            <Cartao rotulo="Em estoque hoje" escopo="todas as safras" unidade={rotuloUnidade}
              valor={formatNum(emEstoque, 2)} />
            <Cartao rotulo="Valor a mercado hoje" unidade="R$"
              valor={formatNum(valorMercadoTotal, 2)}
              titulo={formatMoeda(valorMercadoTotal)} cor="text-success" />
          </div>

          {/* ⚠ O MESMO RÓTULO DA TELA DE ESTOQUE E DO MODAL DE VENDA, pela mesma função. Aqui ele
              trabalha mais que nos outros dois: a tabela abaixo não tem cabeçalho de unidade em
              coluna nenhuma — "Inicial", "+Produção", "=Final" são todos números nus —, e é esta
              linha que diz em que se medem. */}
          <p className="text-[11px] text-muted-foreground">{rotuloCulturaUnidade(cultura)}</p>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['20%', '14%', '14%', '12%', '12%', '12%', '16%'].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Safra</th>
                  <th className={cn(TH, 'text-right')}>Inicial</th>
                  {/* ⚠ O SINAL VAI NO RÓTULO, não numa coluna de sinal: "+Produção" e "−Vendas"
                      dizem a direção sem gastar largura, e a linha se lê como a conta que ela é. */}
                  <th className={cn(TH, 'text-right')}>+Produção</th>
                  <th className={cn(TH, 'text-right')}>−Vendas</th>
                  <th className={cn(TH, 'text-right')}>−Barter</th>
                  <th className={cn(TH, 'text-right')}>−Quebra</th>
                  <th className={cn(TH, 'text-right')}>=Final</th>
                </tr>
              </thead>
              <tbody>
                {/* ⚠ OS TRÊS ESTADOS SEPARADOS, a lição das outras listas de grão: uma falha de
                    leitura renderizada como "nenhum movimento" afirmaria que não há estoque. */}
                {erro ? (
                  <tr><td colSpan={7} className="px-2 py-6 text-center">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Não foi possível carregar o balanço.
                    </span>
                    <div className="mt-1 text-[10px] text-muted-foreground" title={erro.message}>
                      O saldo não foi lido — o dado continua no banco.
                    </div>
                  </td></tr>
                ) : carregando ? (
                  <tr><td colSpan={7} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                    </span>
                  </td></tr>
                ) : linhas.length === 0 ? (
                  <tr><td colSpan={7} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                    Esta cultura ainda não tem safra com área cadastrada.
                  </td></tr>
                ) : linhas.map((l, i) => (
                  /* ⚠ A ÚLTIMA LINHA É O ESTOQUE DE HOJE, e é ela que o cartão repete. O destaque
                      verde marca onde a leitura termina — não é "bom", é "aqui". */
                  <tr key={l.safra} className={cn('border-t border-slate-100',
                    i === linhas.length - 1 && 'bg-success/[0.06]')}>
                    <td className="truncate px-2 py-1 text-[11px] font-medium">{l.safra}</td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums text-muted-foreground">
                      {mov(l.inicial)}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums">
                      {mov(l.producao, 'text-success')}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums">
                      {mov(l.venda, 'text-destructive')}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums">
                      {mov(l.barter, 'text-destructive')}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] tabular-nums">
                      {mov(l.quebra, 'text-destructive')}
                    </td>
                    <td className={cn('px-2 py-1 text-right text-[11px] font-medium tabular-nums',
                      l.final > 0 && 'text-success')}>
                      {formatNum(l.final, 2)}
                    </td>
                  </tr>
                ))}
                {/* ⚠ NÃO HÁ LINHA DE TOTAL, e a ausência é a mesma regra do valor: somar uma coluna
                    que encadeia contaria o mesmo grão tantas vezes quantas safras ele atravessou.
                    O "total" desta tabela é o `final` da última linha — que é o cartão. */}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] leading-snug text-muted-foreground">
            Inicial + Produção − Vendas − Barter − Quebra = Final. O final de cada safra abre a
            próxima. As sacas contam o <strong>movimento</strong>; o valor a mercado (cartão) é do
            estoque <strong>total de hoje</strong>, não a soma das linhas.
            {/* ⚠ A DATA SÓ APARECE SE HOUVER: sem cotação o rodapé some inteiro, porque "no dia —"
                não informa nada e uma data de hoje afirmaria um preço que ninguém lançou. */}
            {dataCotacao && <> Valor a mercado no dia {formatIsoToBr(dataCotacao)}.</>}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
