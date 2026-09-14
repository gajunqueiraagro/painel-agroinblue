/**
 * A COMPOSIÇÃO DA ENTREGA POR CLASSE — a tabela que diz COMO a entrega foi paga.
 *
 * ⚠ SAIU DE DENTRO DA `AgriBarterTab` porque ganhou um segundo leitor. Ela nasceu no card do
 * contrato, somando todas as vendas; agora a lista de vendas abre a composição de UMA venda pelo
 * ↗. Duas cópias da mesma tabela divergiriam na primeira manutenção, e a divergência apareceria
 * como o card mostrando um preço médio e o detalhe outro, sobre o mesmo grão.
 * ⚠ O CÁLCULO NÃO MORA AQUI: vem pronto de `composicaoDasVendas`, no lib que os testes cobrem.
 * Este arquivo só desenha.
 */
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { corDaClasse, labelDaClasse, type composicaoDasVendas } from '@/lib/agri/barterVenda';

type Composicao = ReturnType<typeof composicaoDasVendas>;

export function BarterComposicaoEntrega({ composicao, rotuloTotal, th, larguraMax }: {
  composicao: Composicao;
  /** "Líquido entregue" no card do contrato; "Líquido desta venda" no detalhe de uma. */
  rotuloTotal: string;
  /** A classe do cabeçalho e do rodapé — cada host tem o seu tom. */
  th: string;
  /** `undefined` = ocupa a largura disponível (dentro de um modal, por exemplo). */
  larguraMax?: number;
}) {
  return (
    /* ⚠ BLOCO CONTIDO no card do contrato: a composição ocupava a largura inteira para mostrar
       quatro linhas de três números, e uma tabela esticada põe o rótulo a um palmo do valor.
       Dentro do modal, que já é estreito, o teto não faz falta e por isso é opcional. */
    <div className="w-full shrink-0 overflow-hidden rounded-md border"
      style={larguraMax ? { maxWidth: larguraMax } : undefined}>
      <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
        <colgroup>
          {['40%', '18%', '18%', '24%'].map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className={cn(th, 'text-left')}>Composição da entrega</th>
            <th className={cn(th, 'text-right')}>Sacas</th>
            <th className={cn(th, 'text-right')}>R$ / saca</th>
            <th className={cn(th, 'text-right')}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {composicao.linhas.map(l => (
            <tr key={l.classe} className="border-t border-slate-100">
              <td className="px-1.5 py-0.5">
                {/* ⚠ O PONTO ACOMPANHA O RÓTULO, nunca o substitui: quem não distingue as cores
                    continua lendo "Acima de 20 ppb". */}
                <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                  corDaClasse(l.classe))} />
                {labelDaClasse(l.classe)}
              </td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{formatNum(l.sacas, 2)}</td>
              <td className="px-1.5 py-0.5 text-right tabular-nums text-muted-foreground">
                {formatMoeda(l.precoMedio)}
              </td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{formatMoeda(l.valor)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300">
            <td className="px-1.5 py-0.5 font-semibold">Bruto</td>
            <td className="px-1.5 py-0.5 text-right font-semibold tabular-nums">
              {formatNum(composicao.sacas, 2)}
            </td>
            <td />
            <td className="px-1.5 py-0.5 text-right font-semibold tabular-nums">
              {formatMoeda(composicao.bruto)}
            </td>
          </tr>
          {/* ⚠ O SENAR SÓ APARECE QUANDO EXISTE: uma linha "(−) Senar R$ 0,00" afirmaria que houve
              retenção e ela foi zero, quando o caso é não ter havido retenção nenhuma. */}
          {composicao.deducoes > 0 && (
            <tr className="border-t border-slate-100">
              <td className="px-1.5 py-0.5 pl-4 text-muted-foreground">(−) Senar</td>
              <td /><td />
              <td className="px-1.5 py-0.5 text-right tabular-nums text-destructive">
                {formatMoeda(composicao.deducoes)}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className={cn(th, 'text-left')}>{rotuloTotal}</td>
            <td className={th} /><td className={th} />
            <td className={cn(th, 'text-right tabular-nums')}>{formatMoeda(composicao.liquido)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
