import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Unlink, Link2, FilePlus2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { CriarLancamentoDaLinha } from '@/components/conciliacao/CriarLancamentoDaLinha';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useVinculosDoMovimento, useCandidatosDoMovimento, vincularSelecao, TOL,
  type MovimentoConciliacao, type CandidatoConciliacao,
} from '@/hooks/useConciliacaoDoMes';

/**
 * EstacaoConciliar — a estação "Conciliar movimento do extrato", rodada 1.
 * FIN-CONCIL-PORTAR-01, portada de `ConciliarMovimento.tsx` do `AllinBlues/financas`.
 *
 * ⚠ O QUE ESTÁ AQUI É O QUE É FATO. A tabela "Vínculos deste movimento" — o
 * ajuste que o Gabriel pediu — com as MESMAS colunas que os candidatos vão ter
 * (Descrição · Favorecido · Data · Valor · Aplicado), a soma ao vivo contra o
 * valor do movimento, e o desfazer por vínculo.
 *
 * ⚠ O PAINEL DE CANDIDATOS ENTROU — FIN-CONCIL-ESTACAO-CANDIDATOS-01. Δ R$, Δ
 * dias, score, pré-marca e ambiguidade saem do motor do trio, que está aplicado
 * no Proto desde o B-21; nada disso é calculado aqui. É a doutrina do original:
 * o contador e a lista saem do MESMO campo, e escrever a régua num segundo
 * lugar é divergência por manutenção manual.
 *
 * ⚠ O QUE NÃO VEIO DO ORIGINAL, e é escolha declarada: ajustar o previsto ao
 * valor do banco (o `MoneyInput` da ADR-0036 D2 deles), forma de pagamento
 * sugerida, criar o lançamento da linha e criar o par de transferência. Cada uma
 * é uma feature com ADR própria, e nenhuma é "listar candidatos e vincular".
 *
 * ⚠ A GUARDA DE SOBRE-APLICAÇÃO EXISTE DE UM LADO SÓ, e a leitura dos corpos no
 * banco (B-28b) refinou o que o B-28 tinha registrado. No original quem recusa é
 * um gatilho (`fn_tg_conciliacao_coerente`); aqui não há gatilho equivalente —
 * os quatro de `conciliacao_bancaria_itens` são auditoria, mês fechado, promoção
 * e snapshot. Mas as RPCs não são iguais entre si:
 *   `fn_vincular_grupo_conciliacao` EXIGE que a soma feche o valor cheio do
 *     movimento (`soma_diverge`, tolerância 0,005) — sobre-aplicar por ali é
 *     impossível, e sub-aplicar também;
 *   `fn_vincular_extrato_lancamento` NÃO checa valor nenhum: aceita o
 *     `p_valor_aplicado` que mandarem, inclusive maior que o movimento.
 * Então o freio de tela é a ÚNICA defesa no caminho unitário, e é paliativo: o
 * botão se recusa a oferecer o que estouraria, com o motivo escrito ao lado. A
 * guarda de verdade é migration (CONCIL-SOBRE-APLICACAO-01) e continua pendente.
 */
interface Props {
  movimento: MovimentoConciliacao;
  aoFechar: () => void;
  aoMudar: () => void | Promise<void>;
  /**
   * Conta do extrato — só para dar a fazenda por padrão ao criar-da-linha.
   * Ausente, o formulário pede a fazenda em vez de adivinhá-la; nenhum outro
   * comportamento depende dela, então quem monta sem a prop segue igual.
   */
  contaBancariaId?: string | null;
}

