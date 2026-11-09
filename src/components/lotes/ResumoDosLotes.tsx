/**
 * LOTES-06 (mock ui-validar/lotes-resumo.html, aprovado 08/11 12:33) — a aba RESUMO da Produção › Lotes: os 4 números do topo e os
 * 6 quadros (atividade, raça, sexo, categoria, programa, pasto), cada um com Cab · Peso · % · a barra e a linha Total. Quem decide os
 * números é `resumoDosLotes` (puro); aqui só se desenha. Os lotes são os mesmos da lista (o filtro de cima vale aqui também).
 * Número na coluna dele, à direita, nunca ao lado de texto (regra soberana de 08/11 09:31); uma linha por célula, o rótulo inteiro no title.
 */
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import type { QuadroDoResumo, ResumoDosLotes as Resumo } from '@/lib/lotes/resumo';

const n0 = (v: number | null) => (v == null ? '—' : formatNum(v, 0));
const n1 = (v: number) => formatNum(v, 1);

function Numero({ valor, rotulo, ajuda, testid }: { valor: string; rotulo: string; ajuda?: string; testid: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-md border border-border bg-card px-3 py-1.5" data-testid={testid}>
      <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-[#0b1f3a]">{valor}</span>
      <span className="truncate text-[10px] text-muted-foreground" title={ajuda ?? rotulo}>{rotulo}</span>
    </div>
  );
}

function Quadro({ q }: { q: QuadroDoResumo }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-card" data-testid="resumo-quadro">
      <div className="flex h-[22px] items-center px-2 text-[11px] font-semibold text-primary">{q.titulo}</div>
      <table className="w-full table-fixed border-collapse">
        <colgroup><col /><col style={{ width: 52 }} /><col style={{ width: 52 }} /><col style={{ width: 44 }} /><col style={{ width: '22%' }} /></colgroup>
        <thead><tr className="bg-primary">
          <th className={cn(TH_REGUA, 'text-left')}>{q.coluna}</th><th className={cn(TH_REGUA, 'text-right')}>Cab</th>
          <th className={cn(TH_REGUA, 'text-right')}>Peso kg</th><th className={cn(TH_REGUA, 'text-right')}>%</th><th className={TH_REGUA} />
        </tr></thead>
        <tbody>
          {q.linhas.map((l) => (
            <tr key={l.rotulo} className="border-b border-border/60" data-testid="resumo-linha">
              <td className={TD_REGUA_TEXTO} title={l.rotulo}>{l.rotulo}</td>
              <td className={TD_REGUA_NUM}>{n0(l.cabecas)}</td>
              <td className={TD_REGUA_NUM}>{n0(l.pesoMedioKg)}</td>
              <td className={TD_REGUA_NUM}>{n1(l.pct)}</td>
              <td className={TD_REGUA}><span className="block h-[7px] rounded-sm bg-[#9fb6d6]" style={{ width: `${Math.round(l.barra * 100)}%` }} /></td>
            </tr>
          ))}
          <tr className="bg-[#f3f4f6] font-semibold" data-testid="resumo-total">
            <td className={TD_REGUA}>Total</td><td className={TD_REGUA_NUM}>{n0(q.total.cabecas)}</td>
            <td className={TD_REGUA_NUM}>{n0(q.total.pesoMedioKg)}</td><td className={TD_REGUA_NUM}>{q.total.cabecas > 0 ? n1(100) : '—'}</td><td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ResumoDosLotes({ resumo }: { resumo: Resumo }) {
  const t = resumo.total;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5" data-testid="resumo-dos-lotes">
      <div className="grid flex-none grid-cols-4 gap-2">
        <Numero testid="resumo-cabecas" valor={n0(t.cabecas)} rotulo={`cabeças em ${t.lotes} ${t.lotes === 1 ? 'lote' : 'lotes'}`} />
        <Numero testid="resumo-peso" valor={t.pesoMedioKg == null ? '—' : `${n0(t.pesoMedioKg)} kg`} rotulo="peso médio" />
        <Numero testid="resumo-sexo" valor={`${n0(resumo.machos)} · ${n0(resumo.femeas)}`} rotulo="machos · fêmeas" />
        <Numero testid="resumo-arrobas" valor={resumo.arrobas == null ? '—' : `${n0(resumo.arrobas)} @`} rotulo="arrobas em estoque" ajuda="arrobas em estoque (peso vivo ÷ 30)" />
      </div>
      <div className="grid grid-cols-3 gap-2 max-[1100px]:grid-cols-2">
        {resumo.quadros.map((q) => <Quadro key={q.titulo} q={q} />)}
      </div>
    </div>
  );
}
