import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { faixaDoMes } from '@/hooks/useConciliacaoDoMes';

/**
 * VincularMatchDireto — o balde que não pede decisão, resolvido de uma vez.
 * FIN-CONCIL-VINCULAR-MASSA-MATCH-DIRETO-01 (B-22c); motor trocado no B-38.
 *
 * ⚠ O MOTIVO DE EXISTIR É MEDIDO: no NJ, BB mar/26 tem 239 movimentos sem
 * vínculo contra 244 lançamentos antigos soltos; BB ago/26 são 110 × 110. São
 * lançamentos do fluxo OFX antigo, idênticos aos movimentos, só sem o elo — ~360
 * cliques para refazer à mão. A regra "onde há lançamento antigo solto, primeiro
 * o vínculo, depois a massa" depende de isto ser viável.
 *
 * ⚠ B-38 — O BOTÃO DEIXOU DE DEPENDER DO MOTOR DE SUGESTÕES. Antes ele lia o
 * balde `match_direto` de `fn_sugestoes_extrato` e chamava o gravador uma vez
 * por par, do navegador. O motor chama `fn_candidatos_conciliacao` POR MOVIMENTO
 * (~6 s cada): 190 movimentos = timeout, e o botão simplesmente nunca aparecia
 * no mês grande — exatamente o mês que precisava dele. Agora quem varre é
 * `fn_vincular_exatos_mes`, set-based, e responde em segundos em qualquer
 * tamanho de mês.
 *
 * ⚠ A RÉGUA DA RPC É MAIS DURA QUE A DO CHIP, e é de propósito: par de mesma
 * conta, mesmo valor absoluto e MESMA DATA, único entre os movimentos em aberto
 * E único entre os lançamentos sem vínculo. O balde `match_direto` do motor
 * admite aproximação de data; esta varredura não admite nenhuma. Por isso a
 * contagem daqui pode ser MENOR que a do chip ao lado — o que sobra continua
 * disponível na estação, uma decisão de cada vez.
 *
 * ⚠ E É POR ISSO QUE O RÓTULO DIZ "OS EXATOS", não "os match direto": o botão
 * passou a nomear o que ele faz, em vez do balde de outro motor. Com dois nomes
 * iguais e duas réguas diferentes, a divergência das contagens viraria surpresa
 * no clique; com nomes diferentes, ela está explicada antes.
 * ⚠ O NOME DO ARQUIVO E DO COMPONENTE FICARAM PARA TRÁS de propósito — renomear
 * é mexer em quem importa, e não era o escopo deste conserto.
 *
 * ⚠ O GRAVADOR CONTINUA SENDO UM SÓ. A RPC chama
 * `fn_vincular_extrato_lancamento` par a par, dentro dela: todas as travas e a
 * guarda de sobre-aplicação valem, e a recusa de um par não derruba o lote —
 * volta contada em `recusados`, com o motivo do Postgres.
 *
 * ⚠ PRÉVIA E EXECUÇÃO SÃO A MESMA CHAMADA, com `p_simular` alternando — o mesmo
 * contrato da geração de recorrências. Uma prévia que responde por um caminho e
 * grava por outro pode prometer N e entregar M.
 *
 * ⚠ O ALVO DA CONFIRMAÇÃO NÃO PODE SER O MESMO DO DISPARO — PR-VINCULAR-EXATOS-CONFIRMA-01, e
 * isto nasce de um defeito real: o botão SIMULAVA no primeiro clique e trocava o próprio rótulo
 * para "Confirmar N vínculos", no MESMO lugar; o segundo clique gravava. Um duplo-clique, ou
 * quem clicou de novo achando que não pegou, atravessava a confirmação sem ler nada — foi o que
 * aconteceu na Vera Ligia em 18/09/2026, com dois vínculos gravados sem o operador ver o que
 * ia acontecer. A prévia existia e o desenho a tornava invisível.
 * ⚠ AGORA O BOTÃO SÓ SIMULA E ABRE O DIÁLOGO. Ele nunca grava, em clique nenhum: quem grava é
 * um segundo botão, noutra caixa, ao lado de um "Cancelar". Toda ação em lote desta tela mostra
 * o que vai alterar antes de gravar.
 */
interface Props {
  clienteId: string | null;
  contaId: string | null;
  ano: number;
  mes: number;
  aoConcluir: () => void | Promise<void>;
}

interface RetornoRpc {
  ok: boolean;
  vinculados: number;
  recusados: number;
  motivos: string | null;
  simulacao: boolean;
}

