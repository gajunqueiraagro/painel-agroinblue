/**
 * CONC-CRIAR-COM-NOTA-02 E2 (homologação 09:48, caso Edson: 5 NFs num PIX de −6.000,00) — o "Casar com o banco" com N lançamentos é uma
 * TABELA, UMA LINHA POR LANÇAMENTO (o desenho do Casar do mock do processo do Code 2, `fin-baixa-01-processo-v2` p2b): o EXTRATO numa faixa
 * de largura total em cima; Venc. · Descrição · Fornecedor · NF · Status · Valor · Aplicado (editável) · Fica (inteira / parcial · falta /
 * a mais) · ✕; o rodapé com o total aplicado × o extrato × a diferença.
 * Só DESENHA: o valor de cada campo e o remover são do modal (o mesmo estado `levados`, o mesmo Conciliar — nada de regra nova de gravação).
 * Regra de corte: tabela — texto com "…" e o inteiro no `title`; número, valor, data e NF nunca cortam (larguras medidas para o teto).
 * CONC-CASAR-1X1-TABELA-01 (Gabriel 19/11 07:23, caso Luiz Gustavo) — o 1:1 usa ESTA tabela (uma linha) e ela ganhou Faz. (código, o nome no
 * `title`) · Ativ. (Pec./Agri./Adm./Silv., do escopo do plano) · Plano (o subcentro). Com NF o Aplicado é o valor da NF e não se edita (R2).
 * CONC-SUGESTOES-V2 C (mock aprovado 25/11): fonte 11px, linha 26px, cabeçalho 10px SEM caixa alta; Venc. · Pgto. · Δ dias logo no começo; o
 * EXTRATO é a 1ª linha DA MESMA GRADE ("Banco": Pgto. = a data do banco, o nome sem caixa alta, o CNPJ na coluna Fornecedor, Valor sob Valor);
 * vencimento ESTIMADO (nada o declara, lote 114390) = "~" cinza itálico e Δ dias neutro.
 */
import type { ReactNode } from 'react';
import { nomeDoHistorico, documentoDoHistorico, formatarDocumento } from '@/lib/conciliacao/nomeDoHistorico';
import { nomeDoExtratoSemCaixa } from '@/lib/conciliacao/motorAmpliado';
import { cn } from '@/lib/utils';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { STATUS_FILTRO_LABEL, STATUS_PALETA } from '@/lib/financeiro/statusFinanceiro';

export interface LinhaDoLevado {
  lancamento_id: string; data_vencimento?: string | null; descricao: string | null; fornecedor?: string | null;
  numero_documento?: string | null; status_transacao?: string | null; valor_assinado: number; valorTexto: string;
  /** CONC-CASAR-1X1-TABELA-01 — a fazenda (código; o nome no title), a atividade (escopo do plano) e o plano (subcentro) */
  fazendaCodigo?: string | null; fazendaNome?: string | null; escopoNegocio?: string | null; subcentro?: string | null;
  /** R2 — com NF o aplicado é o valor da NF: o campo não se edita (a diferença se resolve na caixa da NF) */
  travadoNaNf?: boolean;
  /** CONC-SUGESTOES-V2 C — vencimento estimado (nenhum boleto, duplicata, cartão ou contrato o declara) */
  vencEstimado?: boolean;
}
/** a atividade curta pelo escopo do plano (o mesmo vocabulário da barra de atividade do seletor de conta) */
export function atividadeCurta(escopo: string | null | undefined): string {
  const e = (escopo ?? '').trim().toLowerCase();
  if (e === 'pecuaria') return 'Pec.';
  if (e === 'agricultura') return 'Agri.';
  if (e === 'administrativo') return 'Adm.';
  if (e === 'silvicultura') return 'Silv.';
  return '—';
}
/* as larguras: Venc. dd/mm/aaaa 72 · NF 000.000.000 84 · Faz. 40 · Ativ. 38 · Plano 140 · Status 76 · Valor/Aplicado "99.999.999,99" 96/124 · Fica "parcial · falta 99.999.999,99" */
/* ajuste 2 (OK do Edson): sem vão entre Fica e ✕ — o ✕ vai NA célula do Fica, logo depois do selo; a coluna tem a largura do MAIOR texto que o
   conjunto pode mostrar ("parcial · falta <o maior valor>"), fixa enquanto se edita (nada anda); a sobra vai para a Descrição */
