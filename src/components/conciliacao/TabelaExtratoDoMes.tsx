/**
 * O EXTRATO DO MÊS, LINHA A LINHA — a peça que o passo 1 e o Espelho compartilham.
 * PR-IMPORTAR-VER-EXTRATO-01.
 *
 * ⚠ ELA NASCEU DENTRO DO ESPELHO (`EspelhoConciliacaoTab.tsx`, como `AbaOfxReal`) e saiu
 * inteira, sem reescrita: o corpo é o mesmo, byte a byte, salvo os dois consertos que este
 * PR faz de propósito e que estão marcados abaixo. Quem quiser conferir o "antes" olha o
 * commit da extração.
 *
 * ⚠ E SAIU PORQUE O PASSO 1 PRECISA DELA. Conferir se o extrato do mês chegou completo é o
 * que a aba "Importar Banco" promete, e não dá para conferir sem VER: até aqui a tela dava
 * quatro números e uma faixa, e o extrato só existia dentro do modal da aba seguinte.
 * ⚠ UMA PEÇA, NUNCA UMA CÓPIA: o Espelho passa a montar esta. Duas tabelas do mesmo extrato
 * divergiriam na primeira mudança de regra — e a régua do saldo consolidado, que é o que faz
 * a última linha bater com o papel do banco, é justamente o tipo de detalhe que se perde numa
 * segunda escrita.
 *
 * ⚠ OS FORMATADORES MORAM AQUI E O ESPELHO OS IMPORTA, em vez do contrário. Não é gosto: se
 * a peça importasse do Espelho, os dois arquivos fechariam um CICLO de import, e o
 * `npx madge --circular` (gate da casa) acusaria. A direção única resolve, e ela aponta para
 * o módulo mais básico dos dois.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ban, ChevronDown, ChevronRight, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useCancelarMovimento, MOTIVOS_DE_CANCELAMENTO } from '@/hooks/useCancelarMovimento';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useEspelhoInternas, type EspelhoInternas } from '@/hooks/useEspelhoInternas';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import { porDia } from '@/lib/conciliacao/linhasDoDia';
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';
import { ListaDoMesPorDia, CelSaldoDoDia, TD_LISTA, TD_LISTA_NUM, type ColunaDaLista } from '@/components/conciliacao/ListaDoMesPorDia';

/* ─── formatadores (movidos de EspelhoConciliacaoTab, verbatim) ─────────────── */

export const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtData = (s: string | null) => {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
};

export const corValReal = (v: number) => (v >= 0 ? 'text-blue-600' : 'text-rose-600');

export type EspStatus = 'conciliado' | 'sem_vinculo' | 'ignorado';
export interface EspOfx { extrato_id: string; data: string | null; historico: string | null; documento: string | null; valor: number; status: EspStatus; flag_dup: boolean; flag_investimento: boolean; }

/* ⚠ PISO DE 10px NO MODAL INTEIRO — PR-ESPELHO-02. Estes rótulos vieram em 8px e 9px do
   arquivo de origem, quando eram detalhe de um card recolhido dentro de outra tela. Num
   modal de 92vh não há o que economizar em altura, e 8px deixa de ser denso para virar
   ilegível: só a classe muda, o texto e a regra ficam. */
export function EspStatusCell({ status }: { status: string }) {
  if (status === 'conciliado') return <span className="text-emerald-700 text-[10px] shrink-0">✓ conciliado</span>;
  if (status === 'ignorado') return <span className="text-muted-foreground text-[10px] shrink-0">⊘ ignorado</span>;
  return <span className="text-amber-700 text-[10px] shrink-0">⚠ sem vínculo</span>;
}

/* ─── a leitura, para quem não é o Espelho ──────────────────────────────────── */

