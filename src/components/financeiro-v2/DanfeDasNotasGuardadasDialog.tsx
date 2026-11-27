/**
 * O DANFE DAS NOTAS JÁ GUARDADAS — NOTA-RECEITA-DANFE-ANEXO-01 (Gabriel 19/11: todo XML sem PDF, Receita + importados, como gesto com
 * prévia). O molde é o "Itens das notas já guardadas" (ITENS-NOTA-01):
 *   1. Simular — baixa cada XML sem PDF e gera o DANFE na memória; diz quantos saem (nada é gravado);
 *   2. Gerar e anexar — grava o PDF nos documentos do lançamento do XML e o liga aos mesmos lançamentos (`danfeDaCandidata`).
 * UI-LARGURA-FIXA-01: o modal, as colunas e o quadro têm tamanho FIXO (o corpo rola dentro do quadro), qualquer que seja o número de notas.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QUADRO_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { buscarNaReceitaPelaChave, horaCurta, proximaBuscaDoTitular, candidatasDoDanfe, danfeDaCandidata, FRASE_SEM_XML, titularesComCertificado, type CandidataDoDanfe, type ResultadoDoDanfe } from '@/lib/fiscal/danfeDasNotasGuardadas';
import { numeroDaNota } from '@/lib/financeiro/nfe/formatos';
import { dataBR } from '@/lib/datas/dataBR';
import { cn } from '@/lib/utils';

interface Linha { c: CandidataDoDanfe; r: ResultadoDoDanfe | null; gravada: boolean }
/* FILA 12:04: a Situação curta ("sem XML guardado" cabe inteira) + a coluna da ação ("Buscar na Receita") */
const COLUNAS = [88, 78, null, 52, 64, 150, 112];
const colgroup = <colgroup>{COLUNAS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>;
const kb = (b: number) => `${Math.max(1, Math.round(b / 1024)).toLocaleString('pt-BR')} KB`;

export function DanfeDasNotasGuardadasDialog({ clienteId, onClose, ler = candidatasDoDanfe, gerar = danfeDaCandidata,
  titulares = titularesComCertificado, buscar = buscarNaReceitaPelaChave, proxima = proximaBuscaDoTitular }: {
  clienteId: string;
  onClose: () => void;
  /** a bancada e os testes injetam */
  ler?: typeof candidatasDoDanfe;
  gerar?: (clienteId: string, c: CandidataDoDanfe, simular: boolean) => Promise<ResultadoDoDanfe>;
  /** quem pode consultar a nota pela chave (produtor com certificado ativo) e a consulta — a bancada e os testes injetam */
  titulares?: (clienteId: string) => Promise<string[]>;
  buscar?: (titularId: string, chave: string) => Promise<{ ok: boolean; frase: string }>;
  /** BLOQUEIO-01 — quando o produtor pode pedir de novo (null = já pode) */
  proxima?: (titularId: string) => Promise<string | null>;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [fase, setFase] = useState<'lendo' | 'pronto' | 'simulando' | 'gravando'>('lendo');
  const [simulado, setSimulado] = useState(false);
  const [frase, setFrase] = useState<string | null>(null);
  const [comCertificado, setComCertificado] = useState<string | null>(null);
  const [buscando, setBuscando] = useState<string | null>(null);
  /* BLOQUEIO-01: antes da hora liberada pela Receita, o botão diz "próxima às HH:MM" e não chama */
  const [proximaEm, setProximaEm] = useState<string | null>(null);
  useEffect(() => { let vivo = true; if (comCertificado) void proxima(comCertificado).then((p) => { if (vivo) setProximaEm(p); }); return () => { vivo = false; }; },
    [comCertificado, proxima, buscando]);
  useEffect(() => { let vivo = true; void titulares(clienteId).then((t) => { if (vivo) setComCertificado(t[0] ?? null); }); return () => { vivo = false; }; },
    [clienteId, titulares]);
  /* "Buscar na Receita" (a nota sem XML guardado): a consulta pela chave traz o XML para a caixa da Receita; depois, a linha gera de novo (simulação) */
  const buscarNaReceita = async (i: number) => {
    if (!linhas || !comCertificado) return;
    const c = linhas[i].c;
    setBuscando(c.chave); setFrase(null);
    try {
      const r = await buscar(comCertificado, c.chave);
      setFrase(`NF ${c.doc.numero ? numeroDaNota(c.doc.numero) : '—'}: ${r.frase}`);
      if (r.ok) { const g = await gerar(clienteId, c, true); setLinhas((l) => (l ? l.map((x, k) => (k === i ? { ...x, r: g } : x)) : l)); }
    } finally { setBuscando(null); }
  };

  useEffect(() => {
    let vivo = true;
    void ler(clienteId).then((r) => {
      if (!vivo) return;
      if (r.ok === false) { setFrase(r.motivo); setLinhas([]); } else setLinhas(r.valor.map((c) => ({ c, r: null, gravada: false })));
      setFase('pronto');
    });
    return () => { vivo = false; };
  }, [clienteId, ler]);

  const rodar = async (simular: boolean) => {
    if (!linhas) return;
    setFase(simular ? 'simulando' : 'gravando'); setFrase(null);
    const saida = [...linhas];
    for (let i = 0; i < saida.length; i += 1) {
      if (!simular && (saida[i].gravada || saida[i].r?.ok === false)) continue;
      const r = await gerar(clienteId, saida[i].c, simular);
      saida[i] = { ...saida[i], r, gravada: !simular && r.ok === true };
      setLinhas([...saida]);
    }
    if (simular) setSimulado(true);
    else setFrase(`${saida.filter((l) => l.gravada).length} DANFEs anexados. Cada um está na aba Documentos do lançamento (cancelar = o ✕ de lá).`);
    setFase('pronto');
  };
  const total = linhas?.length ?? 0;
  const saem = linhas?.filter((l) => l.r?.ok === true).length ?? 0;
  const falham = linhas?.filter((l) => l.r?.ok === false).length ?? 0;
  const gravadas = linhas?.filter((l) => l.gravada).length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && (fase === 'pronto' || fase === 'lendo')) onClose(); }}>
      {/* FILA 12:04: o tamanho e o cabeçalho PADRÃO dos modais de lista (o das Notas da Receita/Caixa: 1100×560, faixa de 34px, o ✕ no centro dela) */}
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(1100px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground" data-testid="danfe-guardadas">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10">
          <DialogTitle className="text-[11px] font-semibold text-primary-foreground">DANFE das notas já guardadas</DialogTitle>
          <DialogDescription className="sr-only">Gera o DANFE em PDF das notas guardadas só em XML: simular e depois gerar e anexar.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="flex h-5 shrink-0 items-center gap-3 tabular-nums" data-testid="danfe-guardadas-contagem">
            {fase === 'lendo' ? <span className="text-muted-foreground">Procurando as notas só em XML…</span> : <>
              <span>{total} {total === 1 ? 'nota só em XML' : 'notas só em XML'}</span>
              {simulado && <><span className="text-[#1f7a45]">{saem} geram o PDF</span><span className={falham ? 'text-amber-800' : 'text-muted-foreground'}>{falham} sem leitura</span></>}
              {gravadas > 0 && <span className="text-[#1f7a45]">{gravadas} anexados</span>}
              {!simulado && <span className="text-muted-foreground">Simular gera os PDFs e mostra o que sai; nada é gravado.</span>}
            </>}
          </div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">{colgroup}
              <thead><tr>{['Nota', 'Emissão', 'Emitente', 'Lanç.', 'PDF', 'Situação', 'Ação'].map((h, i) => (
                <th key={h} className={cn(TH_REGUA, i === 3 || i === 4 ? 'text-right' : 'text-left')}>{h}</th>))}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed border-collapse">{colgroup}
                <tbody>
                  {(linhas ?? []).map((l, i) => (
                    <tr key={l.c.chave} className="h-[19px] border-b border-border/50" data-testid="danfe-guardadas-linha">
                      <td className={TD_REGUA_NUM}>{l.c.doc.numero ? numeroDaNota(l.c.doc.numero) : '—'}</td>
                      <td className={TD_REGUA}>{dataBR(l.c.doc.data_emissao)}</td>
                      <td className={TD_REGUA_TEXTO} title={l.c.doc.emitente_nome ?? undefined}>{l.c.doc.emitente_nome ?? '—'}</td>
                      <td className={TD_REGUA_NUM} title="Os lançamentos que recebem o PDF (o do XML e os ligados a ele)">{1 + l.c.ligados.length}</td>
                      <td className={TD_REGUA_NUM}>{l.r?.ok === true ? kb(l.r.bytes) : '—'}</td>
                      <td className={cn(TD_REGUA_TEXTO, l.r?.ok === false && 'text-amber-800')} title={l.r?.ok === false ? l.r.frase : undefined}>
                        {l.gravada ? 'anexado' : l.r == null ? (fase === 'simulando' ? 'na fila' : 'só XML') : l.r.ok === false ? l.r.frase : 'gera o PDF (simulação)'}
                      </td>
                      <td className={TD_REGUA}>
                        {l.r?.ok === false && l.r.frase === FRASE_SEM_XML && (
                          <button type="button" className="h-[16px] w-[104px] whitespace-nowrap rounded-[3px] border border-primary/40 bg-card px-1 text-[9.5px] font-semibold text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!comCertificado || buscando !== null || fase !== 'pronto' || !!proximaEm} data-testid="danfe-buscar-receita" onClick={() => { void buscarNaReceita(i); }}
                            title={comCertificado ? 'Consulta a nota pela chave na Receita (o XML completo). A próxima busca automática deste produtor espera 1 h.' : 'Sem certificado A1 ativo: cadastre o certificado do produtor para buscar pela chave.'}>
                            {buscando === l.c.chave ? 'Buscando…' : proximaEm ? `próxima às ${horaCurta(proximaEm)}` : 'Buscar na Receita'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {linhas && linhas.length === 0 && (
                    <tr><td colSpan={7} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Nenhuma nota guardada só em XML.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={frase ?? undefined} data-testid="danfe-guardadas-frase">{frase ?? ''}</span>
          <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" disabled={fase === 'simulando' || fase === 'gravando'} onClick={onClose}>Fechar</Button>
          <Button type="button" size="sm" variant="outline" className="h-[24px] w-[90px] px-2.5 text-[10.5px]" disabled={fase !== 'pronto' || total === 0}
            onClick={() => { void rodar(true); }} data-testid="danfe-guardadas-simular">{fase === 'simulando' ? 'Gerando…' : 'Simular'}</Button>
          <Button type="button" size="sm" className="h-[24px] w-[120px] px-2.5 text-[10.5px]" disabled={fase !== 'pronto' || !simulado || saem === 0 || gravadas === saem}
            onClick={() => { void rodar(false); }} data-testid="danfe-guardadas-gravar">{fase === 'gravando' ? 'Anexando…' : 'Gerar e anexar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
