/**
 * FAZENDA-CADASTRO-01 · F1b — os blocos SÓ DE LEITURA da tela do cadastro (mock tela 2): a faixa das pendências (P5), a área em três medidas
 * (P3: matrícula × soma dos pastos × desenho, a diferença sempre à mostra) com o "Uso da área" (D2 famílias zeradas aparecem, D3 % do destino
 * sobre a família, + a coluna Pastos), o resumo de hoje (último fechamento + chuva do ano, Q3) e o histórico do cadastro (a trilha que já existe).
 */
import type { ReactNode } from 'react';
import { BlocoFormulario } from '@/components/ui/bloco-formulario';
import { formatNum } from '@/lib/calculos/formatters';
import { mesCurtoDe, textosDaVariacao, variacaoNoAno } from '@/lib/fazendas/listaDeFazendas';
import { mesAnoBR, type MudancaDoCadastro } from '@/lib/fazendas/cadastroDaFazenda';
import type { ResumoDaFazenda } from '@/hooks/useResumoDaFazenda';
import { cn } from '@/lib/utils';

export function FaixaDePendencias({ pendencias }: { pendencias: readonly string[] }) {
  return (
    <div data-testid="cadastro-pendencias"
      className={cn('mb-2 flex h-6 items-center rounded border px-2 text-[10px]',
        pendencias.length > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
      <span className="min-w-0 flex-1 truncate" title={pendencias.join(' · ') || undefined}>
        {pendencias.length === 0
          ? 'Cadastro completo.'
          : `Faltam ${pendencias.length} ${pendencias.length === 1 ? 'item' : 'itens'} no cadastro: ${pendencias.join(' · ')} — nenhum bloqueia o uso; servem para relatórios e documentos.`}
      </span>
    </div>
  );
}

const ha = (v: number | null | undefined) => (v == null ? '—' : `${formatNum(v, 2)} ha`);

export interface LinhaDoUso { rotulo: string; ha: number; base: number; pastos: number; destino?: boolean }

export function BlocoArea({ matriculaHa, conferida, acaoConferir, pastosHa, desenho, uso, total, totalPastos }: {
  matriculaHa: number | null;
  conferida: string | null;
  acaoConferir: ReactNode;
  pastosHa: number;
  desenho: ResumoDaFazenda['desenho'];
  uso: LinhaDoUso[];
  total: number;
  totalPastos: number;
}) {
  const difPastos = matriculaHa != null ? pastosHa - matriculaHa : null;
  const refDesenho = matriculaHa ?? pastosHa;
  /* desenho dos pastos INCOMPLETO não se compara (seria a falta de desenho lida como diferença de área): diz quantos faltam */
  const faltamNoMapa = desenho?.tipo === 'pastos' ? desenho.de - desenho.desenhados : 0;
  const difDesenho = desenho && refDesenho > 0 && faltamNoMapa === 0 ? desenho.ha - refDesenho : null;
  const sinal = (v: number) => `${v > 0 ? '+' : ''}${formatNum(v, 2)} ha`;
  const pct = (v: number, base: number) => (base > 0 ? `${formatNum((v / base) * 100, 1)}%` : '—');
  return (
    <BlocoFormulario titulo="Área" dica="três medidas, lado a lado — a diferença nunca é escondida" testId="cadastro-area">
      <div className="grid grid-cols-3 gap-2" data-testid="cadastro-tres-medidas">
        <div className="rounded border bg-muted/40 px-2 py-1">
          <p className="text-[9.5px] text-muted-foreground">Matrícula</p>
          <p className="text-[12px] font-semibold tabular-nums whitespace-nowrap">{ha(matriculaHa)}</p>
          <div className="flex h-5 items-center text-[9.5px]">
            {conferida ? <span className="text-muted-foreground">conferida em {conferida}</span> : acaoConferir}
          </div>
        </div>
        <div className="rounded border bg-muted/40 px-2 py-1">
          <p className="text-[9.5px] text-muted-foreground">Soma dos pastos (cadastro)</p>
          <p className="text-[12px] font-semibold tabular-nums whitespace-nowrap">{ha(pastosHa)}</p>
          <p className={cn('h-5 text-[9.5px] leading-5 tabular-nums',
            difPastos == null ? 'text-muted-foreground' : conferida && Math.abs(difPastos) < 0.01 ? 'text-emerald-700' : Math.abs(difPastos) < 0.01 ? 'text-muted-foreground' : 'text-amber-700')}>
            {difPastos == null ? 'sem matrícula para comparar' : `diferença ${sinal(difPastos)}`}
          </p>
        </div>
        <div className="rounded border bg-muted/40 px-2 py-1">
          <p className="truncate text-[9.5px] text-muted-foreground"
            title={desenho?.tipo === 'pastos' ? 'A fazenda não tem desenho próprio: soma da área do mapa dos pastos desenhados' : undefined}>
            {desenho?.tipo === 'pastos' ? `Pastos desenhados · ${desenho.desenhados} de ${desenho.de}` : 'Desenho da fazenda'}
          </p>
          <p className="text-[12px] font-semibold tabular-nums whitespace-nowrap">{desenho ? ha(desenho.ha) : '—'}</p>
          <p className={cn('h-5 truncate text-[9.5px] leading-5 tabular-nums',
            faltamNoMapa > 0 || (difDesenho != null && Math.abs(difDesenho) >= 0.01) ? 'text-amber-700' : 'text-muted-foreground')}>
            {faltamNoMapa > 0 ? `${faltamNoMapa === 1 ? 'falta 1 pasto' : `faltam ${faltamNoMapa} pastos`} no mapa`
              : difDesenho == null ? 'sem desenho no mapa'
              : `${sinal(difDesenho)} · ${formatNum(Math.abs(difDesenho / refDesenho) * 100, 1)}% ${matriculaHa != null ? 'da matrícula' : 'dos pastos'}`}
          </p>
        </div>
      </div>

      <div className="mt-1.5 overflow-hidden rounded border" data-testid="cadastro-uso-da-area">
        <div className="grid grid-cols-[1fr_84px_58px_44px] gap-1 bg-primary py-1 text-primary-foreground">
          <p className="pl-1 text-[9.5px] font-medium">Uso da área</p>
          <p className="px-1 text-right text-[9.5px] font-medium">ha</p>
          <p className="px-1 text-right text-[9.5px] font-medium" title="família sobre o total; destino sobre a família">%</p>
          <p className="px-1 text-right text-[9.5px] font-medium">Pastos</p>
        </div>
        {uso.map((l, i) => (
          <div key={`${l.rotulo}-${i}`} className={cn('grid grid-cols-[1fr_84px_58px_44px] items-baseline gap-1',
            l.destino ? cn('py-0', i % 2 === 0 ? 'bg-muted/30' : 'bg-card') : 'bg-primary/10 py-0.5')}>
            <span className={l.destino ? 'pl-4 text-[9.5px] text-muted-foreground' : 'pl-1 text-[11px] font-medium'}>{l.rotulo}</span>
            <span className={cn('px-1 text-right tabular-nums', l.destino ? 'text-[9.5px] text-muted-foreground' : 'text-[11px] font-medium')}>{formatNum(l.ha, 2)}</span>
            <span className={cn('px-1 text-right tabular-nums', l.destino ? 'text-[9.5px] text-muted-foreground' : 'text-[11px] font-medium')}>
              {l.ha > 0 ? pct(l.ha, l.base) : '—'}
            </span>
            <span className={cn('px-1 text-right tabular-nums', l.destino ? 'text-[9.5px] text-muted-foreground' : 'text-[11px] font-medium')}>
              {l.pastos > 0 ? l.pastos : '—'}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_84px_58px_44px] items-baseline gap-1 bg-primary py-1 text-primary-foreground">
          <span className="pl-1 text-[11px] font-semibold">Total</span>
          <span className="px-1 text-right text-[11px] font-semibold tabular-nums">{formatNum(total, 2)}</span>
          <span className="px-1 text-right text-[10px] tabular-nums">{total > 0 ? '100,0%' : '—'}</span>
          <span className="px-1 text-right text-[11px] font-semibold tabular-nums">{totalPastos}</span>
        </div>
      </div>
      <p className="mt-1 text-[9.5px] text-muted-foreground">A composição vem do cadastro dos pastos (aba Pastos) — aqui só se lê. Piquete conta uma vez, dentro do pasto dele.</p>
    </BlocoFormulario>
  );
}

export function BlocoResumoDeHoje({ resumo }: { resumo: ResumoDaFazenda }) {
  const f = resumo.fechamento;
  /* regra geral do rebanho (Gabriel 12/11 20:27): delta e % no ano contra o saldo inicial do ano */
  const noAno = textosDaVariacao(variacaoNoAno(f?.cabecas, f?.inicioDoAno));
  return (
    <BlocoFormulario titulo="Resumo de hoje" dica={f ? `lido do último fechamento · ${mesCurtoDe(f.anoMes)}` : 'sem fechamento no último ano'} testId="cadastro-resumo">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[9.5px] text-muted-foreground">Rebanho</p>
          <p className="text-[12px] font-semibold tabular-nums">{f ? `${formatNum(f.cabecas, 0)} cab` : '—'}</p>
          <p className={cn('h-[13px] whitespace-nowrap text-[9.5px] leading-[13px] tabular-nums',
            noAno?.sinal === 1 ? 'text-emerald-700' : noAno?.sinal === -1 ? 'text-red-700' : 'text-muted-foreground')} title={noAno?.inteiro}
            data-testid="cadastro-rebanho-no-ano">
            {noAno?.nota ?? (f ? 'sem saldo inicial do ano' : '')}
          </p>
          <p className="truncate text-[9.5px] text-muted-foreground">
            {resumo.partida ? `partida: ${formatNum(resumo.partida.cabecas, 0)} em ${mesAnoBR(resumo.partida.anoMes)}` : 'sem rebanho inicial'}
          </p>
        </div>
        <div>
          <p className="text-[9.5px] text-muted-foreground">Lotação</p>
          <p className="text-[12px] font-semibold tabular-nums">{f?.lotacao != null ? `${formatNum(f.lotacao, 2)} UA/ha` : '—'}</p>
          <p className="truncate text-[9.5px] text-muted-foreground">{f ? `${mesCurtoDe(f.anoMes)} · área própria` : ''}</p>
        </div>
        <div>
          <p className="text-[9.5px] text-muted-foreground">Chuva {resumo.chuva?.ano ?? ''}</p>
          <p className="text-[12px] font-semibold tabular-nums">{resumo.chuva ? `${formatNum(resumo.chuva.mm, 0)} mm` : '—'}</p>
          <p className="truncate text-[9.5px] text-muted-foreground">
            {resumo.chuva ? `${resumo.chuva.dias} dia${resumo.chuva.dias === 1 ? '' : 's'} com chuva` : ''}
          </p>
        </div>
      </div>
    </BlocoFormulario>
  );
}

export function BlocoHistorico({ historico }: { historico: readonly MudancaDoCadastro[] }) {
  return (
    <BlocoFormulario titulo="Histórico do cadastro" dica="quem mudou o quê" testId="cadastro-historico">
      <div className="max-h-[140px] overflow-auto rounded border">
        <table className="w-full table-fixed border-collapse text-[10px]">
          <colgroup><col style={{ width: 76 }} /><col style={{ width: 120 }} /><col /></colgroup>
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="sticky top-0 z-10 h-[22px] bg-primary px-1 text-left text-[9.5px] font-medium">Quando</th>
              <th className="sticky top-0 z-10 h-[22px] bg-primary px-1 text-left text-[9.5px] font-medium">Quem</th>
              <th className="sticky top-0 z-10 h-[22px] bg-primary px-1 text-left text-[9.5px] font-medium">O que mudou</th>
            </tr>
          </thead>
          <tbody>
            {historico.length === 0 ? (
              <tr><td colSpan={3} className="h-[19px] px-1 text-center text-muted-foreground">Nenhuma mudança registrada.</td></tr>
            ) : historico.map((h, i) => (
              <tr key={i} className={i % 2 ? 'bg-muted/30' : ''}>
                <td className="h-[19px] px-1 tabular-nums">{h.quando}</td>
                <td className="h-[19px] truncate px-1" title={h.quem}>{h.quem}</td>
                <td className="h-[19px] truncate px-1" title={h.oQue}>{h.oQue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlocoFormulario>
  );
}
