// ============================================================================
// ImportLancPrevia — PR-IMPORT-EXCEL-LANC-01, passo 3. DUMB.
//
// Mostra exatamente o que vai entrar e o que vai ficar de fora, com os totais.
// É o último ponto antes do caminho sem volta: NADA foi gravado até aqui —
// nem lançamento, nem apelido.
//
// A data exibida é a de COMPETÊNCIA, nunca a de pagamento: é ela que define o
// ano_mes (trigger trg_00_ano_mes_from_competencia) e, portanto, qual mês é
// testado contra financeiro_fechamentos.
// ============================================================================
import { useMemo, useState } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  MOTIVO_LABEL, FILTRO_LABEL, aplicarFiltroPrevia, resumirPorFiltro,
  type FiltroPrevia,
  type LinhaPrevia,
  type TotaisPrevia,
} from '@/v2/lib/importLanc/importLancamentosView';

export interface ImportLancPreviaProps {
  linhas: LinhaPrevia[];
  totais: TotaisPrevia;
}

const LIMITE_LINHAS = 300;

const FILTRO_CLS: Record<FiltroPrevia, { ativo: string; inativo: string }> = {
  entra: { ativo: 'bg-emerald-600 text-white', inativo: 'bg-emerald-50 text-emerald-800' },
  sai:   { ativo: 'bg-red-600 text-white',     inativo: 'bg-red-50 text-red-800' },
  fora:  { ativo: 'bg-slate-600 text-white',   inativo: 'bg-slate-100 text-slate-700' },
};

const FILTROS: FiltroPrevia[] = ['entra', 'sai', 'fora'];

export function ImportLancPrevia({ linhas, totais }: ImportLancPreviaProps) {
  // null = sem recorte (mostra tudo). Só apresentação: não altera elegibilidade.
  const [filtro, setFiltro] = useState<FiltroPrevia | null>(null);

  const resumo = useMemo(() => resumirPorFiltro(linhas), [linhas]);
  const filtradas = useMemo(
    () => (filtro === null ? linhas : linhas.filter((l) => aplicarFiltroPrevia(l, filtro))),
    [linhas, filtro],
  );
  const visiveis = filtradas.slice(0, LIMITE_LINHAS);

  return (
    <div className="space-y-1.5">
      {/* ── Totais: o contrato do que o operador está prestes a confirmar ── */}
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
          <div className="px-3 py-2 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-emerald-700">Entram</span>
            <span className="text-[11px] tabular-nums font-mono">
              <strong>{totais.entram.qtd}</strong> linha{totais.entram.qtd !== 1 ? 's' : ''}
              {' · '}{formatMoeda(totais.entram.valor)}
            </span>
          </div>
          <div className="px-3 py-2 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-red-700">Ficam de fora</span>
            <span className="text-[11px] tabular-nums font-mono">
              <strong>{totais.ficamDeFora.qtd}</strong> linha{totais.ficamDeFora.qtd !== 1 ? 's' : ''}
              {' · '}{formatMoeda(totais.ficamDeFora.valor)}
            </span>
          </div>
        </div>

        {totais.porMotivo.length > 0 && (
          <div className="border-t px-3 py-1.5 space-y-0.5">
            {totais.porMotivo.map((m) => (
              <div key={m.motivo} className="flex items-baseline justify-between text-[10px]">
                <span className="text-red-700">{MOTIVO_LABEL[m.motivo]}</span>
                <span className="tabular-nums font-mono text-muted-foreground">
                  {m.qtd} · {formatMoeda(m.valor)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          Nada foi gravado ainda — nem lançamento, nem apelido. A gravação só acontece
          quando você confirmar.
        </div>
      </div>

      {/* ── Filtros: recorte da lista. Os totais acima continuam sobre TUDO. ── */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTROS.map((f) => {
          const ativo = filtro === f;
          const r = resumo[f];
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(ativo ? null : f)}
              disabled={r.qtd === 0}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors
                ${r.qtd === 0 ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground'
                              : ativo ? FILTRO_CLS[f].ativo : FILTRO_CLS[f].inativo}`}
            >
              {FILTRO_LABEL[f]} ({r.qtd}) · {formatMoeda(r.valor)}
            </button>
          );
        })}
        {filtro !== null && (
          <button
            type="button"
            onClick={() => setFiltro(null)}
            className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground"
          >
            limpar recorte
          </button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {filtro === null
            ? `${linhas.length} linha(s)`
            : `${filtradas.length} de ${linhas.length} linha(s)`}
        </span>
      </div>

      {/* ── Linhas ── */}
      <div className="border rounded-md overflow-auto max-h-[46vh]">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 74 }} />
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 190 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-primary">
            <tr>
              {['Linha', 'Competência', 'Fazenda', 'Descrição', 'Subcentro', 'Valor', 'Situação'].map((h) => (
                <th key={h} className="px-1 py-1 text-[9px] uppercase font-semibold text-primary-foreground text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-[11px] text-muted-foreground py-6">
                  {filtro === null
                    ? 'Nenhuma linha lida da planilha.'
                    : `Nenhuma linha em "${FILTRO_LABEL[filtro]}".`}
                </td>
              </tr>
            )}
            {visiveis.map((l) => (
              <tr
                key={l.row.linha}
                className={`border-b ${l.entra ? '' : 'bg-red-50/70 text-red-800'}`}
              >
                <td className="px-1 py-0.5 text-[10px] font-mono text-muted-foreground">{l.row.linha}</td>
                <td className="px-1 py-0.5 text-[10px] font-mono">
                  {l.row.data_competencia ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] truncate" title={l.fazendaNome ?? ''}>
                  {l.fazendaNome ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] truncate" title={l.row.descricao ?? ''}>
                  {l.row.descricao ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] truncate" title={l.subcentro ?? ''}>
                  {l.subcentro ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] text-right tabular-nums font-mono">
                  {formatMoeda(Math.abs(Number(l.row.valor) || 0))}
                </td>
                <td className="px-1 py-0.5 text-[10px]">
                  {l.entra ? (
                    <span className="text-emerald-700">entra</span>
                  ) : (
                    <span className="font-medium">⚠ {l.motivo ? MOTIVO_LABEL[l.motivo] : 'fora'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtradas.length > LIMITE_LINHAS && (
        <p className="text-[10px] text-center text-muted-foreground">
          Exibindo {LIMITE_LINHAS} de {filtradas.length} linhas do recorte. Os totais acima
          consideram todas.
        </p>
      )}
    </div>
  );
}
