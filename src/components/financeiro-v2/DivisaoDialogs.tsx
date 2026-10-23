/**
 * OS MODAIS DA CLASSIFICACAO DIVIDIDA — FIN-CLASSIF-DIVIDIDA-01b. Tamanho fixo, sem rolagem (a tabela das partes tem a fonte menor e
 * so' rola dentro do quadro alem de ~18 linhas).
 *   · `MotivoDaDivisaoDialog`: o motivo obrigatorio de toda operacao (dividir pelos itens, voltar para 1 conta, desfazer), com a previa
 *     do banco (a RPC simulada) e a recusa dele, pronta;
 *   · `DividirClassificacaoDialog`: dividir a mao, por valor ou por %; numa parcela de compra parcelada/financiamento a divisao e' do
 *     CADASTRO (so' %, todas as parcelas levam a mesma proporcao — o aviso diz). O primeiro clique simula (a frase do banco), o segundo grava.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Segmentado } from '@/components/ui/segmentado';
import { CampoMoeda, CampoPercentual } from '@/components/ui/campo-moeda';
import { EscolherConta } from '@/components/shared/EscolherConta';
import { atividadeValida } from '@/components/shared/ClassificacaoLancamento';
import type { Atividade } from '@/lib/financeiro/ultimaAtividade';
import { QUADRO_REGUA } from '@/components/ui/regua-tabela';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { dividir, type ParteNova, type RespostaDaDivisao, type ResultadoDaDivisao } from '@/lib/financeiro/divisaoDaClassificacao';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';

type Resultado = ResultadoDaDivisao;

export function MotivoDaDivisaoDialog({ titulo, explicacao, botao, simular, confirmar, onClose }: {
  titulo: string;
  explicacao: string;
  botao: string;
  /** a previa do banco (sem gravar); a frase dele aparece acima do motivo */
  simular?: () => Promise<Resultado>;
  confirmar: (motivo: string) => Promise<Resultado>;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (simular) void simular().then((r) => { if (!vivo) return; if (r.ok === false) setErro(r.frase); else setPrevia([r.valor.frase, r.valor.fraseNota].filter(Boolean).join(' ') || null); });
    return () => { vivo = false; };
  }, [simular]);
  const ir = async () => {
    if (!motivo.trim() || gravando) return;
    setGravando(true); setErro(null);
    try {
      const r = await confirmar(motivo.trim());
      if (r.ok === false) { setErro(r.frase); return; }
      onClose();
    } finally { setGravando(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(270px,95vh)] w-[min(480px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="divisao-motivo">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{explicacao}</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <p className="shrink-0 text-muted-foreground">{explicacao}</p>
          <p className="h-[30px] shrink-0 overflow-hidden rounded-md border bg-card px-2 py-1 text-[10px] leading-[12px]" data-testid="divisao-previa" title={previa ?? undefined}>
            {previa ?? (simular && !erro ? 'Conferindo no banco…' : '')}
          </p>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)" className="min-h-0 flex-1 resize-none text-[10.5px]" data-testid="divisao-motivo-texto" />
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="divisao-erro" title={erro ?? undefined}>{erro ? `⚠ ${erro}` : ''}</span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[170px] shrink-0 px-2.5 text-[10.5px]" disabled={!motivo.trim() || gravando}
            onClick={() => { void ir(); }} data-testid="divisao-confirmar">{gravando ? 'Gravando…' : botao}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface LinhaDaParte { chave: number; plano: string; valor: number | null; percentual: number | null }
const TD = 'h-[22px] px-1 py-0 text-[10px] leading-none';

function ContaDaParte({ valor, classificacoes, tipoOperacao, onEscolher, chave, atividadeSugerida }: {
  valor: string; classificacoes: ClassificacaoItem[]; tipoOperacao: string; onEscolher: (p: string) => void; chave: number; atividadeSugerida: Atividade | null;
}) {
  /* SELETOR-CONTA-POR-ATIVIDADE-01 — o `EscolherConta` (a atividade primeiro, nascendo da conta da parte) */
  return (
    <div data-testid={`dividir-conta-${chave}`}>
      <EscolherConta valor={valor} onEscolher={(c) => onEscolher(c.id)} classificacoes={classificacoes} tipoOperacao={tipoOperacao} atividadeSugerida={atividadeSugerida}
        triggerClassName="h-[20px] px-1.5 text-[10px] [&_svg]:h-3 [&_svg]:w-3" itemClassName="text-[10.5px]" />
    </div>
  );
}

export function DividirClassificacaoDialog({ clienteId, lancamento, classificacoes, partesDeHoje, onDividido, onClose }: {
  clienteId: string;
  lancamento: { id: string; valor: number; tipo_operacao: string; financiamento_id: string | null; plano_conta_id: string | null };
  classificacoes: ClassificacaoItem[];
  /** as partes de hoje (dividido) — ou nenhuma (a conta de hoje entra como a primeira) */
  partesDeHoje: readonly { plano_conta_id: string; valor: number; percentual: number }[];
  onDividido: (r: RespostaDaDivisao) => void;
  onClose: () => void;
}) {
  const total = Math.abs(lancamento.valor);
  /* a parte sem conta abre a barra na atividade da conta de hoje do lancamento */
  const atividadeDoLancamento = atividadeValida(classificacoes.find((c) => c.id === lancamento.plano_conta_id)?.escopo_negocio);
  const doCadastro = !!lancamento.financiamento_id;
  const [modo, setModo] = useState<'valor' | 'percentual'>(doCadastro ? 'percentual' : 'valor');
  const [linhas, setLinhas] = useState<LinhaDaParte[]>(() => (partesDeHoje.length
    ? partesDeHoje.map((p, k) => ({ chave: k, plano: p.plano_conta_id, valor: p.valor, percentual: Math.round(p.percentual * 100) / 100 }))
    : [{ chave: 0, plano: lancamento.plano_conta_id ?? '', valor: total, percentual: 100 }, { chave: 1, plano: '', valor: null, percentual: null }]));
  const [motivo, setMotivo] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const mexeu = () => { setPrevia(null); setErro(null); };
  const somaValor = Math.round(linhas.reduce((s, l) => s + (l.valor ?? 0), 0) * 100) / 100;
  const somaPct = Math.round(linhas.reduce((s, l) => s + (l.percentual ?? 0), 0) * 10000) / 10000;
  const falta = modo === 'valor' ? Math.round((total - somaValor) * 100) / 100 : Math.round((100 - somaPct) * 10000) / 10000;
  const partes: ParteNova[] = linhas.filter((l) => l.plano).map((l) => (modo === 'valor'
    ? { plano_conta_id: l.plano, valor: l.valor ?? 0 } : { plano_conta_id: l.plano, percentual: l.percentual ?? 0 }));
  const pronto = partes.length >= 2 && partes.length === linhas.length && falta === 0 && motivo.trim().length > 0;
  const alvo = { lancamentoId: lancamento.id, financiamentoId: lancamento.financiamento_id };

  const ir = async () => {
    if (!pronto || gravando) return;
    setGravando(true); setErro(null);
    try {
      if (!previa) {
        const s = await dividir(clienteId, alvo, partes, motivo.trim(), true);
        if (s.ok === false) { setErro(s.frase); return; }
        setPrevia(s.valor.frase ?? (doCadastro ? 'Todas as parcelas recebem esta proporção.' : 'Confira e confirme.'));
        return;
      }
      const r = await dividir(clienteId, alvo, partes, motivo.trim(), false);
      if (r.ok === false) { setErro(r.frase); setPrevia(null); return; }
      onDividido(r.valor);
      onClose();
    } finally { setGravando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(500px,95vh)] w-[min(700px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="dividir-classificacao">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Dividir a classificação</DialogTitle>
          <DialogDescription className="sr-only">Divide a classificação do lançamento em contas, por valor ou por percentual.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="flex h-[24px] shrink-0 items-center gap-2">
            <Segmentado<'valor' | 'percentual'> altura={22} valor={modo} onEscolher={(m) => { setModo(m); mexeu(); }}
              opcoes={doCadastro ? [{ valor: 'percentual', rotulo: '%' }] : [{ valor: 'valor', rotulo: 'Por valor' }, { valor: 'percentual', rotulo: 'Por %' }]} />
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">Lançamento <b className="text-foreground">{formatMoeda(total)}</b></span>
            <span className={cn('ml-auto whitespace-nowrap tabular-nums', falta === 0 ? 'text-emerald-700' : 'text-amber-800')} data-testid="dividir-soma">
              {falta === 0 ? '✓ soma = valor do lançamento' : modo === 'valor' ? `faltam ${formatMoeda(falta)}` : `faltam ${falta.toLocaleString('pt-BR')}%`}
            </span>
          </div>
          {doCadastro && (
            <p className="flex h-[22px] shrink-0 items-center rounded-md border border-sky-200 bg-sky-50 px-2 text-[10px] text-sky-900" data-testid="dividir-aviso-parcelas">
              <span className="min-w-0 uma-linha-que-rola">Compra parcelada: a divisão é do cadastro — todas as parcelas recebem a mesma proporção.</span>
            </p>
          )}
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed border-collapse">
                <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 70 }} /><col style={{ width: 26 }} /></colgroup>
                <thead className="bg-primary"><tr>
                  {['Conta', modo === 'valor' ? 'Valor' : '%', modo === 'valor' ? '%' : 'Valor', ''].map((h, k) => (
                    <th key={k} className={cn('h-[18px] px-1 text-[9.5px] font-medium text-primary-foreground', k === 0 ? 'text-left' : 'text-right')}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {linhas.map((l) => {
                    const outro = modo === 'valor'
                      ? (l.valor != null && total ? `${((l.valor * 100) / total).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—')
                      : (l.percentual != null ? formatMoeda(Math.round(total * l.percentual) / 100) : '—');
                    return (
                      <tr key={l.chave} className="border-b border-border/50" data-testid="dividir-linha">
                        <td className={TD}>
                          <ContaDaParte chave={l.chave} valor={l.plano} classificacoes={classificacoes} tipoOperacao={lancamento.tipo_operacao} atividadeSugerida={atividadeDoLancamento}
                            onEscolher={(p) => { setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, plano: p } : x))); mexeu(); }} />
                        </td>
                        <td className={TD}>
                          {modo === 'valor'
                            ? <CampoMoeda valor={l.valor} onChange={(v) => { setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, valor: v } : x))); mexeu(); }} className="h-[20px] text-[10px]" />
                            : <CampoPercentual valor={l.percentual} onChange={(v) => { setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, percentual: v } : x))); mexeu(); }} className="h-[20px] text-[10px]" />}
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap text-right tabular-nums text-muted-foreground')}>{outro}</td>
                        <td className={cn(TD, 'text-center')}>
                          <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-30" aria-label="Tirar a conta" disabled={linhas.length <= 2}
                            onClick={() => { setLinhas((ls) => ls.filter((x) => x.chave !== l.chave)); mexeu(); }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-[20px] px-2 text-[10px]" disabled={linhas.length >= 18} data-testid="dividir-mais"
              onClick={() => { setLinhas((ls) => [...ls, { chave: Math.max(...ls.map((x) => x.chave)) + 1, plano: '', valor: null, percentual: null }]); mexeu(); }}>+ conta</Button>
            <span className="min-w-0 uma-linha-que-rola text-[10px] text-muted-foreground" data-testid="dividir-previa" title={previa ?? undefined}>{previa ?? 'Continua um lançamento só: um pagamento, um vencimento, uma conciliação.'}</span>
          </div>
          <Textarea value={motivo} onChange={(e) => { setMotivo(e.target.value); mexeu(); }} placeholder="Motivo (obrigatório)" className="h-[40px] min-h-0 shrink-0 resize-none text-[10.5px]" data-testid="dividir-motivo" />
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="dividir-erro" title={erro ?? undefined}>{erro ? `⚠ ${erro}` : ''}</span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[170px] shrink-0 px-2.5 text-[10.5px]" disabled={!pronto || gravando} onClick={() => { void ir(); }} data-testid="dividir-confirmar">
            {gravando ? 'Conferindo…' : previa ? 'Confirmar a divisão' : `Dividir em ${linhas.length} contas`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
