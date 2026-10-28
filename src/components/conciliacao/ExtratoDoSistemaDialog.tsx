/**
 * ExtratoDoSistemaDialog — P141 (CONC-LAYOUT-01, Gabriel 27/10, mock aprovado): o ↗ da linha de "Saldos por conta" abre o extrato do
 * SISTEMA da conta no mês. É a aba "Sistema" do Casar lançamentos AMPLIADA: o MESMO componente (`AbaSistemaReal`, modo `grande`) e a
 * MESMA fonte (`useResumoMes` com a conta: `fn_conciliacao_resumo_mes`, que com UMA conta traz `linhas_sistema`). Nada se soma aqui:
 * a faixa de cima são os números do dono (`saldosDaLinha`, os mesmos do card Resumo) e o saldo de cada dia é o do banco.
 * Só leitura. Altura fixa; cabeçalho, faixa e rodapé fixos; só o corpo rola.
 */
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AbaSistemaReal } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { useResumoMes } from '@/hooks/useResumoConciliacao';
import { saldosDaLinha } from '@/lib/conciliacao/resumoDoDono';
import { saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "2026-09" → "set/2026" */
export const rotuloDoMes = (anoMes: string) => `${MESES[Number(anoMes.slice(5, 7)) - 1] ?? anoMes.slice(5, 7)}/${anoMes.slice(0, 4)}`;
const dataInteira = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : null);
const valorOuTraco = (v: number | null | undefined) => (v == null ? '—' : formatMoeda(v));
/** Positivo azul, negativo vermelho (o mock); ausente sem cor. */
const corDoSinal = (v: number | null | undefined) => (v == null ? 'text-muted-foreground' : v < 0 ? 'text-destructive' : 'text-blue-700');

function Item({ rotulo, valor, cor, testId }: { rotulo: string; valor: string; cor?: string; testId: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9.5px] text-muted-foreground" title={rotulo}>{rotulo}</div>
      <div className={cn('whitespace-nowrap text-[11px] font-semibold tabular-nums', cor)} data-testid={testId}>{valor}</div>
    </div>
  );
}

export function ExtratoDoSistemaDialog({ aberto, clienteId, contaId, contaNome, anoMes, onFechar, onAbrirLancamento }: {
  aberto: boolean;
  clienteId: string | null;
  contaId: string | null;
  contaNome: string;
  anoMes: string;
  onFechar: () => void;
  onAbrirLancamento?: (lancamentoId: string) => void;
}) {
  const q = useResumoMes(aberto ? clienteId : null, anoMes, aberto && contaId ? [contaId] : []);
  const linha = q.data?.find((l) => l.nivel === 'conta' && l.conta_id === contaId) ?? null;
  const p = saldosDaLinha(linha);
  const n = linha?.linhas_sistema?.length ?? null;
  const dataExtrato = linha ? dataInteira(linha.saldo_extrato_data) : null;
  const dif = p.diferenca;
  const titulo = `Extrato do sistema · ${contaNome} · ${rotuloDoMes(anoMes)}`;
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex h-[min(640px,calc(100vh-16px))] w-[min(1180px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden"
        data-testid="modal-extrato-sistema">
        <div className="flex h-[32px] shrink-0 items-center gap-2.5 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Lançamentos do sistema desta conta neste mês, com o saldo do fim de cada dia</DialogDescription>
          <button type="button" onClick={onFechar} className="shrink-0 rounded p-0.5 hover:bg-white/10" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>
        {/* A FAIXA DE RESUMO: os números do dono, os mesmos do card Resumo. Sete lugares de largura igual — nada anda ao carregar. */}
        <div className="grid shrink-0 grid-cols-7 gap-3 border-b bg-card px-3 py-1.5" data-testid="faixa-extrato-sistema">
          <Item rotulo="Saldo inicial" valor={linha ? valorOuTraco(p.saldo_inicial) : '—'} cor={corDoSinal(linha ? p.saldo_inicial : null)} testId="es-saldo-inicial" />
          <Item rotulo="Entradas" valor={linha ? valorOuTraco(p.entradas) : '—'} cor={linha ? 'text-blue-700' : 'text-muted-foreground'} testId="es-entradas" />
          <Item rotulo="Saídas" valor={linha ? valorOuTraco(p.saidas) : '—'} cor={linha ? 'text-destructive' : 'text-muted-foreground'} testId="es-saidas" />
          <Item rotulo="Saldo final" valor={linha ? valorOuTraco(p.saldo_sistema) : '—'} cor={corDoSinal(linha ? p.saldo_sistema : null)} testId="es-saldo-final" />
          <Item rotulo={dataExtrato ? `Extrato ${dataExtrato}` : 'Extrato'} valor={linha ? valorOuTraco(p.saldo_extrato) : '—'} cor={corDoSinal(linha ? p.saldo_extrato : null)} testId="es-extrato" />
          {/* A Diferença na regra de "Saldos por conta" (D6): sem extrato "—", zero "confere" e positiva verdes, negativa vermelha. */}
          <Item rotulo="Diferença" valor={dif == null ? '—' : saldoConfere(dif) ? 'confere' : formatMoeda(dif)}
            cor={dif == null ? 'text-muted-foreground' : saldoConfere(dif) || dif > 0 ? 'text-success' : 'text-destructive'} testId="es-diferenca" />
          <Item rotulo="Lançamentos" valor={n == null ? '—' : String(n)} testId="es-qtde" />
        </div>
        {q.isError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-[11px] text-destructive" data-testid="es-erro">
            Não consegui ler o extrato do sistema desta conta. Feche e abra de novo.
          </div>
        ) : (
          <AbaSistemaReal linha={linha} onAbrir={onAbrirLancamento} modo="grande" />
        )}
      </DialogContent>
    </Dialog>
  );
}
