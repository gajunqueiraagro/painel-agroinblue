/**
 * O PERÍODO DA PECUÁRIA — um controle só, quatro maneiras de responder (PR-DRE-PECUARIA-02 §1).
 *
 * ⚠ ELE OCUPA O SLOT DA SAFRA DA LAVOURA, e essa simetria é a decisão: as duas telas do mesmo DRE
 * perguntam "de que recorte estamos falando" no MESMO lugar do cabeçalho. A lavoura fecha por
 * safra; a pecuária pode fechar por mês, por ano, por safra (jul→jun) ou por um intervalo à mão —
 * e as quatro cabem num controle de uma linha, em vez de uma fita de doze meses.
 * ⚠ A FITA DE MESES SAIU. Ela ocupava a largura inteira, tinha altura própria e respondia só uma
 * das quatro perguntas; e como o `SeletorPeriodo` do Financeiro exige Shift+clique para um
 * intervalo, "a safra" era um gesto que ninguém descobria sozinho.
 * ⚠ `usePeriodoUrl` CONTINUA SENDO A FONTE (`f_de`/`f_ate`). Este controle TRADUZ — ele não guarda
 * período nenhum. O modo em que ele abre é deduzido do próprio par de/até, e é por isso que o
 * link copiado continua reabrindo a tela exatamente onde estava.
 */
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  anoMes, mesUnico, anoInteiro, ordenar, type Periodo, type PontoPeriodo,
} from '@/v2/lib/periodo';

type Modo = 'mes' | 'ano' | 'safra' | 'personalizado';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-09" → "set/26". */
const rotuloMes = (am: string) => {
  const [a, m] = am.split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : am;
};

/** `'2026-09'` → `{ano:2026, mes:9}` — a forma que `Periodo` guarda. */
const ponto = (am: string): PontoPeriodo => ({ ano: Number(am.slice(0, 4)), mes: Number(am.slice(5, 7)) });

/**
 * A SAFRA DE PECUÁRIA É jul→jun, e o rótulo é o ano de abertura sobre o seguinte.
 *
 * ⚠ ELA NÃO SE DERIVA DO CALENDÁRIO AQUI: as safras são cadastro (`financeiro_safras` com
 * `escopo_negocio='pecuaria'`), têm código próprio ("25/26-Pec") e é esse código que o operador
 * usa no resto do sistema. Inventar "25/26" a partir das datas faria a tela chamar a safra por um
 * nome que nenhum outro lugar usa — o mesmo erro que o `safraRotulo` da colheita evitou.
 */
export interface SafraPec {
  id: string;
  codigo: string;
  de: string;
  ate: string;
}

function useSafrasPecuaria(clienteId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ['safras-pecuaria', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async (): Promise<SafraPec[]> => {
      const { data: r } = await (supabase as any).from('financeiro_safras')
        .select('id, codigo, nome, data_inicio, data_fim')
        .eq('cliente_id', clienteId)
        .eq('escopo_negocio', 'pecuaria')
        .order('data_inicio', { ascending: false });
      return ((r ?? []) as Array<{
        id: string; codigo: string | null; nome: string | null;
        data_inicio: string | null; data_fim: string | null;
      }>)
        .filter(s => s.data_inicio && s.data_fim)
        .map(s => ({
          id: s.id,
          /* ⚠ SEM O SUFIXO "-Pec" NO BOTÃO: dentro do segmento Pecuária ele é redundante e come a
             largura do controle. O código inteiro fica no `title`. */
          codigo: (s.codigo || s.nome || '—').replace(/-Pec$/i, ''),
          de: (s.data_inicio ?? '').slice(0, 7),
          ate: (s.data_fim ?? '').slice(0, 7),
        }));
    },
  });
  return data ?? [];
}

