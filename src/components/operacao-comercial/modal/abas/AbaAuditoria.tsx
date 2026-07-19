import { useState } from 'react';
import { Download, Info, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ModalOCCtx } from '../tipos';

const s = (v: unknown): string => (v == null ? '' : String(v));
const fmtData = (v: unknown): string => {
  const t = s(v);
  if (!t) return '';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString('pt-BR');
};
const resumoDetalhes = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return ''; }
};

// Aba 6 — Auditoria. SOMENTE eventos reais de zoo_operacao_eventos (via ctx.eventos).
// Nada mockado. Identificação de usuário tenant-safe: representação neutra, sem UUID
// completo e sem consultar auth.users no frontend.
export function AbaAuditoria({ ctx }: { ctx: ModalOCCtx }) {
  const [aba, setAba] = useState<'historico' | 'sistema'>('historico');
  const eventos = ctx.eventos;

  const exportar = () => {
    const linhas = [['data', 'acao', 'origem', 'detalhes'].join(';')].concat(
      eventos.map(e => [fmtData(e['created_at']), s(e['acao']), s(e['origem']), resumoDetalhes(e['detalhes'])]
        .map(c => `"${c.replace(/"/g, '""')}"`).join(';')),
    );
    const blob = new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'auditoria_operacao.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-lg">Auditoria da Operação</h3>
          <p className="text-sm text-muted-foreground">Histórico completo de alterações e eventos desta operação.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={eventos.length === 0} className="gap-1">
          <Download className="h-4 w-4" /> Exportar log
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-4 border-b text-sm">
        <button onClick={() => setAba('historico')} className={aba === 'historico' ? 'font-semibold text-primary border-b-2 border-primary pb-1' : 'text-muted-foreground pb-1'}>Histórico</button>
        <button onClick={() => setAba('sistema')} className={aba === 'sistema' ? 'font-semibold text-primary border-b-2 border-primary pb-1' : 'text-muted-foreground pb-1'}>Eventos do sistema</button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="text-left py-2 font-medium">Data e hora</th>
              <th className="text-left py-2 font-medium">Usuário</th>
              <th className="text-left py-2 font-medium">Ação</th>
              <th className="text-left py-2 font-medium">Detalhes</th>
              <th className="text-left py-2 font-medium">Origem</th>
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">Nenhum evento ainda. Salve o rascunho para gerar a trilha.</td></tr>
            )}
            {eventos.map((e, i) => (
              <tr key={i} className="border-b align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{fmtData(e['created_at'])}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1 text-muted-foreground"><User className="h-3.5 w-3.5" /> Operador</span>
                </td>
                <td className="py-2 pr-3"><span className="rounded bg-muted px-2 py-0.5 text-[11px] uppercase">{s(e['acao'])}</span></td>
                <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[260px] truncate">{resumoDetalhes(e['detalhes'])}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">{s(e['origem']) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
        <Info className="h-4 w-4 shrink-0" /> Todas as alterações são registradas automaticamente. Este log não pode ser alterado.
      </div>
    </div>
  );
}