export function EstacaoConciliar({ movimento, aoFechar, aoMudar, contaBancariaId }: Props) {
  const { clienteAtual } = useCliente();
  const { vinculos, loading, recarregar } = useVinculosDoMovimento(movimento.id);
  const { candidatos, carregando: carregandoCand, recarregar: recarregarCand } =
    useCandidatosDoMovimento(clienteAtual?.id ?? null, movimento.id);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [criando, setCriando] = useState(false);
  /* ⚠ MARCADO É UM MAPA id → VALOR A APLICAR, não um conjunto de ids: dois
     candidatos podem entrar no mesmo movimento com valores diferentes, e é o
     valor que vai ao banco. O default de cada um é o SALDO do lançamento —
     nunca o valor cheio, que já pode estar parcialmente conciliado noutro. */
  const [marcados, setMarcados] = useState<Map<string, number>>(new Map());

  const somaAplicada = vinculos.reduce((s, v) => s + v.valorAplicado, 0);
  const alvo = Math.abs(movimento.valor);
  const resta = alvo - somaAplicada;
  /* ⚠ "fecha" / "passa" / "falta" — os três estados do original, e a tolerância
     é a mesma que o banco usa. A tela antecipa a recusa; quem recusa é o banco. */
  const estado = Math.abs(resta) <= TOL ? 'fecha' : resta < 0 ? 'passa' : 'falta';

  const somaMarcada = useMemo(
    () => Array.from(marcados.values()).reduce((s, v) => s + v, 0), [marcados],
  );
  /* ⚠ O QUE SOBRARIA DEPOIS DE GRAVAR — a conta que decide o botão. Negativo
     significa aplicar mais do que o movimento comporta. */
  const restaDepois = resta - somaMarcada;
  /* ⚠ UMA FRASE, TRÊS USOS: `disabled`, `title` e a dica ao lado saem daqui.
     Botão desabilitado sempre diz por quê, e o motivo tem uma fonte só — dois
     lugares divergiriam no primeiro ajuste.
     ⚠ CADA LINHA ANTECIPA UMA RECUSA QUE EXISTE NO CORPO DA RPC, lida no banco —
     nenhuma é regra inventada aqui. A tela antecipa; quem recusa é o banco, e a
     mensagem dele continua chegando inteira no toast quando algo escapar.
       · 1 marcado + extrato com vínculo ativo → a unitária levanta
         'extrato ja possui vinculo ativo';
       · 2+ marcados que não somam o valor CHEIO do movimento → o grupo levanta
         'soma_diverge', porque compara com `abs(valor_do_extrato)` e não com o
         que falta;
       · seleção que passa do aberto → nada no banco recusa no caminho unitário,
         e este é o único freio (CONCIL-SOBRE-APLICACAO-01, ainda pendente). */
  const impedimento: string | null =
    marcados.size === 0 ? 'Marque ao menos um lançamento.'
    : restaDepois < -TOL
      ? `A seleção passa ${formatMoeda(Math.abs(restaDepois))} do que falta neste movimento.`
    : marcados.size === 1 && vinculos.length > 0
      ? 'Este movimento já tem vínculo ativo — o banco só aceita um vínculo avulso por movimento. Desfaça o atual para refazer.'
    : marcados.size > 1 && Math.abs(somaMarcada - alvo) > TOL
      ? `Em grupo, a soma tem de fechar o valor cheio do movimento (${formatMoeda(alvo)}); a seleção soma ${formatMoeda(somaMarcada)}.`
      : null;

  const alternar = (c: CandidatoConciliacao) => {
    setMarcados(prev => {
      const proximo = new Map(prev);
      if (proximo.has(c.id)) proximo.delete(c.id);
      else proximo.set(c.id, c.saldo);
      return proximo;
    });
  };

  const vincular = async () => {
    if (impedimento) return;
    setVinculando(true);
    try {
      const pares = Array.from(marcados, ([lancamentoId, valor]) => ({ lancamentoId, valor }));
      const { ok, erro } = await vincularSelecao(movimento.id, pares, 'vinculado_na_estacao');
      if (!ok) { toast.error(erro ?? 'O banco recusou o vínculo.'); return; }
      toast.success(`${pares.length} vínculo${pares.length === 1 ? '' : 's'} criado${pares.length === 1 ? '' : 's'}.`);
      setMarcados(new Map());
      await recarregar();
      await recarregarCand();
      await aoMudar();
    } finally {
      setVinculando(false);
    }
  };

  const desfazer = async (vinculoId: string) => {
    setDesfazendo(vinculoId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: idioma existente do .rpc
      const { error } = await (supabase as any).rpc('fn_desfazer_vinculo_extrato', {
        p_extrato_id: movimento.id,
        p_motivo: 'desfeito_na_estacao',
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Vínculo desfeito.');
      await recarregar();
      await aoMudar();
    } finally {
      setDesfazendo(null);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="flex max-h-[85vh] w-[94vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium text-primary leading-none">
            Conciliar movimento do extrato
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            {movimento.data_movimento.split('-').reverse().join('/')} ·{' '}
            <span className="tabular-nums">{formatMoeda(movimento.valor)}</span>
            {movimento.descricao ? ` · ${movimento.descricao}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* ─── VÍNCULOS DESTE MOVIMENTO ────────────────────────────────────
              ⚠ AS MESMAS COLUNAS DOS CANDIDATOS — pedido do Gabriel. Quando o
              painel de candidatos entrar, as duas tabelas ficam lado a lado com
              a mesma régua: o que já está vinculado e o que pode ser. Colunas
              diferentes obrigariam o olho a reaprender a leitura no meio da
              mesma tela. */}
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11px] font-medium text-foreground">Vínculos deste movimento</span>
            <span className="text-[10px] text-muted-foreground">
              {vinculos.length} vínculo{vinculos.length === 1 ? '' : 's'} ativo{vinculos.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">Carregando…</p>
          ) : vinculos.length === 0 ? (
            <p className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
              Nenhum vínculo ainda — este movimento está inteiro em aberto.
            </p>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b text-[9px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1 text-left font-semibold">Descrição</th>
                  <th className="px-2 py-1 text-left font-semibold">Favorecido</th>
                  <th className="px-2 py-1 text-left font-semibold">Data</th>
                  <th className="px-2 py-1 text-right font-semibold">Valor</th>
                  <th className="px-2 py-1 text-right font-semibold">Aplicado</th>
                  <th className="px-2 py-1"> </th>
                </tr>
              </thead>
              <tbody>
                {vinculos.map(v => (
                  <tr key={v.id} className="border-b border-border/60">
                    <td className="max-w-0 truncate px-2 py-1" title={v.lancamentoDescricao ?? ''}>
                      {v.lancamentoDescricao ?? '—'}
                    </td>
                    <td className="max-w-0 truncate px-2 py-1 text-muted-foreground" title={v.favorecido ?? ''}>
                      {v.favorecido ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                      {v.lancamentoData ? v.lancamentoData.split('-').reverse().join('/') : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {v.lancamentoValor == null ? '—' : formatMoeda(v.lancamentoValor)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums">
                      {formatMoeda(v.valorAplicado)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button type="button" variant="ghost" size="sm"
                        className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                        disabled={desfazendo != null}
                        onClick={() => desfazer(v.id)}>
                        {desfazendo === v.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Unlink className="h-3 w-3" />}
                        Desfazer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ⚠ A SOMA AO VIVO CONTRA O VALOR DO MOVIMENTO — o pedido do Gabriel,
              e a mesma leitura do rodapé da estação original: "fecha" em verde,
              "passa" em vermelho, "falta" em âmbar. A cor acompanha a palavra;
              nunca é o único canal. */}
          <div className="mt-2 flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1 border-t pt-2 text-[11px] tabular-nums">
            <span className="text-muted-foreground">Movimento <b className="text-foreground">{formatMoeda(alvo)}</b></span>
            <span className="text-muted-foreground">Aplicado <b className="text-foreground">{formatMoeda(somaAplicada)}</b></span>
            <span className={
              estado === 'fecha' ? 'font-medium text-success'
              : estado === 'passa' ? 'font-medium text-destructive'
              : 'font-medium text-amber-700 dark:text-amber-500'}>
              {estado === 'fecha' ? 'fecha'
                : estado === 'passa' ? `passa ${formatMoeda(Math.abs(resta))}`
                : `falta ${formatMoeda(resta)}`}
            </span>
          </div>

          {/* ─── LANÇAMENTOS CANDIDATOS ──────────────────────────────────────
              ⚠ SÓ APARECE ENQUANTO HÁ O QUE COBRIR. Com o movimento fechado não
              há candidato a oferecer, e a estação volta a ser o que era: mostrar
              e desfazer. Oferecer vínculo sobre um movimento coberto seria
              oferecer o que o próprio saldo recusa. */}
          {estado !== 'fecha' && (
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[11px] font-medium text-foreground">Lançamentos candidatos</span>
                <span className="text-[10px] text-muted-foreground">
                  {candidatos == null ? '—' : `${candidatos.length} encontrado${candidatos.length === 1 ? '' : 's'}`}
                </span>
              </div>

              {carregandoCand ? (
                <p className="py-6 text-center text-[11px] text-muted-foreground">Consultando o motor…</p>
              ) : candidatos == null ? (
                /* ⚠ NULO É "NÃO CONSEGUI PERGUNTAR", e a tela diz isso em vez de
                   mostrar lista vazia — que afirmaria que não há candidato. */
                <p className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
                  O motor de candidatos não respondeu. A lista de vínculos acima continua válida.
                </p>
              ) : candidatos.length === 0 ? (
                <p className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
                  Nenhum lançamento candidato — nada em aberto nesta conta com valor e data compatíveis.
                </p>
              ) : (
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b text-[9px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-1"> </th>
                      <th className="px-2 py-1 text-left font-semibold">Descrição</th>
                      <th className="px-2 py-1 text-left font-semibold">Favorecido</th>
                      <th className="px-2 py-1 text-left font-semibold">Data</th>
                      <th className="px-2 py-1 text-right font-semibold">Valor</th>
                      <th className="px-2 py-1 text-right font-semibold">Δ R$</th>
                      <th className="px-2 py-1 text-right font-semibold">Δ dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidatos.map(c => {
                      const marcado = marcados.has(c.id);
                      return (
                        <tr key={c.id} className={cn('border-b border-border/60',
                          marcado && 'bg-primary/5',
                          /* já coberto por inteiro: auditável, não acionável */
                          c.indisponivel && 'opacity-50')}>
                          <td className="px-2 py-1 align-middle">
                            <Checkbox className="h-3 w-3" checked={marcado} disabled={c.indisponivel}
                              onCheckedChange={() => alternar(c)}
                              aria-label="Selecionar lançamento"
                              /* ⚠ A RAZÃO DA MARCA, sempre — pré-marca e cinza
                                 explicam-se, senão viram arbitrariedade. */
                              title={c.indisponivel
                                ? (c.motivoIndisponivel ?? 'Já conciliado por inteiro.')
                                : c.preMarcado
                                  ? `Pré-marcado pelo motor (score ${c.score ?? '—'}): valor e data compatíveis.`
                                  : undefined} />
                          </td>
                          <td className="max-w-0 truncate px-2 py-1" title={c.descricao ?? ''}>
                            {c.descricao ?? '—'}
                            {c.ambiguo && (
                              <span className="ml-1 rounded bg-amber-500/15 px-1 py-0 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-400"
                                title="Há outro candidato tecnicamente igual a este — o motor não escolhe por você.">
                                ambíguo
                              </span>
                            )}
                          </td>
                          <td className="max-w-0 truncate px-2 py-1 text-muted-foreground" title={c.favorecido ?? ''}>
                            {c.favorecido ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                            {c.dataReferencia ? c.dataReferencia.split('-').reverse().join('/') : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                            {formatMoeda(c.valor)}
                            {/* ⚠ SALDO SÓ QUANDO DIFERE DO VALOR: é o que de fato
                                entra no vínculo quando o lançamento já tem parte
                                conciliada noutro movimento. */}
                            {Math.abs(c.saldo - Math.abs(c.valor)) > TOL && (
                              <span className="ml-1 text-[9px] text-muted-foreground"
                                title="Saldo livre do lançamento — o que ainda pode ser aplicado.">
                                livre {formatMoeda(c.saldo)}
                              </span>
                            )}
                          </td>
                          {/* ⚠ A MARCA DE EXATO NÃO EXISTE NO ORIGINAL — medido: a
                              célula de Δ R$ de lá é texto cru `text-muted-foreground`
                              e escreve "0", não "exato" (a palavra foi nossa, do
                              B-28). O que veio verbatim é a CLASSE: o verde
                              `bg-success/15 text-success` em `text-[10px]` é o do
                              badge de situação do movimento na estação de lá — a
                              mesma linguagem visual, no piso de leitura da casa. */}
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted-foreground">
                            {Math.abs(c.deltaValor) <= TOL ? (
                              <span className="rounded bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success"
                                title="Δ zero: o valor do lançamento bate com o do movimento.">
                                exato
                              </span>
                            ) : formatMoeda(c.deltaValor)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted-foreground">
                            {c.deltaDias == null ? '—' : c.deltaDias}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ⚠ O BOTÃO DIZ QUANTOS VAI GRAVAR E, QUANDO NÃO PODE, POR QUÊ — a regra
            do botão que explica. `impedimento` é fonte única de `disabled`,
            `title` e da frase ao lado; três lugares divergiriam. */}
        <DialogFooter className="shrink-0 items-center gap-2 border-t px-4 py-2.5 sm:justify-between">
          <span className="text-[10px] leading-snug text-muted-foreground">
            {marcados.size > 0 && !impedimento
              ? `Vai aplicar ${formatMoeda(somaMarcada)} — ${Math.abs(restaDepois) <= TOL
                  ? 'fecha o movimento' : `restam ${formatMoeda(restaDepois)}`}.`
              : (impedimento ?? '')}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={aoFechar}>Fechar</Button>
            {/* ⚠ CRIAR SÓ NO MOVIMENTO INTOCADO — e quem manda é a RPC, não uma
                escolha de tela: `fn_criar_lancamento_de_extrato` levanta
                `extrato ja possui vinculo ativo` quando há vínculo. Oferecer o
                botão num movimento parcial seria oferecer o que o banco recusa.
                ⚠ E ELE APARECE MESMO HAVENDO CANDIDATOS: o operador pode saber
                que nenhum deles é este movimento. O caso que abriu esta frente é
                o oposto — "Nenhum lançamento candidato" e nada a fazer. */}
            {estado !== 'fecha' && vinculos.length === 0 && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5"
                onClick={() => setCriando(true)}
                title="Cria o lançamento que falta, já pago e já vinculado a este movimento.">
                <FilePlus2 className="h-3.5 w-3.5" />
                Criar lançamento
              </Button>
            )}
            {estado !== 'fecha' && (
              <Button type="button" size="sm" className="gap-1.5"
                disabled={impedimento !== null || vinculando}
                title={impedimento ?? undefined}
                onClick={() => { void vincular(); }}>
                {vinculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Vincular ({marcados.size})
              </Button>
            )}
          </span>
        </DialogFooter>
      </DialogContent>

      {/* ⚠ O FORMULÁRIO ABRE POR CIMA E A ESTAÇÃO NÃO FECHA. Criado o
          lançamento, a estação recarrega vínculos e candidatos da mesma fonte —
          o movimento aparece conciliado sem ninguém sair da tela. */}
      {criando && (
        <CriarLancamentoDaLinha
          movimento={movimento}
          contaBancariaId={contaBancariaId ?? null}
          aoFechar={() => setCriando(false)}
          aoCriado={async () => {
            await recarregar();
            await recarregarCand();
            await aoMudar();
          }}
        />
      )}
    </Dialog>
  );
}
