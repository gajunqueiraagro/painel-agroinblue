/**
 * NOTA-LIGAR-LANCAMENTO-01 P1–P3 (Gabriel 11/11, OK 10:42) — no "Novo documento" que LÊ a nota, entre a faixa "Lido da nota" e os campos:
 * · P1 a linha da FILIAL: a nota é de outra filial (ou de outro fornecedor) que a do lançamento, nomeando os dois CNPJs. "Trocar para a
 *   filial da nota" = a `fn_lancamentos_trocar_favorecido` (prévia → confirmar; trilha e desfazer na Troca em lote); a filial fora do
 *   cadastro = "Cadastrar esta filial" (o CNPJ conferido no banco antes, a criação do hospedeiro, os dados da nota no cadastro).
 * · P2 o QUADRO Nota × lançamento: as duplicatas da nota e quem paga cada uma (este lançamento · outro lançamento · liberação de contrato ·
 *   ninguém ainda). A regra é a `quadroNotaXLancamento`; quem achou os outros é o `fn_nota_ja_lancada`. Só mostra: nada se grava.
 * · P3 a PARTICIPAÇÃO deste lançamento na nota, sugerida = lançamento ÷ nota (o operador muda); quem grava é o Registrar do documento.
 * Consulta que falha DIZ que falhou (P146) — nunca "ninguém paga".
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { QUADRO_REGUA, TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { avisoDeFilial, quadroNotaXLancamento, type LiberacaoDireta, type QuemPaga } from '@/lib/financeiro/nfe/notaXLancamento';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import { completarCadastroPeloXml, fornecedorPeloDocumento, liberacoesDiretasDoFornecedor, notaJaLancada } from '@/lib/financeiro/nfeConsultas';
import { aplicarTroca, simularTroca } from '@/lib/financeiro/trocarFornecedor';
import { validarDocumento } from '@/lib/fornecedores/documentoFiscal';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';

const reais = (cent: number) => (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const data = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const ROTULO_DO_STATUS: Record<string, string> = { realizado: 'pago', conciliado: 'conciliado', programado: 'programado', agendado: 'agendado', previsto: 'previsto' };
/** até 3 duplicatas à vista; mais que isso rola dentro do quadro (a altura é fixa: o modal não cresce com a nota) */
const LINHAS_A_VISTA = 3;

export interface LancamentoDoQuadro {
  /** `null` = o lançamento ainda não foi salvo (sem trocar) */
  id: string | null;
  valorCent: number | null;
  vencimento: string | null;
  competencia: string | null;
  fornecedor: { id: string; nome: string; documento: string | null } | null;
}

interface TextoDeQuem { texto: string; title: string; tom: 'este' | 'ok' | 'falta' }
const lendo = (falha: boolean): TextoDeQuem => ({ texto: falha ? '—' : 'lendo…', title: falha ? 'não consegui verificar' : 'lendo', tom: 'ok' });
function textoDeQuem(q: QuemPaga, l: LancamentoDoQuadro, vencimento: string | null): TextoDeQuem {
  if (q.tipo === 'este') {
    const outroVenc = !!vencimento && !!l.vencimento && vencimento !== l.vencimento;
    return { texto: outroVenc ? `este lançamento · venc. no lançamento ${data(l.vencimento)}` : 'este lançamento',
      title: outroVenc ? `A duplicata vence em ${data(vencimento)}; o lançamento está com ${data(l.vencimento)}. Só aviso: nada muda sozinho.` : 'Este lançamento paga esta duplicata (mesmo valor).', tom: 'este' };
  }
  if (q.tipo === 'outro') {
    const s = q.status ? ROTULO_DO_STATUS[q.status] ?? q.status : null;
    const t = `outro lançamento · ${q.descricao ?? '—'}${s ? ` · ${s}` : ''}`;
    return { texto: t, title: t, tom: 'ok' };
  }
  if (q.tipo === 'liberacao') {
    const t = `liberação do contrato ${q.contrato ?? '(sem nº)'} · ${data(q.data)}`;
    return { texto: t, title: `${t} — o banco paga direto ao fornecedor: não é conta a pagar do cliente`, tom: 'ok' };
  }
  return { texto: 'ninguém ainda', title: 'Nenhum lançamento nem liberação de contrato com este valor perto deste vencimento.', tom: 'falta' };
}

