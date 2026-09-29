import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import type { FornecedorV2 } from '@/hooks/useFinanceiroV2';
import { formatMoeda } from '@/lib/calculos/formatters';
import { parseNumericValue } from '@/lib/calculos/abate';
import { CATEGORIAS } from '@/types/cattle';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import { corDoSaldo, dataCurta } from '@/lib/oc/contaCorrente';
import {
  cabecasDaDescricao, lerResultado, lerSugestoes, ordenarIrmas, precoPorKg, saidasPreMarcadas,
  type RecebimentoResumo, type ResultadoCriar, type SaidaCandidata,
} from '@/lib/oc/criarDoLegado';

/* OC-CRIAR-DO-LEGADO-01 — "Criar OC a partir deste lancamento" (mock docs/mocks/oc_criar_do_legado_mock_v1.html). O sistema
   sugere as saidas de gado, o operador confere e cria; a OC nasce pronta (conta corrente, concluida, entrega encerrada).
   ⚠ PRINCIPIO DO GABRIEL: preenche sozinho o derivavel (comprador = favorecido, fazenda = do recebimento, data = primeira saida,
     saidas pre-marcadas quando a combinacao que fecha as cabecas e' unica), pergunta so' o que nao tem de onde tirar e bloqueia so'
     o erro primario — que vem do BANCO, todos de uma vez (`oc_criar_do_legado` com `p_simular`), escritos em vermelho ao lado do
     botao, sem toast.
   ⚠ A PREVIA E' A PROPRIA RPC SIMULADA: o extrato em conta corrente que ela devolve e' o que sera' gravado. Nenhuma conta aqui.
   ⚠ PADRAO A31 nas tabelas. OC-CC-CLASSIFICACAO-01: o recebimento fica na conta da venda (fora do DRE pela OC); a previa mostra
     a conta como esta' no plano. */

const TH = 'h-[17px] whitespace-nowrap bg-[#2E4B6E] px-[5px] text-center text-[9.5px] font-semibold text-white';
const TD = 'h-[18px] border-b border-[#eceae4] px-[5px] text-[10px]';
const NUM = `${TD} text-right tabular-nums`;
const COR = { neg: 'text-[#b91c1c]', pos: 'text-[#15803d]', zero: '' };
const DESPESA: Record<string, string> = { comissao: 'Comissão', frete: 'Frete', taxas_impostos: 'Taxas e impostos', taxa_aquisicao: 'Taxa de aquisição' };
const rotuloDaDespesa = (componente: string | null) => (componente ? DESPESA[componente] ?? componente : 'Despesa');
const rotuloCategoria = (slug: string | null) => (slug ? (CATEGORIAS.find(c => c.value === slug)?.label ?? slug) : '—');
const num2 = (v: number) => {
  const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(v * 100) < 0 ? `−${t}` : t;
};

type Criterio = 'recebimentos' | 'saidas' | 'outro';

interface Props {
  clienteId: string;
  lancamentoId: string;
  fornecedores: FornecedorV2[];
  onCriada: (operacaoId: string) => void;
  onFechar: () => void;
}

function Secao({ n, titulo, dica, children }: { n: number; titulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded border">
      <div className="flex items-center gap-2 bg-[#E8E6DF] px-2 py-[3px] text-[10.5px] font-semibold">
        <span>{n} · {titulo}</span>
        {dica && <span className="ml-auto font-normal text-muted-foreground">{dica}</span>}
      </div>
      {children}
    </div>
  );
}

