/**
 * DOCUMENTOS NO CONTRATO DO PARCELAMENTO — PARC-LIVRES-01 passo 6 ("não tem opção de incluir NF e importar no modal pai").
 *
 * ⚠ O CONTRATO NÃO GUARDA DOCUMENTO: esta aba mostra e grava os documentos dos LANÇAMENTOS das parcelas, pelos MESMOS donos do
 *   modal do lançamento — `useLancamentoDocumentos` (registrar, editar, cancelar, abrir), `gravarDocumentosDoParcelamento` (a NF
 *   registrada UMA vez na 1ª parcela e ligada às N; o boleto, só na parcela dele), a lista `AbaDocumentosLancamento`, a grade
 *   `ParcelasDaCompra` e o `AnexarBoletosDialog`. Anexar pela parcela ou pelo contrato dá no MESMO registro.
 * ⚠ AQUI GRAVA NA HORA (como a aba Documentos de um lançamento já salvo): não depende do Salvar do contrato.
 * ⚠ IMPORTAR XML CONFERE, NÃO SOBRESCREVE: a tabela contrato × nota vem de `conferirNota` (centavos, por igualdade); "Usar as
 *   duplicatas da nota" só leva a lista à aba Parcelas, sem gravar; parcela paga não muda.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';
import { AnexarBoletosDialog, type BoletoAtribuido } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLancamentoDocumentos, type LancamentoDocumentosApi } from '@/hooks/useLancamentoDocumentos';
import { useSituacaoDoContrato } from '@/hooks/useSituacaoDoContrato';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { gravarDocumentosDoParcelamento, novoPendente, type DocumentoPendente, type ParcelaGravada } from '@/lib/financeiro/documentosPendentes';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import { arquivoXmlDaNota } from '@/lib/financeiro/nfePrefill';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import { conferirNota, type Conferencia, type LinhaDaConferencia, type NotaParaConferir } from '@/lib/financiamentos/notaContraContrato';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';

const REGRA_DO_XML: RegraDeAceite = { tipos: ['xml'] };
export const MOTIVO_TIRAR_BOLETO = 'Boleto retirado pela aba Documentos do contrato';
const reais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const centavos = (v: number) => Math.round(v * 100);
const TH = 'h-[18px] border-b border-primary bg-primary px-1.5 text-left text-[9.5px] font-semibold text-primary-foreground whitespace-nowrap';
const TD = 'h-[18px] border-b border-border px-1.5 py-0 text-[10px] leading-none align-middle whitespace-nowrap';

/** Os dois lados (contrato, nota) de uma linha da conferência, para desenhar com a mesma célula. */
const ladosDaLinha = (l: LinhaDaConferencia): { lado: string; cent: number | null; texto: string; fixo: string }[] => [
  { lado: 'contrato', cent: l.contratoCent, texto: l.contratoTexto, fixo: l.contratoFixo },
  { lado: 'nota', cent: l.notaCent, texto: l.notaTexto, fixo: l.notaFixo },
];

export function notaParaConferir(n: NotaLida): NotaParaConferir {
  return {
    emitenteDocumento: n.emitente.documento, emitenteNome: n.emitente.nome,
    valorCent: n.duplicatas.length > 0 ? n.somaDuplicatasCent : n.totais.notaCent,
    duplicatas: n.duplicatas.map((d) => ({ vencimento: d.vencimento, valorCent: d.valorCent })),
  };
}

