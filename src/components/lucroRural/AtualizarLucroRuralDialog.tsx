/**
 * FIN-LR-SYNC-01 passo b — o modal "Atualizar do Lucro Rural" (aberto por Conciliação › Importar Banco). Junta as peças:
 * lê os dois relatórios do LR (`lerArquivoLr`, o leitor do a1), compara (`compararComLr` -> `fn_lr_sync_comparar`), mostra a tela
 * (`TelaAtualizarLr`) e aplica / desfaz pelo hook do a2 (`aplicarLr`, `desfazerLr`). Nenhuma regra mora aqui.
 *
 * ⚠ TAMANHO FIXO: a página não rola; a tabela rola por dentro. ⚠ A pasta Downloads automática é o passo c: aqui o operador
 *   arrasta ou escolhe os dois arquivos.
 * ⚠ As tabelas `lr_*` e `financeiro_safras` são lidas com `(supabase as any).from` (fora do `types.ts`; regenerar os tipos tira o
 *   cast) — o idioma declarado da casa para tabela nova.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { loadContasDoPlanoDoCliente } from '@/lib/financeiro/planoContasBuilder';
import { notificarLancamentosMudaram, type ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import { lerArquivoLr, type LinhaLr } from '@/v2/lib/lucroRural/lerArquivoLr';
import { lerEnvelopeLr, type EnvelopeLr } from '@/v2/lib/lucroRural/telaLr';
import { compararComLr } from '@/v2/hooks/useLrSyncComparar';
import { aplicarLr, type DecisaoLr, type ResultadoLr } from '@/v2/hooks/useLrSyncAplicar';
import { REGRA_ARQUIVOS_LR, TelaAtualizarLr, type ArquivoLrNaTela } from './TelaAtualizarLr';
import { HistoricoLucroRural } from './HistoricoLucroRural';
import { PastaDownloadsLr } from './PastaDownloadsLr';
import { fonteDoNavegador, type FontePastaLr } from '@/v2/lib/lucroRural/pastaDownloads';
import { textoDoTamanho } from '@/v2/lib/lucroRural/pastaLr';

interface ArquivoLido extends ArquivoLrNaTela { linhasLr: LinhaLr[] }

const dataDoArquivo = (f: File) => {
  const d = new Date(f.lastModified);
  return Number.isFinite(d.getTime()) ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}` : null;
};

export function AtualizarLucroRuralDialog({ open, onOpenChange, fontePasta }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  /** Para teste: a pasta Downloads (o padrão é a do navegador, passo c). */
  fontePasta?: FontePastaLr;
}) {
  const fonte = useMemo(() => fontePasta ?? fonteDoNavegador(), [fontePasta]);
  /* passo c — os arquivos vieram da pasta? (mostra "trocar arquivos" e o aviso da data); `manual` = o operador trocou: não lê a pasta sozinho */
  const [daPasta, setDaPasta] = useState(false);
  const [avisoPasta, setAvisoPasta] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const [arquivos, setArquivos] = useState<ArquivoLido[]>([]);
  const [envelope, setEnvelope] = useState<EnvelopeLr | null>(null);
  const [lendo, setLendo] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [historico, setHistorico] = useState(false);
  const [historicoQtde, setHistoricoQtde] = useState(0);
  const [classificacoes, setClassificacoes] = useState<ClassificacaoItem[]>([]);
  const [escopoPlano, setEscopoPlano] = useState<Map<string, string | null>>(new Map());
  const [escopoSafra, setEscopoSafra] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!open || !clienteId) return;
    let vivo = true;
    void loadContasDoPlanoDoCliente(clienteId).then(cs => {
      if (!vivo) return;
      setClassificacoes(cs.filter(c => c.subcentro).map(c => ({
        id: c.id, subcentro: c.subcentro ?? '', centro_custo: c.centro_custo, grupo_custo: c.grupo_custo ?? '', macro_custo: c.macro_custo,
        tipo_operacao: c.tipo_operacao, escopo_negocio: c.escopo_negocio ?? '', compoe_dre: c.compoe_dre, ordem_exibicao: c.ordem_exibicao,
      })));
      setEscopoPlano(new Map(cs.map(c => [c.id, c.escopo_negocio ?? null])));
    }).catch(() => undefined);
    void (supabase as any).from('financeiro_safras').select('id, escopo_negocio').eq('cliente_id', clienteId)
      .then(({ data }: { data: { id: string; escopo_negocio: string | null }[] | null }) => {
        if (vivo) setEscopoSafra(new Map((data ?? []).map(s => [s.id, s.escopo_negocio])));
      });
    void (supabase as any).from('lr_sync_aplicacoes').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId)
      .then(({ count }: { count: number | null }) => { if (vivo) setHistoricoQtde(count ?? 0); });
    return () => { vivo = false; };
  }, [open, clienteId, historico]);

  const comparar = useCallback(async (lidos: ArquivoLido[]) => {
    if (!clienteId) return;
    setLendo(true); setRecado(null);
    try {
      const r = await compararComLr(clienteId, crypto.randomUUID(), lidos.flatMap(a => a.linhasLr));
      if (r.ok === false) { setRecado(r.frase); return; }
      const env = lerEnvelopeLr(r.envelope);
      if (!env) { setRecado('Resposta inesperada do banco: compare de novo.'); return; }
      setEnvelope(env);
    } finally { setLendo(false); }
  }, [clienteId]);

  const receberArquivos = async (fs: File[], compararAgora = true) => {
    setRecado(null);
    const lidos: ArquivoLido[] = [];
    for (const f of fs) {
      const r = lerArquivoLr(await f.arrayBuffer(), f.name);
      if (r.ok === false) { setRecado(`${f.name}: ${r.motivo}`); return; }
      lidos.push({ tipo: r.tipo, nome: f.name, data: dataDoArquivo(f), linhas: r.linhas.length, tamanho: f.size, linhasLr: r.linhas });
    }
    /* um arquivo de cada lado: o mais novo de cada tipo vale (trocar só um mantém o outro) */
    const junto = [...arquivos.filter(a => !lidos.some(l => l.tipo === a.tipo)), ...lidos]
      .filter((a, i, arr) => arr.findIndex(b => b.tipo === a.tipo) === i).sort((a, b) => a.tipo.localeCompare(b.tipo));
    setArquivos(junto);
    if (compararAgora) await comparar(junto);
  };
  const receberRef = useRef(receberArquivos);
  receberRef.current = receberArquivos;
  const daPastaAchados = useCallback((fs: File[], completos: boolean, aviso: string | null) => {
    setDaPasta(true); setAvisoPasta(aviso);
    void receberRef.current(fs, completos);
  }, []);
  const trocarArquivos = () => { setEnvelope(null); setArquivos([]); setDaPasta(false); setAvisoPasta(null); setManual(true); setRecado(null); };
  const extraArquivos = daPasta ? (
    <span className="flex min-w-0 items-center gap-2 text-[10px]">
      {avisoPasta && <span className="truncate text-[#b45309]" data-testid="aviso-data-relatorio" title={avisoPasta}>{avisoPasta}</span>}
      <button type="button" className="shrink-0 text-primary underline" data-testid="trocar-arquivos" onClick={trocarArquivos}>trocar arquivos</button>
    </span>
  ) : null;

  const chamar = (simular: boolean) => async (decisoes: DecisaoLr[]): Promise<ResultadoLr> => {
    if (!clienteId || !envelope) { const sem: ResultadoLr = { ok: false, frase: 'Sem cliente.' }; return sem; }
    const r = await aplicarLr(clienteId, envelope.sessao, decisoes, simular);
    if (r.ok && !simular) notificarLancamentosMudaram(clienteId);
    return r;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-32px)] w-[1100px] max-w-[calc(100vw-32px)] flex-col gap-0 overflow-hidden p-0" data-testid="modal-atualizar-lr">
        <DialogTitle className="sr-only">Atualizar do Lucro Rural</DialogTitle>
        {historico && clienteId ? (
          <HistoricoLucroRural clienteId={clienteId} clienteNome={clienteAtual?.nome ?? ''} onVoltar={() => setHistorico(false)} />
        ) : envelope && clienteId ? (
          <TelaAtualizarLr key={envelope.sessao} envelope={envelope} clienteNome={clienteAtual?.nome ?? ''} clienteId={clienteId}
            arquivos={arquivos} classificacoes={classificacoes} fazendas={fazendas}
            escopoDoPlano={id => escopoPlano.get(id)} escopoDaSafra={id => escopoSafra.get(id)}
            onTrocarArquivos={fs => void receberArquivos(fs)} historicoQtde={historicoQtde} onAbrirHistorico={() => setHistorico(true)}
            simular={chamar(true)} gravar={chamar(false)} onCancelar={() => onOpenChange(false)}
            onGravado={() => void comparar(arquivos)} extraArquivos={extraArquivos} />
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
              <span className="text-[13px] font-semibold">Atualizar do Lucro Rural</span>
              <span className="rounded-full bg-white/15 px-2 text-[10px]">{clienteAtual?.nome ?? ''}</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <PastaDownloadsLr fonte={fonte} auto={!manual} onAchados={daPastaAchados} onEsquecida={() => setDaPasta(false)} />
              <div className="flex h-5 items-center gap-2 text-[10px]" data-testid="arquivos-lidos">
                {arquivos.map(a => (
                  <span key={a.tipo} className="rounded border border-[#86efac] bg-[#f0fdf4] px-1.5" title={a.nome}>
                    {a.tipo === 'pagar' ? 'Contas a pagar' : 'Contas a receber'} · {a.linhas} linhas{a.tamanho != null ? ` · ${textoDoTamanho(a.tamanho)}` : ''}
                  </span>
                ))}
              </div>
              <AreaDeArquivo regra={REGRA_ARQUIVOS_LR} modo="lote" className="h-24 w-[520px]" testId="area-arquivos-lr"
                convite="Clique ou arraste os dois relatórios do LR (contas a pagar e a receber, unificado)" detalhe="Excel"
                desabilitado={lendo || !clienteId} motivoDesabilitado={lendo ? 'Lendo e comparando…' : 'Escolha um cliente'}
                onArquivos={fs => void receberArquivos(fs)} />
              <span className="h-4 text-[11px] text-destructive" data-testid="recado-lr">{recado ?? ''}</span>
              <button type="button" className="text-[10px] text-primary underline" onClick={() => setHistorico(true)}>
                Histórico e desfazer ({historicoQtde})
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