export function CriarOCDoLegadoDialog({ clienteId, lancamentoId, fornecedores, onCriada, onFechar }: Props) {
  const [recebimentos, setRecebimentos] = useState<RecebimentoResumo[]>([]);
  const [irmas, setIrmas] = useState<RecebimentoResumo[]>([]);
  const [saidas, setSaidas] = useState<SaidaCandidata[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [comprador, setComprador] = useState('');
  const [buscaComprador, setBuscaComprador] = useState('');
  const [criterio, setCriterio] = useState<Criterio>('recebimentos');
  const [valorOutro, setValorOutro] = useState('');
  const [mostrarIrmas, setMostrarIrmas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ResultadoCriar | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const [iniciado, setIniciado] = useState(false);

  const ids = useMemo(() => [lancamentoId, ...recebimentos.filter(r => r.id !== lancamentoId).map(r => r.id)], [lancamentoId, recebimentos]);
  const chaveIds = ids.join(',');

  /* Sugestoes: relidas quando os recebimentos mudam (a janela das saidas nasce do primeiro pagamento). */
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
      const { data, error } = await (supabase as any).rpc('oc_criar_do_legado_sugestoes', { p_recebimentos: ids });
      if (!vivo) return;
      if (error) { setErroCarga(error.message ?? 'Falha ao carregar as sugestões.'); setCarregando(false); return; }
      const s = lerSugestoes(data);
      setRecebimentos(s.recebimentos);
      setIrmas(ordenarIrmas(s.irmas, s.recebimentos[0]?.descricao ?? null));
      setSaidas(s.saidas);
      if (!iniciado) {
        /* So' na primeira carga: preenche o comprador pelo favorecido e pre-marca. Depois, a mao do operador.
           OC-CRIAR-DO-LEGADO-01b: a saida do PROPRIO lancamento (modal antigo) vence a combinacao pelas cabecas. */
        const base = s.recebimentos[0];
        if (base?.favorecidoId) setComprador(base.favorecidoId);
        const { data: lanc } = await supabase.from('financeiro_lancamentos_v2')
          .select('movimentacao_rebanho_id').eq('id', lancamentoId).maybeSingle();
        if (!vivo) return;
        const pre = saidasPreMarcadas(s.saidas, lanc?.movimentacao_rebanho_id ?? null, cabecasDaDescricao(base?.descricao));
        setMarcadas(new Set(pre ?? []));
        setIniciado(true);
      }
      setErroCarga(null);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [chaveIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = recebimentos[0] ?? null;
  const saidasMarcadas = saidas.filter(s => marcadas.has(s.id));
  const cabMarcadas = saidasMarcadas.reduce((a, s) => a + s.quantidade, 0);
  const valorMarcadas = saidasMarcadas.reduce((a, s) => a + Math.round((s.valor ?? 0) * 100), 0) / 100;
  const alvo = cabecasDaDescricao(base?.descricao);
  const somaRecebida = recebimentos.reduce((a, r) => a + Math.round(r.valor * 100), 0) / 100;

  const argumentos = (simular: boolean) => ({
    p_cliente_id: clienteId,
    p_dados: { fazenda_id: base?.fazendaId ?? null, contraparte_id: comprador || null },
    p_criterio_valor: criterio,
    p_valor_outro: criterio === 'outro' ? parseNumericValue(valorOutro) : null,
    p_recebimentos: ids,
    p_saidas: saidasMarcadas.map(s => ({ lancamento_id: s.id })),
    p_simular: simular,
  });

  /* A previa: a RPC simulada, refeita a cada mudanca (com uma pausa curta para nao disparar a cada tecla). */
  const chavePrevia = [chaveIds, comprador, criterio, valorOutro, [...marcadas].sort().join(',')].join('|');
  useEffect(() => {
    if (!iniciado || !base) return;
    let vivo = true;
    setSimulando(true);
    const t = setTimeout(() => {
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
        const { data, error } = await (supabase as any).rpc('oc_criar_do_legado', argumentos(true));
        if (!vivo) return;
        setPrevia(error ? { ok: false, simulado: true, operacaoId: null, pendencias: [error.message ?? 'Falha na prévia.'], total: null, lotes: [], contaCorrente: null } : lerResultado(data));
        setSimulando(false);
      })();
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [chavePrevia, iniciado]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendencias = previa?.pendencias ?? [];
  const podeCriar = !!previa?.ok && pendencias.length === 0 && !simulando && !criando;

  const criar = async () => {
    setErroCriar(null);
    setCriando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
    const { data, error } = await (supabase as any).rpc('oc_criar_do_legado', argumentos(false));
    setCriando(false);
    if (error) { setErroCriar(error.message ?? 'Falha ao criar a OC.'); return; }
    const r = lerResultado(data);
    if (!r.ok || !r.operacaoId) { setErroCriar(r.pendencias.join(' · ') || 'A OC não foi criada.'); return; }
    onCriada(r.operacaoId);
  };

  const opcoesValor: [Criterio, string][] = [
    ['recebimentos', `Total dos recebimentos do financeiro (${formatMoeda(somaRecebida)}), rateado pelas saídas — a OC nasce com saldo zero`],
    ['saidas', `Valor das saídas do zootécnico (${formatMoeda(valorMarcadas)}) — a diferença vira saldo da OC`],
    ['outro', 'Outro total, rateado do mesmo jeito'],
  ];
  const cc = previa?.contaCorrente ?? null;
  const mesesReceita = cc ? [...new Set(cc.linhas.filter(l => l.tipo === 'entrega').map(l => l.data.slice(0, 7)))] : [];
  const fmtMes = (am: string) => { const [a, m] = am.split('-'); return `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(m) - 1]}/${a.slice(2)}`; };

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[92vh] max-w-[1100px] overflow-y-auto" data-testid="dialogo-criar-do-legado">
        <DialogHeader>
          <DialogTitle className="text-[12px]">
            Criar OC a partir do legado
            {base && <span className="ml-2 font-normal text-muted-foreground">{base.fazenda ?? '—'} · Venda</span>}
          </DialogTitle>
        </DialogHeader>
        {erroCarga && <div className="text-[10px] text-destructive" role="alert">{erroCarga}</div>}
        {carregando && !base && <div className="text-[10.5px] text-muted-foreground">Carregando…</div>}
        {base && (
          <div className="space-y-2">
            <Secao n={1} titulo="Recebimentos desta venda" dica="o lançamento escolhido; dá para somar outros do mesmo comprador">
              <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
                <colgroup><col style={{ width: 70 }} /><col /><col style={{ width: 200 }} /><col style={{ width: 110 }} /><col style={{ width: 60 }} /></colgroup>
                <thead><tr>{['Pagamento', 'Descrição', 'Favorecido', 'Valor', ''].map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {recebimentos.map(r => (
                    <tr key={r.id} className="bg-[#EAF1F9]" data-recebimento={r.id}>
                      <td className={`${TD} text-center`}>{dataCurta(r.data)}</td>
                      <td className={`${TD} break-words`}>{r.descricao ?? '—'}{r.motivo ? <span className="ml-1 text-[#b91c1c]">· {r.motivo}</span> : null}</td>
                      <td className={`${TD} break-words`}>{r.favorecido ?? '—'}</td>
                      <td className={`${NUM} ${COR.pos}`}>{num2(r.valor)}</td>
                      <td className={`${TD} text-center`}>
                        {r.id !== lancamentoId && (
                          <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => setRecebimentos(prev => prev.filter(x => x.id !== r.id))}>tirar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-1">
                <button type="button" className="text-[10px] font-medium text-primary underline" onClick={() => setMostrarIrmas(v => !v)}>
                  + Somar outro recebimento
                </button>
                {mostrarIrmas && (
                  <ul className="mt-1 space-y-0.5 text-[10px]" data-testid="irmas">
                    {irmas.length === 0 && <li className="text-muted-foreground">Nenhum outro recebimento do mesmo comprador, fazenda e conta de venda.</li>}
                    {irmas.map(r => (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className="w-16">{dataCurta(r.data)}</span>
                        <span className="flex-1 break-words">{r.descricao ?? '—'}</span>
                        <span className="w-24 text-right tabular-nums text-[#15803d]">{num2(r.valor)}</span>
                        <Button type="button" variant="outline" size="sm" className="h-[20px] px-2 text-[10px]"
                          onClick={() => { setRecebimentos(prev => [...prev, r]); setMostrarIrmas(false); }}>Somar</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Secao>

            <Secao n={2} titulo="Dados da OC" dica="preenchido pelo que o legado tem; confira o comprador">
              <table className="w-full table-fixed border-separate border-spacing-0">
                <colgroup><col style={{ width: 160 }} /><col /></colgroup>
                <tbody>
                  <tr>
                    <td className={`${TD} text-muted-foreground`}>Comprador *</td>
                    <td className={`${TD} py-1`}>
                      <div className={`max-w-[340px] ${!comprador ? 'rounded ring-1 ring-destructive' : ''}`} data-testid="campo-comprador">
                        <FavorecidoSelect value={comprador} onChange={setComprador} fornecedores={fornecedores}
                          search={buscaComprador} onSearchChange={setBuscaComprador} size="compact" />
                      </div>
                      {!comprador && <div className="text-[10px] text-destructive">Escolha o comprador do cadastro.</div>}
                    </td>
                  </tr>
                  <tr><td className={`${TD} text-muted-foreground`}>Fazenda</td><td className={TD}>{base.fazenda ?? '—'}</td></tr>
                  <tr><td className={`${TD} text-muted-foreground`}>Tipo</td><td className={TD}>Venda · modelo conta corrente · nasce concluída, com a entrega encerrada</td></tr>
                  <tr><td className={`${TD} text-muted-foreground`}>Data da venda</td><td className={TD}>{saidasMarcadas[0] ? dataCurta([...saidasMarcadas].sort((a, b) => a.data.localeCompare(b.data))[0].data) : '—'} <span className="text-muted-foreground">· primeira saída marcada</span></td></tr>
                </tbody>
              </table>
            </Secao>

            <Secao n={3} titulo="Valor da venda" dica="critério do lote 'total'; R$/kg derivado">
              <div className="space-y-1 px-2 py-1.5 text-[10.5px]" role="radiogroup" aria-label="Valor da venda">
                {opcoesValor.map(([v, texto]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="criterio" checked={criterio === v} onChange={() => setCriterio(v)} />
                    <span>{texto}{v === 'recebimentos' && <span className="ml-1 text-muted-foreground">(padrão)</span>}</span>
                    {v === 'outro' && criterio === 'outro' && (
                      <Input aria-label="Total da venda" value={valorOutro} onChange={e => setValorOutro(e.target.value)}
                        className={`h-6 w-36 text-right text-[10.5px] ${!(parseNumericValue(valorOutro) > 0) ? 'border-destructive' : ''}`} />
                    )}
                  </label>
                ))}
              </div>
              {previa?.ok && previa.lotes.length > 0 && (
                <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="lotes-previa">
                  <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 60 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} /><col style={{ width: 80 }} /></colgroup>
                  <thead><tr>{['Lote', 'Categoria', 'Cab', 'Peso (kg)', 'Valor', 'R$/kg'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {previa.lotes.map(l => {
                      const pk = precoPorKg(l);
                      return (
                        <tr key={l.ordem}>
                          <td className={`${TD} text-center`}>{l.ordem}</td>
                          <td className={TD}>{rotuloCategoria(l.categoria)}</td>
                          <td className={NUM}>{l.quantidade}</td>
                          <td className={NUM}>{l.peso == null ? '—' : l.peso.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                          <td className={NUM}>{num2(l.valor)}</td>
                          <td className={NUM}>{pk == null ? '—' : pk.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Secao>

            <Secao n={4} titulo="Saídas de gado sugeridas"
              dica={`mesma fazenda, venda, sem OC, de 60 dias antes a 120 dias depois do pagamento${alvo ? ` · ${alvo} cab pedidos na descrição` : ''}`}>
              <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="saidas">
                <colgroup><col style={{ width: 28 }} /><col style={{ width: 64 }} /><col /><col style={{ width: 50 }} /><col style={{ width: 70 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /></colgroup>
                <thead><tr>{['', 'Data', 'Categoria', 'Cab', 'Peso', 'Valor', 'Lançamento'].map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {saidas.length === 0 && <tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>Nenhuma saída de venda desta fazenda na janela.</td></tr>}
                  {saidas.map(s => (
                    <tr key={s.id} className={marcadas.has(s.id) ? 'bg-white' : 'bg-white text-[#9ca3af]'} data-saida={s.id}>
                      <td className={`${TD} text-center`}>
                        <Checkbox checked={marcadas.has(s.id)} aria-label={`Marcar saída de ${dataCurta(s.data)}`} className="h-3 w-3"
                          onCheckedChange={v => setMarcadas(prev => { const n = new Set(prev); if (v === true) n.add(s.id); else n.delete(s.id); return n; })} />
                      </td>
                      <td className={`${TD} text-center`}>{dataCurta(s.data)}</td>
                      <td className={TD}>{rotuloCategoria(s.categoria)}</td>
                      <td className={NUM}>{s.quantidade}</td>
                      <td className={NUM}>{s.peso_medio_kg == null ? '—' : s.peso_medio_kg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                      <td className={NUM}>{s.valor == null ? '—' : num2(s.valor)}</td>
                      <td className={`${TD} font-mono text-[9.5px]`}>{s.id.slice(0, 8)} · {s.origem_registro ?? 'manual'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={3} className="h-[19px] border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-[10px]">Marcadas</td>
                    <td className="border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px]" data-testid="cab-marcadas">{cabMarcadas}</td>
                    <td className="border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF]" />
                    <td className="border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px]">{num2(valorMarcadas)}</td>
                    <td className="border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF]" />
                  </tr>
                </tfoot>
              </table>
            </Secao>

            <Secao n={5} titulo="Prévia da OC que será criada" dica="modelo conta corrente · nada muda no rebanho nem no caixa">
              {simulando && <div className="px-2 py-1 text-[10px] text-muted-foreground">Conferindo…</div>}
              {cc && (
                <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="previa">
                  <colgroup><col style={{ width: 56 }} /><col style={{ width: 30 }} /><col style={{ width: 34 }} /><col style={{ width: 82 }} /><col /><col style={{ width: 170 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /></colgroup>
                  <thead><tr>{['Data', 'Lote', 'Cab', 'Evento', 'Descrição', 'Conta', 'Entrega (DRE)', 'Recebido (caixa)', 'Saldo'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {cc.linhas.map(l => (
                      <tr key={l.parteId} className={l.tipo === 'recebimento' ? 'bg-[#EAF1F9]' : 'bg-white'} data-tipo={l.tipo}>
                        <td className={`${TD} text-center`}>{dataCurta(l.data)}</td>
                        <td className={`${TD} text-center`}>{l.loteOrdem ?? ''}</td>
                        <td className={NUM}>{l.cab ?? ''}</td>
                        <td className={`${TD} text-center`}>{l.tipo === 'entrega' ? 'Entrega' : l.tipo === 'recebimento' ? 'Recebimento' : 'Explicação'}</td>
                        <td className={`${TD} break-words`}>{l.descricao ?? '—'}</td>
                        <td className={`${TD} break-words`}>{rotuloDaConta(l.conta) ?? '—'}</td>
                        <td className={`${NUM} ${COR[corDoSaldo(l.movEntrega)]}`}>{l.movEntrega == null ? '' : num2(l.movEntrega)}</td>
                        <td className={`${NUM} ${COR[corDoSaldo(l.movRecebido)]}`}>{l.movRecebido == null ? '' : num2(l.movRecebido)}</td>
                        <td className={`${NUM} font-bold ${COR[corDoSaldo(l.saldo)]}`}>{num2(l.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={2} className="h-[19px] border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-[10px]">Total</td>
                      <td className="border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px]">{cc.cabEntregue}</td>
                      <td colSpan={3} className="border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF]" />
                      <td className={`border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px] ${COR.neg}`}>{num2(-cc.entregue)}</td>
                      <td className={`border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px] ${COR.pos}`}>{num2(cc.recebido)}</td>
                      <td className={`border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px] ${COR[corDoSaldo(cc.saldo)]}`} data-testid="saldo-previa">{num2(cc.saldo)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {cc && (
                <div className="flex flex-wrap gap-x-4 px-2 py-1 text-[10px]" data-testid="resumo-previa">
                  <span><span className="text-muted-foreground">Comprador</span> {fornecedores.find(f => f.id === comprador)?.nome ?? '—'}</span>
                  <span><span className="text-muted-foreground">Receita no DRE</span> {mesesReceita.map(fmtMes).join(', ') || '—'}{base ? ` (hoje está em ${fmtMes(base.data.slice(0, 7))})` : ''}</span>
                  <span><span className="text-muted-foreground">Saldo</span> <b className={COR[corDoSaldo(cc.saldo)]}>{num2(cc.saldo)}</b>{corDoSaldo(cc.saldo) !== 'zero' ? ' · explicar depois na OC' : ' · quitado'}</span>
                </div>
              )}
              {/* OC-CRIAR-DO-LEGADO-01b — a comissao do modal antigo presa a' saida entra na OC como despesa da operacao, fora do
                  saldo. Vem da propria simulacao (`conta_corrente.despesas`): nenhuma regra copiada aqui. */}
              {cc && cc.despesas.length > 0 && (
                <table className="mt-1 w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="despesas-previa">
                  <colgroup><col style={{ width: 300 }} /><col /><col style={{ width: 200 }} /><col style={{ width: 90 }} /></colgroup>
                  <thead><tr>{['Despesa ligada à OC', 'Descrição', 'Favorecido', 'Valor'].map(h => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {cc.despesas.map(d => (
                      <tr key={d.parteId} className="bg-white" data-despesa={d.componente ?? ''}>
                        <td className={TD}>{rotuloDaDespesa(d.componente)} — despesa da operação, fora do saldo</td>
                        <td className={`${TD} break-words`}>{d.descricao ?? '—'}</td>
                        <td className={`${TD} break-words`}>{d.favorecido ?? '—'}</td>
                        <td className={`${NUM} ${COR[corDoSaldo(d.valor)]}`}>{num2(d.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Secao>
          </div>
        )}
        <DialogFooter className="items-center">
          {pendencias.length > 0 && (
            <div className="mr-auto text-[10px] text-destructive" role="alert" data-testid="pendencias">
              {pendencias.map((p, i) => <div key={i}>{p}</div>)}
            </div>
          )}
          {erroCriar && <span className="mr-auto text-[10px] text-destructive" role="alert">{erroCriar}</span>}
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px]" onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px]" disabled={!podeCriar} onClick={criar}
            title={podeCriar ? 'Cria a OC concluída, com as entregas e os recebimentos ligados' : 'Resolva as pendências para criar'}>
            Criar OC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
