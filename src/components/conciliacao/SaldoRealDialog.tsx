import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { gravarSaldoReal, removerSaldoReal, fimDoMes } from '@/hooks/useExtratoDaConta';

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
  /** Valores atuais; `null` = nunca informado. */
  saldoAtual: number | null;
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
  const [texto, setTexto] = useState(
    saldoAtual === null ? '' : String(saldoAtual).replace('.', ','),
  );
  const [data, setData] = useState(saldoDataAtual ?? fimDoMes(ano, mes));
  const [ocupado, setOcupado] = useState(false);

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
      <DialogContent className="w-[94vw] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">
            Saldo real de {contaNome}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            O que o banco mostra na tela, conferido por você.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
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

          <p className="text-[10px] leading-snug text-muted-foreground">
            O saldo do sistema é somado até esta data — posição contra posição. Conta no vermelho:
            informe com o sinal, ex. −1.845,32.
          </p>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-between">
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

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (anoMes: string): string => {
  const [a, m] = anoMes.split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
