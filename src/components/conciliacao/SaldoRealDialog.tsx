import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import {
  gravarSaldoReal, removerSaldoReal, fimDoMes,
  useSaldoDeclaradoOfx, useSaldoDocumentos, useSaldoGerencialDoMes,
  useSaldoSistemaNaPosicao, useExtratoFimDoMes,
  anexarSaldoDocumento, cancelarSaldoDocumento, urlAssinadaSaldoDocumento,
} from '@/hooks/useExtratoDaConta';
import { TIPOS_ACEITOS } from '@/hooks/useLancamentoDocumentos';

/**
 * SaldoRealDialog — o lápis: informar o saldo que o banco mostra, e QUANDO.
 * FIN-SALDO-POSICAO-01, peça 1. Estrutura portada do `SaldoManualDialog` do
 * `financas`, com o vocabulário desta casa.
 *
 * ⚠ A DATA É CAMPO, NÃO DETALHE, e é a razão de este modal existir. A tela
 * comparava um saldo digitado com o mês INTEIRO; quem consulta o extrato em
 * 13/08 está declarando a posição daquele dia, e confrontá-la com o fechamento
 * de 31/08 acusa uma diferença que é só o resto do mês. Foi o que obrigou a
 * arqueologia do Bradesco.
 *
 * ⚠ EM BRANCO É O FIM DO MÊS, e o campo já nasce preenchido com ele em vez de
 * vazio: deixar vazio passaria a impressão de que a data é opcional por não
 * importar — quando o que acontece é que o banco assume o fim do mês.
 *
 * ⚠ NÃO HÁ BLOCO "O BANCO DECLAROU". O original mostra o LEDGERBAL do OFX ao
 * lado; aqui esse número não existe — `saldo_apos` é nulo nos 3.685 movimentos e
 * o parser não lê a tag. Um bloco sempre vazio ensinaria que o dado existe e
 * está faltando, quando ele nunca chegou. Nasce com a frente do LEDGERBAL.
 *
 * ⚠ REMOVER NÃO É ZERAR. Apagar a declaração devolve a conta a "sem saldo
 * informado"; gravar zero afirmaria que o banco mostra zero — e zero é um saldo
 * real possível.
 */
interface Props {
  clienteId: string;
  contaId: string;
  contaNome: string;
  ano: number;
  mes: number;
  /** Valor atual; `null` = nunca informado. */
  saldoAtual: number | null;
  /** Posição atual declarada; `null` = nunca informada (o modal propõe o fim do mês). */
  saldoDataAtual: string | null;
  aoFechar: () => void;
  aoSalvar: () => void | Promise<void>;
}

