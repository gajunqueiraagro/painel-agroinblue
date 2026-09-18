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
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useEspelhoInternas, type EspelhoInternas } from '@/hooks/useEspelhoInternas';

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
export function TabelaExtratoDoMes({ ofx, inicial, internas, rolagem = 'propria' }: {
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
      <div className="grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 font-semibold text-muted-foreground border-b pb-0.5 sticky top-0 bg-card">
        <span>Data</span><span>Histórico</span><span>Documento</span><span className="text-right">Valor</span><span className="text-right">Saldo</span><span>Status</span>
      </div>
      <div className="grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 py-0.5 bg-muted/40 text-[11px] font-semibold border-b">
        <span className="col-span-3">Saldo inicial (extrato)</span>
        <span />
        <span className={cn('text-right tabular-nums', corValReal(abertura))}>{fmtBRL(abertura)}</span>
        <span />
      </div>
      {rows.map(({ r, saldo }) => (
        <div key={r.extrato_id} className="grid grid-cols-[44px_1fr_72px_92px_92px_92px] gap-1 py-0.5 border-b last:border-b-0 items-center">
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
      <div className="sticky bottom-0 z-[2] grid grid-cols-[1fr_92px_92px] gap-1 border-t bg-muted py-0.5 text-[11px] font-semibold">
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
                  {Math.abs(difere ?? 0) <= 0.01
                    ? <span className="text-success">confere</span>
                    : <span className="text-amber-600">difere R$ {fmtBRL(Math.abs(difere ?? 0))}</span>}
                </>}
          </span>
        </span>
        <span className={cn('text-right tabular-nums', corValReal(fechamento))}>{fmtBRL(fechamento)}</span>
        <span />
      </div>
    </div>
  );
}

/**
 * O EXTRATO DO MÊS PRONTO PARA MONTAR — a aba Importar precisa de uma linha, não de três hooks.
 *
 * ⚠ OS HOOKS FICAM AQUI, e não na tela: são dois (`useExtratoDoMesEspelhado` e
 * `useEspelhoInternas`) e nascem sempre juntos — a tabela não sabe abrir o saldo sem o
 * consolidado das contas internas. Espalhá-los pela `ConciliacaoBancariaTab` daria à tela
 * duas leituras para guardar e nenhuma para usar sozinha.
 * ⚠ CADA ESTADO TEM A SUA FRASE, e nenhuma delas é "—": sem conta escolhida, carregando,
 * falhou e mês vazio dizem coisas diferentes, e é o passo 1 — conferir se o extrato chegou
 * completo — que depende de saber qual dos quatro é.
 */
export function ExtratoDoMesInline({ clienteId, contaId, anoMes }: {
  clienteId: string | null; contaId: string | null; anoMes: string;
}) {
  const { data, isLoading, error } = useExtratoDoMesEspelhado(clienteId, contaId, anoMes);
  const internas = useEspelhoInternas(clienteId, contaId, anoMes);

  if (!clienteId || !contaId) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
        Escolha uma conta no cabeçalho para ver o extrato do mês.
      </div>
    );
  }
  if (isLoading) {
    return <div className="rounded-md border px-3 py-6 text-center text-[11px] text-muted-foreground">Lendo o extrato do mês…</div>;
  }
  if (error || !data) {
    /* ⚠ A MENSAGEM DO BANCO VAI JUNTO, no `title`: um "não consegui" mudo é o defeito que o
       PR-PALCO-ERRO-VISIVEL-01 acabou de tirar da tela vizinha. */
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-6 text-center text-[11px] text-destructive"
        title={error instanceof Error ? error.message : undefined}>
        Não foi possível ler o extrato deste mês.
      </div>
    );
  }
  if (data.ofx.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
        Nenhum movimento importado neste mês — importe o OFX acima.
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-card">
      <div className="px-3.5 py-1.5 text-[11px] font-medium">
        O extrato do mês, como o banco mandou
        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
          {data.ofx.length} movimento{data.ofx.length === 1 ? '' : 's'} · o saldo corre linha a linha até fechar com o banco
        </span>
      </div>
      <TabelaExtratoDoMes ofx={data.ofx} inicial={data.inicial} internas={internas} rolagem="da-pagina" />
    </div>
  );
}