/**
 * O extrato espelhado de um mês — só o que ESTA tabela precisa.
 *
 * ⚠ CHAVE DE CACHE PRÓPRIA, e não a do Espelho (`espelho-conciliacao`), de propósito: o
 * Espelho guarda o JSON CRU da RPC e lê dele mais sete campos; este hook guarda o recorte
 * já conferido. Dois formatos sob a mesma chave fariam quem chegasse primeiro decidir o que
 * o outro receberia — e o Espelho quebraria de forma silenciosa.
 * ⚠ O CUSTO DA CHAMADA A MAIS FOI MEDIDO antes de aceitá-la: `fn_extratos_espelhados` leva
 * 134,7 ms (EXPLAIN ANALYZE como `authenticated`, Vera Ligia · Itaú Personalite · set/26) e
 * devolve 42 kB. É três ordens de grandeza abaixo do motor de sugestões, e só acontece se as
 * duas telas estiverem abertas ao mesmo tempo.
 * ⚠ NARROWING, NÃO CAST: o retorno é `jsonb`, e a regra zero-cast vale. Perguntar antes de
 * ler é o que faz a tabela dizer "não sei" em vez de quebrar, se a RPC mudar de forma.
 */
export interface ExtratoDoMesEspelhado {
  ofx: EspOfx[];
  inicial: number;
}

const ehObjeto = (j: unknown): j is Record<string, unknown> =>
  !!j && typeof j === 'object' && !Array.isArray(j);
const txt = (j: unknown): string | null => (typeof j === 'string' ? j : null);
const num = (j: unknown): number => { const n = Number(j); return Number.isFinite(n) ? n : 0; };
const status = (j: unknown): EspStatus =>
  j === 'conciliado' || j === 'ignorado' ? j : 'sem_vinculo';

function daResposta(j: unknown): ExtratoDoMesEspelhado | null {
  if (!ehObjeto(j)) return null;
  const saldos = ehObjeto(j.saldos) ? j.saldos : {};
  const linhas = Array.isArray(j.ofx_completo) ? j.ofx_completo : [];
  return {
    inicial: num(saldos.inicial),
    ofx: linhas.flatMap(l => {
      if (!ehObjeto(l)) return [];
      return [{
        extrato_id: String(l.extrato_id),
        data: txt(l.data),
        historico: txt(l.historico),
        documento: txt(l.documento),
        valor: num(l.valor),
        status: status(l.status),
        flag_dup: l.flag_dup === true,
        flag_investimento: l.flag_investimento === true,
      }];
    }),
  };
}

export function useExtratoDoMesEspelhado(
  clienteId: string | null, contaId: string | null, anoMes: string,
) {
  return useQuery({
    queryKey: ['extrato-do-mes', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<ExtratoDoMesEspelhado | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data: d, error } = await (supabase as any).rpc('fn_extratos_espelhados', {
        p_cliente: clienteId, p_conta: contaId, p_mes: anoMes,
      });
      if (error) throw error;
      return daResposta(d);
    },
  });
}

/* ─── a peça ────────────────────────────────────────────────────────────────── */

/**
 * A aba do extrato, com as duas pontas do saldo — PR-ESPELHO-07 item C.
 *
 * ⚠ O SALDO DO EXTRATO É CONSOLIDADO, e é isso que a lista precisava dizer. O extrato do
 * Bradesco mostra a conta corrente JUNTO com a Invest Fácil, que o banco consolida nela:
 * 1,00 + 238.790,26 = 238.791,26 em 31/07. Abrir a lista pelo saldo da conta sozinha —
 * 1,00 — faria a última linha fechar 238 mil longe do papel do banco, e o operador
 * procuraria por semanas um erro que não existe.
 *
 * ⚠ O FINAL É CALCULADO, O INFORMADO É LIDO, e os dois aparecem lado a lado. Exibir só um
 * deles obrigaria a confiar: com os dois, "confere" é uma afirmação verificável, e a
 * diferença — quando existe — é o próprio número que falta explicar.
 */
