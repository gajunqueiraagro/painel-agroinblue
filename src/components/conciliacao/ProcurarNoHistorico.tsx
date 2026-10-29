/**
 * ProcurarNoHistorico — P153 (CONC-HISTORICO-01, Gabriel 28/10). O movimento do banco sem nada em aberto acha COMO FOI LANÇADO ANTES:
 * o mesmo nome no texto do banco já casado, na descrição ou no fornecedor (`fn_conciliacao_historico_buscar`), e "Criar igual" abre o
 * Criar de hoje com fornecedor, subcentro, fazenda e descrição do achado (o valor, a data e a conta continuam os do movimento).
 * O MESMO componente no "Sugestões para casar" (Conferência) e na estação "Conciliar movimento do extrato".
 *
 * ⚠ BUSCAR É GESTO (Procurar ou Enter): nada sai sozinho ao abrir.
 * ⚠ D1: banco sem nome (Bradesco "PIX ENVIADO", Sicredi com 8 dígitos) = o campo VAZIO e a frase "o banco não trouxe o nome: digite".
 * ⚠ "NÃO CONSEGUI" NUNCA VIRA "NADA ACHADO" (P146): a recusa ou o formato inesperado dizem "Não consegui procurar" e oferecem de novo.
 * ⚠ LAYOUT FIXO: a linha do campo e o quadro de 6 linhas têm altura fixa — nada se desloca entre "antes de procurar", "procurando",
 *   "nada achado" e a lista. Na tabela, texto = uma linha com "…" e o inteiro no `title`. A FRASE (a faixa amarela e a do D1) é a 1ª
 *   linha DO QUADRO: fora de tabela o "…" reprova (o gate de 29/10 a pegou), dentro dela é a regra de corte.
 * ⚠ O QUADRO TEM PISO (`PISO_DO_QUADRO`): abaixo dele rola na horizontal dentro da caixa (os cabeçalhos não vazam em 750px); o cabeçalho
 *   só fica PRESO quando o quadro rola de fato (mais de 6 linhas) — preso num quadro que não rola, dentro de um que rola, é vão.
 */
import { useState, type Ref } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { dataBR } from '@/lib/datas/dataBR';
import { fmtBRL } from '@/components/conciliacao/TabelaExtratoDoMes';
import { nomeDoHistorico } from '@/lib/conciliacao/nomeDoHistorico';
import {
  lerResultado, fraseDaFaixa, modeloDoAchado, contagemDosAchados, ONDE_TODOS,
  type ModeloDoHistorico, type OndeProcurar, type ResultadoDoHistorico,
} from '@/lib/conciliacao/procurarNoHistorico';

interface Props {
  clienteId: string | null;
  movimento: { data: string | null; historico: string | null; valor: number };
  onCriarIgual: (m: ModeloDoHistorico) => void;
  /** P159f — o campo da busca, para quem monta pôr o cursor nele (o modal sem sugestão automática) */
  campoRef?: Ref<HTMLInputElement>;
}

const ROTULO: Record<OndeProcurar, string> = { banco: 'texto do banco', descricao: 'descrição', fornecedor: 'fornecedor' };
/* Pgto. 70 (dd/mm/aaaa inteira) · banco, descrição e fornecedor dividem o resto · Subcentro 110 · Fazenda 80 · Conta 80 · Valor 96
   (o teto) · Criar igual 64 */
const COLUNAS: readonly (number | null)[] = [70, null, null, null, 110, 80, 80, 96, 64];
const CAB = ['Pgto.', 'O que o banco disse', 'Descrição', 'Fornecedor', 'Subcentro', 'Fazenda', 'Conta', 'Valor', ''];
const LINHAS_A_VISTA = 6;
/* as fixas (500) + 3 × 100 para banco, descrição e fornecedor (o cabeçalho "O que o banco disse" pede 97) */
const PISO_DO_QUADRO = 800;
const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');

type Estado =
  | { tipo: 'antes' }
  | { tipo: 'procurando' }
  | { tipo: 'falhou'; motivo: string }
  | { tipo: 'pronto'; termo: string; r: ResultadoDoHistorico };