export function SaldoRealDialog({
  clienteId, contaId, contaNome, ano, mes,
  saldoAtual, saldoDataAtual, aoFechar, aoSalvar,
}: Props) {
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const jaInformado = saldoAtual !== null;
  /* O campo é o `CampoMoeda` com sinal (PR-CAMPO-MOEDA-NEGATIVO-01): o estado é o NÚMERO, e o
     texto formatado (R$ 208.561,46 / -R$ 1.845,32) é dele. */
  const [valor, setValor] = useState<number | null>(saldoAtual);
  const [data, setData] = useState(saldoDataAtual ?? fimDoMes(ano, mes));
  const [ocupado, setOcupado] = useState(false);

  /* PR-SALDO-MODAL-OFX-ANEXO-02B — conferência ao lado do saldo manual: o que o OFX
     declarou e os anexos do extrato. Nenhum dos dois grava saldo; quem prevalece é o
     saldo informado aqui. */
  const { ofx } = useSaldoDeclaradoOfx(clienteId, contaId, ano, mes);
  /**
   * ⚠ O MODAL VIROU CONFERÊNCIA VIVA — PR-CONC-MODAL-SALDO-DATA-01, e isto INVERTE de propósito
   * a decisão do PR-CONCILIACAO-CARDS-01a ("os números gravados, não os digitados").
   *
   * Aquela decisão fazia sentido quando o bloco só ecoava a linha do card. Mas o modal existe
   * para o operador DIGITAR um saldo e uma data, e um número que não reage à data digitada não
   * confere coisa nenhuma: ao declarar 21/09 ele comparava contra o mês inteiro e acusava uma
   * diferença que era só o movimento dos dias seguintes.
   * ⚠ MEDIDO na Itaú Personalite da Vera: posição 17/09, declarado 155.749,72. O sistema ATÉ
   * 17/09 é 155.746,78 (diferença real 2,94, o rendimento provisionado); o sistema do MÊS
   * INTEIRO é 96.937,72, e era ele que a tela mostrava — diferença falsa de 58.812,00,
   * inteiramente composta pelos lançamentos de 18 a 20/09 descontados de uma posição de 17.
   * ⚠ A SOMA NÃO É NOVA: `useSaldoSistemaNaPosicao` já faz exatamente "saldo inicial do mês
   * mais os realizados até a posição", e é a mesma função que o card do Extrato usa.
   * ⚠ E ELA HERDA UMA INCOERÊNCIA DE FILTRO: o hook pede `cenario='realizado'` sem exigir
   * `status_transacao='realizado'` — a mesma que o card da CPR corrigiu em db5c900c. Na Vera
   * não muda nada (ela não tem linha nesse estado); no NJ mudaria. Consertar ali afeta
   * `AcoesDoMes` e `PainelExtratoMes`, então fica PR próprio. Aqui só se registra a herança.
   */
  const gerencial = useSaldoGerencialDoMes(clienteId, contaId, ano, mes);
  /* `data` é o campo "Posição em" — a soma segue o que o operador digita, ao vivo. */
  const sistemaNaData = useSaldoSistemaNaPosicao(
    clienteId, contaId, anoMes, gerencial.saldoInicial, data);
  const extratoFim = useExtratoFimDoMes(clienteId, contaId, ano, mes);
  const anexos = useSaldoDocumentos(clienteId, contaId, ano, mes);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [anexando, setAnexando] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  /* ⚠ A DATA VEM DA TELA, e desde a regeneração do types.ts (02/09) ela pode vir:
     `saldo_data` entrou no tipo gerado, então o `select` de quem monta o modal a
     carrega sem cast. A versão anterior deste arquivo a buscava sozinho — um
     round-trip a mais e um `as any` — só porque o tipo não a conhecia. */

  /* ⚠ O SINAL SOBREVIVE: conta no vermelho é o caso que motivou o campo, e
     `Math.abs` em qualquer ponto do caminho apagaria justamente o dado que se
     quer conferir. */
  const valorValido = valor != null && Number.isFinite(valor);

  const impedimento: string | null =
    !valorValido ? 'Informe o saldo que o banco mostra — com o sinal, se estiver negativo.'
    : !data ? 'Informe a data da posição.'
    : data.slice(0, 7) !== anoMes ? `A posição precisa ser uma data de ${mesBr(anoMes)}.`
    : null;

  const salvar = async () => {
    if (impedimento) return;
    setOcupado(true);
    try {
      if (valor == null) return;
      const r = await gravarSaldoReal({ clienteId, contaId, anoMes, saldo: valor, saldoData: data });
      if (!r.ok) { toast.error(r.erro ?? 'O banco recusou a gravação.'); return; }
      toast.success('Saldo real atualizado.');
      await aoSalvar();
      aoFechar();
    } finally { setOcupado(false); }
  };

  const anexar = async (file: File | undefined) => {
    if (!file) return;
    setAnexando(true);
    try {
      const r = await anexarSaldoDocumento({ clienteId, contaId, anoMes, file });
      if (!r.ok) toast.error(r.erro ?? 'Não foi possível anexar o arquivo.');
      else toast.success('Extrato anexado.');
      await anexos.recarregar();
    } finally {
      setAnexando(false);
      if (inputArquivo.current) inputArquivo.current.value = '';
    }
  };

  const abrirAnexo = async (caminho: string | null) => {
    if (!caminho) return;
    const url = await urlAssinadaSaldoDocumento(caminho);
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    window.open(url, '_blank', 'noopener');
  };

  const confirmarCancelamento = async () => {
    if (!cancelandoId) return;
    /* Motivo obrigatório: é o que a auditoria mostra daqui a um ano. */
    if (!motivo.trim()) { toast.error('Informe o motivo do cancelamento.'); return; }
    const r = await cancelarSaldoDocumento({ documentoId: cancelandoId, clienteId, motivo: motivo.trim() });
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível cancelar o anexo.'); return; }
    toast.success('Anexo cancelado.');
    setCancelandoId(null); setMotivo('');
    await anexos.recarregar();
  };

  /**
   * A DIFERENÇA DO MODAL — saldo VISUAL contra SISTEMA, ambos na data declarada.
   *
   * ⚠ É A ÚNICA DIFERENÇA QUE ESTA TELA MOSTRA. O OFX deixou de gerar a sua (ver abaixo):
   * são duas conciliações independentes, e a visual é a principal.
   */
  const dif = valor !== null && sistemaNaData.saldoSistema !== null
    ? Math.round((valor - sistemaNaData.saldoSistema) * 100) / 100
    : null;

  /**
   * ⚠ A RÉGUA DO "CONFERE" NÃO MUDA — continua `saldoConfere`, zero em centavos. A doutrina do
   * PR-CONCILIACAO-TOLERANCIA-ZERO-02 é que divergência de centavo não bloqueia nada mas TEM
   * de aparecer: é ela que denuncia o lançamento digitado com um algarismo a menos. Criar uma
   * tolerância própria deste modal quebraria a régua única do sistema.
   * ⚠ O QUE MUDA É A COR. Uma diferença pequena e POSITIVA — o banco tendo mais que o sistema —
   * é quase sempre provisão de rendimento ainda não lançada, e pintá-la de vermelho ensina o
   * operador a ignorar o vermelho. Em âmbar, o número continua visível e para de gritar erro.
   * ⚠ O LIMIAR É R$ 50,00 e o SINAL importa. Positivo e pequeno é rendimento a lançar; qualquer
   * valor NEGATIVO (o sistema tendo mais que o banco) é dinheiro que o extrato não confirma, e
   * isso é vermelho em qualquer tamanho. Cinquenta reais cobre rendimento de conta corrente e
   * de investimento pequeno sem chegar perto de uma tarifa ou de um lançamento esquecido.
   */
  const LIMIAR_RENDIMENTO = 50;
  const provavelRendimento = dif !== null && !saldoConfere(dif)
    && dif > 0 && dif <= LIMIAR_RENDIMENTO;

  const remover = async () => {
    setOcupado(true);
    try {
      const r = await removerSaldoReal({ clienteId, contaId, anoMes });
      if (!r.ok) { toast.error(r.erro ?? 'O banco recusou a remoção.'); return; }
      toast.success('Saldo removido. A conta volta a "sem saldo informado".');
      await aoSalvar();
      aoFechar();
    } finally { setOcupado(false); }
  };

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      {/* ⚠ TRÊS FAIXAS, SÓ O CORPO ROLA — PR-ANEXO-MODAL-OVERFLOW-01 (A21). Com anexos de nome
          longo o modal crescia além da tela e levava o rodapé junto: o "Atualizar" sumia e não
          havia como salvar. E o `DialogContent` base é `grid`: sem `flex`, a linha de nome sem
          quebra alargava a coluna em vez de truncar, e o "visualizar" saía cortado. */}
      <DialogContent className="flex max-h-[85vh] w-[94vw] max-w-md flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">
            Saldo real de {contaNome}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            O que o banco mostra na tela, conferido por você.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Saldo real (R$)</Label>
              <CampoMoeda aceitaNegativo autoFocus valor={valor} onChange={setValor}
                className="h-8 text-xs tabular-nums" placeholder="-1.845,32" />
            </div>
            <div>
              <Label className="text-[10px]">Posição em</Label>
              <DatePicker value={data} onChange={setData} className="text-[11px]" />
            </div>
          </div>

          {/* ⚠ O OFX É REFORÇO, NUNCA VEREDITO — PR-CONC-MODAL-SALDO-DATA-01. São duas
              conciliações independentes: a VISUAL (o operador confere o PDF do banco e declara
              saldo e data) é a principal, e o extrato só a reforça até onde alcança. Não ter
              OFX de depois da data declarada não desfaz conferência nenhuma.
              ⚠ POR ISSO A LINHA PERDEU A DIFERENÇA E O VERMELHO. Ela comparava o `LEDGERBAL`
              com o saldo gravado e pintava de destrutivo — transformando "o arquivo é mais
              antigo que a sua conferência" em erro, que é o oposto do que é.
              ⚠ E A DATA MUDOU DE FONTE: era o `saldo_declarado_data` do OFX, que existe em só
              4 das 64 importações vivas do proto (o `LEDGERBAL` é opcional no arquivo). Agora é
              o último movimento importado, que existe para toda conta com extrato. O valor
              declarado continua aparecendo quando há, porque é conferência de graça. */}
          {(extratoFim || ofx) && (
          <div className="space-y-0.5 rounded border bg-muted/30 px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2" title={ofx?.nomeArquivo ?? undefined}>
              <span className="text-[10px] text-muted-foreground">
                {extratoFim
                  ? `OFX validado até ${extratoFim.slice(8, 10)}/${extratoFim.slice(5, 7)}`
                  : `OFX em ${ofx!.data.slice(8, 10)}/${ofx!.data.slice(5, 7)}`}
              </span>
              {ofx && <span className="text-[11px] tabular-nums text-muted-foreground">{formatMoeda(ofx.valor)}</span>}
            </div>
            {/* Informação, não pendência: o extrato é mais antigo que a posição declarada. */}
            {extratoFim && data > extratoFim && (
              <div className="text-[9.5px] leading-tight text-muted-foreground">
                reimporte um extrato mais recente para reforçar até {data.slice(8, 10)}/{data.slice(5, 7)}
              </div>
            )}
          </div>
          )}

          {/* ⚠ AO VIVO, na data que está no campo — ver a nota longa no topo do componente. */}
          <div className="space-y-0.5 rounded border bg-muted/30 px-2 py-1.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">
                sistema em {dataBr(data)}
              </span>
              <span className="text-[11px] tabular-nums">
                {sistemaNaData.carregando ? '…'
                  : sistemaNaData.saldoSistema === null ? '—'
                  : formatMoeda(sistemaNaData.saldoSistema)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                diferença
                {provavelRendimento && (
                  <span className="ml-1 text-[9.5px] text-amber-600 dark:text-amber-400">
                    provisão de rendimento?
                  </span>
                )}
              </span>
              <span className={`text-[11px] tabular-nums ${
                dif == null ? 'text-muted-foreground'
                : saldoConfere(dif) ? 'text-success'
                : provavelRendimento ? 'font-semibold text-amber-600 dark:text-amber-400'
                : 'font-semibold text-destructive'}`}>
                {dif == null ? '—' : saldoConfere(dif) ? 'confere' : formatMoeda(dif)}
              </span>
            </div>
          </div>

          {/* Anexos do extrato — prova visual. Gravam na hora, independente do Informar/
              Atualizar do saldo. A lista rola sozinha a partir do 4º arquivo; o modal não. */}
          <div className="rounded border px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground">Extrato (PDF/imagem)</span>
              <input ref={inputArquivo} type="file" accept={TIPOS_ACEITOS.join(',')} className="hidden"
                onChange={(e) => { void anexar(e.target.files?.[0]); }} />
              <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]"
                disabled={anexando} onClick={() => inputArquivo.current?.click()}>
                {anexando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                Anexar
              </Button>
            </div>
            {anexos.documentos.length === 0 ? (
              <div className="pt-1 text-[10px] text-muted-foreground">Nenhum arquivo anexado.</div>
            ) : (
              <ul className="mt-1 max-h-[120px] divide-y overflow-y-auto">
                {anexos.documentos.map(d => (
                  <li key={d.id} className="py-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px]" title={d.nome}>{d.nome}</span>
                      {d.url ? (
                        <button type="button" className="shrink-0 text-[10px] text-primary underline"
                          onClick={() => { void abrirAnexo(d.url); }}>visualizar</button>
                      ) : (
                        <span className="shrink-0 text-[10px] text-warning">sem arquivo</span>
                      )}
                      <button type="button" className="shrink-0 text-[10px] text-destructive underline"
                        onClick={() => { setCancelandoId(d.id); setMotivo(''); }}>cancelar</button>
                    </div>
                    {cancelandoId === d.id && (
                      <div className="flex items-center gap-1 pt-0.5">
                        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                          className="h-6 flex-1 text-[10px]" placeholder="Motivo do cancelamento" autoFocus />
                        <Button type="button" size="sm" variant="destructive" className="h-6 px-2 text-[10px]"
                          onClick={() => { void confirmarCancelamento(); }}>Confirmar</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                          onClick={() => { setCancelandoId(null); setMotivo(''); }}>Voltar</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[10px] leading-snug text-muted-foreground">
            O saldo do sistema é somado até esta data — posição contra posição. Conta no vermelho:
            informe com o sinal, ex. −1.845,32.
          </p>
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-between">
          {/* Remover à esquerda e destrutivo: separado das ações de salvar, para
              não ser clicado no caminho do Cancelar. */}
          {jaInformado ? (
            <Button type="button" variant="ghost" size="sm" disabled={ocupado}
              className="text-destructive hover:text-destructive"
              title="Apaga o saldo informado deste mês. A conta volta a “sem saldo informado” — não a zero."
              onClick={() => { void remover(); }}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
            </Button>
          ) : <span />}

          <span className="flex items-center gap-2">
            {/* A regra do botão: o motivo é fonte única do disabled, do title e da dica. */}
            {impedimento && <span className="text-[10px] text-muted-foreground">{impedimento}</span>}
            <Button variant="outline" size="sm" onClick={aoFechar} disabled={ocupado}>Cancelar</Button>
            <Button type="button" size="sm" className="gap-1.5"
              disabled={impedimento !== null || ocupado}
              title={impedimento ?? undefined}
              onClick={() => { void salvar(); }}>
              {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {jaInformado ? 'Atualizar' : 'Informar'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const dataBr = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (anoMes: string): string => {
  const [a, m] = anoMes.split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