export function TabelaExtratoDoMes({ ofx, inicial, internas, aoMarcarDuplicado, semPar }: {
  ofx: EspOfx[]; inicial: number; internas: EspelhoInternas;
  /**
   * A ação de "marcar como duplicado" por linha — PR-EXTRATO-CANCELAR-MOVIMENTO-01.
   *
   * ⚠ OPCIONAL, E É ASSIM QUE A PEÇA SERVE AOS DOIS LUGARES SEM VIRAR DUAS. Quem passa a
   * função ganha a coluna; quem não passa fica com a tabela de antes, idêntica.
   * ⚠ HOJE SÓ A ABA IMPORTAR PASSA, e é decisão de produto: o passo 1 é conferir o que
   * ENTROU — é ali que se descobre a linha que não deveria existir. O Espelho é o FECHO do
   * mês e vive dentro do passo 2; editar o extrato de dentro da conferência final convidaria
   * a "arrumar" o extrato para o mês fechar, que é o avesso de conferir.
   */
  aoMarcarDuplicado?: (linha: EspOfx) => void;
  /**
   * P159a — os dois botões da linha SEM PAR ([Sugestões] [Criar]), os MESMOS da Conferência (o "Ver sugestões" e o "Criar" do "⋯"
   * de lá). Só o Casar lançamentos passa; sem eles (a aba Importar) a Situação diz "sem par".
   */
  semPar?: { nSugestoes: (e: EspOfx) => number; aoSugestoes: (e: EspOfx) => void; aoCriar: (e: EspOfx) => void };
}) {
  /* ⚠ O CONSOLIDADO MANDA QUANDO EXISTE; sem ele, o saldo da própria conta, que é o que a
     lista sempre usou. Nunca um zero no lugar do desconhecido: `??` não cai em 0. */
  const abertura = internas.saldoInicialConsolidado ?? inicial;
  /* ⚠ O SALDO É O ACUMULADO DE SEMPRE, na ordem do ARQUIVO (a mesma soma de antes). P159a: a tela agora mostra só o do FIM DO DIA —
     o acumulado depois da última linha do dia na ordem do arquivo (`porDia`), que não depende da ordem em que o dia se desenha. */
  const rows = useMemo(() => {
    let acc = abertura;
    return ofx.map((r) => { acc += r.valor; return { r, saldo: acc }; });
  }, [ofx, abertura]);
  const dias = useMemo(() => porDia(rows, (x) => (x.r.data ?? '').slice(0, 10), (x) => x.r.valor), [rows]);
  const movimentos = ofx.reduce((a, r) => a + r.valor, 0);
  const fechamento = abertura + movimentos;
  const informado = internas.saldoInformadoConsolidado;
  const difere = informado == null ? null : fechamento - informado;
  /* ⚠ A COLUNA DA AÇÃO É ESTRUTURAL, NÃO DEPENDE DO DADO — e é isso que mantém a Lei de
     Estabilidade Visual de pé: ela existe ou não existe pela CAPACIDADE da tela (passou a
     função?), e nunca aparece no meio do uso porque uma linha é diferente da outra. */
  /* P159a (mock 28/10): Data 44 · Histórico (o resto) · Valor 96 · Saldo 100 · ✓/○ 20 · Situação 150. A coluna Documento saiu: o
     número vai no `title` do histórico. */
  const colunas: ColunaDaLista[] = [
    { titulo: 'Data', largura: 44 }, { titulo: 'Histórico' }, { titulo: 'Valor', largura: 96, alinhar: 'right' },
    { titulo: 'Saldo', largura: 100, alinhar: 'right' }, { titulo: '', largura: 20, alinhar: 'center' }, { titulo: 'Situação', largura: 150 },
    ...(aoMarcarDuplicado ? [{ titulo: '', largura: 24 }] : []),
  ];
  return (
    <ListaDoMesPorDia
      testid="extrato-do-mes" testidLinha="extrato-linha"
      linhas={dias} colunas={colunas} chave={(x) => x.r.extrato_id}
      classeDaLinha={(x) => (x.item.r.status === 'sem_vinculo' ? 'bg-amber-50 dark:bg-amber-950/20' : undefined)}
      saldoInicial={{ rotulo: 'Saldo inicial (extrato)', valor: fmtBRL(abertura), coluna: 3, className: cn('font-semibold', corValReal(abertura)),
        testid: 'extrato-saldo-inicial' }}
      celulas={(x) => {
        const r = x.item.r;
        const h = historicoDoBanco(r.historico, r.data);
        /* o `title` leva o texto LIMPO (o que a célula mostra, para o "…" ter o inteiro) e o inteiro do banco — a mesma regra da `CelHistorico` */
        const original = r.historico ?? '';
        const titulo = [h.texto && h.texto !== original ? h.texto : null, original || null, r.documento ? `documento ${r.documento}` : null]
          .filter(Boolean).join('\n');
        return (<>
          <td className={TD_LISTA} title={titulo || undefined}>
            <span className="flex min-w-0 items-center gap-1">
              {/* a hora pequena e cinza, em lugar FIXO (vazio sem hora): o texto começa sempre no mesmo ponto */}
              <span className="w-[28px] shrink-0 text-[9.5px] tabular-nums text-muted-foreground" data-testid="extrato-hora">{h.hora}</span>
              <span className="min-w-0 flex-1 truncate" data-testid="extrato-historico">{h.texto || '—'}</span>
              {r.flag_dup && <span className="shrink-0 rounded bg-orange-100 px-1 text-[9.5px] leading-[13px] text-orange-700">dup</span>}
              {r.flag_investimento && <span className="shrink-0 rounded bg-violet-100 px-1 text-[9.5px] leading-[13px] text-violet-700">invest</span>}
            </span>
          </td>
          <td className={cn(TD_LISTA_NUM, corValReal(r.valor))}>{fmtBRL(r.valor)}</td>
          <CelSaldoDoDia fimDoDia={x.fimDoDia} testid="extrato-saldo"
            saldo={x.ultimaDoDiaNaOrigem ? fmtBRL(x.ultimaDoDiaNaOrigem.saldo) : null}
            className={x.ultimaDoDiaNaOrigem ? corValReal(x.ultimaDoDiaNaOrigem.saldo) : undefined} />
          <td className={cn(TD_LISTA, 'px-0 text-center')} data-testid="extrato-sinal">
            {r.status === 'conciliado' ? <span className="font-bold text-emerald-600" title="casado">✓</span>
              : r.status === 'ignorado' ? <span className="text-muted-foreground" title="ignorado">⊘</span>
              : <span className="text-muted-foreground" title="sem par">○</span>}
          </td>
          <td className={TD_LISTA} data-testid="extrato-situacao">
            {r.status === 'conciliado' ? <span className="text-muted-foreground">casado</span>
              : r.status === 'ignorado' ? <span className="text-muted-foreground">ignorado</span>
              : semPar ? <BotoesDoSemPar e={r} semPar={semPar} />
              : <span className="text-amber-700">sem par</span>}
          </td>
          {/* ⚠ A AÇÃO DIZ O MOTIVO, NÃO O MECANISMO — "marcar como duplicado", nunca
              "cancelar": numa linha de tabela, "cancelar" se confunde com "cancelar a
              operação", e o operador que quer tirar a duplicata hesita justamente por medo de
              desfazer o que estava fazendo.
              ⚠ `title` E `aria-label` (regra da casa), e os dois dizem a mesma frase inteira —
              um ícone sozinho não é rótulo de nada. */}
          {aoMarcarDuplicado && (
            <td className={cn(TD_LISTA, 'px-0')}>
              <button type="button"
                className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Marcar como duplicado — o movimento sai do extrato do mês"
                aria-label={`Marcar como duplicado o movimento de ${fmtData(r.data)}, ${fmtBRL(r.valor)}`}
                onClick={(ev) => { ev.stopPropagation(); aoMarcarDuplicado(r); }}>
                <Ban className="h-3 w-3" />
              </button>
            </td>
          )}
        </>);
      }}
      rodape={<>
        <span className="shrink-0">Saldo final do extrato{' '}
          <b className={cn('tabular-nums', corValReal(fechamento))} data-testid="extrato-saldo-final">{fmtBRL(fechamento)}</b></span>
        {/* ⚠ "—" QUANDO FALTA SALDO INFORMADO, nunca "difere R$ 0,00": a sentinela do
            CLAUDE.md diz que ausência é traço, e um "confere" sobre dado que não existe é a
            pior das duas mentiras possíveis aqui.
            ⚠ TOLERÂNCIA ZERO — PR-CONCILIACAO-TOLERANCIA-ZERO-02: um centavo aqui é divergência. */}
        <span className="min-w-0 truncate" data-testid="extrato-informado"
          title={informado == null ? 'sem saldo informado para o mês' : `informado no arquivo: ${fmtBRL(informado)} · calculado: ${fmtBRL(fechamento)}`}>
          {informado == null
            ? <span className="text-muted-foreground">informado no arquivo —</span>
            : saldoConfere(difere ?? 0)
              ? <span className="text-success">informado no arquivo {fmtBRL(informado)} · confere</span>
              : <span className="text-amber-700">informado no arquivo {fmtBRL(informado)} · difere R$ {fmtBRL(Math.abs(difere ?? 0))}</span>}
        </span>
        <span className="ml-auto shrink-0 text-[9.5px] text-muted-foreground">✓ casado · ○ sem par · ordem do dia: maior valor primeiro</span>
      </>}
    />
  );
}

