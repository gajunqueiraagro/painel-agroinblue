// BlocoReuniaoExecutiva — página 1 do boletim de fechamento (PR-FECHAMENTO-P0.1).
// "O proprietário entende a operação em 30 segundos; depois vê os números."
// Substitui, NESTA página, o BlocoResumoExecutivo do Planejamento. Consome os 7
// indicadores do PC-100 e renderiza via helper PURO buildReuniaoExecutiva:
//   Resumo (4 linhas) → Indicadores (7 + semáforo) → Destaques | Atenção → Recomendações.
// SEM IA, SEM score/pesos, SEM caixa, SEM margem por fazenda. Texto só do dicionário.
import { useMemo } from 'react';
import {
  buildReuniaoExecutiva,
  type IndicadorEntrada,
  type CorSemaforo,
} from './buildReuniaoExecutiva';

// Estrutural (decoupled do tipo gigante do PC-100): só os campos lidos.
interface IndicadorLike {
  valor: number | null;
  deltaMeta: number | null;
  deltaAno: number | null;
}
interface PainelLike {
  receitaPecIndicador: IndicadorLike | null;
  arrobasIndicador: IndicadorLike | null;
  margemArrIndicador: IndicadorLike | null;
  gmdIndicador: IndicadorLike | null;
  desfruteArrIndicador: IndicadorLike | null;
  custoArrIndicador: IndicadorLike | null;
  custoCabIndicador: IndicadorLike | null;
}

interface Props {
  painel: PainelLike | null;
  subtitulo?: string;
}

const DOT: Record<CorSemaforo, string> = {
  verde: 'bg-emerald-500',
  amarelo: 'bg-amber-400',
  vermelho: 'bg-rose-500',
  cinza: 'bg-slate-300',
};
const TXT: Record<CorSemaforo, string> = {
  verde: 'text-emerald-700',
  amarelo: 'text-amber-700',
  vermelho: 'text-rose-700',
  cinza: 'text-slate-400',
};

function ent(
  chave: IndicadorEntrada['chave'], label: string, i: IndicadorLike | null,
  direcao: IndicadorEntrada['direcao'], unidade: IndicadorEntrada['unidade'],
): IndicadorEntrada {
  return { chave, label, valor: i?.valor ?? null, deltaMeta: i?.deltaMeta ?? null, deltaAno: i?.deltaAno ?? null, direcao, unidade };
}

export function BlocoReuniaoExecutiva({ painel, subtitulo }: Props) {
  const vm = useMemo(() => {
    if (!painel) return null;
    // Desfrute: uso a variante em @ (desfruteArrIndicador) — carrega comparativos
    // (a variante em cabeças não tem deltaMeta/deltaAno nesta fase → seria sempre cinza).
    const entradas: IndicadorEntrada[] = [
      ent('receita',  'Receita pecuária',  painel.receitaPecIndicador, 'up',   'brl'),
      ent('arrobas',  'Arrobas produzidas', painel.arrobasIndicador,   'up',   'arroba'),
      ent('margem',   'Margem por @',      painel.margemArrIndicador,  'up',   'brl_arroba'),
      ent('gmd',      'GMD',               painel.gmdIndicador,        'up',   'kg'),
      ent('desfrute', 'Desfrute (@)',      painel.desfruteArrIndicador, 'up',  'arroba'),
      ent('custoArr', 'Custo por @',       painel.custoArrIndicador,   'down', 'brl_arroba'),
      ent('custoCab', 'Custo por cabeça',  painel.custoCabIndicador,   'down', 'brl_cab'),
    ];
    return buildReuniaoExecutiva(entradas);
  }, [painel]);

  if (!vm) return null;
  const [l1, l2, l3, l4] = vm.linhas4;

  return (
    <div className="rounded-lg border bg-card p-4 text-[12px] tabular-nums space-y-4">
      <div>
        <div className="text-sm font-bold text-foreground">Resumo Executivo — Reunião Mensal</div>
        {subtitulo && <div className="text-[10px] text-muted-foreground">{subtitulo}</div>}
      </div>

      {/* Resumo — 4 linhas */}
      <div className="rounded-md border bg-muted/30 p-3 space-y-1">
        <div className="text-[13px] font-semibold">{l1}</div>
        <div className="text-[11px] text-emerald-700">{l2}</div>
        <div className="text-[11px] text-rose-700">{l3}</div>
        <div className="text-[11px] font-medium">Recomendação: {l4}</div>
      </div>

      {/* Indicadores — 7 com semáforo */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Indicadores</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {vm.semaforos.map((s) => (
            <div key={s.chave} className="rounded-md border px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT[s.cor]}`} />
                <span className="text-[10px] text-muted-foreground truncate">{s.label}</span>
              </div>
              <div className="text-[13px] font-semibold mt-0.5">{s.valorFmt}</div>
              <div className={`text-[10px] ${TXT[s.cor]}`}>
                {s.deltaFmt}{s.reguaLabel ? ` ${s.reguaLabel}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Destaques | Atenção */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">Destaques</div>
          {vm.destaques.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">Sem destaques além da faixa (±5%).</div>
          ) : (
            <ul className="space-y-0.5">
              {vm.destaques.map((d) => (
                <li key={d.chave} className="text-[11px]">
                  <span className="text-emerald-700 font-medium">{d.label}</span>: {d.valorFmt}{' '}
                  <span className="text-muted-foreground">({d.deltaFmt} {d.reguaLabel})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-rose-700 mb-1">Atenção</div>
          {vm.alertas.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">Sem alertas além da faixa (±5%).</div>
          ) : (
            <ul className="space-y-0.5">
              {vm.alertas.map((a) => (
                <li key={a.chave} className="text-[11px]">
                  <span className="text-rose-700 font-medium">{a.label}</span>: {a.valorFmt}{' '}
                  <span className="text-muted-foreground">({a.deltaFmt} {a.reguaLabel})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recomendações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Manter</div>
          {vm.recomendacoes.manter.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">—</div>
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {vm.recomendacoes.manter.map((m) => <li key={m} className="text-[11px]">{m}</li>)}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Prioridades</div>
          {vm.recomendacoes.prioridades.length === 0 ? (
            <div className="text-[10px] text-muted-foreground italic">—</div>
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {vm.recomendacoes.prioridades.map((p) => <li key={p} className="text-[11px]">{p}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