export function ProcurarNoHistorico({ clienteId, movimento, onCriarIgual, campoRef }: Props) {
  const nomeDoBanco = nomeDoHistorico(movimento.historico, movimento.data);
  const ano = Number((movimento.data ?? '').slice(0, 4)) || new Date().getFullYear();
  const [termo, setTermo] = useState(nomeDoBanco);
  const [onde, setOnde] = useState<ReadonlySet<OndeProcurar>>(new Set(ONDE_TODOS));
  const [desdeAno, setDesdeAno] = useState(ano);
  const [estado, setEstado] = useState<Estado>({ tipo: 'antes' });

  const podeProcurar = !!clienteId && termo.trim().length >= 2 && onde.size > 0 && estado.tipo !== 'procurando';

  const procurar = async () => {
    if (!podeProcurar || !clienteId) return;
    const t = termo.trim();
    setEstado({ tipo: 'procurando' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_conciliacao_historico_buscar', {
      p_cliente: clienteId, p_termo: t, p_onde: ONDE_TODOS.filter((o) => onde.has(o)),
      p_de: `${desdeAno}-01-01`, p_ate: movimento.data ?? null, p_valor: movimento.valor,
    });
    if (error) { console.error('[ProcurarNoHistorico]', error); setEstado({ tipo: 'falhou', motivo: 'o banco recusou a busca' }); return; }
    const r = lerResultado(data);
    if (!r) { console.error('[ProcurarNoHistorico] resposta inesperada', data); setEstado({ tipo: 'falhou', motivo: 'a resposta veio num formato inesperado' }); return; }
    setEstado({ tipo: 'pronto', termo: t, r });
  };

  const alternar = (o: OndeProcurar) => setOnde((s) => {
    const n = new Set(s); if (n.has(o)) n.delete(o); else n.add(o); return n;
  });

  const faixa = estado.tipo === 'pronto' ? fraseDaFaixa(estado.termo, estado.r.resumo) : null;
  const frase = faixa ?? (!nomeDoBanco && estado.tipo === 'antes' ? 'o banco não trouxe o nome: digite' : null);
  const contagem = estado.tipo === 'pronto' ? contagemDosAchados(estado.r) : estado.tipo === 'procurando' ? 'procurando…' : '';
  const linhasNoQuadro = (frase ? 1 : 0) + (estado.tipo === 'pronto' ? Math.max(1, estado.r.achados.length) : estado.tipo === 'falhou' ? 1 : 0);

  return (
    <div className="mt-2" data-testid="procurar-historico">
      {/* a linha do campo: altura fixa, nada quebra */}
      <div className="flex h-[24px] items-center gap-1.5 text-[10px]">
        <span className="shrink-0 font-semibold text-foreground">Procurar no histórico</span>
        <Input ref={campoRef} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="nome do fornecedor ou do banco"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void procurar(); } }}
          className="h-[22px] w-auto min-w-[80px] max-w-[200px] flex-1 px-1.5 text-[10px]" data-testid="procurar-historico-termo" aria-label="Procurar no histórico" />
        {ONDE_TODOS.map((o) => (
          <label key={o} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground">
            <Checkbox checked={onde.has(o)} onCheckedChange={() => alternar(o)} className="h-3 w-3" data-testid={`procurar-onde-${o}`} />
            {ROTULO[o]}
          </label>
        ))}
        <button type="button" onClick={() => setDesdeAno((a) => (a === ano ? ano - 1 : ano))} data-testid="procurar-periodo"
          className="shrink-0 whitespace-nowrap rounded border px-1.5 leading-[18px] text-muted-foreground hover:bg-muted"
          title={desdeAno === ano ? `Procurar também em ${ano - 1}` : `Procurar só a partir de ${ano}`}>
          desde jan/{desdeAno}
        </button>
        <button type="button" onClick={() => void procurar()} disabled={!podeProcurar} data-testid="procurar-historico-botao"
          className="shrink-0 rounded bg-primary px-2 leading-[20px] font-semibold text-primary-foreground disabled:opacity-50">
          Procurar
        </button>
        {/* a contagem tem lugar reservado: "procurando…", "N achados" e vazio ocupam o mesmo (vazio = um espaço fixo: sem texto o span
            perde a linha e desce 7,5px — o desloca pegou) */}
        <span className="ml-auto w-[96px] shrink-0 truncate text-right tabular-nums text-muted-foreground" title={contagem || undefined}
          data-testid="procurar-historico-contagem">{contagem || '\u00a0'}</span>
      </div>

      {/* ⚠ o quadro de 6 linhas: ALTURA fixa (22 do cabeçalho + 6 × 19), o vazio fica dentro; mais de 6 rola aqui dentro */}
      <div className="mt-1 overflow-auto rounded-sm border" style={{ height: 22 + LINHAS_A_VISTA * 19 + 2 }}>
        <table className="w-full table-fixed border-collapse text-[10px]" style={{ minWidth: PISO_DO_QUADRO }}>
          <colgroup>{COLUNAS.map((w, i) => <col key={i} style={w == null ? undefined : { width: w }} />)}</colgroup>
          <thead className={cn('z-10 bg-primary text-primary-foreground', linhasNoQuadro > LINHAS_A_VISTA && 'sticky top-0')}>
            <tr className="h-[22px]">
              {CAB.map((t, i) => (
                <th key={i} className={cn('px-[4px] text-[9.5px] font-medium whitespace-nowrap', i === 7 ? 'text-right' : 'text-left')}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frase && (
              <tr className="h-[19px]">
                <td colSpan={9} className={cn('truncate px-[4px] text-[9.5px]', faixa ? 'bg-amber-50 text-amber-800' : 'text-muted-foreground')}
                  title={frase} data-testid="procurar-historico-frase">{frase}</td>
              </tr>
            )}
            {estado.tipo === 'falhou' && (
              <tr className="h-[19px]">
                <td colSpan={9} className="truncate px-[4px] text-muted-foreground">
                  Não consegui procurar: {estado.motivo}.{' '}
                  <button type="button" onClick={() => void procurar()} className="font-semibold text-[#1d4ed8] underline underline-offset-2">Tentar de novo</button>
                </td>
              </tr>
            )}
            {estado.tipo === 'pronto' && estado.r.achados.length === 0 && (
              <tr className="h-[19px]"><td colSpan={9} className="px-[4px] italic text-muted-foreground">nada achado com "{estado.termo}"</td></tr>
            )}
            {estado.tipo === 'pronto' && estado.r.achados.map((a) => (
              <tr key={a.lancamentoId} className="h-[19px] border-b border-border/40" data-testid="procurar-historico-achado">
                <td className="px-[4px] whitespace-nowrap tabular-nums text-muted-foreground">{dataBR(a.dataPagamento)}</td>
                <td className="truncate px-[4px]" title={a.banco ?? undefined}>{a.banco ?? '—'}</td>
                <td className="truncate px-[4px]" title={a.descricao ?? undefined}>{a.descricao ?? '—'}</td>
                <td className="truncate px-[4px]" title={a.fornecedor ?? undefined}>{a.fornecedor ?? '—'}</td>
                <td className="truncate px-[4px]" title={[a.centro, a.subcentro].filter(Boolean).join(' · ') || undefined}>{a.subcentro ?? '—'}</td>
                <td className="truncate px-[4px]" title={a.fazenda ?? undefined}>{a.fazenda ?? '—'}</td>
                <td className="truncate px-[4px]" title={a.conta ?? undefined}>{a.conta ?? '—'}</td>
                <td className={cn('px-[4px] whitespace-nowrap text-right tabular-nums', corVal(a.valor))}>{fmtBRL(a.valor)}</td>
                <td className="px-[4px] text-right">
                  <button type="button" onClick={() => onCriarIgual(modeloDoAchado(a))} data-testid="procurar-criar-igual"
                    className="whitespace-nowrap text-[10px] font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af]">
                    Criar igual
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