/* CONC-SUGESTOES-V2 C: + Pgto. 72 e Δ dias 40 depois do Venc.; a 11px as datas pedem 70, o Fornecedor e o Plano cedem (120 cada) */
/* gate 26/11 (814px: a Descrição ficava com 2px; 1126: 35px): datas a 10px (régua) — Venc. 70 (o estimado "~dd/mm/aaaa" itálico pede 70), Pgto. 62;
   Δ dias 32, NF 76 (só na larga), Status 70, Valor 92, Aplicado 94; na larga Fornecedor 104 e Plano 84 (texto: "…" e o inteiro no title) */
export const COLUNAS_DOS_LEVADOS: readonly (number | null)[] = [70, 62, 32, null, 104, 76, 40, 38, 84, 70, 92, 94];
/* CASAR-1X1 abaixo de 1000px (a regra do P101; o gate de 19/11 15:20: a 750 e 814 a tabela ficava mais larga que o modal, rolava de lado
   e o foco no Aplicado deslocava tudo) — saem Fornecedor · Faz. · Ativ. · Plano (índices abaixo) e o `title` da Descrição leva os quatro.
   A conta a 750: o modal tem 712 − 24 de recuo = 688px; sem as 4 ficam 452 + o Fica, e a Descrição ainda tem ~100px. */
/* gate 26/11: com Pgto. e Δ dias (C) a larga a 1000px deixava a Descrição com 6px — as colunas extras só de 1100px (1126/1280 seguem largas) */
export const LARGURA_MINIMA_DAS_COLUNAS_EXTRAS = 1100;
/* gate 26/11: abaixo de 1000px também sai a NF (vai ao `title` da Descrição, como Fornecedor · Faz. · Ativ. · Plano) — a 750 a Descrição pede os 76px */
const SO_NA_JANELA_LARGA: readonly number[] = [4, 5, 6, 7, 8];
/** a largura do Fica + ✕ para este conjunto: o selo mais largo possível (10px tabular ≈ 5,6 px por caractere + recuos) + o ✕ */
export function larguraDoFica(levados: readonly { valor_assinado: number }[]): number {
  const maior = Math.max(0, ...levados.map((l) => Math.abs(l.valor_assinado)));
  const texto = `parcial · falta ${fmt(maior)}`;
  /* a 11px ≈ 6,2 px por caractere */
  return Math.ceil(texto.length * 6.2) + 12 + 20;
}
const PALETA: Record<string, { texto: string } | undefined> = {
  previsto: STATUS_PALETA.previsto, programado: STATUS_PALETA.programado, agendado: STATUS_PALETA.agendado,
  realizado: STATUS_PALETA.realizado, conciliado: STATUS_PALETA.conciliado,
};
export const TITULO_ESTIMADO = 'Vencimento estimado: nenhum boleto, duplicata da NF, cartão ou contrato o declara (foi digitado ou sugerido).';
/** pgto. no banco − vencimento, em dias (− = pago antes) */
export function deltaDias(banco: string | null | undefined, venc: string | null | undefined): number | null {
  if (!banco || !venc) return null;
  return Math.round((Date.parse(banco.slice(0, 10)) - Date.parse(venc.slice(0, 10))) / 86400000);
}
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
export const valorDoCampo = (t: string) => Number(t.replace(/\./g, '').replace(',', '.')) || 0;

/** o que fica de cada lançamento depois do casar: inteira (aplicado = valor), parcial (falta), a mais (aplicado > valor) */
export function oQueFica(valor: number, aplicado: number): { texto: string; classe: string; tipo: 'inteira' | 'parcial' | 'a_mais' } {
  const d = Math.round((Math.abs(aplicado) - Math.abs(valor)) * 100) / 100;
  if (Math.abs(d) < 0.005) return { tipo: 'inteira', texto: 'inteira', classe: 'bg-emerald-50 text-emerald-700' };
  if (d < 0) return { tipo: 'parcial', texto: `parcial · falta ${fmt(-d)}`, classe: 'bg-amber-50 text-amber-800' };
  return { tipo: 'a_mais', texto: `a mais ${fmt(d)}`, classe: 'bg-rose-50 text-rose-700' };
}