/**
 * O PERÍODO QUE O BOTÃO "Ano" ENTREGA — decisão do Gabriel, 23/09.
 *
 * ⚠ ANO CORRENTE VAI ATÉ O MÊS FECHADO, não até dezembro: em setembro, "Ano" agora é jan→ago. O
 * mês em curso não tem nem lançamento completo nem fechamento de rebanho, e incluí-lo punha uma
 * fatia pela metade no meio da comparação — o DRE mostrava um mês que ainda está acontecendo.
 * ⚠ ANO PASSADO CONTINUA INTEIRO: ele fechou, e cortá-lo no mês de hoje compararia doze meses com
 * oito por um acidente de calendário.
 * ⚠ JANEIRO FICA COMO ESTAVA (jan→dez), E É DECISÃO PENDENTE: no primeiro mês do ano não há mês
 * fechado nenhum dentro dele, e a regra não tem resposta. Reportado ao Gabriel; até a decisão, o
 * comportamento é o de hoje — mudar por conta própria seria escolher por ele.
 */
export function periodoDoAno(ano: number, hoje = new Date()): Periodo {
  const mesAnterior = hoje.getMonth(); // 0-based: em setembro dá 8, que é agosto em base 1
  if (ano !== hoje.getFullYear() || mesAnterior < 1) return anoInteiro(ano);
  return { de: { ano, mes: 1 }, ate: { ano, mes: mesAnterior } };
}

/**
 * De que modo este par de/até veio?
 *
 * ⚠ A DEDUÇÃO É POR FORMA, não por memória: um mês só é "Mês"; janeiro a dezembro do mesmo ano é
 * "Ano"; o intervalo idêntico ao de uma safra cadastrada é "Safra"; o resto é Personalizado.
 * Guardar o modo num estado à parte faria o link copiado reabrir noutro modo que o da URL.
 */
function modoDoPeriodo(de: string, ate: string, safras: readonly SafraPec[], hoje = new Date()): Modo {
  if (de === ate) return 'mes';
  if (safras.some(s => s.de === de && s.ate === ate)) return 'safra';
  const [a1, m1] = de.split('-');
  const [a2, m2] = ate.split('-');
  if (a1 === a2 && m1 === '01' && m2 === '12') return 'ano';
  /* ⚠ E O ANO CORRENTE CORTADO NO MÊS FECHADO TAMBÉM É "Ano" — senão o próprio botão devolveria um
     período que a régua chamaria de Personalizado, e o modo mudaria de nome sozinho ao ser
     clicado. A conta é a mesma de `periodoDoAno`, não uma segunda. */
  const doAno = periodoDoAno(Number(a1), hoje);
  if (de === anoMes(doAno.de) && ate === anoMes(doAno.ate)) return 'ano';
  return 'personalizado';
}

/**
 * LARGURA FIXA — §1, e foi MEDIDO que ela não era.
 *
 * ⚠ SEM ISTO O CONTROLE MUDA DE TAMANHO A CADA MODO: medido no harness, os quatro estados davam
 * 241,83 / 236,42 / 240,12 / 204,56 px — 37px de diferença entre o mais largo e o mais estreito.
 * Num cabeçalho em `flex`, isso EMPURRA os vizinhos: trocar de Mês para Personalizado deslocaria
 * o seletor de cultura ao lado, e o operador veria a régua "pular" a cada escolha.
 * ⚠ 250px CABE O MAIOR ESTADO MEDIDO com folga; o botão ativo estica e corta, os outros três
 * mantêm o tamanho do seu texto.
 */
const LARGURA_CONTROLE = 250;

/** O botão de um modo — navy quando ativo, transparente quando não. A régua do `Segmentado`. */
function Botao({ ativo, children, title, onClick }: {
  ativo: boolean; children: React.ReactNode; title?: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cn('px-2 text-[10px] font-medium transition-colors',
        /* ⚠ O ATIVO ESTICA E CORTA; os inativos ficam do tamanho do texto. É o que mantém a
           largura total fixa sem espremer "Personalizado…" em três letras. */
        ativo ? 'min-w-0 flex-1 truncate bg-primary text-primary-foreground'
          : 'shrink-0 whitespace-nowrap bg-transparent text-muted-foreground hover:bg-muted')}>
      {children}
    </button>
  );
}

const ITEM = 'w-full cursor-pointer rounded px-2 py-1 text-left text-[11px] hover:bg-muted';

