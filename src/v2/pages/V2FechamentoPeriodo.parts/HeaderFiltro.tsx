/**
 * HeaderFiltro — filtro de período (mês início / mês fim) + botão Imprimir.
 * Marca className="no-print" para sumir na impressão.
 */

interface Props {
  periodoInicio: string;       // "YYYY-MM"
  periodoFim: string;
  onChange: (ini: string, fim: string) => void;
  onImprimir: () => void;
  loading?: boolean;
}

export default function HeaderFiltro({ periodoInicio, periodoFim, onChange, onImprimir, loading }: Props) {
  const handleIni = (v: string) => {
    if (v > periodoFim) onChange(v, v);
    else onChange(v, periodoFim);
  };
  const handleFim = (v: string) => {
    if (v < periodoInicio) onChange(v, v);
    else onChange(periodoInicio, v);
  };

  return (
    <div className="header-filtro no-print">
      <label htmlFor="periodo-inicio">Período:</label>
      <input
        id="periodo-inicio"
        type="month"
        value={periodoInicio}
        onChange={e => handleIni(e.target.value)}
        max={periodoFim}
      />
      <span>até</span>
      <input
        id="periodo-fim"
        type="month"
        value={periodoFim}
        onChange={e => handleFim(e.target.value)}
        min={periodoInicio}
      />
      <button
        type="button"
        className="btn-imprimir"
        onClick={onImprimir}
        disabled={loading}
      >
        Gerar PDF
      </button>
    </div>
  );
}
