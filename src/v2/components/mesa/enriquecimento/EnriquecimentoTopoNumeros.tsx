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
 * ⚠ "TRANSFERÊNCIA ENTRE CONTAS" VEM DE FORA — 133c. Nenhum `match_status` a significa,
 * e continua não significando: o número chega por prop, de `fn_transferencias_espelhadas`,
 * que compara lançamentos do banco entre si. Enquanto a RPC não responde, "—" — o traço
 * diz "não sei ainda", e zero diria "não há nenhuma", que ninguém verificou.
 */
import { fmtBRL } from './fmt';
import type { EnriqGrupo, EnriqResumoGrupos } from '@/v2/lib/mesa/enriquecimentoView';

/** 133c — o chip da visão inversa. Não é `match_status`: é o que a planilha NÃO explica. */
export type VistaPasso2 = EnriqGrupo | 'todas' | 'sem_par_sistema';

export interface EnriquecimentoTopoNumerosProps {
  resumo: EnriqResumoGrupos;
  total: number;
  filtro: VistaPasso2;
  onFiltro: (g: VistaPasso2) => void;
  /**
   * 133c item 3 — os pares espelhados do mês, vindos de `fn_transferencias_espelhadas`.
   *
   * ⚠ ELES NÃO SAEM DO STAGING, e por isso chegam por prop em vez de `resumirGrupos`: são
   * lançamentos do banco que se espelham, não linhas da planilha. Até a 133c o card mostrava
   * "—" porque nenhum `match_status` significa transferência — e continua não significando.
   */
  transferencias?: { total: number; unicos: number };
  /** 133c item 4 — quantos lançamentos do mês nenhuma linha da planilha referencia. */
  semParSistema?: number;
}

/** Rótulo, cor e a segunda linha de cada um dos seis. A ordem é a do trabalho. */
const GRUPOS: ReadonlyArray<{
  key: EnriqGrupo;
  rotulo: string;
  cls: string;
  dot: string;
  /** O que aparece embaixo do número. `null` = a soma em R$. */
  detalhe: 'soma' | 'candidatos' | 'lancamentos';
}> = [
  { key: 'atualizam',     rotulo: 'Atualizam sem perguntar', cls: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', detalhe: 'soma' },
  { key: 'decide',        rotulo: 'Você decide',             cls: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500',   detalhe: 'candidatos' },
  { key: 'agrupam',       rotulo: 'Agrupamento sugerido',    cls: 'text-violet-700 dark:text-violet-400',   dot: 'bg-violet-500',  detalhe: 'lancamentos' },
  /* `detalhe` não é lido para a transferência — ela tem o próprio texto ("N únicos"). */
  { key: 'transferencia', rotulo: 'Transferência entre contas', cls: 'text-sky-700 dark:text-sky-400',       dot: 'bg-sky-500', detalhe: 'soma' },
  { key: 'sem_par',       rotulo: 'Sem par no banco',        cls: 'text-rose-700 dark:text-rose-400',       dot: 'bg-rose-500',    detalhe: 'soma' },
  { key: 'ja_gravadas',   rotulo: 'Já gravadas',             cls: 'text-muted-foreground',                  dot: 'bg-muted-foreground', detalhe: 'soma' },
];

function detalheDe(d: (typeof GRUPOS)[number]['detalhe'], r: { qtd: number; soma: number; lancamentos: number }): string {
  switch (d) {
    case 'soma': return fmtBRL(r.soma);
    case 'candidatos': return r.qtd > 0 ? '2+ candidatos' : '—';
    case 'lancamentos': return r.qtd > 0 ? `${r.lancamentos} lançamentos` : '—';
  }
}

export function EnriquecimentoTopoNumeros({
  resumo, total, filtro, onFiltro, transferencias, semParSistema,
}: EnriquecimentoTopoNumerosProps) {
  return (
    <div className="shrink-0 rounded-lg border bg-card">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 px-2 py-1.5 sm:grid-cols-6">
        {GRUPOS.map((g) => {
          const r = resumo[g.key];
          /* ⚠ A TRANSFERÊNCIA VIROU NÚMERO EM 133c. Ela mostrava "—" porque nenhum
             `match_status` a significa; agora o número vem da RPC do banco, e o "—"
             permanece quando ela ainda não respondeu — traço é "não sei", não zero. */
          const eTransf = g.key === 'transferencia';
          const vazio = eTransf ? !transferencias : false;
          const qtd = eTransf ? (transferencias?.total ?? 0) : r.qtd;
          const detalhe = eTransf
            ? (transferencias ? `${transferencias.unicos} únicos` : 'apurando…')
            : detalheDe(g.detalhe, r);
          return (
            <div key={g.key} className="min-w-0">
              <div className="truncate text-[10px] leading-tight text-muted-foreground" title={g.rotulo}>
                {g.rotulo}
              </div>
              <div className={`text-[16px] font-medium leading-tight tabular-nums ${vazio ? 'text-muted-foreground' : g.cls}`}>
                {vazio ? '—' : qtd}
              </div>
              <div className="truncate text-[10px] leading-tight text-muted-foreground">{detalhe}</div>
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
          const eTransf = g.key === 'transferencia';
          const qtd = eTransf ? (transferencias?.total ?? 0) : resumo[g.key].qtd;
          const ativo = filtro === g.key;
          const desabilitado = eTransf && !transferencias;
          return (
            <button key={g.key} type="button"
              disabled={desabilitado}
              title={desabilitado ? 'Apurando as transferências do mês…' : undefined}
              onClick={() => onFiltro(g.key)}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
                ativo ? 'border-primary bg-primary/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted/60'
              } ${desabilitado || (qtd === 0 && !ativo) ? 'opacity-45' : ''}`}>
              <span className={`h-2 w-2 rounded-full ${g.dot}`} />
              <span className="truncate">{g.rotulo}</span>
              <span className="tabular-nums font-medium">{desabilitado ? '—' : qtd}</span>
            </button>
          );
        })}
        {/* ⚠ O CHIP DA VISÃO INVERSA FICA POR ÚLTIMO E EM CINZA: ele não conta linhas da
            planilha, conta o que ela não explica — outra pergunta, outro universo. */}
        <button type="button"
          onClick={() => onFiltro('sem_par_sistema')}
          className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
            filtro === 'sem_par_sistema' ? 'border-primary bg-primary/10 text-foreground'
              : 'bg-card text-muted-foreground hover:bg-muted/60'
          } ${(semParSistema ?? 0) === 0 && filtro !== 'sem_par_sistema' ? 'opacity-45' : ''}`}>
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          <span className="truncate">Sem par no sistema</span>
          <span className="tabular-nums font-medium">{semParSistema ?? '—'}</span>
        </button>
      </div>
    </div>
  );
}