export function SeletorPeriodoPecuaria({ clienteId, periodo, onPeriodoChange }: {
  clienteId: string | null | undefined;
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
}) {
  const safras = useSafrasPecuaria(clienteId);
  const de = anoMes(periodo.de);
  const ate = anoMes(periodo.ate);
  const modoCru = modoDoPeriodo(de, ate, safras);
  /* ⚠ UM LINK ANTIGO DE UM MÊS SÓ NÃO PODE VIRAR ERRO NEM MUDAR O PERÍODO: sem botão de "Mês", o
     modo deduzido cai em Personalizado, que mostra "jan/2026 → jan/2026" — o mesmo recorte, com
     outro nome. Trocar o período por uma safra aqui mudaria os números sem ninguém pedir. */
  const modo: Modo = modoCru === 'mes' ? 'personalizado' : modoCru;
  const [aberto, setAberto] = useState<Modo | null>(null);

  const hoje = new Date();
  const anoHoje = hoje.getFullYear();

  /* ⚠ A LISTA DE ANOS SAI DAS SAFRAS, não de um intervalo inventado: é o cadastro que diz até
     onde o cliente tem história. Com o ano corrente garantido, porque a safra dele pode ainda
     não ter sido aberta. */
  const anos = useMemo(() => {
    const s = new Set<number>([anoHoje]);
    safras.forEach(x => { s.add(Number(x.de.slice(0, 4))); s.add(Number(x.ate.slice(0, 4))); });
    return Array.from(s).filter(a => a > 2000).sort((a, b) => b - a);
  }, [safras, anoHoje]);

  /* ⚠ `ordenar` SEMPRE, e não é zelo: o painel Personalizado deixa mexer nas duas pontas em
     qualquer ordem, e "de ago até jul" é o que alguém digita quando quis jul→ago. A lib já
     resolve isso num lugar só. */
  const aplicar = (d: string, a: string) => {
    onPeriodoChange(ordenar({ de: ponto(d), ate: ponto(a) }));
    setAberto(null);
  };

  const safraAtual = safras.find(s => s.de === de && s.ate === ate);

  /* Os quatro rótulos: o ativo mostra o VALOR, os outros mostram o nome do modo. */
  const rotulo = {
    ano: modo === 'ano' ? `Ano ${de.slice(0, 4)}` : 'Ano',
    safra: modo === 'safra' ? `Safra ${safraAtual?.codigo ?? ''}`.trim() : 'Safra',
    personalizado: modo === 'personalizado' ? `${rotuloMes(de)} → ${rotuloMes(ate)}` : 'Personalizado…',
  };

  const painel = (m: Modo) => {
    /* ⚠ O PAINEL DE MESES SAIU COM O BOTÃO — DRE-PADRAO-01a-2: sem "Mês" na régua, ele não tinha
       como abrir, e o TSC o denunciou como comparação impossível. Código morto apagado, não
       silenciado. */
    if (m === 'ano') {
      return (
        <div className="max-h-[220px] w-[110px] overflow-auto p-1">
          {anos.map(a => (
            <button key={a} type="button" className={cn(ITEM, 'tabular-nums',
              modo === 'ano' && String(a) === de.slice(0, 4) && 'bg-primary text-primary-foreground')}
              onClick={() => { onPeriodoChange(periodoDoAno(a)); setAberto(null); }}>
              {a}
            </button>
          ))}
        </div>
      );
    }
    if (m === 'safra') {
      return (
        <div className="max-h-[240px] w-[150px] overflow-auto p-1">
          {safras.length === 0 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              Nenhuma safra de pecuária cadastrada.
            </div>
          )}
          {safras.map(s => (
            <button key={s.id} type="button" title={`${s.de} → ${s.ate}`}
              className={cn(ITEM, safraAtual?.id === s.id && 'bg-primary text-primary-foreground')}
              onClick={() => aplicar(s.de, s.ate)}>
              {s.codigo}
            </button>
          ))}
        </div>
      );
    }
    /* Personalizado: dois campos de mês. O `month` do navegador não é `date` nem `select`, então
       fica fora do gate de controle nativo — e não existe seletor de MÊS na casa (o `DatePicker`
       é de dia). A dívida está anotada como PR-UI-MONTHPICKER. */
    return (
      <div className="w-[200px] space-y-1.5 p-2">
        <label className="block text-[10px] text-muted-foreground">
          De
          <input type="month" value={de} max={ate}
            onChange={e => e.target.value && onPeriodoChange({ de: ponto(e.target.value), ate: periodo.ate })}
            className="mt-0.5 h-7 w-full rounded border px-1.5 text-[11px]" />
        </label>
        <label className="block text-[10px] text-muted-foreground">
          Até
          <input type="month" value={ate} min={de}
            onChange={e => e.target.value && onPeriodoChange({ de: periodo.de, ate: ponto(e.target.value) })}
            className="mt-0.5 h-7 w-full rounded border px-1.5 text-[11px]" />
        </label>
      </div>
    );
  };

  return (
    /* ⚠ ALTURA FIXA DE 22, a mesma do `Segmentado` vizinho e do seletor de safra da lavoura: o
       slot troca de conteúdo ao mudar de atividade e NADA pode mudar de altura (A23). */
    <div className="flex shrink-0 overflow-hidden rounded-md border"
      style={{ height: 22, width: LARGURA_CONTROLE }}>
      {/* ⚠ O "MÊS" SAIU — DRE-PADRAO-01a-2, decisão do Gabriel: um DRE de um mês só compara mal
          (a variação de patrimônio de trinta dias é ruído) e o botão custava 56px na régua, que é
          justamente o espaço que faltava para o subtítulo caber inteiro. O modo continua existindo
          em `Modo` e em `modoDoPeriodo` porque um link antigo com de = até ainda chega aqui — ele
          cai em Personalizado (ver `modoVisivel`), conservando o período que o operador tinha. */}
      {/* ⚠ SAFRA PRIMEIRO — decisão do Gabriel, 23/09: é o recorte em que a tela abre e o que o
          produtor pede primeiro. O Personalizado fica ao lado do Ano porque é dele que ele
          deriva — quem quer um intervalo à mão está refinando um ano, não uma safra. */}
      {(['safra', 'ano', 'personalizado'] as const).map(m => (
        <Popover key={m} open={aberto === m} onOpenChange={o => setAberto(o ? m : null)}>
          <PopoverTrigger asChild>
            {/* ⚠ O EMBRULHO HERDA O FLEX DO BOTÃO: sem `flex` e `min-w-0` aqui, o `flex-1` do
                botão ativo não alcança o contêiner e a largura fixa volta a variar. */}
            <div className={cn('flex', modo === m ? 'min-w-0 flex-1' : 'shrink-0')}>
              <Botao ativo={modo === m} onClick={() => setAberto(a => (a === m ? null : m))}
                title={m === 'safra' && safraAtual ? `${safraAtual.de} → ${safraAtual.ate}` : undefined}>
                {rotulo[m]}
              </Botao>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">{painel(m)}</PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

/**
 * A SAFRA EM QUE HOJE CAI — só o PADRÃO SÍNCRONO do primeiro render.
 *
 * ⚠ ELA NÃO É MAIS A ABERTURA DA TELA. `usePeriodoUrl` exige um valor no primeiro render, antes de
 * qualquer consulta responder, e é esse buraco que esta função tapa. Quem decide onde a tela abre
 * é `useSafraDeAbertura`, abaixo — e ele troca o período assim que o banco responde.
 */
export function safraCorrentePecuaria(hoje = new Date()): Periodo {
  const ano = hoje.getFullYear();
  /* Julho (mês 6, base zero) abre a safra; antes dele ainda se está na safra que começou no ano
     anterior. */
  const inicio = hoje.getMonth() >= 6 ? ano : ano - 1;
  return { de: { ano: inicio, mes: 7 }, ate: { ano: inicio + 1, mes: 6 } };
}

/**
 * ONDE A TELA ABRE — a última safra de pecuária COM MOVIMENTO e COM FECHAMENTO NO FIM.
 *
 * ⚠ "A QUE CONTÉM A DATA" ESTAVA ERRADO, e por isso saiu: em 16/09/2026 ela dá 26/27, uma safra
 * de dois meses e meio. O DRE abria numa fatia que ainda não fechou.
 * ⚠ MAS "A ÚLTIMA COM LANÇAMENTO", LITERAL, TAMBÉM DÁ 26/27 — medido: ela tem 453 lançamentos
 * REALIZADOS entre 01/07 e 20/09/2026. Só o lançamento não distingue as duas.
 * ⚠ O QUE DISTINGUE É O FECHAMENTO DE REBANHO, e ele não é um critério inventado para chegar ao
 * resultado: é do que o DRE da pecuária É FEITO. `vpb_operacional` e `efeito_mercado` saem de DUAS
 * fotos do rebanho — a do mês anterior ao início e a do fim. Sem a foto do FIM, as duas linhas
 * vêm nulas e a cascata abre com "—" em dois dos seus números centrais. Medido: os fechamentos vão
 * até 2026-08; a 25/26 fecha em 2026-06 (tem foto), a 26/27 fecharia em 2027-06 (não tem).
 * ⚠ E O CRITÉRIO SE MANTÉM SOZINHO: quando o fechamento de 2027-06 existir, a abertura vira 26/27
 * sem ninguém tocar em código.
 */
export function useSafraDeAbertura(clienteId: string | null | undefined) {
  const safras = useSafrasPecuaria(clienteId);

  const { data: limites } = useQuery({
    queryKey: ['pec-abertura-limites', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async (): Promise<{ ultimoFechamento: string; meses: Set<string> }> => {
      const db = supabase as any;
      /* ⚠ UMA LINHA SÓ: o mês mais recente com foto de rebanho. */
      const { data: fech } = await db.from('valor_rebanho_fechamento_itens')
        .select('ano_mes').eq('cliente_id', clienteId)
        .order('ano_mes', { ascending: false }).limit(1);
      const ultimoFechamento = ((fech ?? [])[0] as { ano_mes?: string } | undefined)?.ano_mes ?? '';

      /* ⚠ OS MESES COM MOVIMENTO, não o intervalo: uma safra inteira sem lançamento no meio de
         duas que têm não pode ser escolhida só porque cai entre o mínimo e o máximo.
         ⚠ E O CORTE É POR DATA, NÃO POR NÚMERO DE LINHAS. Com `limit(5000)` a consulta passava
         hoje — 4.109 lançamentos de 2025-07 para cá — e deixaria de passar sozinha quando o
         cliente crescesse, escolhendo a safra errada sem erro nenhum. Quatro anos cobrem com
         folga qualquer "última safra" e o volume acompanha a atividade, não o histórico. */
      const corte = new Date();
      corte.setFullYear(corte.getFullYear() - 4);
      const { data: lanc } = await db.from('financeiro_lancamentos_v2')
        .select('data_competencia')
        .eq('cliente_id', clienteId)
        .eq('escopo_negocio', 'pecuaria')
        .eq('cancelado', false)
        .gte('data_competencia', corte.toISOString().slice(0, 10));
      const meses = new Set<string>();
      for (const l of (lanc ?? []) as Array<{ data_competencia: string | null }>) {
        if (l.data_competencia) meses.add(l.data_competencia.slice(0, 7));
      }
      return { ultimoFechamento, meses };
    },
  });

  return useMemo(() => {
    if (safras.length === 0 || !limites) return null;
    const temMovimento = (s: SafraPec) =>
      Array.from(limites.meses).some(m => m >= s.de && m <= s.ate);
    /* `safras` já vem da mais recente para a mais antiga. */
    const completa = safras.find(s =>
      limites.ultimoFechamento !== '' && s.ate <= limites.ultimoFechamento && temMovimento(s));
    /* ⚠ SEM NENHUMA COMPLETA, a mais recente com movimento — melhor abrir numa safra em andamento
       do que numa tela vazia. */
    const alvo = completa ?? safras.find(temMovimento);
    if (!alvo) return null;
    return {
      periodo: ordenar({ de: ponto(alvo.de), ate: ponto(alvo.ate) }),
      codigo: alvo.codigo,
    };
  }, [safras, limites]);
}
