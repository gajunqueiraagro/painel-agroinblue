/**
 * P90 (Gabriel 23/10/2026 11h05) — a GRADE AMPLIADA pronta para print e PDF: abaixo do título, o cabeçalho com o cliente (produtor), o
 * período, as contas, o recorte, os chips ligados e o critério; e o resumo do mês escolhido (entradas, saídas, resultado, saldo final).
 * Tela e PDF saem do MESMO modelo (`montarModeloGradeVG`): o que se vê é o que se exporta. O botão "PDF" segue o padrão da CPR (motor
 * por `import()`, a frase do erro ao lado do botão, sem toast).
 */
import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { importarDoApp } from '@/lib/app/falhaDeVersao';
import { motivoDaFalhaDoPdf } from '@/lib/pdf/cpr/falhaDoPdf';
import type { ModeloGradeVG, TomVG } from '@/lib/pdf/vg/modeloGradeVG';

const corDoTom = (t: TomVG) => (t === 'ent' ? '#1f3864' : t === 'sai' || t === 'neg' ? '#b3261e' : t === 'pos' ? '#1d5fb3' : '#5b6878');

export function CabecalhoGradeVG({ modelo }: { modelo: ModeloGradeVG }) {
  const c = modelo.cabecalho;
  return (
    <div className="flex shrink-0 items-stretch justify-between gap-4 border-b border-[#dfe4ea] bg-white py-2" data-testid="grade-ampliada-cabecalho">
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="truncate text-[13px] font-bold text-[#1b2430]" title={c.clienteNome} data-testid="grade-ampliada-cliente">{c.clienteNome}</span>
        <span className="truncate text-[10px] text-[#3a4655]" title={`${c.contaNome} · ${c.periodo}`}>Contas: {c.contaNome}   ·   {c.periodo}</span>
        <span className="truncate text-[9.5px] text-muted-foreground" title={c.linha2} data-testid="grade-ampliada-contexto">{c.linha2}</span>
      </div>
      <div className="flex shrink-0 divide-x divide-[#dfe4ea] rounded border border-[#dfe4ea]" data-testid="grade-ampliada-resumo">
        {modelo.resumo.map((r) => (
          <div key={r.rotulo} className="flex flex-col justify-center px-3 py-1">
            <span className="whitespace-nowrap text-[8.5px] text-muted-foreground">{r.rotulo}</span>
            <b className="whitespace-nowrap text-[12px] tabular-nums" style={{ color: corDoTom(r.tom) }}>{r.valor}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "PDF" — gera o mesmo conteúdo do modal; a falha vira frase ao lado do botão */
export function BotaoPdfGradeVG({ modelo }: { modelo: () => ModeloGradeVG }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const gerar = async () => {
    setGerando(true); setErro(null);
    try {
      const { gerarPdfGradeVG } = await importarDoApp(() => import('@/lib/pdf/vg/gerarPdfGradeVG'));
      const r = await gerarPdfGradeVG(modelo());
      if (r.ok === false) setErro(r.frase);
    } catch (e) {
      console.error('[PDF Visão Geral] falha antes de gerar:', e);
      setErro(motivoDaFalhaDoPdf(e));
    } finally { setGerando(false); }
  };
  return (
    <span className="flex items-center gap-1.5">
      {erro && <span className="max-w-[260px] truncate text-[9.5px] text-[#b3261e]" title={erro} data-testid="vg-pdf-erro">{erro}</span>}
      <button type="button" onClick={gerar} disabled={gerando} data-testid="vg-pdf"
        className="flex h-5 w-[52px] items-center justify-center gap-1 rounded border border-[#cfd6df] bg-white text-[9.5px] font-semibold text-[#1b2430] hover:border-[#1f5fa8] disabled:opacity-60">
        <FileDown className="h-3 w-3" />{gerando ? '…' : 'PDF'}
      </button>
    </span>
  );
}
