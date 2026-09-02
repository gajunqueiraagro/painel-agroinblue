import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Unlink, Link2, FilePlus2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { CriarLancamentoDaLinha } from '@/components/conciliacao/CriarLancamentoDaLinha';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  useVinculosDoMovimento, useCandidatosDoMovimento, vincularSelecao, desfazerGrupo, TOL,
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
 * ⚠ A GUARDA DE SOBRE-APLICAÇÃO ESTÁ NO BANCO, NOS DOIS CAMINHOS — e este
 * comentário já disse o contrário. Quando o B-28b o escreveu, a unitária não
 * checava valor nenhum e o freio desta tela era a única defesa;
 * CONCIL-SOBRE-APLICACAO-01 fechou isso por migration (`md5 b22fd273`), e a
 * frase envelheceu no mesmo dia. Fica registrada porque foi verdade e porque a
 * classe do defeito já custou uma caçada: era assim que a estação afirmava que
 * `fn_candidatos_conciliacao` "ainda não existe neste banco" enquanto ela rodava.
 *
 * O que o banco recusa hoje, lido no corpo das funções:
 *   `fn_vincular_extrato_lancamento` — duas faces, ambas com tolerância 0,005:
 *     `sobre_aplicacao: valor (%) excede o aberto do movimento` (o valor contra
 *     `|valor do extrato|` menos o que já está aplicado nele) e
 *     `sobre_aplicacao: valor (%) excede o saldo livre do lancamento` (o mesmo
 *     do outro lado). Parcial vale; sobre-aplicar, não.
 *   `fn_vincular_grupo_conciliacao` — exige soma EXATA contra o valor CHEIO do
 *     movimento (`soma_diverge`), e não contra o que falta.
 *
 * ⚠ E O GRUPO NÃO FECHA PARCIAL, o que este comentário não promete de propósito:
 * como ele compara com o valor cheio ignorando o que já está aplicado, completar
 * um movimento parcial com dois lançamentos continua impossível por construção.
 * É dívida aberta do lado do banco (MIG do arquiteto), não limite desta tela.
 *
 * ⚠ O FREIO DAQUI FICA, e agora é o que sempre deveria ter sido: antecipação de
 * UX. Ele não protege o invariante — o banco protege —; ele evita que o operador
 * descubra a recusa depois do clique.
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
  /**
   * B-42 — ORDENAÇÃO CLIENT-SIDE dos candidatos.
   *
   * ⚠ `null` É "A ORDEM DO MOTOR", e é um estado de primeira classe, não a
   * ausência de ordenação: o motor devolve por score, que é a opinião dele sobre
   * qual é o par — e essa opinião é informação. Um terceiro clique volta a ela em
   * vez de deixar o operador preso na última coluna que tocou.
   *
   * ⚠ E A SELEÇÃO SOBREVIVE porque é por ID (`marcados` é um Set de ids), não por
   * posição. Reordenar com marcação por índice trocaria as linhas marcadas sem
   * nenhum aviso — sobre dinheiro.
   */
  const [ordem, setOrdem] = useState<{ campo: CampoCand; direcao: 'asc' | 'desc' } | null>(null);
  /** Grupo cuja desfeita está em confirmação; `null` = nenhuma. */
  const [confirmandoGrupo, setConfirmandoGrupo] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [criando, setCriando] = useState(false);
  /* ⚠ MARCADO É UM MAPA id → VALOR A APLICAR, não um conjunto de ids: dois
     candidatos podem entrar no mesmo movimento com valores diferentes, e é o
     valor que vai ao banco. O default de cada um é o SALDO do lançamento —
     nunca o valor cheio, que já pode estar parcialmente conciliado noutro. */
  const [marcados, setMarcados] = useState<Map<string, number>>(new Map());

  const somaAplicada = vinculos.reduce((s, v) => s + v.valorAplicado, 0);

  /* ⚠ SÓ OFERECE O BOTÃO QUANDO HÁ UM GRUPO SÓ. Um movimento pode, em tese,
     ter vínculos de mais de um grupo; nesse caso um botão único no cabeçalho
     não saberia qual desfazer, e escolher por conta própria seria decidir sobre
     dinheiro. Aí só o botão da própria linha aparece, que sabe o seu. */
  const gruposAtivos = [...new Set(vinculos.map(v => v.grupoId).filter((g): g is string => !!g))];
  const grupoUnico = gruposAtivos.length === 1 ? gruposAtivos[0] : null;
  const vinculosDoGrupo = grupoUnico ? vinculos.filter(v => v.grupoId === grupoUnico).length : 0;

  const confirmarDesfazerGrupo = async () => {
    if (!confirmandoGrupo) return;
    setDesfazendo(confirmandoGrupo);
    try {
      const r = await desfazerGrupo(confirmandoGrupo);
      /* A recusa do banco vai SEM TRADUÇÃO: ela nomeia o invariante violado, e
         reescrevê-la aqui trocaria o motivo real por um genérico nosso. */
      if (!r.ok || r.erro) { toast.error(r.erro ?? 'O banco recusou desfazer o grupo.'); return; }
      toast.success(`${r.itensDesfeitos} vínculo${r.itensDesfeitos === 1 ? '' : 's'} desfeito${r.itensDesfeitos === 1 ? '' : 's'}. Os lançamentos continuam onde estão.`);
      setConfirmandoGrupo(null);
      await recarregar();
      await recarregarCand();
      await aoMudar();
    } finally {
      setDesfazendo(null);
    }
  };
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
     nenhuma é regra inventada aqui, e NENHUMA é a defesa do invariante. Quem
     recusa é o banco, nos dois caminhos; a tela só evita que a recusa chegue
     depois do clique. Quando algo escapar daqui, a mensagem do Postgres chega
     inteira no toast, e ela é mais precisa que qualquer texto nosso.
       · 1 marcado + extrato com vínculo ativo → a unitária levanta
         'extrato ja possui vinculo ativo';
       · 2+ marcados que não somam o valor CHEIO do movimento → o grupo levanta
         'soma_diverge', porque compara com `abs(valor_do_extrato)` e não com o
         que falta;
       · seleção que passa do aberto → a unitária levanta
         'sobre_aplicacao: valor (%) excede o aberto do movimento' desde a
         migration `b22fd273`, e também barra o excesso do lado do LANÇAMENTO
         ('excede o saldo livre do lancamento'). Este freio deixou de ser a
         única defesa e virou o aviso antecipado dela. */
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

  const alternarOrdem = (campo: CampoCand) => setOrdem(o =>
    o?.campo !== campo ? { campo, direcao: 'asc' }
    : o.direcao === 'asc' ? { campo, direcao: 'desc' }
    : null);   // terceiro clique: volta à ordem do motor

  const candidatosOrdenados = useMemo(() => {
    const lista = candidatos ?? [];
    if (!ordem) return lista;
    const chave = (c: typeof lista[number]): string | number | null => {
      switch (ordem.campo) {
        case 'descricao': return c.descricao ?? null;
        case 'favorecido': return c.favorecido ?? null;
        case 'data': return c.dataReferencia ?? null;
        case 'valor': return Math.abs(c.valor);
        case 'deltaValor': return Math.abs(c.deltaValor);
        case 'deltaDias': return c.deltaDias ?? null;
      }
    };
    return [...lista].sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      /* Ausente vai para o fim em qualquer direção: uma coluna sem valor não é
         "menor", é desconhecida — e o operador procura o que existe. */
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      const base = typeof ka === 'string' && typeof kb === 'string'
        ? ka.localeCompare(kb, 'pt-BR', { sensitivity: 'base', numeric: true })
        : Number(ka) - Number(kb);
      return ordem.direcao === 'asc' ? base : -base;
    });
  }, [candidatos, ordem]);

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
              {/* O botão do grupo vive no cabeçalho da lista, e não numa linha:
                  a ação é sobre o conjunto, e pendurá-la numa linha sugeriria que
                  desfaz só aquela. */}
              {grupoUnico && (
                <Button type="button" variant="outline" size="sm"
                  className="ml-2 h-5 gap-1 px-2 text-[10px]"
                  disabled={desfazendo != null}
                  title="Desfaz de uma vez os vínculos deste grupo. Os lançamentos continuam onde estão."
                  onClick={() => setConfirmandoGrupo(grupoUnico)}>
                  <Unlink className="h-3 w-3" />
                  Desfazer grupo ({vinculosDoGrupo})
                </Button>
              )}
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
                      {/* ⚠ MEMBRO DE GRUPO NÃO SE DESFAZ SOZINHO — PR-DESFAZER-GRUPO.
                          Os N vínculos nasceram juntos porque N lançamentos
                          explicam UM movimento; tirar um deixaria o extrato
                          explicado por uma soma que ninguém escolheu. A RPC
                          unitária já recusava — o que faltava era a tela DIZER
                          isso e oferecer a saída, em vez de um botão que falha. */}
                      <Button type="button" variant="ghost" size="sm"
                        className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                        disabled={desfazendo != null}
                        title={v.grupoId
                          ? 'Este vínculo faz parte de um grupo — use "Desfazer grupo" acima.'
                          : undefined}
                        onClick={() => (v.grupoId ? setConfirmandoGrupo(v.grupoId) : desfazer(v.id))}>
                        {desfazendo === v.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Unlink className="h-3 w-3" />}
                        {v.grupoId ? 'Desfazer grupo' : 'Desfazer'}
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
                /* ⚠ TEXTO GANHA, NÚMERO DEVOLVE — B-42. A Descrição é o CRITÉRIO
                   de validação do operador: é lendo "PIX 790 FORNECEDOR X" que
                   ele decide se aquele lançamento é o movimento. "PAGAMEN…" não
                   valida nada, e era o que a divisão igual entre sete colunas
                   produzia. Os números têm largura previsível — `tabular-nums` e
                   um teto —, então devolvem o espaço que não usam.
                   `table-fixed` + colgroup é o que faz o truncate acontecer no
                   lugar certo em vez de a coluna esticar. */
                <table className="w-full table-fixed border-collapse text-[10px]">
                  <colgroup>
                    <col className="w-[28px]" />
                    <col />
                    <col className="w-[140px]" />
                    <col className="w-[80px]" />
                    <col className="w-[100px]" />
                    <col className="w-[84px]" />
                    <col className="w-[56px]" />
                  </colgroup>
                  <thead>
                    {/* Cabeçalho no padrão da casa: fundo primário, texto claro. */}
                    <tr className="bg-primary text-[9px] uppercase tracking-wide text-primary-foreground">
                      <th className="px-2 py-1"> </th>
                      <Cab campo="descricao" rotulo="Descrição" ordem={ordem} aoOrdenar={alternarOrdem} />
                      <Cab campo="favorecido" rotulo="Favorecido" ordem={ordem} aoOrdenar={alternarOrdem} />
                      <Cab campo="data" rotulo="Data" ordem={ordem} aoOrdenar={alternarOrdem} />
                      <Cab campo="valor" rotulo="Valor" ordem={ordem} aoOrdenar={alternarOrdem} alinhaDireita />
                      <Cab campo="deltaValor" rotulo="Δ R$" ordem={ordem} aoOrdenar={alternarOrdem} alinhaDireita />
                      <Cab campo="deltaDias" rotulo="Δ dias" ordem={ordem} aoOrdenar={alternarOrdem} alinhaDireita />
                    </tr>
                  </thead>
                  <tbody>
                    {candidatosOrdenados.map(c => {
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
                          <td className="truncate px-2 py-1 text-[11px] font-medium" title={c.descricao ?? ''}>
                            {c.descricao ?? '—'}
                            {c.ambiguo && (
                              <span className="ml-1 rounded bg-amber-500/15 px-1 py-0 text-[9px] font-semibold uppercase text-amber-700 dark:text-amber-400"
                                title="Há outro candidato tecnicamente igual a este — o motor não escolhe por você.">
                                ambíguo
                              </span>
                            )}
                          </td>
                          <td className="truncate px-2 py-1 text-muted-foreground" title={c.favorecido ?? ''}>
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

      {/* ⚠ A CONFIRMAÇÃO DIZ O QUE NÃO ACONTECE. "Desfazer" sobre dinheiro
          assusta, e a dúvida do clique é sempre a mesma: os lançamentos somem?
          Não somem — e dizê-lo aqui é o que separa a hesitação da decisão. */}
      <AlertDialog open={confirmandoGrupo !== null}
        onOpenChange={o => !o && setConfirmandoGrupo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer o grupo?</AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-snug">
              Desfaz os <b>{vinculosDoGrupo || vinculos.filter(v => v.grupoId === confirmandoGrupo).length} vínculos</b> deste
              grupo de uma vez. <b>Os lançamentos ficam</b> — eles voltam a ficar disponíveis para
              conciliar, e nenhum é apagado ou alterado. O movimento volta a “sem vínculo”, e você
              pode refazer a conciliação do jeito certo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desfazendo != null}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void confirmarDesfazerGrupo(); }}>
              Desfazer grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

type CampoCand = 'descricao' | 'favorecido' | 'data' | 'valor' | 'deltaValor' | 'deltaDias';

/**
 * Um cabeçalho clicável da tabela de candidatos.
 *
 * ⚠ A SETA É SEMPRE VISÍVEL, apagada quando a coluna não é a ativa: mostrá-la só
 * no hover esconde quais colunas ordenam — justamente o que o operador precisa
 * saber antes de tentar.
 */
function Cab({ campo, rotulo, ordem, aoOrdenar, alinhaDireita }: {
  campo: CampoCand; rotulo: string;
  ordem: { campo: CampoCand; direcao: 'asc' | 'desc' } | null;
  aoOrdenar: (c: CampoCand) => void;
  alinhaDireita?: boolean;
}) {
  const ativo = ordem?.campo === campo;
  const Seta = !ativo ? ChevronsUpDown : ordem.direcao === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className={cn('cursor-pointer select-none px-2 py-1 font-semibold hover:bg-primary/80',
        alinhaDireita ? 'text-right' : 'text-left')}
      onClick={() => aoOrdenar(campo)}
      aria-sort={ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
      title="Clique para ordenar; um terceiro clique volta à ordem do motor."
    >
      <span className={cn('inline-flex items-center gap-0.5', alinhaDireita && 'flex-row-reverse')}>
        {rotulo}
        <Seta className={cn('h-2.5 w-2.5 shrink-0', !ativo && 'opacity-40')} aria-hidden />
      </span>
    </th>
  );
}