export function DocumentosDoContrato({ financiamentoId, clienteId, hoje, credorId, valorDoContrato, onUsarDuplicatas }: {
  financiamentoId: string; clienteId: string; hoje: string;
  credorId: string | null; valorDoContrato: number;
  /** Leva as duplicatas da nota à aba Parcelas (em "parcelas livres", sem gravar). Ausente = o gesto fica apagado. */
  onUsarDuplicatas?: (nota: NotaParaConferir) => void;
}) {
  const qc = useQueryClient();
  const { data: situacao } = useSituacaoDoContrato(financiamentoId, clienteId, hoje);
  /* as parcelas VIVAS com lançamento — a retirada não entra (a leitura do banco já a tira) */
  const vivas = useMemo(
    () => (situacao?.parcelas ?? []).filter((p): p is typeof p & { numero: number; lancamentoId: string } => p.numero != null && !!p.lancamentoId),
    [situacao],
  );
  const gravadas: ParcelaGravada[] = useMemo(() => vivas.map((p) => ({ numero: p.numero, lancamentoId: p.lancamentoId })), [vivas]);
  const ids = useMemo(() => vivas.map((p) => p.lancamentoId), [vivas]);

  /* os documentos da COMPRA são os da 1ª parcela (onde a NF é registrada) menos o boleto dela */
  const api = useLancamentoDocumentos(vivas[0]?.lancamentoId ?? null, clienteId);
  const { data: credor } = useQuery({
    queryKey: ['contrato-credor-documento', clienteId, credorId],
    enabled: !!credorId,
    queryFn: async () => {
      const { data } = await supabase.from('financeiro_fornecedores').select('id, nome, cpf_cnpj, ativo').eq('cliente_id', clienteId).eq('id', credorId ?? '').maybeSingle();
      return data ?? null;
    },
  });
  const chaveBoletos = ['contrato-boletos', financiamentoId, ids.join(',')];
  const { data: boletosGravados = [] } = useQuery({
    queryKey: chaveBoletos,
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_lancamento_documentos')
        .select('documento_id, lancamento_id, nome, numero, url, origem')
        .in('lancamento_id', ids).eq('cliente_id', clienteId).eq('especie', 'boleto').eq('cancelado', false);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null);
  const [anexarVarios, setAnexarVarios] = useState(false);
  const [tirar, setTirar] = useState<string | null>(null);
  const [xml, setXml] = useState<{ nota: NotaLida; arquivo: File; conferencia: Conferencia } | null>(null);
  const [recusaXml, setRecusaXml] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const reler = async () => {
    await api.recarregar();
    await qc.invalidateQueries({ queryKey: ['contrato-boletos', financiamentoId] });
    notificarLancamentosMudaram(clienteId);
  };

  /* a NF registrada pela lista tem de valer para TODAS: o `registrar` do dono grava na 1ª parcela, e a ligação às N é a mesma
     `fin_documento_vincular` do nascimento (idempotente) */
  const apiDaCompra: LancamentoDocumentosApi = useMemo(() => ({
    ...api,
    documentos: api.documentos.filter((d) => d.especie !== 'boleto'),
    confronto: null,
    registrar: async (p) => {
      const criado = await api.registrar(p);
      if (criado && criado.origem === 'lancamento' && ids.length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { error } = await (supabase as any).rpc('fin_documento_vincular', { p_documento: criado.id, p_cliente: clienteId, p_lancamentos: ids });
        if (error) setRecado({ texto: `O documento foi gravado na 1ª parcela, mas não foi ligado às outras: ${error.message}`, erro: true });
        await api.recarregar();
        notificarLancamentosMudaram(clienteId);
      }
      return criado;
    },
  }), [api, ids, clienteId]);

  const nf = apiDaCompra.documentos.find((d) => d.especie === 'nf' && !d.cancelado) ?? null;
  const qtdNotas = apiDaCompra.documentos.filter((d) => d.especie === 'nf' && !d.cancelado).length;

  /* o boleto gravado entra na grade como um "pendente já gravado": a grade é a mesma do lançamento novo */
  const boletos: DocumentoPendente[] = useMemo(() => boletosGravados.flatMap((b) => {
    const parcela = vivas.find((p) => p.lancamentoId === b.lancamento_id);
    if (!parcela || !b.documento_id) return [];
    const rotulo = b.nome || (b.numero ? `boleto ${b.numero}` : 'boleto');
    return [{ ...novoPendente({ especie: 'boleto' }, new File([], b.url ? rotulo : `${rotulo} · sem arquivo`), parcela.numero), chave: b.documento_id, gravado: true }];
  }), [boletosGravados, vivas]);

  const gravarBoletos = async (itens: { parcela: number; arquivo: File }[]): Promise<string | null> => {
    setOcupado(true);
    try {
      const saida = await gravarDocumentosDoParcelamento(clienteId, gravadas, itens.map((i) => novoPendente({ especie: 'boleto' }, i.arquivo, i.parcela)));
      await reler();
      const falhas = saida.filter((r) => !r.gravado).map((r) => `parcela ${r.parcela}: ${r.erro ?? 'falha'}`);
      return falhas.length ? `Não gravados — ${falhas.join('; ')}` : null;
    } finally { setOcupado(false); }
  };

  const lerXml = async (arquivo: File) => {
    setRecusaXml(null); setRecado(null);
    const bytes = await arquivo.arrayBuffer();
    const r = lerNFe(bytes);
    if (r.ok === false) { setXml(null); setRecusaXml(r.frase); return; }
    const conferencia = conferirNota(notaParaConferir(r.nota), {
      credorDocumento: credor?.cpf_cnpj ?? null, credorNome: credor?.nome ?? null, valorCent: centavos(valorDoContrato),
      parcelas: vivas.map((p) => ({ vencimento: p.dataVencimento ?? '', valorCent: centavos(p.valorTotal), paga: p.situacao === 'paga' })),
    });
    setXml({ nota: r.nota, arquivo: arquivoXmlDaNota(bytes, arquivo.name), conferencia });
  };

  const registrarNotaDoXml = async () => {
    if (!xml) return;
    const n = xml.nota;
    const mesmoFornecedor = xml.conferencia.linhas.find((l) => l.campo === 'fornecedor')?.confere === true;
    setOcupado(true);
    try {
      const [r] = await gravarDocumentosDoParcelamento(clienteId, gravadas, [novoPendente({
        especie: 'nf', nome: `nf ${n.numero}`, numero: n.numero, serie: n.serie || null, chaveAcesso: n.chave, dataEmissao: n.emissao,
        valorDocumento: n.totais.notaCent / 100,
        emitenteId: mesmoFornecedor ? credorId : null,
        emitenteNome: mesmoFornecedor ? null : n.emitente.nome, emitenteDocumento: mesmoFornecedor ? null : n.emitente.documento,
      }, xml.arquivo, null)]);
      await reler();
      setRecado(r.gravado ? { texto: `Nota ${formatNFNumber(n.numero) || n.numero} gravada e ligada às ${gravadas.length} parcelas.`, erro: false }
        : { texto: `A nota não foi gravada: ${r.erro ?? 'falha'}`, erro: true });
      if (r.gravado) setXml(null);
    } finally { setOcupado(false); }
  };

  if (!situacao) return <p className="text-[10px] text-muted-foreground" data-testid="docs-contrato-lendo">Lendo as parcelas do contrato…</p>;
  if (vivas.length === 0) {
    return <p className="rounded border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground" data-testid="docs-contrato-sem-lancamento">
      Este contrato não tem parcela com lançamento no Financeiro: não há onde guardar documento.</p>;
  }

  const somaDasParcelas = situacao.cartoes.somaTotal;
  const notaConfere = nf?.valorDocumento != null ? centavos(nf.valorDocumento) === centavos(somaDasParcelas) : null;
  const parcelaDoTirar = tirar ? boletos.find((b) => b.chave === tirar)?.parcela ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="documentos-do-contrato">
      {/* ── Documentos da compra ── */}
      <div className="shrink-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold">Documentos da compra <span className="font-normal text-muted-foreground">· valem para todas as parcelas</span></p>
          <AreaDeArquivo regra={REGRA_DO_XML} convite="Importar XML da nota" detalhe="" className="ml-auto h-[22px] w-[230px]"
            testId="contrato-xml-area" inputTestId="contrato-xml-input" motivoExterno={recusaXml}
            desabilitado={ocupado} onArquivos={([f]) => { if (f) void lerXml(f); }} />
        </div>
        {/* 2a-fix1 — o emitente do documento NOVO nasce com o credor do contrato, sugerido (âmbar) e editável */}
        <AbaDocumentosLancamento api={apiDaCompra} semBoleto
          clienteId={clienteId}
          sugestao={credorId ? { numero: null, dataEmissao: null, valor: null, emitenteId: credorId, origem: 'o contrato' } : undefined} />
        {/* a NF contra a COMPRA INTEIRA (a soma das parcelas ativas, do banco) — os dois números lado a lado; a tela só compara */}
        <p className="h-[14px] text-[10px] leading-[14px]" data-testid="nota-x-compra">
          {nf?.valorDocumento == null ? <span className="text-muted-foreground">Sem nota fiscal com valor para conferir contra a compra.</span>
            : <>Nota <span className="tabular-nums font-medium">R$ {reais(nf.valorDocumento)}</span> · compra (soma das parcelas) <span className="tabular-nums font-medium">R$ {reais(somaDasParcelas)}</span>{' · '}
              {notaConfere ? <span className="font-semibold text-[#15803d]">confere ✓</span> : <span className="font-semibold text-[#b91c1c]">não confere</span>}</>}
        </p>
      </div>

      {/* ── As parcelas e o boleto de cada uma (só esta grade rola) ── */}
      <div className="min-h-0 flex-1 overflow-auto" data-testid="docs-contrato-rolagem">
        <ParcelasDaCompra
          parcelas={vivas.map((p) => ({ numero: p.numero, dataVencimento: p.dataVencimento ?? '', valor: p.valorTotal }))}
          notaFiscal={nf?.numero ?? null} qtdNotas={qtdNotas} boletos={boletos} foraDoPlano={[]} travado={ocupado}
          onBoleto={(parcela, arquivo) => { setRecado(null); void gravarBoletos([{ parcela, arquivo }]).then((erro) => { if (erro) setRecado({ texto: erro, erro: true }); }); }}
          onTirarBoleto={(chave) => { setRecado(null); setTirar(chave); }}
          onVerBoleto={(chave) => {
            const b = boletosGravados.find((x) => x.documento_id === chave);
            if (!b?.url) { setRecado({ texto: 'Este boleto não tem arquivo anexado.', erro: true }); return; }
            void api.urlAssinada(b.url).then((u) => { if (u) window.open(u, '_blank', 'noopener'); else setRecado({ texto: 'Não foi possível abrir o boleto.', erro: true }); });
          }}
          onAnexarVarios={() => setAnexarVarios(true)} />
      </div>

      {/* lugar fixo do recado e da confirmação de tirar — sempre presente */}
      <div className="flex h-[22px] shrink-0 items-center gap-2 text-[10px]" data-testid="docs-contrato-recado">
        {tirar ? (
          <>
            <span className="font-medium text-amber-700">Tirar o boleto da parcela {parcelaDoTirar}?</span>
            <button type="button" className="font-semibold text-destructive underline" data-testid="tirar-boleto-sim" disabled={ocupado}
              onClick={() => { const id = tirar; setTirar(null); setOcupado(true); void api.cancelar(id, MOTIVO_TIRAR_BOLETO).then(reler).catch((e: unknown) => setRecado({ texto: `O boleto não foi tirado: ${e instanceof Error ? e.message : 'falha'}`, erro: true })).finally(() => setOcupado(false)); }}>
              Sim, tirar
            </button>
            <button type="button" className="text-muted-foreground underline" onClick={() => setTirar(null)}>Não</button>
          </>
        ) : recado ? <span className={`min-w-0 truncate ${recado.erro ? 'text-destructive' : 'text-[#15803d]'}`} title={recado.texto}>{recado.texto}</span> : null}
      </div>

      {/* ── A nota lida do XML, contra o contrato — num DIÁLOGO próprio, de tamanho fixo: a aba não muda de altura (a 523px de
          janela a tabela dentro da aba deixava 5px para a grade dos boletos, medido) ── */}
      <Dialog open={!!xml} onOpenChange={(o) => { if (!o) setXml(null); }}>
        <DialogContent className="w-[760px] max-w-[95vw] gap-0 p-0" data-testid="conferencia-do-xml">
          <DialogHeader className="h-9 justify-center bg-primary px-3">
            <DialogTitle className="text-[13px] font-semibold text-primary-foreground">Nota {xml ? (formatNFNumber(xml.nota.numero) || xml.nota.numero) : ''} × contrato</DialogTitle>
          </DialogHeader>
          {xml && (
            <div className="p-3">
              <table className="w-full table-fixed border-separate border-spacing-0">
                <colgroup><col style={{ width: 132 }} /><col /><col /><col style={{ width: 96 }} /></colgroup>
                <thead><tr><th className={TH}>Campo</th><th className={TH}>Contrato</th><th className={TH}>Nota</th><th className={TH}>Situação</th></tr></thead>
                <tbody>
                  {xml.conferencia.linhas.map((l) => (
                    <tr key={l.campo} data-testid={`conf-${l.campo}`}>
                      <td className={TD}>{l.rotulo}</td>
                      {ladosDaLinha(l).map(({ lado, cent, texto, fixo }) => (
                        <td key={lado} className={TD}>
                          {cent != null ? <span className="tabular-nums">R$ {reais(cent / 100)}</span> : (
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="min-w-0 truncate" title={texto}>{texto}</span>
                              {fixo && <span className="shrink-0 tabular-nums text-muted-foreground">· {fixo}</span>}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className={`${TD} font-semibold ${l.confere === true ? 'text-[#15803d]' : l.confere === false ? 'text-[#b91c1c]' : 'text-muted-foreground'}`}>
                        {l.confere === true ? 'confere ✓' : l.confere === false ? 'difere' : 'não comparável'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Nada do contrato é alterado pela importação: a tabela só confere, e você decide.</p>
            </div>
          )}
          {xml && (
            <div className="flex h-8 items-center gap-2 border-t bg-muted/30 px-3">
              <Button type="button" size="sm" className="h-[22px] px-2 text-[10px]" disabled={ocupado} onClick={() => void registrarNotaDoXml()} data-testid="registrar-nota-do-xml">
                Gravar esta nota no contrato
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-[22px] px-2 text-[10px]" data-testid="usar-duplicatas"
                disabled={!xml.conferencia.duplicatasDiferem || !onUsarDuplicatas}
                title={!xml.conferencia.temDuplicatas ? 'A nota não tem duplicatas.' : !xml.conferencia.duplicatasDiferem ? 'As duplicatas da nota são iguais às parcelas.' : !onUsarDuplicatas ? 'Indisponível nesta tela.' : 'Leva as duplicatas à aba Parcelas, sem gravar. Parcela paga não muda.'}
                onClick={() => { if (onUsarDuplicatas) { const n = notaParaConferir(xml.nota); setXml(null); onUsarDuplicatas(n); } }}>
                Usar as duplicatas da nota
              </Button>
              {/* o motivo do gesto apagado fica ESCRITO, não só no title */}
              {(!xml.conferencia.duplicatasDiferem || !onUsarDuplicatas) && (
                <span className="min-w-0 truncate text-[10px] text-muted-foreground" data-testid="motivo-usar-duplicatas">
                  {!xml.conferencia.temDuplicatas ? 'A nota não tem duplicatas.' : !xml.conferencia.duplicatasDiferem ? 'As duplicatas da nota são iguais às parcelas.' : 'Indisponível nesta tela.'}
                </span>
              )}
              <Button type="button" size="sm" variant="ghost" className="ml-auto h-[22px] px-2 text-[10px]" onClick={() => setXml(null)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {anexarVarios && (
        <AnexarBoletosDialog subtitulo={`${vivas.length} parcelas`}
          parcelas={vivas.map((p) => ({ numero: p.numero, vencimento: p.dataVencimento, valor: p.valorTotal, temBoleto: boletos.some((b) => b.parcela === p.numero) }))}
          onConfirmar={(itens: BoletoAtribuido[]) => gravarBoletos(itens.map((i) => ({ parcela: i.parcela, arquivo: i.arquivo })))}
          onFechar={() => setAnexarVarios(false)} />
      )}
    </div>
  );
}
