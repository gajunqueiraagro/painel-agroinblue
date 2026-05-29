export function RegrasEdicaoBar() {
  return (
    <div className="rounded bg-slate-50 border border-slate-200 px-2.5 py-1">
      <div className="flex items-center gap-3 flex-wrap text-[10px]">
        <span className="font-bold text-slate-700 uppercase">Regras:</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <b>Sem fin.:</b> gerar do zoot
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <b>Programado:</b> regenerar
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <b>Agendado:</b> revisar
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <b>Realizado:</b> não altera
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <b>Conciliado:</b> prioridade absoluta
        </span>
      </div>
    </div>
  );
}