export function TabelaDosLevados({ extrato, nomeConta, levados, onValor, onRemover, somenteLeitura, rotuloDoCampo, acaoNoCampo }: {
  extrato: { data: string | null; historico: string | null; valor: number };
  nomeConta?: string | null;
  levados: readonly LinhaDoLevado[];
  onValor: (id: string, texto: string) => void;
  onRemover: (id: string) => void;
  /** o campo que não se edita (ex.: o juro do pós-fixado, que o banco diz) */
  somenteLeitura?: (id: string) => boolean;
  rotuloDoCampo?: (l: LinhaDoLevado) => string;
  /** o gesto do modal colado ao campo (o "absorver a diferença", ⇆) */
  acaoNoCampo?: (l: LinhaDoLevado) => ReactNode;
}) {
  const aplicado = levados.reduce((t, l) => t + valorDoCampo(l.valorTexto), 0);
  const banco = Math.abs(extrato.valor);
  const dif = Math.round((aplicado - banco) * 100) / 100;
  const inteiras = levados.filter((l) => oQueFica(l.valor_assinado, valorDoCampo(l.valorTexto)).tipo === 'inteira').length;
  const parciais = levados.filter((l) => oQueFica(l.valor_assinado, valorDoCampo(l.valorTexto)).tipo === 'parcial').length;
  /* CONC-SUGESTOES-V2 C (régua UI-FONTES-REGUA-01): cabeçalho 10px sem caixa alta, 22px; linha 26px a 11px */
  const th = 'h-[22px] px-1 text-[10px] font-semibold leading-tight';
  const larga = useLarguraDaJanela() >= LARGURA_MINIMA_DAS_COLUNAS_EXTRAS;
  const colunas = COLUNAS_DOS_LEVADOS.filter((_, i) => larga || !SO_NA_JANELA_LARGA.includes(i));
  /* estreita: o `title` da Descrição leva o que saiu da linha */
  const tituloDaDescricao = (l: LinhaDoLevado, nf?: string | null): string | undefined => {
    if (larga) return l.descricao ?? undefined;
    const partes = [l.descricao ?? '—'];
    if (nf && nf !== '—') partes.push(`NF: ${nf}`);
    if (l.fornecedor) partes.push(`Fornecedor: ${l.fornecedor}`);
    if (l.fazendaCodigo || l.fazendaNome) partes.push(`Fazenda: ${l.fazendaNome || l.fazendaCodigo}`);
    if (l.escopoNegocio) partes.push(`Atividade: ${atividadeCurta(l.escopoNegocio)}`);
    if (l.subcentro) partes.push(`Plano: ${l.subcentro}`);
    return partes.join(' · ');
  };
  const cor = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
  const nomeDoBanco = nomeDoExtratoSemCaixa(extrato.historico, nomeDoHistorico(extrato.historico, extrato.data));
  const doc = documentoDoHistorico(extrato.historico);
  const docDoBanco = doc ? formatarDocumento(doc) : '';
  return (
    <div className="space-y-1.5" data-testid="tabela-dos-levados">
      <table className="w-full table-fixed border-separate border-spacing-0 text-[11px]" data-testid="levados-tabela">
        <colgroup>{colunas.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}<col style={{ width: larguraDoFica(levados) }} /></colgroup>
        <thead><tr className="bg-primary text-primary-foreground">
          <th className={cn(th, 'text-center')}>Venc.</th><th className={cn(th, 'text-center')}>Pgto.</th>
          <th className={cn(th, 'text-right')} title="dias entre o pagamento no banco e o vencimento (− = antes; ~ = vencimento estimado)">Δ dias</th>
          <th className={cn(th, 'text-left')}>Descrição</th>{larga && <th className={cn(th, 'text-left')}>Fornecedor</th>}
          {larga && <th className={cn(th, 'text-right')}>NF</th>}
          {larga && <><th className={cn(th, 'text-center')}>Faz.</th><th className={cn(th, 'text-center')}>Ativ.</th><th className={cn(th, 'text-left')}>Plano</th></>}
          <th className={cn(th, 'text-center')}>Status</th><th className={cn(th, 'text-right')}>Valor</th>
          <th className={cn(th, 'text-right')}>Aplicado</th><th className={cn(th, 'text-left')}>Fica</th>
        </tr></thead>
        <tbody>
          {/* o EXTRATO: a 1ª linha da MESMA grade (ALINHAMENTO SOBERANO: data sob data, valor sob valor) */}
          <tr className="h-[28px] bg-[#eaf0fa] font-semibold" data-testid="levados-extrato">
            {/* a linha do banco não tem vencimento: a célula DECLARA (`data-sem-data`, a exceção do gate de datas) e mostra o selo "Banco" */}
            <td className="border-b-2 border-primary px-1" data-sem-data=""><span className="rounded-[3px] bg-primary px-1 text-[9.5px] font-bold leading-[13px] text-primary-foreground">Banco</span></td>
            <td className="whitespace-nowrap border-b-2 border-primary px-1 text-center text-[10px] tabular-nums">{dataBR(extrato.data)}</td>
            <td className="border-b-2 border-primary" />
            <td className="truncate border-b-2 border-primary px-1"
              title={[nomeDoBanco, extrato.historico].filter((x, i, a) => !!x && a.indexOf(x) === i).join('\n') || undefined}
              data-testid="levados-extrato-historico">{nomeDoBanco || extrato.historico || '—'}</td>
            {larga && <td className="whitespace-nowrap border-b-2 border-primary px-1 text-[9px] tabular-nums" data-testid="levados-extrato-documento">{docDoBanco}</td>}
            {larga && <td className="border-b-2 border-primary" />}
            {larga && <><td className="border-b-2 border-primary" /><td className="border-b-2 border-primary" /><td className="border-b-2 border-primary" /></>}
            <td className="border-b-2 border-primary" />
            <td className={cn('whitespace-nowrap border-b-2 border-primary px-1 text-right tabular-nums', cor(extrato.valor))} data-testid="levados-extrato-valor">{fmt(extrato.valor)}</td>
            <td className="border-b-2 border-primary" /><td className="border-b-2 border-primary" />
          </tr>
          {levados.length === 0 && (
            <tr className="h-[26px]"><td colSpan={colunas.length + 1} className="px-1 italic text-muted-foreground" data-testid="levados-vazio">nenhum lançamento levado</td></tr>
          )}
          {levados.map((l) => {
            const st = (l.status_transacao ?? '').trim().toLowerCase();
            const fica = oQueFica(l.valor_assinado, valorDoCampo(l.valorTexto));
            const nf = l.numero_documento ? (formatNFNumber(l.numero_documento) || l.numero_documento) : '—';
            const dd = deltaDias(extrato.data, l.data_vencimento);
            return (
              <tr key={l.lancamento_id} className="h-[26px] border-b" data-testid="levado-linha">
                {l.vencEstimado
                  /* o "~" é desenho (CSS), fora do texto: a célula segue uma data dd/mm/aaaa para quem lê e para o gate */
                  ? <td className="whitespace-nowrap border-b px-1 text-center text-[10px] italic tabular-nums text-muted-foreground before:content-['~']" title={TITULO_ESTIMADO} data-testid="levado-linha-venc-estimado">{dataBR(l.data_vencimento)}</td>
                  : <td className="whitespace-nowrap border-b px-1 text-center text-[10px] tabular-nums">{dataBR(l.data_vencimento)}</td>}
                <td className="whitespace-nowrap border-b px-1 text-center text-[10px] tabular-nums text-muted-foreground" title="a data do pagamento no banco">{dataBR(extrato.data)}</td>
                <td className={cn('whitespace-nowrap border-b px-1 text-right tabular-nums', l.vencEstimado || dd == null ? 'text-muted-foreground' : dd < 0 ? 'text-sky-700' : dd > 0 ? 'text-amber-700' : 'text-emerald-700')}
                  title={l.vencEstimado ? `contra vencimento estimado — ${TITULO_ESTIMADO}` : undefined} data-testid="levado-linha-delta-dias">
                  {dd == null ? '—' : `${dd > 0 ? '+' : dd < 0 ? '−' : ''}${Math.abs(dd)}`}</td>
                <td className="truncate border-b px-1" title={tituloDaDescricao(l, nf)} data-testid="levado-linha-descricao">{l.descricao ?? '—'}</td>
                {larga && <td className="truncate border-b px-1 text-muted-foreground" title={l.fornecedor ?? undefined} data-testid="levado-linha-fornecedor">{l.fornecedor || '—'}</td>}
                {larga && <td className="whitespace-nowrap border-b px-1 text-right tabular-nums" data-testid="levado-linha-nf">{nf}</td>}
                {larga && <>
                  <td className="whitespace-nowrap border-b px-1 text-center" title={l.fazendaNome ?? undefined} data-testid="levado-linha-fazenda">{l.fazendaCodigo || '—'}</td>
                  <td className="whitespace-nowrap border-b px-1 text-center" data-testid="levado-linha-atividade">{atividadeCurta(l.escopoNegocio)}</td>
                  <td className="truncate border-b px-1" title={l.subcentro ?? undefined} data-testid="levado-linha-plano">{l.subcentro || '—'}</td>
                </>}
                <td className={cn('whitespace-nowrap border-b px-1 text-center font-medium', PALETA[st]?.texto ?? 'text-muted-foreground')}>
                  {st ? (STATUS_FILTRO_LABEL[st] ?? l.status_transacao) : '—'}
                </td>
                <td className={cn('whitespace-nowrap border-b px-1 text-right tabular-nums', cor(l.valor_assinado))}>{fmt(l.valor_assinado)}</td>
                <td className="border-b px-0.5"><div className="flex items-center gap-0.5">
                  <input value={l.valorTexto} readOnly={l.travadoNaNf || somenteLeitura?.(l.lancamento_id)} inputMode="decimal"
                    title={l.travadoNaNf ? 'Com NF, o aplicado é o valor da NF e não muda: a diferença se resolve na caixa da NF, embaixo.' : undefined}
                    data-travado={l.travadoNaNf ? 'nf' : undefined}
                    onChange={(e) => onValor(l.lancamento_id, e.target.value)}
                    aria-label={rotuloDoCampo?.(l) ?? `Valor aplicado em ${l.descricao ?? 'lançamento'}`}
                    className={cn('h-[22px] w-full min-w-0 rounded border px-1 text-right text-[11px] font-medium tabular-nums', cor(l.valor_assinado),
                      l.travadoNaNf && 'cursor-not-allowed bg-muted')}
                    data-testid="levado-linha-aplicado" />
                  {acaoNoCampo?.(l)}
                </div></td>
                <td className="whitespace-nowrap border-b px-1">
                  <span className={cn('whitespace-nowrap rounded px-1.5 py-[1px] text-[11px] tabular-nums', fica.classe)} data-testid="levado-linha-fica">{fica.texto}</span>
                  <button type="button" onClick={() => onRemover(l.lancamento_id)} aria-label={`Remover ${l.descricao ?? 'lançamento'} deste casamento`}
                    title="Tira este lançamento do casamento. Nada é apagado." className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    data-testid="levado-linha-remover">✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* o rodapé: total aplicado × extrato × diferença (o que o Conciliar vai conferir) */}
      <table className="w-full table-fixed border-separate border-spacing-0 rounded bg-primary text-[11px] text-primary-foreground" data-testid="levados-rodape">
        <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 70 }} /><col style={{ width: 120 }} /><col style={{ width: 80 }} /><col style={{ width: 110 }} /></colgroup>
        <tbody><tr className="h-[28px]">
          <td className="truncate px-2" title={`${levados.length} lançamentos · ${inteiras} inteiras · ${parciais} parciais`}>
            {levados.length} lançamento{levados.length === 1 ? '' : 's'} · {inteiras} inteira{inteiras === 1 ? '' : 's'}{parciais ? ` + ${parciais} parcial${parciais === 1 ? '' : 's'}` : ''}
          </td>
          <td className="whitespace-nowrap px-1 text-right">aplicado <b className="tabular-nums" data-testid="levados-total-aplicado">{fmt(aplicado)}</b></td>
          <td className="px-1 text-right opacity-80">extrato</td>
          <td className="whitespace-nowrap px-1 text-right font-semibold tabular-nums">{fmt(banco)}</td>
          <td className="px-1 text-right opacity-80">diferença</td>
          <td className={cn('whitespace-nowrap px-2 text-right font-semibold tabular-nums', Math.abs(dif) < 0.005 ? 'text-emerald-300' : 'text-amber-300')}
            data-testid="levados-diferenca">{fmt(dif)}</td>
        </tr></tbody>
      </table>
    </div>
  );
}

