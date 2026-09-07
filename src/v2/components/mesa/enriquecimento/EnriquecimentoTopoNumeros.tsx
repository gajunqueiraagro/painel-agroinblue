/**
 * O topo do passo 2 — [ENRIQUECER-TELA-01] (133b). DUMB.
 *
 * Seis números com rótulo de 10px, e logo abaixo os MESMOS seis como chips de filtro,
 * mais "Todas".
 *
 * ⚠ OS NÚMEROS E OS CHIPS SÃO A MESMA FONTE (`resumirGrupos`), de propósito: quando o
 * número do topo vem de um lugar e o chip de outro, os dois divergem na primeira regra
 * nova e o operador passa a não confiar em nenhum dos dois.
 *
 * ⚠ ZERO NÃO SOME. Um grupo que desaparece faz o operador se perguntar se ele existia —
 * e "nenhuma linha para você decidir" é uma informação, não uma ausência de informação.
 *
 * ⚠ "TRANSFERÊNCIA ENTRE CONTAS" MOSTRA "—", NÃO ZERO. Nenhum `match_status` de hoje
 * significa transferência: o traço diz "não sei ainda", que é a verdade, e zero diria
 * "não há nenhuma", que seria uma afirmação que ninguém verificou. Vira número na 133c.
 */
import { fmtBRL } from './fmt';
import type { EnriqGrupo, EnriqResumoGrupos } from '@/v2/lib/mesa/enriquecimentoView';

export interface EnriquecimentoTopoNumerosProps {
  resumo: EnriqResumoGrupos;
  total: number;
  filtro: EnriqGrupo | 'todas';
  onFiltro: (g: EnriqGrupo | 'todas') => void;
}

/** Rótulo, cor e a segunda linha de cada um dos seis. A ordem é a do trabalho. */
const GRUPOS: ReadonlyArray<{
  key: EnriqGrupo;
  rotulo: string;
  cls: string;
  dot: string;
  /** O que aparece embaixo do número. `null` = a soma em R$. */
  detalhe: 'soma' | 'candidatos' | 'lancamentos' | 'pendente';
}> = [
  { key: 'atualizam',     rotulo: 'Atualizam sem perguntar', cls: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', detalhe: 'soma' },
  { key: 'decide',        rotulo: 'Você decide',             cls: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500',   detalhe: 'candidatos' },
  { key: 'agrupam',       rotulo: 'Agrupamento sugerido',    cls: 'text-violet-700 dark:text-violet-400',   dot: 'bg-violet-500',  detalhe: 'lancamentos' },
  { key: 'transferencia', rotulo: 'Transferência entre contas', cls: 'text-muted-foreground',               dot: 'bg-muted-foreground', detalhe: 'pendente' },
  { key: 'sem_par',       rotulo: 'Sem par no banco',        cls: 'text-rose-700 dark:text-rose-400',       dot: 'bg-rose-500',    detalhe: 'soma' },
  { key: 'ja_gravadas',   rotulo: 'Já gravadas',             cls: 'text-muted-foreground',                  dot: 'bg-muted-foreground', detalhe: 'soma' },
];

function detalheDe(d: (typeof GRUPOS)[number]['detalhe'], r: { qtd: number; soma: number; lancamentos: number }): string {
  switch (d) {
    case 'soma': return fmtBRL(r.soma);
    case 'candidatos': return r.qtd > 0 ? '2+ candidatos' : '—';
    case 'lancamentos': return r.qtd > 0 ? `${r.lancamentos} lançamentos` : '—';
    case 'pendente': return 'na próxima parte';
  }
}

export function EnriquecimentoTopoNumeros({ resumo, total, filtro, onFiltro }: EnriquecimentoTopoNumerosProps) {
  return (
    <div className="shrink-0 rounded-lg border bg-card">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 px-2 py-1.5 sm:grid-cols-6">
        {GRUPOS.map((g) => {
          const r = resumo[g.key];
          const vazio = g.detalhe === 'pendente';
          return (
            <div key={g.key} className="min-w-0">
              <div className="truncate text-[10px] leading-tight text-muted-foreground" title={g.rotulo}>
                {g.rotulo}
              </div>
              <div className={`text-[16px] font-medium leading-tight tabular-nums ${vazio ? 'text-muted-foreground' : g.cls}`}>
                {vazio ? '—' : r.qtd}
              </div>
              <div className="truncate text-[10px] leading-tight text-muted-foreground">
                {detalheDe(g.detalhe, r)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t px-2 py-1">
        <button type="button" onClick={() => onFiltro('todas')}
          className={`rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
            filtro === 'todas' ? 'border-primary bg-primary/10 text-foreground'
              : 'bg-card text-muted-foreground hover:bg-muted/60'}`}>
          Todas · <span className="tabular-nums font-medium">{total}</span>
        </button>
        {GRUPOS.map((g) => {
          const r = resumo[g.key];
          const ativo = filtro === g.key;
          const desabilitado = g.detalhe === 'pendente';
          return (
            <button key={g.key} type="button"
              disabled={desabilitado}
              title={desabilitado ? 'Transferências entram na próxima parte (133c).' : undefined}
              onClick={() => onFiltro(g.key)}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
                ativo ? 'border-primary bg-primary/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted/60'
              } ${desabilitado || (r.qtd === 0 && !ativo) ? 'opacity-45' : ''}`}>
              <span className={`h-2 w-2 rounded-full ${g.dot}`} />
              <span className="truncate">{g.rotulo}</span>
              <span className="tabular-nums font-medium">{desabilitado ? '—' : r.qtd}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
