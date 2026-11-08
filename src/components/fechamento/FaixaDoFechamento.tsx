/**
 * FECH-FAIXA-01 (Gabriel 08/11 07:17) — a faixa do fechamento do mês, no topo do Fechamento área, do Valor do Rebanho e do Mapa do
 * rebanho, no MESMO lugar e com a MESMA altura (22px, uma linha):
 *   "Out/26 · ① Pastos 17/17 fechados ✓ → ② Valor do rebanho ⏳ falta validar → ③ Mapa do rebanho"
 * A etapa da tela aberta fica destacada (navy). As outras abrem a tela delas no MESMO mês e fazenda (o mês é um só: o do shell) — só
 * quando há destino (`abrir[etapa]`; quem não pode abrir a tela vê o texto, sem botão). O bloqueio aparece na etapa: "② ⚠ invalidado —
 * rebanho mudou" leva ao Valor do Rebanho daquele mês, onde está o Revalidar.
 */
import { Fragment } from 'react';
import type { EstadoDaFaixa, EtapaDoFechamento, TomDaEtapa } from '@/lib/fechamento/faixaDoFechamento';
import { mesDaFaixa, passosDaFaixa } from '@/lib/fechamento/faixaDoFechamento';

const COR_DO_TOM: Record<TomDaEtapa, string> = {
  ok: 'text-emerald-700',
  pendente: 'text-amber-700',
  alerta: 'text-red-700',
  neutro: 'text-slate-700',
};

interface Props {
  estado: EstadoDaFaixa | null;
  /** a etapa da tela aberta (destacada, sem clique) */
  atual: EtapaDoFechamento;
  /** abrir a tela de cada etapa no mesmo mês; sem a função, a etapa é só texto */
  abrir?: Partial<Record<EtapaDoFechamento, () => void>>;
}

export function FaixaDoFechamento({ estado, atual, abrir }: Props) {
  if (!estado) return null;
  const passos = passosDaFaixa(estado);
  return (
    <div className="flex h-[22px] min-w-0 flex-none items-center gap-1 overflow-hidden whitespace-nowrap rounded border border-border bg-card px-1.5 text-[10px]"
      data-testid="faixa-do-fechamento" role="navigation" aria-label="Etapas do fechamento do mês">
      <span className="shrink-0 font-semibold text-slate-800" data-testid="faixa-do-fechamento-mes">{mesDaFaixa(estado.anoMes)} ·</span>
      {passos.map((p, i) => {
        const ehAtual = p.etapa === atual;
        const ir = !ehAtual ? abrir?.[p.etapa] : undefined;
        /* a atual: contorno navy e fundo claro, sem perder a cor do estado (o "⚠ invalidado" segue vermelho na tela do Valor) */
        const classe = ehAtual
          ? `rounded border border-[#1e3a5f] bg-[#1e3a5f]/10 px-1 font-semibold ${COR_DO_TOM[p.tom]}`
          : `rounded border border-transparent px-1 ${COR_DO_TOM[p.tom]}${ir ? ' hover:bg-slate-100 hover:underline' : ''}`;
        const conteudo = <><span className="mr-0.5">{p.numero}</span>{p.texto}</>;
        return (
          <Fragment key={p.etapa}>
            {i > 0 && <span className="shrink-0 text-slate-400" aria-hidden>→</span>}
            {ir ? (
              <button type="button" onClick={ir} title={`${p.title} — abrir`} className={`shrink-0 leading-[18px] ${classe}`}
                data-testid={`faixa-etapa-${p.etapa}`} data-tom={p.tom}>{conteudo}</button>
            ) : (
              <span title={p.title} className={`shrink-0 leading-[18px] ${classe}`} aria-current={ehAtual ? 'step' : undefined}
                data-testid={`faixa-etapa-${p.etapa}`} data-tom={p.tom}>{conteudo}</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
