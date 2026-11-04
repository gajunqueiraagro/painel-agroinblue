/**
 * VISAO-GERAL-02 — a tabela "Fazendas" da Visão Geral (mock aprovado, 03/11/2026).
 * Régua da casa (`regua-tabela`: cabeçalho navy 9,5px, célula 10px), fazenda pelo CÓDIGO, número que nunca corta, linha de total no
 * pé (regra 17). Clicar na fazenda troca o seletor global (o sistema inteiro filtra por ela). Os números chegam prontos
 * (`fazendasDaVisao.ts`); esta peça só desenha.
 * VISAO-GERAL-03: o quadro é o `Card` da Geo pastos › Global (título "Fazendas" a 11 px, o lembrete a 9,5 px), como a tabela de lá.
 */
import { Card } from '@/components/mapa-geo/GeoPastosGlobal';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO } from '@/components/ui/regua-tabela';
import { totalDasFazendas, type LinhaFazendaVG, type SituacaoFechamento } from './fazendasDaVisao';

/* VISAO-GERAL-05 — a unidade mora no cabeçalho ("Pecuária ha"); a célula só o número */
const ha = (v: number | null) => (v === null ? '—' : formatNum(v, 0));

function TextoFechamento({ s, mesCurto }: { s: SituacaoFechamento; mesCurto: string }) {
  if (s === 'fechado') return <span className="text-emerald-700">{mesCurto} ✓</span>;
  if (s === 'falta') return <span className="text-amber-700">falta {mesCurto}</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function TabelaFazendasVG({ linhas, mesCurto, onEscolher }: {
  linhas: readonly LinhaFazendaVG[];
  /** "set" — o mês da régua, para "set ✓" / "falta set" */
  mesCurto: string;
  onEscolher?: (fazendaId: string) => void;
}) {
  const total = totalDasFazendas(linhas);
  const th = cn(TH_REGUA, 'text-left');
  const thNum = cn(TH_REGUA, 'text-right');
  return (
    <Card titulo="Fazendas" testid="vg-fazendas"
      extra={<span className="ml-auto whitespace-nowrap text-[9.5px] text-muted-foreground">clique numa fazenda para filtrar o sistema inteiro</span>}>
      <div className="overflow-x-auto rolagem-fina">
        <table className="w-full border-collapse">
          <thead className="bg-primary text-primary-foreground">
            <tr>
              <th className={th}>Fazenda</th>
              <th className={thNum}>Pecuária ha</th>
              <th className={thNum}>Agricultura ha</th>
              <th className={thNum}>Silvicultura ha</th>
              <th className={thNum}>Reserva/APP/benf. ha</th>
              <th className={thNum}>Total ha</th>
              <th className={thNum}>Cabeças</th>
              <th className={thNum}>UA/ha</th>
              <th className={thNum}>Chuva mm</th>
              <th className={thNum}>Fechamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border/50 hover:bg-muted/40" data-testid={`vg-fazenda-${l.id}`}>
                <td className={cn(TD_REGUA_TEXTO, 'max-w-[220px]')} title={l.rotulo}>
                  {onEscolher ? (
                    <button type="button" className="text-primary hover:underline truncate max-w-full text-left" onClick={() => onEscolher(l.id)}>
                      {l.rotulo}
                    </button>
                  ) : l.rotulo}
                </td>
                <td className={TD_REGUA_NUM}>{ha(l.areaPecuaria)}</td>
                <td className={TD_REGUA_NUM}>{ha(l.areaAgricultura)}</td>
                <td className={TD_REGUA_NUM}>{ha(l.areaSilvicultura)}</td>
                <td className={TD_REGUA_NUM}>{ha(l.areaReservaAppBenf)}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{ha(l.areaTotal)}</td>
                <td className={TD_REGUA_NUM}>{formatNum(l.cabecas, 0)}</td>
                <td className={TD_REGUA_NUM}>{formatNum(l.uaHa, 2)}</td>
                <td className={TD_REGUA_NUM}>{l.chuvaMm === null ? '—' : formatNum(l.chuvaMm, 0)}</td>
                <td className={cn(TD_REGUA, 'text-right whitespace-nowrap')}><TextoFechamento s={l.fechamento} mesCurto={mesCurto} /></td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 1 && (
            <tfoot>
              <tr className="bg-primary text-primary-foreground font-medium" data-testid="vg-fazendas-total">
                <td className={cn(TD_REGUA, 'font-semibold')}>Total</td>
                <td className={TD_REGUA_NUM}>{ha(total.areaPecuaria)}</td>
                <td className={TD_REGUA_NUM}>{ha(total.areaAgricultura)}</td>
                <td className={TD_REGUA_NUM}>{ha(total.areaSilvicultura)}</td>
                <td className={TD_REGUA_NUM}>{ha(total.areaReservaAppBenf)}</td>
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{ha(total.areaTotal)}</td>
                <td className={TD_REGUA_NUM}>{formatNum(total.cabecas, 0)}</td>
                <td className={TD_REGUA_NUM}>{formatNum(total.uaHa, 2)}</td>
                <td className={TD_REGUA_NUM} />
                <td className={cn(TD_REGUA, 'text-right whitespace-nowrap')}>
                  {total.comGado > 0 ? `${total.fechadas} de ${total.comGado} fechadas` : ''}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