/**
 * UM PAR EXATO, COM OS DOIS LADOS — PR-CONCILIAR-MES-VER-OS-PARES-01.
 *
 * ⚠ EXPORTADO — PR-CONCILIAR-MES-ESPERANDO-COM-PAR-01. O `ConciliarMesDialog` mostra os mesmos
 * pares na faixa "Têm par exato", e uma segunda cópia do tipo e do narrowing divergiria na
 * primeira mudança do contrato da RPC. Uma peça, nunca uma cópia.
 * ⚠ ELE NÃO EXISTIA NO RETORNO ATÉ 18/09/2026. A RPC percorria o `m1 JOIN l1` inteiro e só
 * contava: devolvia `vinculados` e nada mais. A caixa então dizia "Vincular 20 pares exatos?"
 * sem mostrar um par sequer — pedir aprovação sem mostrar o que se aprova, que é o defeito que
 * este projeto passou o dia tirando das telas.
 */
export interface ParExato {
  extratoId: string;
  lancamentoId: string;
  data: string | null;
  historicoBanco: string | null;
  valorBanco: number;
  descricaoSistema: string | null;
  favorecido: string | null;
  /** ⚠ JÁ VEM COM O SINAL — a RPC aplica `sinal` sobre o valor, para a tela não precisar
      conhecer a convenção de `financeiro_lancamentos_v2` (valor positivo + direção à parte). */
  valorSistema: number;
}

/* ⚠ NARROWING, NÃO CAST: o retorno é `jsonb` e a regra zero-cast vale. Perguntar antes de ler é
   o que faz a caixa mostrar o que tem, em vez de quebrar, se a RPC mudar de forma. */
const ehObjeto = (j: unknown): j is Record<string, unknown> =>
  !!j && typeof j === 'object' && !Array.isArray(j);
const txt = (j: unknown): string | null => (typeof j === 'string' ? j : null);
const num = (j: unknown): number => { const v = Number(j); return Number.isFinite(v) ? v : 0; };

export function lerPares(j: unknown): ParExato[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap(i => {
    if (!ehObjeto(i)) return [];
    return [{
      extratoId: String(i.extrato_id),
      lancamentoId: String(i.lancamento_id),
      data: txt(i.data),
      historicoBanco: txt(i.historico_banco),
      valorBanco: num(i.valor_banco),
      descricaoSistema: txt(i.descricao_sistema),
      favorecido: txt(i.favorecido),
      valorSistema: num(i.valor_sistema),
    }];
  });
}

/**
 * DATA CURTA — DD/MM. PR-CONCILIAR-MES-DATA-VAZANDO-01.
 *
 * ⚠ ELA DEVOLVIA DD/MM/AAAA E VAZAVA POR CIMA DA DESCRIÇÃO. As células destas listas têm
 * `w-[38px]` — largura de "04/09" —, e "04/09/2026" mede quase o dobro: o texto transbordava e
 * a tela mostrava "04/09/20PAG BOLETO UNIAO INDUSTRIA…". Em TODAS as linhas.
 * ⚠ O ANO É REDUNDANTE AQUI, e é por isso que a saída é DD/MM e não uma coluna mais larga:
 * estas listas são de UM mês, anunciado no cabeçalho do próprio diálogo. Repetir "2026" em
 * cada linha gasta largura para não dizer nada.
 * ⚠ EXPORTADA: o `ConciliarMesDialog` tinha uma cópia byte a byte desta função, e as duas
 * vazavam do mesmo jeito. Uma peça, nunca uma cópia.
 */