export function NotaXLancamentoQuadro({ clienteId, nota, notaFornecedorId, lancamento, participacaoPct, participacaoPadrao, onParticipacao, onTrocado,
  onCriarFornecedor, onCadastrado }: {
  clienteId: string;
  nota: NotaLida;
  /** o cadastro com o CNPJ exato da nota (`null` = não há) */
  notaFornecedorId: string | null;
  lancamento: LancamentoDoQuadro;
  /** P3 — `null` = o lançamento paga a nota inteira (sem campo) */
  participacaoPct: number | null;
  participacaoPadrao: number | null;
  onParticipacao: (pct: number) => void;
  /** a troca gravou: o lançamento agora é deste fornecedor */
  onTrocado: (fornecedorId: string, nome: string) => void;
  /** a criação de cadastro do hospedeiro (a do "+ novo fornecedor"); ausente = sem "Cadastrar esta filial" */
  onCriarFornecedor?: (nome: string, cpfCnpj: string) => Promise<{ id: string; nome: string } | string>;
  onCadastrado: (fornecedorId: string) => void;
}) {
  const filial = avisoDeFilial({ notaDocumento: nota.emitente.documento, notaFornecedorId,
    lancamento: lancamento.fornecedor ? { id: lancamento.fornecedor.id, documento: lancamento.fornecedor.documento } : null });

  /* P2 — quem paga as outras duplicatas: os achados do banco e as liberações diretas (lidos juntos) */
  const [donos, setDonos] = useState<{ outros: LancamentoJaLancado[]; liberacoes: LiberacaoDireta[] } | null>(null);
  const [falha, setFalha] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    setDonos(null); setFalha(false);
    const parcelas = nota.duplicatas.length
      ? nota.duplicatas.map((d, i) => ({ n: i + 1, vencimento: d.vencimento, valorCent: d.valorCent }))
      : [{ n: 1, vencimento: nota.emissao, valorCent: nota.totais.notaCent }];
    void Promise.all([
      notaJaLancada(clienteId, { parcelas, numero: nota.numero || null, chave: nota.chave || null, emitenteDocumento: nota.emitente.documento || null,
        nomes: [nota.emitente.nome, nota.emitente.fantasia], lancamento: lancamento.id }),
      liberacoesDiretasDoFornecedor(clienteId, nota.emitente.documento),
    ]).then(([o, l]) => {
      if (!vivo) return;
      if (o.ok === false || l.ok === false) { setFalha(true); return; }
      setDonos({ outros: o.valor, liberacoes: l.valor });
    });
    return () => { vivo = false; };
  }, [clienteId, nota, lancamento.id, tentativa]);
  const quadro = quadroNotaXLancamento({ duplicatas: nota.duplicatas, notaCent: nota.totais.notaCent, emissao: nota.emissao || null,
    lancamento: { id: lancamento.id, valorCent: lancamento.valorCent, data: lancamento.vencimento }, outros: donos?.outros ?? [], liberacoes: donos?.liberacoes ?? [] });

  /* P1 — trocar: a prévia do banco, depois confirmar */
  const [troca, setTroca] = useState<{ fase: 'previa' | 'gravando'; frase: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const podeTrocar = filial?.tipo === 'outra-filial' && !!lancamento.id && !!notaFornecedorId;
  const simular = async () => {
    if (!lancamento.id || !notaFornecedorId) return;
    setOcupado(true); setErro(null);
    try {
      const r = await simularTroca(clienteId, [lancamento.id], notaFornecedorId);
      if ('erro' in r) { setErro(r.erro); return; }
      if (!r.ok || r.recusa) { setErro(r.recusa ?? 'O banco recusou a troca.'); return; }
      const avisos = [r.conciliados ? 'conciliado (o vínculo com o extrato fica)' : null, r.mesesFechados.length ? 'em mês fechado' : null].filter(Boolean).join(' · ');
      setTroca({ fase: 'previa', frase: `O lançamento passa da filial ${filial?.lancamentoFinal} para a ${filial?.notaFinal}${avisos ? ` · ${avisos}` : ''}. Só o fornecedor muda.` });
    } finally { setOcupado(false); }
  };
  const confirmar = async () => {
    if (!lancamento.id || !notaFornecedorId) return;
    setOcupado(true); setErro(null);
    try {
      const r = await aplicarTroca(clienteId, [lancamento.id], notaFornecedorId, `NF ${formatNFNumber(nota.numero) || nota.numero} é da filial ${filial?.notaFinal}`);
      if ('erro' in r) { setErro(r.erro); return; }
      if (!r.ok || r.recusa) { setErro(r.recusa ?? 'O fornecedor não foi trocado.'); return; }
      setTroca(null);
      toast.success(`Fornecedor trocado para a filial ${filial?.notaFinal}.`);
      onTrocado(notaFornecedorId, nota.emitente.nome);
    } finally { setOcupado(false); }
  };
  /* P1 — a filial fora do cadastro: o CNPJ conferido no BANCO antes (a lista pode estar velha), a criação do hospedeiro e os dados da nota */
  const cadastrar = async () => {
    if (!onCriarFornecedor) return;
    setOcupado(true); setErro(null);
    try {
      const ja = await fornecedorPeloDocumento(clienteId, nota.emitente.documento);
      if (ja.ok === false) { setErro(`Não consegui conferir o CNPJ no cadastro (${ja.motivo}). Nada foi gravado.`); return; }
      if (ja.valor) { onCadastrado(ja.valor.id); return; }
      const novo = await onCriarFornecedor(nota.emitente.nome, validarDocumento(nota.emitente.documento).formatado ?? nota.emitente.documento);
      if (typeof novo === 'string') { setErro(novo); return; }
      const e = await completarCadastroPeloXml(clienteId, novo.id, nota.emitente);
      if (e) toast.error(`Filial cadastrada, mas os dados da nota não foram gravados nela: ${e}`);
      onCadastrado(novo.id);
    } finally { setOcupado(false); }
  };

  const nLinhas = Math.min(LINHAS_A_VISTA, quadro.linhas.length);
  return (
    <div className="flex flex-col gap-1" data-testid="nota-x-lancamento">
      {filial && (
        <div className={cn('flex h-[24px] items-center gap-2 rounded border px-2 text-[10px] leading-[14px]',
          filial.tipo === 'outro-fornecedor' ? 'border-red-200 bg-red-50 text-destructive' : 'border-amber-300 bg-amber-50 text-amber-900')}
          role="alert" data-testid="nota-filial" data-tipo={filial.tipo}>
          <span className="min-w-0 flex-1 truncate" title={troca?.frase ?? erro ?? filial.frase}>{troca?.frase ?? (erro ? `${filial.frase} ${erro}` : filial.frase)}</span>
          {troca ? (<>
            <Button type="button" variant="ghost" className="h-[20px] shrink-0 px-2 text-[10px]" onClick={() => setTroca(null)} disabled={ocupado}>Voltar</Button>
            <Button type="button" className="h-[20px] shrink-0 px-2 text-[10px]" onClick={() => { void confirmar(); }} disabled={ocupado} data-testid="nota-filial-confirmar">
              {ocupado ? 'Trocando…' : 'Confirmar a troca'}</Button>
          </>) : podeTrocar ? (
            <Button type="button" variant="outline" className="h-[20px] shrink-0 px-2 text-[10px]" onClick={() => { void simular(); }} disabled={ocupado} data-testid="nota-filial-trocar"
              title="Troca o fornecedor DESTE lançamento para o cadastro da filial da nota (prévia antes; desfaz pela Troca de fornecedor)">
              Trocar para a filial da nota</Button>
          ) : filial.tipo === 'filial-fora-do-cadastro' && onCriarFornecedor ? (
            <Button type="button" variant="outline" className="h-[20px] shrink-0 px-2 text-[10px]" onClick={() => { void cadastrar(); }} disabled={ocupado} data-testid="nota-filial-cadastrar"
              title="Cria o cadastro desta filial (mesma razão social, o CNPJ da nota); depois dá para trocar o lançamento para ela">
              {ocupado ? 'Cadastrando…' : 'Cadastrar esta filial'}</Button>
          ) : filial.tipo === 'outra-filial' && !lancamento.id ? (
            <span className="shrink-0 text-muted-foreground">troque o fornecedor do lançamento</span>
          ) : null}
        </div>
      )}
      <div className={cn(QUADRO_REGUA, 'h-auto')}>
        <div className="overflow-y-auto" style={{ height: 22 + nLinhas * 19 }} data-testid="nota-x-lancamento-tabela">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 70 }} /><col style={{ width: 78 }} /><col style={{ width: 92 }} /><col /></colgroup>
            <thead className="sticky top-0 z-10 bg-primary">
              <tr>
                <th className={cn(TH_REGUA, 'pl-2 text-left')}>Duplicata</th>
                <th className={cn(TH_REGUA, 'text-left')}>Venc.</th>
                <th className={cn(TH_REGUA, 'text-right')}>Valor</th>
                <th className={cn(TH_REGUA, 'pl-2 text-left')}>Quem paga</th>
              </tr>
            </thead>
            <tbody>
              {quadro.linhas.map((d, i) => {
                const q = donos || d.quem.tipo === 'este' ? textoDeQuem(d.quem, lancamento, d.vencimento) : lendo(falha);
                return (
                  <tr key={`${d.numero}-${i}`} className="border-b border-border/50" data-testid="nota-x-linha" data-quem={d.quem.tipo}>
                    <td className={cn(TD_REGUA, 'pl-2 tabular-nums')}>{d.numero === 'nota' ? 'à vista' : d.numero}</td>
                    <td className={cn(TD_REGUA, 'tabular-nums')}>{data(d.vencimento)}</td>
                    <td className={TD_REGUA_NUM}>{reais(d.valorCent)}</td>
                    <td className={cn(TD_REGUA, 'pl-2')}>
                      <span className={cn('block truncate', q.tom === 'este' && 'font-semibold text-sky-900', q.tom === 'falta' && 'text-amber-800')} title={q.title}>{q.texto}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* o rodapé: a nota, o que ninguém paga ainda e a participação deste lançamento (P3) — cada um no seu lugar */}
        <div className="grid h-[24px] shrink-0 items-center gap-3 border-t px-2 text-[10px]" style={{ gridTemplateColumns: 'auto auto minmax(0, 1fr) auto' }}
          data-testid="nota-x-rodape">
          <span className="whitespace-nowrap">nota <b className="tabular-nums">{reais(quadro.notaCent)}</b></span>
          <span className={cn('whitespace-nowrap', quadro.semDonoCent > 0 && donos ? 'text-amber-800' : 'text-muted-foreground')} data-testid="nota-x-sem-dono">
            {falha ? (
              <span className="text-destructive">Não consegui verificar quem paga as outras · <button type="button" className="underline underline-offset-2" onClick={() => setTentativa((t) => t + 1)}>tentar de novo</button></span>
            ) : !donos ? 'lendo…' : quadro.semDonoCent > 0 ? <>sem quem pague <b className="tabular-nums">{reais(quadro.semDonoCent)}</b></> : 'todas com quem pague'}
          </span>
          <span className="min-w-0 truncate text-amber-800" data-testid="nota-x-este-sem-duplicata"
            title={quadro.esteSemDuplicata && lancamento.valorCent ? `O lançamento (R$ ${reais(lancamento.valorCent)}) não tem o valor de nenhuma duplicata desta nota.` : undefined}>
            {quadro.esteSemDuplicata && lancamento.valorCent ? `o lançamento (${reais(lancamento.valorCent)}) não bate com nenhuma duplicata` : ''}
          </span>
          {participacaoPct !== null ? (
            <label className="flex items-center gap-1 whitespace-nowrap" data-testid="nota-x-participacao"
              title={`A parte desta nota que este lançamento paga${participacaoPadrao !== null ? ` (sugerido: ${participacaoPadrao}% = lançamento ÷ nota)` : ''}. A nota fica anexada inteira.`}>
              participação
              <CampoNumeroComConta valor={participacaoPct} casas={0} percentual className="h-[20px] w-[52px] text-right text-[10px]"
                onChange={(n) => { if (n !== null && n >= 1 && n <= 100) onParticipacao(Math.round(n)); }} />
              % da nota
            </label>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}