/** [Sugestões] [Criar] — a linha sem par do Extrato e da Conferência (P159a). Sugestões sem nenhuma = desabilitado, com o porquê. */
export function BotoesDoSemPar({ e, semPar }: {
  e: EspOfx; semPar: { nSugestoes: (e: EspOfx) => number; aoSugestoes: (e: EspOfx) => void; aoCriar: (e: EspOfx) => void };
}) {
  const n = semPar.nSugestoes(e);
  const btn = 'h-[15px] rounded-[4px] border border-blue-600 bg-card px-1.5 text-[9.5px] leading-[13px] text-blue-700 disabled:border-border disabled:text-muted-foreground';
  return (
    <span className="inline-flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
      <button type="button" className={btn} disabled={n === 0} data-testid="sem-par-sugestoes"
        title={n === 0 ? 'nenhuma sugestão para este movimento' : `${n} sugest${n === 1 ? 'ão' : 'ões'}`}
        onClick={() => semPar.aoSugestoes(e)}>Sugestões</button>
      <button type="button" className={btn} data-testid="sem-par-criar" title="Criar o lançamento deste movimento"
        onClick={() => semPar.aoCriar(e)}>Criar</button>
    </span>
  );
}

/**
 * O EXTRATO DO MÊS, NUM MODAL — PR-IMPORTAR-EXTRATO-MODAL-01.
 *
 * ⚠ ELE ERA INLINE NO CORPO DA ABA, e o argumento que o pôs lá era MEU: "conferir numa janela
 * que se fecha não é conferir". O argumento não sobreviveu à tela. Com 35 linhas a tabela toma
 * a aba inteira e empurra para fora do campo de visão o portão do saldo e os quatro números —
 * ou seja, empurra para fora justamente a conferência que ela deveria apoiar. Quem decidiu foi
 * o uso, não a teoria: a tabela é CONSULTA sob demanda, e o que fica na aba é o veredito.
 * ⚠ E A LIÇÃO VALE ALÉM DESTE PR: "não pode ser modal porque conferir exige permanência" era
 * uma regra plausível e errada. O que exige permanência é o RESULTADO da conferência (fecha ou
 * não fecha, quantos movimentos, qual saldo), e ele continua na aba. O detalhe linha a linha é
 * o que se abre quando o resultado não convence.
 *
 * ⚠ OS HOOKS FICAM AQUI, e não na tela: são dois (`useExtratoDoMesEspelhado` e
 * `useEspelhoInternas`) e nascem sempre juntos — a tabela não sabe abrir o saldo sem o
 * consolidado das contas internas.
 * ⚠ DENTRO DO MODAL A ROLAGEM É `propria`, e não mais `da-pagina`: o modal tem altura fixa
 * (`h-[88vh]`) e a lista é o único scrollport dele, que é a receita do A21 — e é assim que o
 * cabeçalho gruda no topo da LISTA, à vista, em vez de grudar no topo de uma aba que rola por
 * outro motivo. A prop continua existindo porque o Espelho usa o mesmo modo.
 * ⚠ CADA ESTADO TEM A SUA FRASE, e nenhuma delas é "—": sem conta escolhida, carregando,
 * falhou e mês vazio dizem coisas diferentes, e é o passo 1 — conferir se o extrato chegou
 * completo — que depende de saber qual dos quatro é.
 */