export const dataBr = (iso: string | null) =>
  (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—');
const corValor = (v: number) => (v < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400');

export function VincularMatchDireto({ clienteId, contaId, ano, mes, aoConcluir }: Props) {
  const [ocupado, setOcupado] = useState(false);
  /**
   * O que a varredura encontrou. `null` = ainda não perguntamos.
   * ⚠ ERA SÓ O NÚMERO (`number | null`), e era essa a limitação que fazia a caixa afirmar sem
   * mostrar. Agora guarda os pares, que é o que o operador precisa ver para aprovar.
   */
  const [previa, setPrevia] = useState<{ n: number; pares: ParExato[] } | null>(null);

  const impedimento: string | null =
    !clienteId ? 'Escolha um cliente primeiro.'
    : !contaId ? 'Escolha uma conta bancária primeiro.'
    : null;

  const chamar = async (simular: boolean) => {
    if (impedimento || !clienteId || !contaId) return;
    setOcupado(true);
    try {
      const { de, ate } = faixaInclusiva(ano, mes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_vincular_exatos_mes', {
        p_cliente_id: clienteId,
        p_conta_bancaria_id: contaId,
        p_de: de,
        p_ate: ate,
        p_simular: simular,
      });
      if (error) { toast.error(error.message ?? 'O banco recusou a varredura.'); return; }
      const r = (data ?? {}) as Partial<RetornoRpc>;
      const n = Number(r.vinculados ?? 0);

      if (simular) {
        /* ⚠ ZERO TAMBÉM ABRE O DIÁLOGO: "não há par exato" é uma resposta, e ela merece a mesma
           caixa que o "há 2". Um toast que some em três segundos faria o operador duvidar se a
           varredura rodou. */
        setPrevia({ n, pares: lerPares(ehObjeto(data) ? data.pares : null) });
        return;
      }

      const rec = Number(r.recusados ?? 0);
      /* O relatório diz a verdade inteira, inclusive quando é parcial. A
         mensagem do Postgres nomeia o invariante violado e vai sem tradução. */
      if (n === 0 && rec === 0) {
        toast.info('Nada a vincular — nenhum par exato restou em aberto.');
      } else if (rec === 0) {
        toast.success(`${n} vínculo${n === 1 ? '' : 's'} criado${n === 1 ? '' : 's'}.`);
      } else if (n === 0) {
        toast.error(`Nenhum vínculo criado · ${rec} recusado(s). Motivo: ${r.motivos ?? 'não informado'}`);
      } else {
        toast.warning(`${n} vinculado(s) · ${rec} recusado(s). Motivo: ${r.motivos ?? 'não informado'}`);
      }
      setPrevia(null);
      await aoConcluir();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <span className="ml-1 inline-flex items-center gap-1.5">
      {/* ⚠ O BOTÃO DIZ O QUE FAZ E, QUANDO NÃO PODE, POR QUÊ — e o motivo é fonte
          única do `disabled`, do `title` e da dica ao lado.
          ⚠ E ELE NÃO GRAVA NUNCA: o rótulo é fixo e o clique só simula e abre o diálogo. Era
          esta a armadilha do desenho anterior — o mesmo alvo para perguntar e para gravar. */}
      <Button type="button" variant="outline" size="sm"
        className="h-5 gap-1 px-2 text-[10px]"
        disabled={impedimento !== null || ocupado}
        title={impedimento ?? 'Procura os pares de mesma data e mesmo valor, únicos dos dois lados, e mostra quantos são antes de gravar.'}
        onClick={() => { void chamar(true); }}>
        {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
        Vincular os exatos
      </Button>

      {impedimento && (
        <span className="text-[10px] text-muted-foreground">{impedimento}</span>
      )}

      {/* ⚠ DUAS SAÍDAS SEPARADAS, e a que grava é a da direita: "Cancelar" e "Vincular N pares"
          são botões diferentes, em posições diferentes, com palavras diferentes. Fechar o
          diálogo por Esc ou pelo fundo também não grava. */}
      <AlertDialog open={previa !== null} onOpenChange={(aberto) => { if (!aberto) setPrevia(null); }}>
        {/* ⚠ A CAIXA CRESCEU PORQUE AGORA ELA MOSTRA — PR-CONCILIAR-MES-VER-OS-PARES-01. Era
            `max-w-md` para um texto de três linhas; com os dois lados de cada par lado a lado,
            `md` cortaria as descrições a ponto de o operador não reconhecer nem um nem outro.
            ⚠ A CADEIA DO A21: altura máxima no diálogo, a LISTA é o único scrollport, e o rodapé
            com "Cancelar" e "Vincular N pares" fica FORA dele — o botão que grava não pode sair
            da vista enquanto se lê a lista que ele vai executar. */}
        <AlertDialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0">
          <AlertDialogHeader className="shrink-0 pb-2">
            <AlertDialogTitle className="text-sm">
              {previa?.n === 0
                ? 'Nenhum par exato neste mês'
                : `Vincular ${previa?.n} par${previa?.n === 1 ? '' : 'es'} exato${previa?.n === 1 ? '' : 's'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-relaxed">
              {previa?.n === 0 ? (
                /* ⚠ ZERO É RESPOSTA, NÃO FALHA — e a frase diz o que fazer a seguir, em vez de
                   deixar o operador achando que a varredura quebrou. */
                <>Não há par de mesma data e mesmo valor em aberto neste mês. O que restou exige
                decisão sua, uma de cada vez, na estação de conciliação.</>
              ) : (
                <>
                  O critério é <strong>mesma data e mesmo valor, um de cada lado, sem tolerância</strong>:
                  só entram os pares em que existe exatamente um movimento do banco e exatamente um
                  lançamento do sistema com aquela data e aquele valor, ambos ainda sem vínculo.
                  {' '}Cada par passa pelas mesmas travas do vínculo manual.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* ═══ OS PARES, OS DOIS LADOS ═══════════════════════════════════════════════════
              ⚠ ESQUERDA É O BANCO, DIREITA É O SISTEMA, e a régua entre as duas não é enfeite:
              ela diz que cada linha é um CASAMENTO, não um item de lista. Sem a divisão, ler
              "PAG BOLETO UNIAO INDUSTRIA · 50 SACC SE · Pontero Nutrição" seria uma frase só.
              ⚠ OS DOIS VALORES APARECEM, um de cada lado, e são sempre iguais em módulo — é o
              critério do "exato". Mostrá-los duas vezes parece redundante e não é: é o que
              permite conferir sem ler, correndo o olho pela coluna.
              ⚠ FONTE 10px, o piso da casa: são até dezenas de linhas, e o que importa aqui é
              reconhecer, não estudar. */}
          {previa && previa.pares.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-muted/20 text-[10px]">
              {/* ⚠ 96px, E ERA 86 — medido em PR-CONCILIAR-MES-ESPERANDO-COM-PAR-01: "-R$ 1.500.000,55"
                  mede 85,94px a 10px e cabia por 6 CENTÉSIMOS. O maior lançamento do proto é
                  R$ 3.996.196,13; o primeiro valor de 8 dígitos cortaria em silêncio. */}
              {previa.pares.map(par => (
                <div key={par.extratoId}
                  className="flex items-center gap-2 border-b border-border/50 px-2 py-1 last:border-b-0">
                  {/* ⚠ `overflow-hidden` É CINTO E SUSPENSÓRIO: a largura já cabe DD/MM, mas uma
                      célula de largura fixa sem contenção vaza por cima da vizinha em vez de
                      cortar — foi assim que o ano apareceu por cima da descrição. */}
                  <span className="w-[38px] shrink-0 overflow-hidden tabular-nums text-muted-foreground">{dataBr(par.data)}</span>
                  <span className="min-w-0 flex-1 truncate" title={par.historicoBanco ?? ''}>
                    {par.historicoBanco ?? '—'}
                  </span>
                  <span className={`w-[96px] shrink-0 text-right font-medium tabular-nums ${corValor(par.valorBanco)}`}>
                    {formatMoeda(par.valorBanco)}
                  </span>
                  <span className="shrink-0 text-muted-foreground/40" aria-hidden>│</span>
                  <span className="min-w-0 flex-1 truncate"
                    title={[par.descricaoSistema, par.favorecido].filter(Boolean).join(' · ')}>
                    {par.descricaoSistema ?? '—'}
                    {par.favorecido && <span className="text-muted-foreground"> · {par.favorecido}</span>}
                  </span>
                  <span className={`w-[96px] shrink-0 text-right font-medium tabular-nums ${corValor(par.valorSistema)}`}>
                    {formatMoeda(par.valorSistema)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <AlertDialogFooter className="shrink-0 pt-3">
            <AlertDialogCancel className="h-7 text-[11px]">
              {previa?.n === 0 ? 'Fechar' : 'Cancelar'}
            </AlertDialogCancel>
            {previa !== null && previa.n > 0 && (
              <AlertDialogAction className="h-7 text-[11px]" disabled={ocupado}
                onClick={() => { void chamar(false); }}>
                {ocupado ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Vincular {previa.n} par{previa.n === 1 ? '' : 'es'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}

/**
 * ⚠ A RPC USA `BETWEEN`, INCLUSIVO NOS DOIS LADOS, e `faixaDoMes` devolve o fim
 * EXCLUSIVO (o dia 1º do mês seguinte, como o resto do sistema). Passar o `fim`
 * direto faria a varredura alcançar o primeiro dia do mês seguinte — fora do
 * palco que o operador está vendo. A régua do mês continua sendo uma só; o que
 * se faz aqui é converter a convenção, explicitamente.
 */
export function faixaInclusiva(ano: number, mes: number): { de: string; ate: string } {
  const { inicio, fim } = faixaDoMes(ano, mes);
  const d = new Date(`${fim}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { de: inicio, ate: d.toISOString().slice(0, 10) };
}
