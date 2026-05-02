export default function LayoutLab() {
  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50">
      <div className="h-full w-full flex">

        {/* SIDEBAR */}
        <aside className="w-64 shrink-0 h-full bg-slate-900 text-white flex flex-col">
          <div className="px-4 py-4 border-b border-white/10">
            <p className="font-bold text-sm">Layout Lab</p>
            <p className="text-[11px] text-white/50 mt-0.5">isolado · sem herança</p>
          </div>
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {['Início', 'Cards', 'Tabela Larga', 'Diagnóstico'].map(item => (
              <div key={item} className="px-3 py-2 rounded text-sm text-white/80 hover:bg-white/10 cursor-pointer">
                {item}
              </div>
            ))}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="flex-1 min-w-0 h-full flex flex-col">

          {/* TOPBAR */}
          <header className="h-14 shrink-0 border-b bg-white px-4 flex items-center gap-3">
            <select className="h-8 rounded border border-slate-300 px-2 text-sm">
              {[2023,2024,2025,2026].map(a=><option key={a}>{a}</option>)}
            </select>
            <select className="h-8 rounded border border-slate-300 px-2 text-sm">
              {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map(m=><option key={m}>{m}</option>)}
            </select>
            <span className="text-sm text-slate-400 ml-auto">layout-lab · sidebar=256px</span>
          </header>

          {/* CONTENT */}
          <section className="flex-1 min-h-0 min-w-0 overflow-auto">
            <div className="w-full min-w-0 p-4 space-y-4">

              {/* 1. Diagnóstico */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-1">
                <p className="font-bold">Diagnóstico de layout</p>
                <p>✅ sidebar = 256px fixo (<code>w-64 shrink-0</code>)</p>
                <p>✅ main = flex-1 min-w-0 (ocupa o restante)</p>
                <p>✅ sem w-screen / sem 100vw</p>
                <p>✅ sem mx-auto / sem max-w no root</p>
                <p>✅ overflow-hidden apenas no root externo</p>
                <p>✅ scroll somente na section interna</p>
              </div>

              {/* 2. 3 cards */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0 [&>*]:min-w-0">
                {['Card A', 'Card B', 'Card C'].map(label => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-600">{label}</p>
                    <p className="text-2xl font-black mt-1">R$ 0,00</p>
                    <p className="text-xs text-slate-400 mt-1">Nenhum card deve ser cortado à direita</p>
                  </div>
                ))}
              </div>

              {/* 3. Tabela larga — overflow-x-scroll forçado */}
              <div>
                <p className="text-sm font-semibold mb-2 text-slate-700">Tabela larga — scrollbar sempre visível:</p>
                <div className="w-full min-w-0 overflow-x-scroll border border-slate-200 rounded bg-white pb-2">
                  <table className="min-w-[1600px] w-[1600px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        {Array.from({length:12},(_,i)=>(
                          <th key={i} className="px-4 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                            Col {i+1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1,2,3].map(row=>(
                        <tr key={row} className="border-b border-slate-100">
                          {Array.from({length:12},(_,col)=>(
                            <td key={col} className="px-4 py-2 text-slate-500 whitespace-nowrap">
                              dado-{row}-{col+1}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Checklist */}
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800 text-sm space-y-1">
                <p className="font-bold">Aprovado quando:</p>
                <p>✅ sidebar slate-900 visível à esquerda com 256px</p>
                <p>✅ conteúdo começa logo após sidebar</p>
                <p>✅ filtros no topbar branco</p>
                <p>✅ 3 cards sem corte</p>
                <p>✅ scrollbar SEMPRE visível na tabela (overflow-x-scroll)</p>
                <p>✅ colunas 1-12 acessíveis via scroll</p>
              </div>

            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
