import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OpcoesDeEscopo } from '@/components/financeiro-v2/OpcoesDeEscopo';
import { AlertTriangle, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { propagarRecorrencia, textoVagas, frasePuladasValorDoMes, type EscopoPropagacao, type ResultadoPropagacao } from '@/hooks/useRecorrencias';

/**
 * PropagarRecorrenciaDialog — até onde a edição da regra alcança o que ela gerou.
 * FIN-RECORR-PROPAGA-01.
 *
 * ⚠ A REGRA JÁ ESTÁ SALVA QUANDO ESTE DIÁLOGO ABRE, e isso muda o que "Cancelar" quer
 * dizer: aqui ele é "não propagar", nunca "desfazer a edição". Por isso a terceira opção é
 * explícita na lista em vez de ficar só no botão de fechar — um operador que fecha no X tem
 * de saber que a regra mudou de qualquer jeito.
 *
 * ⚠ AS CONTAGENS VÊM DO BANCO, pela MESMA consulta que o update usa. Contar na tela, sobre
 * a lista carregada, diria um número sobre o recorte em memória e gravaria sobre outro —
 * e o front sequer conhece os lançamentos de uma recorrência (a lista não filtra por ela).
 *
 * ⚠ SINAL TROCADO É RECUSA, NÃO AVISO. Mudar a regra de saída para entrada mudaria o
 * `tipo_operacao` e o `sinal` de lançamentos já existentes — inclusive conciliados. A RPC
 * recusa antes de escrever, e o que se mostra aqui é a mensagem do banco, não uma paráfrase:
 * quem escreveu a regra é quem sabe explicá-la.
 */
interface Props {
  recorrenciaId: string;
  descricao: string;
  /** A prévia (`p_simular = true`). `null` quando a RPC recusou — aí vale `recusa`. */
  previa: ResultadoPropagacao | null;
  /** A mensagem do banco quando a propagação é impossível. */
  recusa: string | null;
  aoFechar: () => void;
}

const OPCOES: readonly { valor: EscopoPropagacao; rotulo: string; explica: string }[] = [
  { valor: 'futuros', rotulo: 'Só os futuros',
    explica: 'ainda não pagos nem conciliados — classificação, identificação e valor' },
  { valor: 'todos', rotulo: 'Futuros e passados',
    explica: 'os realizados também mudam de classificação e competência; vencimento, pagamento e valor pago ficam' },
  { valor: 'nenhum', rotulo: 'Não propagar',
    explica: 'só a regra muda; os lançamentos já gerados ficam como estão' },
];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2026-08' ou '2026-08-01' → 'ago/26'. */
const mesCurto = (s: string | null) => (s && s.length >= 7 ? `${MESES[Number(s.slice(5, 7)) - 1] ?? s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
/** '2026-10-05' → '05/10'. */
const diaMes = (s: string | null) => (s && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');

/**
 * A COMPETÊNCIA NA PRÉVIA — FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01 (Gabriel, 30/09).
 *
 * ⚠ O QUE SE MOSTRA É O QUE O BANCO FARIA NO ESCOPO ESCOLHIDO: a RPC simula os dois (`projecao.futuros` e
 * `projecao.todos`) numa ida só, e trocar a opção só troca qual se lê — nada é recalculado na tela.
 * ⚠ E A MARCA DA GERAÇÃO É PARTE DA RESPOSTA: recuar a competência de dezembro para novembro deixa dezembro vago, e
 * a propagação move a marca para o próximo "Gerar" criar o que faltou. A propagação em si não cria lançamento.
 */
export function BlocoCompetencia({ previa, escopo }: { previa: ResultadoPropagacao; escopo: 'futuros' | 'todos' }) {
  const c = previa.competencia;
  if (!c) return null;
  const p = c.projecao[escopo];
  const exemplos = escopo === 'todos' ? [...c.grupos.futuros.lista, ...c.grupos.passados.lista] : c.grupos.futuros.lista;
  const ex = exemplos[0];
  const puladas = c.grupos.futuros.puladasMesFechado + (escopo === 'todos' ? c.grupos.passados.puladasMesFechado : 0);
  const marcaMuda = p.marcaDepois !== c.marcaAntes;
  return (
    <div className="rounded border px-2 py-1.5 text-[11px] leading-snug" data-testid="propagar-competencia">
      {p.alteradas > 0 ? (
        <div data-testid="competencias-recalculadas">
          <b className="tabular-nums">{p.alteradas}</b> competência{p.alteradas === 1 ? '' : 's'} recalculada{p.alteradas === 1 ? '' : 's'}
          {ex && <span className="text-muted-foreground"> (ex.: venc {diaMes(ex.venc)}: {diaMes(ex.compAntiga)} → {diaMes(ex.compNova)})</span>}
        </div>
      ) : (
        <div className="text-muted-foreground">Nenhuma competência muda: todas já seguem a regra.</div>
      )}
      {puladas > 0 && (
        <div className="text-amber-700" data-testid="competencias-puladas">
          <b className="tabular-nums">{puladas}</b> pulada{puladas === 1 ? '' : 's'} por mês fechado ({c.mesesFechados.map(mesCurto).join(', ')})
        </div>
      )}
      {marcaMuda && (
        <div className="text-[10px] text-muted-foreground" data-testid="competencias-marca">
          Marca da geração: {mesCurto(c.marcaAntes)} → {mesCurto(p.marcaDepois)}
          {p.aGerar.length > 0 && <> · a próxima geração cria {p.aGerar.map(mesCurto).join(', ')}</>}
        </div>
      )}
      {/* A vaga que o recálculo abre abaixo da marca, e o próximo Gerar preenche (FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01). */}
      {p.vagas.length > 0 && (
        <div className="text-[10px] text-muted-foreground" data-testid="competencias-vagas">
          A próxima geração {textoVagas(p.vagas)}
        </div>
      )}
      {/* ⚠ COLISÃO REAL (fix2): a frase é a do BANCO, a mesma com que a execução recusa — a tela não a recompõe. Sem
          aviso mas com repetição (RPC anterior ao fix2), cai na lista de competências repetidas de antes. */}
      {p.aviso ? (
        <div className="text-amber-700" data-testid="competencias-aviso">{p.aviso}</div>
      ) : p.duplicidades.length > 0 && (
        <div className="text-amber-700" data-testid="competencias-duplicadas">
          Competência repetida depois do recálculo: {p.duplicidades.map((d) => `${mesCurto(d.competencia)} (${d.n})`).join(', ')} — confira antes
        </div>
      )}
    </div>
  );
}

export function PropagarRecorrenciaDialog({ recorrenciaId, descricao, previa, recusa, aoFechar }: Props) {
  const [escopo, setEscopo] = useState<EscopoPropagacao>('futuros');
  const [ocupado, setOcupado] = useState(false);

  const nada = !previa || (previa.futuros === 0 && previa.passados === 0);
  const avisoEscolhido = escopo === 'nenhum' ? null : (previa?.competencia?.projecao[escopo].aviso ?? null);
  /* REC-PROPAGAR-VALOR-DO-MES-01 — as contas com o valor do mês ajustado que o escopo ESCOLHIDO pula. O número é do banco
     (`valor_do_mes[escopo]`); trocar a opção só troca qual se lê. "Não propagar" não pula nada: nada é propagado. */
  const puladasValorDoMes = escopo === 'nenhum' ? 0 : (previa?.valorDoMes[escopo] ?? 0);
  const frasePuladas = frasePuladasValorDoMes(puladasValorDoMes);

  /* ⚠ "Não propagar" NÃO CHAMA A RPC. Ela aceita `'nenhum'` e devolveria as contagens sem
     escrever — mas seria uma ida ao banco para não fazer nada, e o resultado é o mesmo de
     fechar. A opção existe na lista para ser uma ESCOLHA declarada, não uma chamada. */
  const confirmar = async () => {
    if (escopo === 'nenhum') { aoFechar(); return; }
    setOcupado(true);
    try {
      const r = await propagarRecorrencia(recorrenciaId, escopo, false);
      if (!r.ok || !r.dados) { toast.error(r.erro ?? 'O banco recusou a propagação.'); return; }
      const n = r.dados.aplicadosFuturos + r.dados.aplicadosPassados;
      const nc = r.dados.competencia?.aplicadas ?? 0;
      /* O que ficou de fora também é resultado: o operador lê quantas o Propagar pulou (número do banco, da execução). */
      const fp = frasePuladasValorDoMes(r.dados.puladasValorDoMes);
      toast.success((n === 1 ? '1 lançamento atualizado' : `${n} lançamentos atualizados`)
        + (nc > 0 ? ` · ${nc} competência${nc === 1 ? '' : 's'} recalculada${nc === 1 ? '' : 's'}.` : '.')
        + (fp ? ` ${fp}` : ''));
      aoFechar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="w-[94vw] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">
            Propagar aos lançamentos gerados
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            {descricao} · a regra já foi salva
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
          {recusa ? (
            /* A mensagem do banco, inteira. Ela nomeia o invariante e diz o que fazer. */
            <div className="flex gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{recusa}</span>
            </div>
          ) : nada ? (
            <div className="rounded border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
              Esta recorrência ainda não gerou lançamentos — não há o que propagar.
            </div>
          ) : (
            <>
              <div className="rounded border bg-muted/40 px-2 py-1.5 text-[11px]">
                {frasePuladas ? (
                  /* ⚠ NA MESMA LINHA DA CONTAGEM, para o diálogo não mudar de altura — REC-PROPAGAR-VALOR-DO-MES-01. A caixa tem
                     398px úteis e a frase pede 255 a 9,5px ao lado de ~123 da contagem: cabe; com números grandes quem cede é
                     o TEXTO da frase (corta, inteiro no `title`). A contagem e o N da frase nunca cortam.
                     ⚠ SEM CONTA AJUSTADA este ramo não existe: o HTML é o de antes, byte a byte. */
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 whitespace-nowrap">
                      <b className="tabular-nums">{previa.futuros}</b> futuro{previa.futuros === 1 ? '' : 's'}
                      {' · '}
                      <b className="tabular-nums">{previa.passados}</b> passado{previa.passados === 1 ? '' : 's'}
                    </span>
                    <span className="ml-auto flex min-w-0 items-baseline gap-1 text-[9.5px] text-muted-foreground"
                      data-testid="propagar-valor-do-mes" title={frasePuladas}>
                      <b className="shrink-0 tabular-nums text-foreground">{puladasValorDoMes}</b>
                      <span className="min-w-0 truncate">{frasePuladas.replace(/^\d+\s/, '')}</span>
                    </span>
                  </div>
                ) : (
                  <>
                <b className="tabular-nums">{previa.futuros}</b> futuro{previa.futuros === 1 ? '' : 's'}
                {' · '}
                <b className="tabular-nums">{previa.passados}</b> passado{previa.passados === 1 ? '' : 's'}
                  </>
                )}
                <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  Propagam: descrição, favorecido, fazenda, conta, classificação e safra.
                  O valor só alcança os futuros. Vencimento, pagamento e valor pago não mudam; a competência segue
                  a regra. Tipo e sinal nunca mudam.
                </div>
              </div>

              {escopo !== 'nenhum' && <BlocoCompetencia previa={previa} escopo={escopo} />}

              {/* As três opções moram em `OpcoesDeEscopo` (PARC-CONTRATO-01): a MESMA peça do contrato de parcelamento. */}
              <OpcoesDeEscopo opcoes={OPCOES} valor={escopo} aoMudar={setEscopo} />
            </>
          )}
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-end">
          {recusa || nada ? (
            <Button size="sm" onClick={aoFechar}>Entendi</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoFechar}>Fechar</Button>
              {/* ⚠ COM COLISÃO NO ESCOPO ESCOLHIDO, "Propagar" desliga e diz por quê: o banco recusaria com a mesma frase,
                  e mandar o clique só para receber a recusa num aviso de canto é o caminho mais longo para a mesma
                  informação. "Futuros e passados" costuma ser a saída, e a frase já diz isso. */}
              {avisoEscolhido && (
                <span className="mr-auto text-[10px] text-amber-700" data-testid="propagar-bloqueado">resolva o aviso acima para propagar</span>
              )}
              <Button type="button" size="sm" className="gap-1.5" disabled={ocupado || !!avisoEscolhido}
                title={avisoEscolhido ?? undefined}
                onClick={() => { void confirmar(); }}>
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {escopo === 'nenhum' ? 'Manter como estão' : 'Propagar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
