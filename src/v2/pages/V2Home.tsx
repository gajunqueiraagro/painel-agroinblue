import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelGeralOficial } from '@/v2/hooks/usePainelGeralOficial';

const fmt = (v: number | null | undefined, decimals = 0) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const Sk = () => <span className="inline-block w-16 h-4 bg-muted/50 rounded animate-pulse align-middle" />;

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{titulo}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Linha({ label, valor, loading, pendente }: {
  label: string; valor: string; loading?: boolean; pendente?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-px">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${pendente ? 'text-muted-foreground/50 italic' : 'text-foreground'}`}>
        {loading ? <Sk /> : valor}
      </span>
    </div>
  );
}

function Alerta({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
      <span className="shrink-0 mt-px">⚠</span>
      <span>{texto}</span>
    </div>
  );
}

export function V2Home({ ano, mes }: { ano: string; mes: string }) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual } = useFazenda();
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const mesNum = mes === '0' ? 0 : parseInt(mes);
  const anoNum = parseInt(ano);
  const fazendaId = fazendaAtual?.id ?? '__global__';
  const isGlobal = fazendaId === '__global__';

  const ml = mes === '0'
    ? 'Jan–Dez ' + ano
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const { caixaAtual, resultadoMes, rebanhoAtual, endividamento, avisos } = usePainelGeralOficial({
    clienteId: clienteAtual?.id ?? '',
    fazendaId,
    ano: anoNum,
    mes: mesNum,
  });

  const loadR = rebanhoAtual.loading;
  const loadF = resultadoMes.loading;
  const loadC = caixaAtual.loading;
  const loadD = endividamento.loading;

  return (
    <div className="px-4 py-4 space-y-5 max-w-2xl">

      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {g}{clienteAtual ? ', ' + clienteAtual.nome : ''}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isGlobal ? 'Todas as fazendas' : fazendaAtual?.nome} · {ml}
        </p>
      </div>

      {avisos.length > 0 && (
        <div className="space-y-1">
          {avisos.map(a => <Alerta key={a} texto={a} />)}
        </div>
      )}

      <Bloco titulo="Produção">
        <Linha label="Rebanho final" valor={rebanhoAtual.cabecas != null ? `${fmt(rebanhoAtual.cabecas)} cab.` : '—'} loading={loadR} />
        <Linha label="Peso médio" valor={rebanhoAtual.pesoMedio != null ? `${fmt(rebanhoAtual.pesoMedio, 0)} kg/cab` : '—'} loading={loadR} />
        <Linha label="GMD" valor={rebanhoAtual.gmd != null ? `${fmt(rebanhoAtual.gmd, 3)} kg/cab/dia` : '—'} loading={loadR} />
        <Linha label="UA média" valor={rebanhoAtual.ua != null ? `${fmt(rebanhoAtual.ua, 0)} UA` : '—'} loading={loadR} />
        <Linha label="@ produzidas" valor="—" pendente />
        <Linha label="Desfrute" valor="—" pendente />
      </Bloco>

      <div className="border-t border-border/40" />

      <Bloco titulo="Financeiro Produtivo">
        <Linha label="Receita" valor={fmtR(resultadoMes.entradas)} loading={loadF} />
        <Linha label="Desembolso" valor={fmtR(resultadoMes.saidas)} loading={loadF} />
        <Linha label="Resultado" valor={fmtR(resultadoMes.saldo)} loading={loadF} />
        <Linha label="Custo/@" valor="—" pendente />
        <Linha label="Receita/@" valor="—" pendente />
      </Bloco>

      <div className="border-t border-border/40" />

      <Bloco titulo="Estrutura Financeira">
        <Linha label="Caixa disponível" valor={fmtR(caixaAtual.valor)} loading={loadC} />
        <Linha label="Endividamento" valor={fmtR(endividamento.valor)} loading={loadD} />
        <Linha label="Valor do rebanho" valor="—" pendente />
        <Linha label="Dívida / rebanho" valor="—" pendente />
      </Bloco>

    </div>
  );
}
