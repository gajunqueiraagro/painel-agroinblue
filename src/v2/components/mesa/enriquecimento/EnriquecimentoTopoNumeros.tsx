/**
 * O topo do passo 2 — [ENRIQUECER-TELA-01] (133b), refeito no 133h item 1.
 *
 * ⚠ OS CARDS SÃO O FILTRO, e a linha de chips SAIU. Eram os MESMOS sete recortes ditos
 * duas vezes, um em cima do outro: número grande em cima, pílula com o mesmo número
 * embaixo. O operador clicava na pílula e o card não reagia — porque só a pílula filtrava,
 * e nada na tela dizia isso. Duas superfícies para a mesma pergunta é uma a mais.
 *
 * ⚠ CLICAR DE NOVO VOLTA A "Todas": o filtro é um alternador, não um estado sem saída. Sem
 * isso, sair de um recorte exigia achar o "Todas" — que agora é um texto de 10px no canto,
 * e não mais o primeiro de uma fila de oito pílulas.
 *
 * ⚠ ZERO NÃO SOME. Um grupo que desaparece faz o operador se perguntar se ele existia —
 * e "nenhuma linha para você decidir" é uma informação, não uma ausência de informação.
 *
 * ⚠ "TRANSFERÊNCIA ENTRE CONTAS" VEM DE FORA — 133c. Nenhum `match_status` a significa,
 * e continua não significando: o número chega por prop, de `fn_transferencias_espelhadas`,
 * que compara lançamentos do banco entre si. Enquanto a RPC não responde, "—" — o traço
 * diz "não sei ainda", e zero diria "não há nenhuma", que ninguém verificou.
 *
 * ⚠ "SEM PAR NO SISTEMA" É O SÉTIMO CARD, em cinza e por último — 133h item 1. Ele não
 * conta linhas da planilha, conta o que ela NÃO explica: outra pergunta, outro universo, e
 * a cor neutra é o que impede de somá-lo mentalmente aos outros seis.
 */
import { fmtBRL } from './fmt';
import type { EnriqGrupo, EnriqResumoGrupos } from '@/v2/lib/mesa/enriquecimentoView';

/** 133c — o chip da visão inversa. Não é `match_status`: é o que a planilha NÃO explica. */
export type VistaPasso2 = EnriqGrupo | 'todas' | 'sem_par_sistema' | 'incompletos';

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
  /** 133i item 7 — linhas cujo lançamento está classificado mas sem produto ou fornecedor. */
  incompletos?: number;
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

/* A moldura do card. Ativo = borda do primary e fundo `bg-muted/40` — 133h item 1. */
const CARD_BASE = 'min-w-0 rounded-md border px-1.5 py-1 text-left transition-colors';
const CARD_ATIVO = 'border-primary bg-muted/40';
const CARD_INERTE = 'border-transparent hover:bg-muted/30';

export function EnriquecimentoTopoNumeros({
  resumo, total, filtro, onFiltro, transferencias, semParSistema, incompletos,
}: EnriquecimentoTopoNumerosProps) {
  /* Clicar no card que já filtra volta a "Todas" — o filtro é alternador. */
  const alternar = (g: VistaPasso2) => onFiltro(filtro === g ? 'todas' : g);

  return (
    <div className="shrink-0 rounded-lg border bg-card">
      <div className="flex items-baseline justify-between px-2 pt-1">
        <span className="text-[10px] text-muted-foreground">Clique num card para filtrar.</span>
        {/* ⚠ "Todas" É TEXTO, NÃO CARD: ela não é um recorte a mais, é a ausência de
            recorte — e um oitavo card do mesmo tamanho a faria parecer um. */}
        <button type="button" onClick={() => onFiltro('todas')}
          className={`text-[10px] transition-colors ${
            filtro === 'todas' ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          Todas · <span className="tabular-nums">{total}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5 pt-1 sm:grid-cols-8">
        {GRUPOS.map((g) => {
          const r = resumo[g.key];
          /* ⚠ A TRANSFERÊNCIA VIROU NÚMERO EM 133c. Ela mostrava "—" porque nenhum
             `match_status` a significa; agora o número vem da RPC do banco, e o "—"
             permanece quando ela ainda não respondeu — traço é "não sei", não zero. */
          const eTransf = g.key === 'transferencia';
          const vazio = eTransf ? !transferencias : false;
          const qtd = eTransf ? (transferencias?.total ?? 0) : r.qtd;
          const detalhe = eTransf
            ? (transferencias ? `${transferencias.unicos} a fazer` : 'apurando…')
            : detalheDe(g.detalhe, r);
          const ativo = filtro === g.key;
          return (
            <button key={g.key} type="button"
              disabled={vazio}
              title={vazio ? 'Apurando as transferências do mês…' : (ativo ? 'Clique de novo para ver todas.' : `Filtrar: ${g.rotulo}`)}
              onClick={() => alternar(g.key)}
              className={`${CARD_BASE} ${ativo ? CARD_ATIVO : CARD_INERTE} ${vazio ? 'opacity-45' : ''}`}>
              <div className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.dot}`} />
                <span className="truncate text-[10px] leading-tight text-muted-foreground" title={g.rotulo}>
                  {g.rotulo}
                </span>
              </div>
              <div className={`text-[16px] font-medium leading-tight tabular-nums ${vazio ? 'text-muted-foreground' : g.cls}`}>
                {vazio ? '—' : qtd}
              </div>
              <div className="truncate text-[10px] leading-tight text-muted-foreground">{detalhe}</div>
            </button>
          );
        })}

        {/* O sétimo: a visão inversa. Cinza, e por último. */}
        <button type="button"
          title={filtro === 'sem_par_sistema' ? 'Clique de novo para ver todas.' : 'Filtrar: lançamentos do mês sem linha na planilha'}
          onClick={() => alternar('sem_par_sistema')}
          className={`${CARD_BASE} ${filtro === 'sem_par_sistema' ? CARD_ATIVO : CARD_INERTE}`}>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="truncate text-[10px] leading-tight text-muted-foreground">Sem par no sistema</span>
          </div>
          <div className="text-[16px] font-medium leading-tight tabular-nums text-muted-foreground">
            {semParSistema ?? '—'}
          </div>
          <div className="truncate text-[10px] leading-tight text-muted-foreground">
            {semParSistema === undefined ? 'apurando…' : 'a planilha não explica'}
          </div>
        </button>

        {/* ⚠ O OITAVO: CLASSIFICADO, MAS INCOMPLETO — 133i item 7. Ele não cabe em nenhum
            dos outros sete porque não é uma pergunta sobre o CASAMENTO: a linha casou, o
            lançamento está classificado, e mesmo assim ninguém sabe o que foi comprado nem
            de quem. Some de todos os recortes por estar "certo", e é por isso que precisa
            de um card próprio. Cinza como o "Sem par no sistema": não é erro, é trabalho. */}
        <button type="button"
          title={filtro === 'incompletos' ? 'Clique de novo para ver todas.' : 'Filtrar: classificados sem produto ou sem fornecedor'}
          onClick={() => alternar('incompletos')}
          className={`${CARD_BASE} ${filtro === 'incompletos' ? CARD_ATIVO : CARD_INERTE}`}>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="truncate text-[10px] leading-tight text-muted-foreground">Incompletos</span>
          </div>
          <div className="text-[16px] font-medium leading-tight tabular-nums text-muted-foreground">
            {incompletos ?? 0}
          </div>
          <div className="truncate text-[10px] leading-tight text-muted-foreground">
            sem produto ou fornecedor
          </div>
        </button>
      </div>
    </div>
  );
}
