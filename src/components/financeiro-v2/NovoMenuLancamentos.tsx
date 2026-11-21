/**
 * "+ Novo ▾" — o botão ÚNICO de criar lançamento (decisão do Gabriel 15/11 07:28; mock novo-menu-v1 aprovado 07:48).
 *
 * Um botão na célula do "Novo" da grade fixa 2×3 (UI-BOTOES-LUGAR-FIXO-01); a célula do antigo "+ Da nota" fica VAZIA e reservada.
 * O menu (o `DropdownMenu` da casa, `menuPadrao`) diz em uma linha o que cada entrada faz:
 *   Lançamento em branco · Da nota fiscal (o MESMO diálogo de hoje, do Code 2 — só o gatilho mudou) · Dos boletos (a caixa, D1c).
 * ⚠ SELO: os boletos que PEDEM AÇÃO ("na caixa" + "sem par", D1), em lugar FIXO (reserva "99+"): sem pendência ou sem leitura o lugar
 *   fica vazio — o botão tem sempre a mesma largura (nada se desloca).
 * ⚠ "Da planilha" NÃO entra (D2): mora na Importação. "Do extrato" mora na Conciliação (precisa da linha do banco).
 */
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TextoReservado } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';

/** "99+" acima de 99; nulo/zero = vazio (o lugar segue reservado). */
export const textoDoSelo = (n: number | null): string => (!n || n <= 0 ? '' : n > 99 ? '99+' : String(n));

/** D2 (Gabriel 16/11 15:15): o selo conta boletos E notas da Receita; nenhum lido = vazio */
export const somaDoSelo = (boletos: number | null, notas: number | null): number | null =>
  boletos == null && notas == null ? null : (boletos ?? 0) + (notas ?? 0);

export function NovoMenuLancamentos({ boletosPedemAcao, notasDaReceita = null, onEmBranco, onDaNota, onDosBoletos, className }: {
  boletosPedemAcao: number | null;
  /** NOTAS-RECEITA F3.4 (D2) — as notas da Receita que pedem ação (a lançar + ciência pendente); entram no MESMO selo */
  notasDaReceita?: number | null;
  onEmBranco: () => void;
  onDaNota: () => void;
  onDosBoletos: () => void;
  className?: string;
}) {
  const selo = textoDoSelo(somaDoSelo(boletosPedemAcao, notasDaReceita));
  const seloBoletos = textoDoSelo(boletosPedemAcao);
  const seloNotas = textoDoSelo(notasDaReceita);
  const item = 'flex-col items-start gap-0';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" data-testid="btn-novo" title="Novo lançamento: em branco, da nota fiscal ou da caixa de entrada"
          className={cn('h-6 gap-0.5 px-1.5 text-[10px] bg-[#E7C873] text-foreground hover:bg-[#D9B95F]', className)}>
          <Plus className="h-3 w-3" /> Novo
          <TextoReservado reserva="99+" alinhar="direita" testid="selo-boletos"
            texto={selo ? <span className="rounded-[7px] bg-amber-700 px-[3px] text-[9px] font-bold leading-[13px] text-white">{selo}</span> : ''}
            className={cn('text-[9px]', !selo && 'invisible')} />
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]" data-testid="menu-novo">
        <DropdownMenuItem className={item} onSelect={onEmBranco} data-testid="novo-em-branco">
          <span className="font-semibold">Lançamento em branco</span>
          <span className="text-zinc-200">preencher tudo à mão</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={onDaNota} data-testid="btn-novo-de-xml">
          <span className="flex w-full justify-between font-semibold">
            Da nota fiscal
            {seloNotas && <span className="font-semibold tabular-nums text-sky-300" data-testid="novo-notas-da-receita">{seloNotas} chegaram da Receita</span>}
          </span>
          <span className="text-zinc-200">{seloNotas ? 'XML ou PDF, ou as notas que a Receita mandou' : 'XML ou PDF: a nota preenche fornecedor, valor e parcelas'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={onDosBoletos} data-testid="novo-dos-boletos">
          <span className="flex w-full justify-between font-semibold">
            Da caixa de entrada
            {seloBoletos && <span className="font-semibold tabular-nums text-amber-200">{seloBoletos} pedem ação</span>}
          </span>
          <span className="text-zinc-200">boletos, notas e folha que chegaram por e-mail</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