export function ExtratoDoMesModal({ clienteId, contaId, anoMes, contaNome, aberto, aoFechar }: {
  clienteId: string | null; contaId: string | null; anoMes: string;
  contaNome: string;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { data, isLoading, error } = useExtratoDoMesEspelhado(clienteId, contaId, anoMes);
  const internas = useEspelhoInternas(clienteId, contaId, anoMes);
  const api = useCancelarMovimento(clienteId, contaId, anoMes);
  const [alvo, setAlvo] = useState<EspOfx | null>(null);
  const [verCancelados, setVerCancelados] = useState(false);

  /* ⚠ OS QUATRO ESTADOS VIRARAM MIOLO DO MODAL, e não `return` antecipado: o diálogo precisa
     existir para poder ser fechado. Um `return` antes do `<Dialog>` faria o modal sumir da
     árvore em vez de fechar, e o `aoFechar` do pai nunca rodaria. */
  const miolo = () => {
    if (!clienteId || !contaId) {
      return <p className="px-4 py-10 text-center text-[11px] text-muted-foreground">
        Escolha uma conta no cabeçalho para ver o extrato do mês.
      </p>;
    }
    if (isLoading) {
      return <p className="flex items-center justify-center gap-2 px-4 py-10 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo o extrato do mês…
      </p>;
    }
    if (error || !data) {
      /* ⚠ A MENSAGEM DO BANCO VAI JUNTO, no `title`: um "não consegui" mudo é o defeito que o
         PR-PALCO-ERRO-VISIVEL-01 acabou de tirar da tela vizinha. */
      return <p className="px-4 py-10 text-center text-[11px] text-destructive"
        title={error instanceof Error ? error.message : undefined}>
        Não foi possível ler o extrato deste mês.
      </p>;
    }
    if (data.ofx.length === 0) {
      return <p className="px-4 py-10 text-center text-[11px] text-muted-foreground">
        Nenhum movimento importado neste mês — importe o OFX na aba.
      </p>;
    }
    return (
      <>
        <TabelaExtratoDoMes ofx={data.ofx} inicial={data.inicial} internas={internas}
          aoMarcarDuplicado={setAlvo} />

        {/* ═══ OS CANCELADOS DO MÊS ══════════════════════════════════════════════════════
            ⚠ ELES PRECISAM TER ONDE APARECER, e este é o lugar: o operador que acabou de tirar
            uma linha do extrato tem de poder conferir o que tirou, aqui mesmo, sem trocar de
            tela. O único lugar que mostrava cancelados era o "ver canceladas (N)" do modal de
            importações — e aquilo responde por ARQUIVO, que é outra pergunta.
            ⚠ FECHADO POR PADRÃO e sem existir quando não há nenhum: num mês limpo, uma linha
            dizendo "0 cancelados" seria ruído permanente para a exceção.
            ⚠ E FORA DO SCROLLPORT (`shrink-0`), abaixo da lista: ele é rodapé de conferência,
            não conteúdo — some da vista se rolar junto, que é o defeito que o total teve. */}
        {api.cancelados.length > 0 && (
          <div className="max-h-[22vh] shrink-0 overflow-y-auto border-t">
            <button type="button"
              className="sticky top-0 z-[2] flex w-full items-center gap-1 bg-card px-3.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
              aria-expanded={verCancelados}
              onClick={() => setVerCancelados(v => !v)}>
              {verCancelados ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {api.cancelados.length} movimento{api.cancelados.length === 1 ? '' : 's'} cancelado{api.cancelados.length === 1 ? '' : 's'} neste mês
              <span className="text-[10px] opacity-70">— fora do saldo e da conciliação</span>
            </button>
            {verCancelados && (
              <div className="border-t bg-muted/20 px-3.5 py-1 text-[10px]">
                {api.cancelados.map(c => (
                  <div key={c.id} className="flex items-center gap-2 border-b border-border/40 py-0.5 last:border-b-0">
                    <span className="w-[44px] shrink-0 text-muted-foreground">{fmtData(c.data)}</span>
                    <span className="min-w-0 flex-1 truncate line-through opacity-70" title={c.descricao ?? ''}>
                      {c.descricao ?? '—'}
                    </span>
                    <span className="shrink-0 italic text-muted-foreground">{c.motivo ?? '—'}</span>
                    <span className={cn('w-[92px] shrink-0 text-right tabular-nums line-through opacity-70', corValReal(c.valor))}>
                      {fmtBRL(c.valor)}
                    </span>
                    {/* ⚠ A VOLTA EXISTE — e é o que separa este PR de repetir o defeito que ele
                        veio corrigir. Cancelar sem desfazer devolveria o operador a depender de
                        quem tem acesso ao banco, que foi a queixa de origem. */}
                    <Button type="button" variant="ghost" size="sm"
                      className="h-4 shrink-0 gap-1 px-1 text-[10px]"
                      disabled={api.gravando}
                      title="Trazer o movimento de volta para o extrato do mês"
                      aria-label={`Trazer de volta o movimento de ${fmtData(c.data)}, ${fmtBRL(c.valor)}`}
                      onClick={async () => {
                        const ok = await api.reverter(c.id);
                        toast[ok ? 'success' : 'error'](ok ? 'Movimento de volta no extrato.' : (api.erro ?? 'Não foi possível reverter.'));
                      }}>
                      <Undo2 className="h-3 w-3" /> voltar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {/* ⚠ A ALTURA É FIXA (`h-[88vh]`) E A CADEIA É A DO A21: `flex-col` → cabeçalho
          `shrink-0` → lista `flex-1 min-h-0` com o único `overflow-y-auto`. É o que faz o
          cabeçalho da tabela grudar no topo do que ROLA, e não no topo de uma aba que rola por
          outro motivo. */}
      <Dialog open={aberto} onOpenChange={o => { if (!o) aoFechar(); }}>
        <DialogContent className="flex h-[88vh] max-h-[88vh] w-[94vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-0.5 border-b px-4 py-2.5 pr-10 text-left">
            <DialogTitle className="text-[13px] font-semibold">
              Extrato do mês · {contaNome || 'conta'}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              O que o banco mandou, linha a linha, com o saldo correndo até fechar. Nada aqui concilia.
            </p>
          </DialogHeader>
          {miolo()}
        </DialogContent>
      </Dialog>

      <MarcarDuplicadoDialog
        alvo={alvo} aoFechar={() => setAlvo(null)}
        gravando={api.gravando} erro={api.erro}
        aoConfirmar={async (motivo) => {
          if (!alvo) return;
          const ok = await api.cancelar(alvo.extrato_id, motivo);
          if (ok) { toast.success('Movimento marcado como duplicado — saiu do extrato do mês.'); setAlvo(null); }
        }}
      />
    </>
  );
}

/**
 * A CONFIRMAÇÃO, COM A LINHA À VISTA — PR-EXTRATO-CANCELAR-MOVIMENTO-01.
 *
 * ⚠ A LINHA APARECE INTEIRA AQUI, e não é enfeite: o clique acontece numa tabela de 35 linhas
 * de 10px, e confirmar "tem certeza?" sem dizer SOBRE QUAL é como não perguntar nada. Data,
 * histórico, documento e valor são exatamente os quatro campos pelos quais o operador reconhece
 * um movimento no papel do banco.
 * ⚠ E O AVISO DIZ O QUE MUDA, em vez de assustar: o movimento sai do saldo, das sugestões e da
 * prévia — e dá para trazer de volta, o que muda o peso da decisão.
 */
function MarcarDuplicadoDialog({ alvo, aoFechar, aoConfirmar, gravando, erro }: {
  alvo: EspOfx | null;
  aoFechar: () => void;
  aoConfirmar: (motivo: string) => void | Promise<void>;
  gravando: boolean;
  erro: string | null;
}) {
  const [escolha, setEscolha] = useState<string>(MOTIVOS_DE_CANCELAMENTO[0]);
  const [livre, setLivre] = useState('');
  const outro = escolha === 'Outro';
  const motivo = outro ? livre.trim() : escolha;

  /* Cada movimento recomeça a conversa: herdar o motivo do anterior faria o segundo
     cancelamento sair com a justificativa do primeiro, e ninguém notaria. */
  const aoAbrir = (aberto: boolean) => {
    if (!aberto) { setEscolha(MOTIVOS_DE_CANCELAMENTO[0]); setLivre(''); aoFechar(); }
  };

  return (
    <Dialog open={alvo != null} onOpenChange={aoAbrir}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b px-4 py-2.5">
          <DialogTitle className="text-[13px] font-semibold">Marcar como duplicado</DialogTitle>
        </DialogHeader>

        {alvo && (
          <div className="space-y-2.5 px-4 py-3">
            <div className="rounded border bg-muted/40 px-2.5 py-1.5 text-[11px]">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground">{fmtData(alvo.data)}</span>
                <span className="min-w-0 flex-1 truncate font-medium" title={alvo.historico ?? ''}>
                  {alvo.historico ?? '—'}
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums', corValReal(alvo.valor))}>
                  {fmtBRL(alvo.valor)}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                documento {alvo.documento ?? '—'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Por quê?
              </label>
              {/* ⚠ `Select` DA CASA, NUNCA `<select>` NATIVO (gate `check:ui-nativo`). */}
              <Select value={escolha} onValueChange={setEscolha}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_DE_CANCELAMENTO.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="Outro">Outro…</SelectItem>
                </SelectContent>
              </Select>
              {outro && (
                <Input autoFocus value={livre} onChange={e => setLivre(e.target.value)}
                  placeholder="Escreva o motivo — ele fica gravado na auditoria."
                  className="h-7 text-[11px]" />
              )}
            </div>

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              O movimento sai do extrato do mês: deixa de contar no saldo, nas sugestões e na
              prévia da conciliação. Ele continua listado abaixo da tabela, e dá para trazer de
              volta.
            </p>

            {/* ⚠ O ERRO DO BANCO FICA NA TELA, e as recusas previstas (movimento conciliado, já
                cancelado) vêm escritas em português pela própria RPC — é onde o operador lê o
                que precisa fazer ANTES. */}
            {erro && (
              <p className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1 text-[10px] text-destructive">
                {erro}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="border-t px-4 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => aoAbrir(false)}>
            Fechar sem alterar
          </Button>
          <Button type="button" size="sm" variant="destructive" className="h-7 gap-1 text-[11px]"
            disabled={gravando || motivo === ''}
            title={motivo === '' ? 'Escreva o motivo para continuar.' : undefined}
            onClick={() => { void aoConfirmar(motivo); }}>
            {gravando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
            Marcar como duplicado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
