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
export function TabelaExtratoDoMes({ ofx, inicial, internas, rolagem = 'propria', aoMarcarDuplicado }: {
  ofx: EspOfx[]; inicial: number; internas: EspelhoInternas;
  /**
   * Quem rola esta lista.
   *   'propria'    — ela é o scrollport (o Espelho, dentro de um modal de altura fixa).
   *   'da-pagina'  — ela FLUI e quem rola é a tela que a montou (a aba "Importar Banco").
   * ⚠ A PROP EXISTE POR CAUSA DA REGRA DO SCROLLPORT ÚNICO (CLAUDE.md): o corpo da aba
   * Importar já é `overflow-y-auto`, e uma lista com rolagem própria lá dentro criaria a
   * segunda barra — rolar a de dentro não moveria o cabeçalho fixo, e o operador veria a
   * lista andar sem entender por que o topo fica.
   * ⚠ E O `sticky` CONTINUA FUNCIONANDO NOS DOIS CASOS, porque ele ancora no scrollport MAIS
   * PRÓXIMO: dentro do modal é esta div; na aba, é o corpo dela. O total não rola em nenhum.
   */
  rolagem?: 'propria' | 'da-pagina';
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
}) {
  /* ⚠ O CONSOLIDADO MANDA QUANDO EXISTE; sem ele, o saldo da própria conta, que é o que a
     lista sempre usou. Nunca um zero no lugar do desconhecido: `??` não cai em 0. */
  const abertura = internas.saldoInicialConsolidado ?? inicial;
  const rows = useMemo(() => {
    let acc = abertura;
    return ofx.map((r) => { acc += r.valor; return { r, saldo: acc }; });
  }, [ofx, abertura]);
  const movimentos = ofx.reduce((a, r) => a + r.valor, 0);
  const fechamento = abertura + movimentos;
  const informado = internas.saldoInformadoConsolidado;
  const difere = informado == null ? null : fechamento - informado;
  /* ⚠ A COLUNA DA AÇÃO É ESTRUTURAL, NÃO DEPENDE DO DADO — e é isso que mantém a Lei de
     Estabilidade Visual de pé: ela existe ou não existe pela CAPACIDADE da tela (passou a
     função?), e nunca aparece no meio do uso porque uma linha é diferente da outra. Dentro de
     cada tela as larguras são constantes; medido nos dois lugares.
     ⚠ AS DUAS CLASSES SÃO LITERAIS INTEIRAS de propósito: o Tailwind varre o fonte em busca de
     nomes completos, e uma classe montada por concatenação não seria gerada. */
  const colunas = aoMarcarDuplicado
    ? 'grid-cols-[44px_1fr_72px_92px_92px_92px_24px]'
    : 'grid-cols-[44px_1fr_72px_92px_92px_92px]';
  const colunasDoTotal = aoMarcarDuplicado
    ? 'grid-cols-[1fr_92px_92px_24px]'
    : 'grid-cols-[1fr_92px_92px]';
  return (
    /* ⚠ A LISTA OCUPA A ALTURA QUE SOBRA, E TEM A MARGEM DA CONFERÊNCIA — PR-ESPELHO-06 item C.
       Era `max-h-[55vh]` sem padding lateral: a tabela parava no meio do modal de 92vh,
       sobrava faixa morta até o rodapé, e o texto encostava na borda enquanto a Conferência
       respirava em `px-3.5`. `min-h-0 flex-1` é a MESMA receita da Conferência — 55vh é uma
       altura chutada; `flex-1` é a altura que existe.
       ⚠ `min-h-0` NÃO É ENFEITE: sem ele o filho de um flex não encolhe abaixo do conteúdo e
       o `overflow-y-auto` nunca ganha barra — a página inteira é que rolaria. */
    <div className={cn('border-t px-3.5 text-[10px]',
      rolagem === 'propria' && 'min-h-0 flex-1 overflow-y-auto')}>
      {/* ⚠ O CABEÇALHO FIXO GANHOU `z` EXPLÍCITO — PR-IMPORTAR-EXTRATO-MODAL-01, A21: em lista
          com rolagem, cabeçalho e totais ficam parados e só o corpo anda. O rodapé já tinha
          `z-[2]` desde o PR anterior; o topo não tinha nenhum, e dependia da regra implícita de
          que um elemento posicionado cobre os não-posicionados. Regra implícita é a que quebra
          quando alguém acrescenta um badge posicionado numa célula.
          ⚠ O FUNDO É OPACO E ISSO FOI CONFERIDO NO TOKEN, não presumido: `--card: 0 0% 100%`,
          sem alpha. É a mesma lição do rodapé, que era `bg-muted/40` e deixava as linhas
          aparecerem por baixo do total.
          ⚠ SEM MARGEM NEGATIVA LATERAL (A21): o container tem `px-3.5`, e resolver a faixa dos
          lados com `-mx-3.5` comeria as bordas do cartão. O eixo vertical é o único em que a
          compensação é segura, e aqui nem ele é necessário. */}
      <div className={cn('grid gap-1 font-semibold text-muted-foreground border-b pb-0.5 sticky top-0 z-[3] bg-card', colunas)}>
        <span>Data</span><span>Histórico</span><span>Documento</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
        {aoMarcarDuplicado && <span />}
      </div>
      <div className={cn('grid gap-1 py-0.5 bg-muted/40 text-[11px] font-semibold border-b', colunas)}>
        <span className="col-span-3">Saldo inicial (extrato)</span>
        <span />
        <span className={cn('text-right tabular-nums', corValReal(abertura))}>{fmtBRL(abertura)}</span>
        <span />
        {aoMarcarDuplicado && <span />}
      </div>
      {rows.map(({ r, saldo }) => (
        <div key={r.extrato_id} className={cn('group grid gap-1 py-0.5 border-b last:border-b-0 items-center', colunas)}>
          <span className="text-muted-foreground">{fmtData(r.data)}</span>
          <span className="truncate flex items-center gap-1" title={r.historico ?? ''}>
            <span className="truncate">{r.historico ?? '—'}</span>
            {r.flag_dup && <span className="px-1 rounded bg-orange-100 text-orange-700 text-[10px] shrink-0">dup</span>}
            {r.flag_investimento && <span className="px-1 rounded bg-violet-100 text-violet-700 text-[10px] shrink-0">invest</span>}
          </span>
          <span className="truncate text-muted-foreground" title={r.documento ?? ''}>{r.documento ?? '—'}</span>
          <span className={`text-right tabular-nums ${corValReal(r.valor)}`}>{fmtBRL(r.valor)}</span>
          <span className={`text-right tabular-nums ${corValReal(saldo)}`}>{fmtBRL(saldo)}</span>
          <EspStatusCell status={r.status} />
          {/* ⚠ A AÇÃO DIZ O MOTIVO, NÃO O MECANISMO — "marcar como duplicado", nunca
              "cancelar": numa linha de tabela, "cancelar" se confunde com "cancelar a
              operação", e o operador que quer tirar a duplicata hesita justamente por medo de
              desfazer o que estava fazendo.
              ⚠ `title` E `aria-label` (regra da casa), e os dois dizem a mesma frase inteira —
              um ícone sozinho não é rótulo de nada. */}
          {aoMarcarDuplicado && (
            <button type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              title="Marcar como duplicado — o movimento sai do extrato do mês"
              aria-label={`Marcar como duplicado o movimento de ${fmtData(r.data)}, ${fmtBRL(r.valor)}`}
              onClick={() => aoMarcarDuplicado(r)}>
              <Ban className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {/* ═══ O TOTAL — FIXO NO PÉ, E FORA DA GRADE DAS LINHAS ═══════════════════════════
          ⚠ ELE ROLAVA JUNTO COM A LISTA (PR-IMPORTAR-VER-EXTRATO-01): era o último filho do
          scrollport, sem `sticky`, enquanto o cabeçalho já grudava no topo. Num mês de 35
          linhas o operador perdia de vista exatamente o número que foi conferir. A regra A21
          da casa diz que o bloco de totais não rola.
          ⚠ E O FUNDO PRECISOU FICAR OPACO: era `bg-muted/40`, e translúcido é pior que não
          fixar — as linhas passam por baixo do total que se está lendo.
          ⚠ A GRADE DE 6 COLUNAS SAIU DAQUI, e este é o segundo conserto: o "informado" caía
          na coluna de Status, de 92px, para um texto que mede 184,8px — cortava no meio
          ("informado: 155.7…") e NÃO tinha `title`, então o número não podia ser lido nem no
          hover. Este bloco é um TOTAL, não uma linha de dados: ele mantém as duas últimas
          colunas alinhadas (`1fr 92px 92px` cai exatamente sobre Saldo e Status, medido) e
          deixa o texto usar a largura que sobra à esquerda. */}
      <div className={cn('sticky bottom-0 z-[2] grid gap-1 border-t bg-muted py-0.5 text-[11px] font-semibold', colunasDoTotal)}>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">Saldo final (extrato)</span>
          {/* ⚠ "—" QUANDO FALTA SALDO INFORMADO, nunca "difere R$ 0,00": a sentinela do
              CLAUDE.md diz que ausência é traço, e um "confere" sobre dado que não existe é a
              pior das duas mentiras possíveis aqui. */}
          <span className="min-w-0 truncate text-[10px] font-normal text-muted-foreground"
            title={informado == null
              ? 'sem saldo informado para o mês'
              : `informado: ${fmtBRL(informado)} · calculado: ${fmtBRL(fechamento)}`}>
            {informado == null
              ? '—'
              : <>informado: {fmtBRL(informado)}{' · '}
                  {/* ⚠ TOLERÂNCIA ZERO — PR-CONCILIACAO-TOLERANCIA-ZERO-02: este é o total do
                      extrato contra o que o banco declarou, e é a mesma pergunta do portão e da
                      tabela de saldos. Um centavo aqui é divergência, e divergência aparece. */}
                  {saldoConfere(difere ?? 0)
                    ? <span className="text-success">confere</span>
                    : <span className="text-amber-600">difere R$ {fmtBRL(Math.abs(difere ?? 0))}</span>}
                </>}
          </span>
        </span>
        <span className={cn('text-right tabular-nums', corValReal(fechamento))}>{fmtBRL(fechamento)}</span>
        <span />
        {aoMarcarDuplicado && <span />}
      </div>
    </div>
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
          rolagem="propria" aoMarcarDuplicado={setAlvo} />

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
                    <SelectItem key={m} value={m} className="text-[11px]">{m}</SelectItem>
                  ))}
                  <SelectItem value="Outro" className="text-[11px]">Outro…</SelectItem>
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
