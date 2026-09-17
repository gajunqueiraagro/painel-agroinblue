import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  gravarSaldoReal, removerSaldoReal, fimDoMes,
  useSaldoDeclaradoOfx, useSaldoDocumentos,
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
  /** Saldo do sistema da linha da conta no card; `null` = a tela não o tem.
      Ausente (`undefined`) = o chamador não repassa o resumo, e o bloco não aparece. */
  saldoSistema?: number | null;
  /** Diferença da linha da conta no card; `null` = sem saldo de extrato (ausência, não zero). */
  diferenca?: number | null;
  aoFechar: () => void;
  aoSalvar: () => void | Promise<void>;
}

export function SaldoRealDialog({
  clienteId, contaId, contaNome, ano, mes,
  saldoAtual, saldoDataAtual, saldoSistema, diferenca, aoFechar, aoSalvar,
}: Props) {
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const jaInformado = saldoAtual !== null;
  const [texto, setTexto] = useState(
    saldoAtual === null ? '' : String(saldoAtual).replace('.', ','),
  );
  const [data, setData] = useState(saldoDataAtual ?? fimDoMes(ano, mes));
  const [ocupado, setOcupado] = useState(false);

  /* PR-SALDO-MODAL-OFX-ANEXO-02B — conferência ao lado do saldo manual: o que o OFX
     declarou e os anexos do extrato. Nenhum dos dois grava saldo; quem prevalece é o
     saldo informado aqui. */
  const { ofx } = useSaldoDeclaradoOfx(clienteId, contaId, ano, mes);
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
  const valor = Number(texto.trim().replace(/\./g, '').replace(',', '.'));
  const valorValido = texto.trim() !== '' && Number.isFinite(valor);

  const impedimento: string | null =
    !valorValido ? 'Informe o saldo que o banco mostra — com o sinal, se estiver negativo.'
    : !data ? 'Informe a data da posição.'
    : data.slice(0, 7) !== anoMes ? `A posição precisa ser uma data de ${mesBr(anoMes)}.`
    : null;

  const salvar = async () => {
    if (impedimento) return;
    setOcupado(true);
    try {
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

  /* O OFX é comparado com o saldo GRAVADO, não com o digitado — pela mesma razão do
     bloco sistema/diferença: número que muda enquanto se digita não confere nada. */
  const difOfx = ofx && saldoAtual !== null ? Math.round((ofx.valor - saldoAtual) * 100) / 100 : null;

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
              <Input value={texto} onChange={(e) => setTexto(e.target.value)}
                className="h-8 text-xs tabular-nums" placeholder="-1.845,32" autoFocus />
            </div>
            <div>
              <Label className="text-[10px]">Posição em</Label>
              <DatePicker value={data} onChange={setData} className="text-[11px]" />
            </div>
          </div>

          {/* O que o arquivo do banco declarou (LEDGERBAL). Sem OFX com saldo no mês a linha
              não aparece: ausência não se mostra como zero. */}
          {ofx && (
          <div className="space-y-0.5 rounded border bg-muted/30 px-2 py-1.5">
            <div className="flex justify-between" title={ofx.nomeArquivo ?? undefined}>
              <span className="text-[10px] text-muted-foreground">OFX em {ofx.data.slice(8, 10)}/{ofx.data.slice(5, 7)}</span>
              <span className="text-[11px] tabular-nums">{formatMoeda(ofx.valor)}</span>
            </div>
            {difOfx !== null && (
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground">contra o saldo gravado</span>
                <span className={`text-[11px] tabular-nums ${Math.abs(difOfx) <= 0.01 ? 'text-success' : 'font-semibold text-destructive'}`}>
                  {Math.abs(difOfx) <= 0.01 ? 'confere' : formatMoeda(difOfx)}
                </span>
              </div>
            )}
          </div>
          )}

          {/* ⚠ OS NÚMEROS GRAVADOS, NÃO OS DIGITADOS — PR-CONCILIACAO-CARDS-01a. São os
              mesmos da linha da conta no card, repassados pela tela; nada é recalculado
              aqui, e por isso não mudam enquanto se digita. */}
          {saldoSistema !== undefined && (
          <div className="space-y-0.5 rounded border bg-muted/30 px-2 py-1.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">
                sistema em {dataBr(saldoDataAtual ?? fimDoMes(ano, mes))}
              </span>
              <span className="text-[11px] tabular-nums">
                {saldoSistema === null ? '—' : formatMoeda(saldoSistema)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">diferença</span>
              <span className={`text-[11px] tabular-nums ${diferenca == null ? 'text-muted-foreground' : Math.abs(diferenca) <= 0.01 ? 'text-success' : 'font-semibold text-destructive'}`}>
                {diferenca == null ? '—' : Math.abs(diferenca) <= 0.01 ? 'confere' : formatMoeda(diferenca)}
              </span>
            </div>
          </div>
          )}

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
