/**
 * IMPORTAR-ABATE-01 — "⇪ Importar abate" (Central de OCs): os PDFs do frigorífico (NF, acerto, romaneio) viram a OC de abate inteira —
 * lotes, recebimento e documentos — pela `oc_importar_abate` (banco 117510 + 117530). Mock aprovado: ui-validar/importar-abate-mock.
 *
 *  - NADA GRAVA SEM A PRÉVIA NA TELA (Chat 11/11 16:28): "Ver prévia" chama a RPC com p_simular (o banco desfaz); "Criar" só acende com a
 *    prévia vista e as Dúvidas respondidas.
 *  - DIFERENÇA ENTRE DOCUMENTOS SE MOSTRA, NUNCA SE AJUSTA: o centavo NF × acerto, a soma das faixas × o total impresso (que vira o
 *    componente "diferença do acerto", D-ABATE-1) e a NF de produtor com valor de pauta ficam escritos, em âmbar.
 *  - A mesma NF já no sistema: o banco diz qual OC e o que mudaria (nada é criado); "Abrir a OC".
 *  - Depois de criar, os PDFs sobem anexados aos documentos registrados (o gesto do "anexar" da aba Documentos), e a OC abre.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import type { FornecedorLido } from '@/lib/fornecedores/leitorDeFornecedores';
import { useFornecedoresDoCliente } from '@/hooks/useFornecedoresDoCliente';
import { useOperacaoDocumentos, type EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import { extrairLinhasPdf } from '@/lib/oc/leitura/linhasDoPdf';
import { lerDocumentosDoImport, entradaDoImport, fazendaPelaNf, remetenteDaNfFrigorifico, documentoDoPdf, marcaDoPdf, type DocumentoDoImport, type FazendaSugerida, type MarcaDoPdf } from '@/lib/oc/importar/leituraDoImport';
import { fazendasComIEDoCliente } from '@/components/financeiro-v2/NovoDeXmlDialog';
import type { FazendaComIE } from '@/lib/financeiro/nfe/proporLancamento';
import { diferencaCabeNaOc, docsXOc, lotesComPrecoDiferente, montarPacoteDoAbate, type Duvida, type OcExistente } from '@/lib/oc/importar/pacoteDoAbate';
import { CATEGORIAS } from '@/types/cattle';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';

const REGRA_PDFS: RegraDeAceite = { tipos: ['pdf'], tamanhoMaxBytes: 10 * 1024 * 1024, varios: true };
const ROTULO_ESPECIE: Partial<Record<EspecieDoc, string>> = { nf_principal: 'NF do frigorífico', acerto: 'Acerto do abate', romaneio: 'Romaneio', nf_produtor: 'NF de produtor', gta: 'GTA' };
const TODAS_AS_DUVIDAS: Duvida[] = ['fazenda', 'contraparte', 'categoria', 'peso_vivo'];
const FRASE_DUVIDA: Record<Duvida, string> = { fazenda: 'De qual fazenda saiu o gado?', contraparte: 'Quem comprou (o frigorífico)?', categoria: 'Categoria que saiu', peso_vivo: 'Peso vivo médio (kg)' };
const brl = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dataBR = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
/* o resumo do banco escreve "especie:numero" (ex.: "nf_principal:45854"); a tela mostra o nome do documento */
const ROTULO_CURTO: Partial<Record<EspecieDoc, string>> = { nf_principal: 'NF', acerto: 'Acerto', romaneio: 'Romaneio', nf_produtor: 'NF de produtor', gta: 'GTA' };
const rotuloDoDocumento = (s: string) => {
  const [e, n] = s.split(':');
  const nome = Object.entries(ROTULO_CURTO).find(([k]) => k === e)?.[1] ?? e;
  return n ? `${nome} ${n}` : nome;
};
/* cada dúvida tem o seu campo: o rodapé leva até ele (Chat 17:15, ajuste 5) */
const ID_DA_DUVIDA: Record<Duvida, string> = { fazenda: 'importar-duvida-fazenda', contraparte: 'importar-duvida-contraparte', categoria: 'importar-duvida-categoria', peso_vivo: 'importar-duvida-peso' };
const irParaADuvida = (d: Duvida) => {
  const campo = document.getElementById(ID_DA_DUVIDA[d]);
  campo?.scrollIntoView?.({ block: 'nearest' });
  campo?.querySelector<HTMLElement>('button, input')?.focus();
};

interface LoteDoResumo { ordem: number; cab: number; peso_carcaca_kg: number | null; preco_arroba: number | null; valor_liquido: number | null; senar: number | null; funrural: number | null }
interface Resumo { data: string | null; lotes: LoteDoResumo[]; recebimento: { valor: number | null; vencimento: string | null } | null; documentos: string[]; diferenca_acerto: number | null }
interface Previa {
  ok: boolean; ja_existe: boolean; simulado: boolean; operacao_id?: string; rotulo?: string; nada_muda?: boolean;
  diferencas?: { campo: string; hoje: unknown; pacote: unknown }[]; resumo?: Resumo;
}

export interface ImportarAbateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clienteId: string;
  fazendas: { id: string; nome: string; codigo?: string | null }[];
  fazendaInicialId: string | null;
  /** a OC criada (ou a que já existia) — a Central a abre */
  onAbrirOperacao: (operacaoId: string) => void;
}

/* Depois de criar: cada documento registrado recebe o PDF DELE (`documentoDoPdf`: espécie + número + cab + kg), pelo MESMO anexar da aba Documentos. */
function AnexarOsPdfs({ operacaoId, clienteId, arquivos, aoTerminar }: {
  operacaoId: string; clienteId: string; arquivos: { marca: MarcaDoPdf; arquivo: File }[]; aoTerminar: (falhas: number) => void;
}) {
  const api = useOperacaoDocumentos({ operacaoId, clienteId, enabled: true });
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || api.loading || api.documentos.length === 0) return;
    feito.current = true;
    void (async () => {
      let falhas = 0;
      const usados = new Set<string>();
      for (const a of arquivos) {
        const doc = documentoDoPdf(a.marca, api.documentos, usados);
        if (!doc) { falhas += 1; continue; }
        usados.add(doc.documentoId);
        if (!(await api.anexarArquivo(doc.documentoId, 1, a.arquivo))) falhas += 1;
      }
      aoTerminar(falhas);
    })();
  }, [api.loading, api.documentos, api, arquivos, aoTerminar]);
  return null;
}

export function ImportarAbateDialog({ open, onOpenChange, clienteId, fazendas, fazendaInicialId, onAbrirOperacao }: ImportarAbateDialogProps) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [lidos, setLidos] = useState<{ documentos: DocumentoDoImport[]; cnpjFrigorifico: string | null; nomeFrigorifico: string | null } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [fazendaId, setFazendaId] = useState<string | null>(fazendaInicialId);
  const [contraparte, setContraparte] = useState<{ id: string; nome: string } | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [pesoVivo, setPesoVivo] = useState<number | null>(null);
  /* 117535: a categoria de cada lote (pela ordem); sem escolha = a do lote 1 (a 'Categoria que saiu') */
  const [categoriasPorLote, setCategoriasPorLote] = useState<Record<number, string | null>>({});
  /* Chat 12/11 17:50: a fazenda que a TELA escolheu (pela NF) precisa do toque do operador; a escolhida por ele (ou a da Central) já vale */
  const [fazendaConfirmada, setFazendaConfirmada] = useState(fazendaInicialId != null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [criada, setCriada] = useState<string | null>(null);
  const [anexos, setAnexos] = useState<string | null>(null);
  const [anexada, setAnexada] = useState(false);

  useEffect(() => {
    if (open) return;
    setArquivos([]); setLidos(null); setPrevia(null); setRecusa(null); setCriada(null); setAnexos(null); setAnexada(false);
    setContraparte(null); setCategoria(null); setPesoVivo(null); setCategoriasPorLote({}); setFazendaId(fazendaInicialId); setFazendaConfirmada(fazendaInicialId != null);
  }, [open, fazendaInicialId]);

  /* O comprador pelo CNPJ lido (exato): sugerido, nunca escolhido por cima do que o operador já marcou. */
  const { fornecedores } = useFornecedoresDoCliente(clienteId || null);
  useEffect(() => {
    if (contraparte || !lidos?.cnpjFrigorifico) return;
    const exato = fornecedores.find(f => soDigitos(f.cpf_cnpj) === soDigitos(lidos.cnpjFrigorifico));
    if (exato) setContraparte({ id: exato.id, nome: exato.nome });
  }, [fornecedores, lidos?.cnpjFrigorifico, contraparte]);

  /* A FAZENDA PELA NF (ajuste 4): a IE do remetente (o produtor) → fazenda_cadastros.ie; sem ela, o nome no endereço. Pré-escolhida
     só quando o campo está vazio; o operador confirma (a frase diz de onde veio). */
  const [fazendasComIe, setFazendasComIe] = useState<FazendaComIE[]>([]);
  useEffect(() => {
    if (!open || !clienteId) return;
    let vivo = true;
    void fazendasComIEDoCliente(clienteId, fazendas).then(l => { if (vivo) setFazendasComIe(l); }).catch(() => {});
    return () => { vivo = false; };
  }, [open, clienteId, fazendas]);
  const fazendaSugerida: FazendaSugerida | null = useMemo(() => {
    const nf = lidos?.documentos.find(d => d.leitura.tipo === 'lido' && d.leitura.grupo === 'nf');
    return nf ? fazendaPelaNf(remetenteDaNfFrigorifico(nf.linhas), fazendasComIe) : null;
  }, [lidos, fazendasComIe]);
  useEffect(() => { if (!fazendaId && fazendaSugerida) { setFazendaId(fazendaSugerida.fazenda.id); setFazendaConfirmada(false); } }, [fazendaSugerida, fazendaId]);


  /* Lê a lista INTEIRA de novo a cada mudança: o CNPJ do frigorífico (que libera o romaneio) depende de todos os PDFs juntos. */
  const lerTodos = async (todos: File[]) => {
    setArquivos(todos); setPrevia(null); setRecusa(null);
    if (todos.length === 0) { setLidos(null); return; }
    setLendo(true);
    try {
      const pdfs = await Promise.all(todos.map(async f => ({ nome: f.name, ...(await extrairLinhasPdf(f)) })));
      setLidos(lerDocumentosDoImport(pdfs));
    } catch {
      setRecusa('Não consegui ler os PDFs: confira os arquivos e tente de novo.');
    } finally { setLendo(false); }
  };
  const receber = (novos: File[]) => lerTodos([...arquivos, ...novos.filter(n => !arquivos.some(a => a.name === n.name && a.size === n.size))]);
  const tirar = (nome: string) => lerTodos(arquivos.filter(a => a.name !== nome));

  const montagem = useMemo(() => {
    if (!lidos) return null;
    const { entrada, falta } = entradaDoImport(lidos.documentos, {
      fazendaId, contraparteId: contraparte?.id ?? null, contraparteNome: contraparte?.nome ?? null, categoria, pesoVivoMedioKg: pesoVivo, categoriasPorLote,
    }, lidos.cnpjFrigorifico);
    if (!entrada) return { falta, m: null };
    return { falta: null, m: montarPacoteDoAbate(entrada) };
  }, [lidos, fazendaId, contraparte, categoria, pesoVivo, categoriasPorLote]);

  useEffect(() => { setPrevia(null); }, [fazendaId, contraparte, categoria, pesoVivo, categoriasPorLote]);

  const pacote = montagem?.m?.pacote ?? null;
  /* A MESMA OC LANÇADA À MÃO (caso real SM-LT06, 12/11): o "já existe" do banco é pela chave da NF; OC lançada sem documentos passa.
     Antes do Criar: OC de abate VIVA da mesma fazenda e do mesmo comprador com abate a ±3 dias. Achou = não cria (abrir a OC e anexar
     os documentos nela). A consulta que DECIDE nunca falha calada (P146): falhou = "Não consegui verificar" e o Criar fica apagado. */
  type OcParecida = { id: string; data_operacao: string; status_comercial: string; valor_acordado: number | null; numero_documento: string | null };
  const [parecidas, setParecidas] = useState<{ ok: true; valor: OcParecida[] } | { ok: false } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const dataDoAbate = montagem?.m?.pacote?.data_abate ?? null;
  useEffect(() => {
    setParecidas(null);
    if (!open || !clienteId || !fazendaId || !contraparte?.id || !dataDoAbate) return;
    let vivo = true;
    const d = new Date(`${dataDoAbate}T12:00:00`);
    const dia = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    void (async () => {
      const { data, error } = await (supabase as any).from('zoo_operacoes_comerciais')
        .select('id, data_operacao, status_comercial, valor_acordado, numero_documento')
        .eq('cliente_id', clienteId).eq('fazenda_id', fazendaId).eq('contraparte_id', contraparte.id).eq('tipo_operacao', 'abate')
        .eq('rascunho', false).neq('status_comercial', 'cancelada').gte('data_operacao', dia(-3)).lte('data_operacao', dia(3));
      if (!vivo) return;
      if (error) { console.error('[importar abate] OC parecida', error); setParecidas({ ok: false }); return; }
      setParecidas({ ok: true, valor: data ?? [] });
    })();
    return () => { vivo = false; };
  }, [open, clienteId, fazendaId, contraparte?.id, dataDoAbate, tentativa]);
  const ocRepetida = parecidas?.ok ? parecidas.valor[0] ?? null : null;

  /* ANEXAR À OC EXISTENTE (Chat 18:00): a OC de hoje lida para o lado a lado (lotes + abate realizado + recebimento) e os ids dos lotes
     (o documento se liga a eles). Leitura só; o anexar usa o registrar da aba Documentos (não toca lote, rebanho nem financeiro). */
  const [ocExistente, setOcExistente] = useState<{ ok: true; oc: OcExistente; loteIds: string[] } | { ok: false } | null>(null);
  useEffect(() => {
    setOcExistente(null);
    if (!ocRepetida) return;
    let vivo = true;
    void (async () => {
      const [lotes, partes] = await Promise.all([
        (supabase as any).from('zoo_operacao_lotes').select('id, ordem, qtd_negociada, zoo_operacao_abate(cenario, peso_carcaca_kg, preco_arroba, valor_liquido, senar_valor, funrural_valor)')
          .eq('operacao_id', ocRepetida.id).order('ordem'),
        (supabase as any).from('zoo_operacao_partes').select('valor, data_vencimento').eq('operacao_id', ocRepetida.id).eq('cancelada', false).eq('componente', 'recebimento'),
      ]);
      if (!vivo) return;
      if (lotes.error || partes.error) { console.error('[importar abate] OC existente', lotes.error ?? partes.error); setOcExistente({ ok: false }); return; }
      type LinhaLote = { id: string; qtd_negociada: number | null; zoo_operacao_abate: { cenario: string; peso_carcaca_kg: number | null; preco_arroba: number | null; valor_liquido: number | null; senar_valor: number | null; funrural_valor: number | null }[] | null };
      type LinhaParte = { valor: number | null; data_vencimento: string | null };
      const ls: LinhaLote[] = lotes.data ?? [];
      const ps: LinhaParte[] = partes.data ?? [];
      const oc: OcExistente = {
        lotes: ls.map(l => { const a = (l.zoo_operacao_abate ?? []).find(x => x.cenario === 'realizado');
          return { cab: l.qtd_negociada ?? 0, peso_carcaca_kg: a?.peso_carcaca_kg ?? null, preco_arroba: a?.preco_arroba ?? null, valor_liquido: a?.valor_liquido ?? null,
            senar: a?.senar_valor ?? null, funrural: a?.funrural_valor ?? null }; }),
        recebimento: { valor: ps.length ? Math.round(ps.reduce((t, x) => t + (x.valor ?? 0) * 100, 0)) / 100 : null, vencimento: ps[0]?.data_vencimento ?? null },
      };
      setOcExistente({ ok: true, oc, loteIds: ls.map(l => l.id) });
    })();
    return () => { vivo = false; };
  }, [ocRepetida]);
  const ladoALado = ocExistente?.ok && pacote ? docsXOc(pacote, ocExistente.oc) : null;
  const difEntraNaOc = ocExistente?.ok && pacote ? diferencaCabeNaOc(pacote, ocExistente.oc) : false;

  const anexarNaOc = async () => {
    if (!ocRepetida || !ocExistente?.ok || !pacote) return;
    setGravando(true); setRecusa(null);
    try {
      /* os documentos do pacote; o componente da diferença só quando cabe na OC (senão contaria o centavo 2×) */
      const docs = pacote.documentos.map(d => (difEntraNaOc || !Array.isArray(d.componentes) ? d
        : { ...d, componentes: d.componentes.filter((c: { tipo?: string }) => c?.tipo !== 'diferenca_acerto') }));
      for (const d of docs) {
        const { lote_ordem: _lo, ...semOrdem } = d;  /* 117537: o lote do pacote não existe na OC de hoje */
        const { error } = await (supabase as any).rpc('oc_documento_registrar', { p_operacao_id: ocRepetida.id, p_cliente_id: clienteId, p_payload: { ...semOrdem, lotes: ocExistente.loteIds } });
        if (error) { console.error('[importar abate] anexar', error); setRecusa(`Parou no ${rotuloDoDocumento(`${String(d.especie)}:${String(d.numero ?? '')}`)}: ${error.message || 'o banco recusou o documento'}`); return; }
      }
      setAnexada(true); setCriada(ocRepetida.id);
    } finally { setGravando(false); }
  };
  const duvidas = montagem?.m?.duvidas ?? (lidos ? TODAS_AS_DUVIDAS : []);
  const diferencas = montagem?.m?.diferencas ?? [];
  const avisos = montagem?.m?.avisos ?? [];
  /* D-ABATE-1: o total impresso no acerto − a soma das faixas (mostrada desde a leitura, antes das dúvidas) */
  const faixasXAcerto = diferencas.find(d => d.qual === 'faixas_x_acerto');
  const difDoAcerto = faixasXAcerto ? Math.round((faixasXAcerto.b - faixasXAcerto.a) * 100) / 100 : null;

  const chamar = async (simular: boolean): Promise<Previa | null> => {
    if (!pacote) return null;
    setRecusa(null);
    const { data, error } = await (supabase as any).rpc('oc_importar_abate', { p_cliente_id: clienteId, p_pacote: pacote, p_simular: simular });
    if (error) {
      console.error('[importar abate]', error);
      setRecusa(`Nada foi gravado: ${error.message || 'o banco recusou a importação'}`);
      return null;
    }
    return data;
  };
  const verPrevia = async () => { setConferindo(true); try { setPrevia(await chamar(true)); } finally { setConferindo(false); } };
  const criar = async () => {
    setGravando(true);
    try {
      const r = await chamar(false);
      if (r?.ok && r.operacao_id && !r.ja_existe) setCriada(r.operacao_id);
    } finally { setGravando(false); }
  };

  const motivoDoCriar = !lidos ? 'Arraste os PDFs do frigorífico'
    : montagem?.falta === 'acerto' ? 'Falta o acerto do abate (é ele que tem as faixas e o líquido)'
    : montagem?.falta === 'acerto_sem_faixas' ? 'O acerto não trouxe as faixas de preço'
    : montagem?.m?.recusa ? montagem.m.recusa
    : duvidas.length > 0 ? `Responda as dúvidas: ${duvidas.map(d => FRASE_DUVIDA[d].replace('?', '')).join(' · ')}`
    : !fazendaConfirmada ? 'Confirme a fazenda (sugerida pela NF)'
    : parecidas == null ? 'Conferindo se este abate já está lançado…'
    : parecidas.ok === false ? 'Não consegui verificar se este abate já está lançado'
    : ocRepetida ? (ocExistente == null ? 'Lendo a OC que já existe…' : ocExistente.ok === false ? 'Não consegui ler a OC que já existe' : 'Pronto para anexar à OC existente')
    : !previa ? 'Veja a prévia antes de criar'
    : previa.ja_existe ? 'Esta NF já está numa OC: abra a OC'
    : null;

  const arquivosPorEspecie = useMemo(() => (lidos?.documentos ?? [])
    .map(d => ({ marca: marcaDoPdf(d), arquivo: arquivos.find(a => a.name === d.nome) }))
    .filter((x): x is { marca: MarcaDoPdf; arquivo: File } => x.marca != null && x.arquivo != null), [lidos, arquivos]);

  const resumo = previa?.resumo ?? null;
  const totais = useMemo(() => {
    const ls = resumo?.lotes ?? [];
    const soma = (f: (l: LoteDoResumo) => number | null) => Math.round(ls.reduce((a, l) => a + (f(l) ?? 0) * 100, 0)) / 100;
    return { cab: ls.reduce((a, l) => a + (l.cab ?? 0), 0), kg: soma(l => l.peso_carcaca_kg), senar: soma(l => l.senar), funrural: soma(l => l.funrural),
      liquido: Math.round((soma(l => l.valor_liquido) + (resumo?.diferenca_acerto ?? 0)) * 100) / 100 };
  }, [resumo]);
  const lotesLidos = montagem?.m?.lotes ?? [];
  /* 117537: o incentivo e a observação (ordem de compra, preço composto) vêm dos lotes montados aqui — o resumo do banco não os traz */
  const loteLido = (ordem: number) => lotesLidos.find(l => l.ordem === ordem);
  const comIncentivo = lotesLidos.some(l => (l.incentivo ?? 0) > 0);
  const totalIncentivo = Math.round(lotesLidos.reduce((a, l) => a + (l.incentivo ?? 0) * 100, 0)) / 100;
  const precoDiferente = useMemo(() => lotesComPrecoDiferente(resumo?.lotes ?? lotesLidos), [resumo, lotesLidos]);
  const catDoLote = (ordem: number) => categoriasPorLote[ordem] ?? categoria;
  const rotuloCat = (v: string | null) => CATEGORIAS.find(c => c.value === v)?.label ?? '—';
  /* a baixa no rebanho por categoria (a soma das cabeças dos lotes de cada uma) */
  const baixaPorCategoria = (() => {
    const m = new Map<string, number>();
    for (const l of resumo?.lotes ?? []) { const k = rotuloCat(catDoLote(l.ordem)); m.set(k, (m.get(k) ?? 0) + (l.cab ?? 0)); }
    return [...m.entries()].map(([k, n]) => `${n} cab · ${k}`).join(' + ');
  })();
  const nomeDaFazenda = (() => { const f = fazendas.find(x => x.id === fazendaId); return f ? (f.codigo ? `${f.codigo} · ${f.nome}` : f.nome) : '—'; })();
  const categoriaLabel = CATEGORIAS.find(c => c.value === categoria)?.label ?? '—';

  return (
    <Dialog open={open} onOpenChange={v => { if (!gravando) onOpenChange(v); }}>
      <DialogContent className="flex h-[580px] max-w-[1000px] flex-col gap-2 p-4" data-testid="importar-abate">
        <DialogHeader className="flex-none">
          <DialogTitle className="text-[14px]">Importar abate · documentos do frigorífico</DialogTitle>
          <DialogDescription className="text-[10.5px]">
            Nada é gravado antes de "Criar OC e lançamentos". Diferença entre os documentos aparece aqui e nunca é ajustada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-3">
          {/* ── Documentos + prévia ── */}
          <div className="flex min-h-0 flex-col gap-2">
            <AreaDeArquivo regra={REGRA_PDFS} modo="um" className="h-10 flex-none" testId="importar-area"
              convite="Arraste os PDFs aqui ou clique para escolher" detalhe="NF, acerto e romaneio · PDF"
              onArquivos={fs => void receber(fs)} desabilitado={lendo || gravando || criada != null} />
            <table className="w-full table-fixed text-[10.5px]" data-testid="importar-documentos">
              <colgroup><col className="w-[150px]" /><col /><col className="w-[24px]" /></colgroup>
              <thead><tr className="h-[22px] bg-[#1B2A44] text-left text-[9.5px] font-medium text-white">
                <th className="px-1">Documento</th><th className="px-1">Como leu</th><th /></tr></thead>
              <tbody>
                {(lidos?.documentos ?? []).map(d => (
                  <tr key={d.nome} className="h-[19px] border-b border-black/[0.06]">
                    <td className="px-1 font-medium">{d.especie ? (ROTULO_ESPECIE[d.especie] ?? d.especie) : 'Não reconhecido'}</td>
                    <td className="truncate px-1" title={`${d.nome} · ${d.leitura.tipo === 'lido' ? d.leitura.rotulo : d.leitura.frase}`}>
                      {d.leitura.tipo === 'lido' ? `${d.leitura.rotulo} · lido` : <span className="text-amber-700">{d.leitura.frase}</span>}
                    </td>
                    <td><button type="button" className="text-[#4A5361] hover:text-red-700" aria-label={`Tirar ${d.nome}`}
                      onClick={() => void tirar(d.nome)} disabled={gravando || criada != null}>✕</button></td>
                  </tr>
                ))}
                {!lidos && <tr className="h-[19px]"><td colSpan={3} className="px-1 text-muted-foreground">{lendo ? 'Lendo…' : 'Nenhum PDF ainda'}</td></tr>}
              </tbody>
            </table>

            {diferencas.length > 0 && (
              <div className="flex-none rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10.5px] text-amber-900" data-testid="importar-diferencas">
                <div className="font-semibold">Diferenças entre os documentos (mostradas, nunca ajustadas)</div>
                {diferencas.map((d, i) => <div key={`${d.qual}-${i}`}>{d.frase}</div>)}
                {difDoAcerto != null && (
                  <div>Entra na OC como "diferença do acerto" de R$ {brl(difDoAcerto)}: os lotes ficam como as faixas e o recebimento é o líquido do acerto.</div>
                )}
              </div>
            )}

            {avisos.length > 0 && (
              <div className="flex-none rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10.5px] text-amber-900" data-testid="importar-avisos">
                <div className="font-semibold">Falta documento (não trava)</div>
                {avisos.map(t => <div key={t}>{t}</div>)}
              </div>
            )}

            {/* a prévia do banco */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded border border-black/[0.08] p-2" data-testid="importar-previa">
              {!previa && <div className="text-[10.5px] text-muted-foreground">A prévia do banco aparece aqui (nada é gravado).</div>}
              {ocRepetida && (
                <div className="mb-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" data-testid="importar-oc-repetida">
                  <div className="font-semibold">Este abate já está lançado: OC de {dataBR(ocRepetida.data_operacao)} · {ocRepetida.status_comercial} · R$ {brl(ocRepetida.valor_acordado)}. Não crie outra: anexe os documentos nela.</div>
                  {ladoALado && (
                    <table className="mt-1 w-full table-fixed bg-white text-[10.5px]" data-testid="importar-docs-x-oc">
                      <colgroup><col className="w-[130px]" /><col /><col /></colgroup>
                      <thead><tr className="h-[22px] bg-[#1B2A44] text-[9.5px] font-medium text-white">
                        <th className="px-1 text-left">Campo</th><th className="px-1 text-right">Documentos</th><th className="px-1 text-right">OC de hoje</th></tr></thead>
                      <tbody>{ladoALado.map(x => (
                        <tr key={x.campo} className={`h-[19px] border-b border-black/[0.06] tabular-nums ${x.difere ? 'bg-amber-50 font-semibold text-amber-900' : 'text-[#1d232b]'}`}>
                          <td className="px-1">{x.campo}</td><td className="px-1 text-right">{x.documentos}</td><td className="px-1 text-right">{x.oc}</td></tr>))}
                      </tbody>
                    </table>
                  )}
                  {ocExistente?.ok && (
                    <div className="mt-1" data-testid="importar-o-que-anexa">
                      <div className="font-semibold">O que será feito</div>
                      <ul className="list-disc pl-4">
                        <li>Anexar à OC: {(lidos?.documentos ?? []).filter(d => d.especie).map(d => ROTULO_ESPECIE[d.especie ?? 'outro'] ?? d.especie).join(' · ')} (os PDFs junto)</li>
                        <li>{difEntraNaOc ? `Registrar a diferença do acerto (R$ ${brl(pacote?.diferenca_acerto?.valor)}) como componente do acerto`
                          : pacote?.diferenca_acerto ? 'A diferença do acerto NÃO é registrada: o líquido da OC já tem o centavo (registrar contaria 2×)' : 'Sem diferença do acerto'}</li>
                        <li>Nada de lote, rebanho ou financeiro muda: as diferenças acima ficam para conferir na OC</li>
                      </ul>
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="mt-1 h-6 text-[11px]" onClick={() => { onAbrirOperacao(ocRepetida.id); onOpenChange(false); }}>Só abrir a OC</Button>
                </div>
              )}
              {parecidas?.ok === false && (
                <div className="mb-2 text-[11px] text-red-700" data-testid="importar-oc-nao-verificou">Não consegui verificar se este abate já está lançado.
                  {' '}<button type="button" className="underline" onClick={() => setTentativa(t => t + 1)}>Tentar de novo</button></div>
              )}
              {previa?.ja_existe && (
                <div className="text-[11px]">
                  <div className="font-semibold">Esta NF já está na OC {previa.rotulo ?? ''}: nada será criado.</div>
                  {previa.nada_muda ? <div>Os documentos dizem o mesmo que a OC.</div> : (
                    <table className="mt-1 w-full table-fixed text-[10.5px]"><tbody>
                      {(previa.diferencas ?? []).map(d => (
                        <tr key={d.campo} className="h-[19px] border-b border-black/[0.06]">
                          <td className="w-[180px] px-1">{d.campo}</td>
                          <td className="px-1 tabular-nums">OC: {JSON.stringify(d.hoje)}</td>
                          <td className="px-1 tabular-nums">documentos: {JSON.stringify(d.pacote)}</td>
                        </tr>))}
                    </tbody></table>
                  )}
                  {previa.operacao_id && <Button size="sm" variant="outline" className="mt-2 h-6 text-[11px]"
                    onClick={() => { if (previa.operacao_id) { onAbrirOperacao(previa.operacao_id); onOpenChange(false); } }}>Abrir a OC</Button>}
                </div>
              )}
              {resumo && !previa?.ja_existe && (
                <div className="space-y-2 text-[10.5px]">
                  <div className="grid grid-cols-4 gap-2">
                    <div><div className="text-muted-foreground">Abate</div><div className="font-semibold tabular-nums">{dataBR(resumo.data)}</div></div>
                    <div><div className="text-muted-foreground">Cabeças</div><div className="font-semibold tabular-nums">{resumo.lotes.reduce((a, l) => a + (l.cab ?? 0), 0)}</div></div>
                    <div><div className="text-muted-foreground">A receber</div><div className="font-semibold tabular-nums">R$ {brl(resumo.recebimento?.valor)}</div></div>
                    <div><div className="text-muted-foreground">Vencimento</div><div className="font-semibold tabular-nums">{dataBR(resumo.recebimento?.vencimento)}</div></div>
                  </div>
                  <table className="w-full table-fixed">
                    <colgroup><col className="w-[44px]" /><col className="w-[40px]" /><col /><col /><col /><col />{comIncentivo && <col />}<col /></colgroup>
                    <thead><tr className="h-[22px] bg-[#1B2A44] text-[9.5px] font-medium text-white">
                      <th className="px-1 text-left">Lote</th><th className="px-1 text-right">Cab.</th><th className="px-1 text-right">Carcaça kg</th>
                      <th className="px-1 text-right">R$/@</th><th className="px-1 text-right">SENAR</th><th className="px-1 text-right">Funrural</th>
                      {comIncentivo && <th className="px-1 text-right" title="Crédito do acerto (ex.: Incentivo Proape-Precoce), já dentro do líquido">Incentivo</th>}
                      <th className="px-1 text-right">Líquido R$</th></tr></thead>
                    <tbody>
                      {resumo.lotes.map(l => (
                        <tr key={l.ordem} className={`h-[19px] border-b border-black/[0.06] tabular-nums ${precoDiferente.includes(l.ordem) ? 'bg-amber-50 text-amber-900' : ''}`}
                          title={[loteLido(l.ordem)?.observacao, precoDiferente.includes(l.ordem) ? 'Preço por arroba diferente dos outros lotes: confira a categoria' : null].filter(Boolean).join(' · ') || undefined}>
                          <td className="px-1">{l.ordem}</td><td className="px-1 text-right">{l.cab}</td><td className="px-1 text-right">{brl(l.peso_carcaca_kg)}</td>
                          <td className="px-1 text-right">{brl(l.preco_arroba)}</td><td className="px-1 text-right text-red-700">{brl(l.senar)}</td>
                          <td className="px-1 text-right text-red-700">{brl(l.funrural)}</td>
                          {comIncentivo && <td className="px-1 text-right text-emerald-700">{brl(loteLido(l.ordem)?.incentivo ?? 0)}</td>}
                          <td className="px-1 text-right">{brl(l.valor_liquido)}</td>
                        </tr>))}
                      {(resumo.diferenca_acerto ?? 0) !== 0 && (
                        <tr className="h-[19px] border-b border-black/[0.06] tabular-nums text-amber-800">
                          <td className="px-1" colSpan={comIncentivo ? 7 : 6}>Diferença do acerto (componente explícito)</td><td className="px-1 text-right">{brl(resumo.diferenca_acerto)}</td>
                        </tr>)}
                    </tbody>
                    {/* ajuste 1: o TOTAL = o que entra na OC; o líquido total é o a receber */}
                    <tfoot><tr className="h-[22px] bg-[#1B2A44] font-semibold tabular-nums text-white" data-testid="importar-total">
                      <td className="px-1">Total</td><td className="px-1 text-right">{totais.cab}</td><td className="px-1 text-right">{brl(totais.kg)}</td>
                      <td /><td className="px-1 text-right">{brl(totais.senar)}</td><td className="px-1 text-right">{brl(totais.funrural)}</td>
                      {comIncentivo && <td className="px-1 text-right">{brl(totalIncentivo)}</td>}
                      <td className="px-1 text-right">{brl(totais.liquido)}</td></tr></tfoot>
                  </table>
                  {precoDiferente.length > 0 && (
                    <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900" data-testid="importar-preco-diferente">
                      {precoDiferente.length === 1 ? `O lote ${precoDiferente[0]} tem` : `Os lotes ${precoDiferente.join(', ')} têm`} preço por arroba bem diferente
                      do lote de mais cabeças: pode ser outra categoria (ex.: desclassificado). Confira a categoria de cada lote nas dúvidas.
                    </div>
                  )}
                  {/* ajuste 1: o que o "Criar" faz, em frases curtas */}
                  <div data-testid="importar-o-que-cria">
                    <div className="font-semibold">O que será criado</div>
                    <ul className="list-disc pl-4">
                      <li>OC de abate · {nomeDaFazenda} · comprador {contraparte?.nome ?? '—'} · abate em {dataBR(resumo.data)}</li>
                      <li>Baixa no rebanho: {baixaPorCategoria || `${totais.cab} cab · ${categoriaLabel}`} · em {dataBR(resumo.data)} · {nomeDaFazenda}</li>
                      <li>Lançamento a receber: R$ {brl(resumo.recebimento?.valor)} · vence {dataBR(resumo.recebimento?.vencimento)} · conta: escolha na OC (o banco casa na conciliação)</li>
                      <li title={(lidos?.documentos ?? []).map(d => d.nome).join(' · ')}>Documentos anexados: {resumo.documentos.map(rotuloDoDocumento).join(' · ') || '—'}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Dúvidas ── */}
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto" data-testid="importar-duvidas">
            <div className="text-[11px] font-semibold">Dúvidas {duvidas.length > 0 ? `· ${duvidas.length} em aberto` : '· respondidas'}</div>
            <label className="text-[10.5px]" id={ID_DA_DUVIDA.fazenda}>{FRASE_DUVIDA.fazenda}
              <SearchableSelect value={fazendaId ?? ''} onValueChange={v => { setFazendaId(v || null); setFazendaConfirmada(v !== ''); }} semTodos allValue="" allLabel="Escolha a fazenda" placeholder="Buscar fazenda"
                options={fazendas.map(f => ({ value: f.id, label: f.codigo ? `${f.codigo} · ${f.nome}` : f.nome }))} triggerClassName="h-[22px] text-[11px]" />
              {fazendaSugerida && (fazendaId === fazendaSugerida.fazenda.id
                ? (fazendaConfirmada
                    ? <span className="text-[9.5px] text-muted-foreground" data-testid="importar-fazenda-sugerida">{fazendaSugerida.pela === 'ie' ? 'Pela inscrição estadual da NF' : 'Pelo endereço da NF'} · confirmada</span>
                    : <span className={`text-[9.5px] ${fazendaSugerida.pela === 'ie' ? 'text-[#5A6472]' : 'font-semibold text-amber-700'}`} data-testid="importar-fazenda-sugerida">
                        {fazendaSugerida.pela === 'ie' ? 'Sugerida pela inscrição estadual da NF' : 'Sugerida pelo endereço da NF — CONFIRA'}
                        {' · '}<button type="button" className="underline" onClick={() => setFazendaConfirmada(true)} data-testid="importar-confirmar-fazenda">Confirmar</button>
                      </span>)
                : <span className="text-[9.5px] text-amber-700" data-testid="importar-fazenda-sugerida">A NF indica {fazendaSugerida.fazenda.nome}</span>)}
            </label>
            <label className="text-[10.5px]" id={ID_DA_DUVIDA.contraparte}>{FRASE_DUVIDA.contraparte}
              <FavorecidoSelect<FornecedorLido> value={contraparte?.id ?? ''} clienteId={clienteId || null}
                onChange={id => { if (!id) setContraparte(null); }} onSelected={x => setContraparte({ id: x.id, nome: x.nome })}
                limpavel placeholder="Escolha o frigorífico" triggerClassName="h-[22px] text-[11px]" />
              {lidos?.nomeFrigorifico && <span className="text-[9.5px] text-muted-foreground">Lido no PDF: {lidos.nomeFrigorifico}{lidos.cnpjFrigorifico ? ` · ${lidos.cnpjFrigorifico}` : ''}</span>}
            </label>
            <label className="text-[10.5px]" id={ID_DA_DUVIDA.categoria}>{FRASE_DUVIDA.categoria}
              <SearchableSelect value={categoria ?? ''} onValueChange={v => setCategoria(v || null)} semTodos allValue="" allLabel="Escolha a categoria" placeholder="Buscar categoria"
                options={CATEGORIAS.map(c => ({ value: c.value, label: c.label }))} triggerClassName="h-[22px] text-[11px]" />
            </label>
            {lotesLidos.length > 1 && (
              <div className="text-[10.5px]" data-testid="importar-categoria-por-lote">
                <div className="text-muted-foreground">Por lote (sem escolha, a de cima)</div>
                {lotesLidos.map(l => (
                  <div key={l.ordem} className={`mt-0.5 grid grid-cols-[134px_1fr] items-center gap-1 ${precoDiferente.includes(l.ordem) ? 'text-amber-800' : ''}`}>
                    <span className="whitespace-nowrap tabular-nums" title={l.observacao}>Lote {l.ordem} · {l.cab} cab · {brl(l.preco_arroba)}/@</span>
                    <SearchableSelect value={categoriasPorLote[l.ordem] ?? ''} semTodos allValue="" allLabel={categoria ? `${rotuloCat(categoria)} (a de cima)` : 'A de cima'}
                      placeholder="Buscar categoria" onValueChange={v => setCategoriasPorLote(c => ({ ...c, [l.ordem]: v || null }))}
                      options={CATEGORIAS.map(c => ({ value: c.value, label: c.label }))} triggerClassName="h-[22px] text-[11px]" />
                  </div>
                ))}
              </div>
            )}
            <label className="text-[10.5px]" id={ID_DA_DUVIDA.peso_vivo}>{FRASE_DUVIDA.peso_vivo}
              <CampoNumeroComConta valor={pesoVivo} onChange={setPesoVivo} casas={2} className="h-[22px] text-[11px]" />
              <span className="text-[9.5px] text-muted-foreground">O romaneio traz só a carcaça: o peso vivo é o da saída da fazenda.</span>
            </label>
          </div>
        </div>

        {/* ── Rodapé ── */}
        <div className="flex h-[32px] flex-none items-center gap-2 border-t pt-2">
          <span className={`min-w-0 flex-1 text-[10.5px] ${recusa ? 'text-red-700' : 'text-[#5A6472]'}`} data-testid="importar-motivo">
            {recusa ?? (criada ? (anexos ?? (anexada ? 'Documentos registrados · anexando os PDFs…' : 'OC criada · anexando os PDFs…'))
              : duvidas.length > 0 && montagem?.m && !montagem.m.recusa
                ? <>Responda as dúvidas: {duvidas.map((d, i) => (
                    <span key={d}>{i > 0 && ' · '}<button type="button" className="underline hover:text-[#1B2A44]" onClick={() => irParaADuvida(d)}
                      data-testid={`importar-ir-${d}`}>{FRASE_DUVIDA[d].replace('?', '')}</button></span>))}</>
                : motivoDoCriar ?? 'Pronto para criar')}
          </span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onOpenChange(false)} disabled={gravando}>
            {criada ? 'Fechar' : 'Cancelar'}</Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => void verPrevia()}
            disabled={!pacote || conferindo || gravando || criada != null}>{conferindo ? 'Conferindo…' : 'Ver prévia'}</Button>
          {ocRepetida ? (
            <Button size="sm" className="h-7 text-[11px]" onClick={() => void anexarNaOc()}
              disabled={motivoDoCriar !== 'Pronto para anexar à OC existente' || gravando || criada != null} title={motivoDoCriar ?? undefined} data-testid="importar-anexar">
              {gravando ? 'Anexando…' : 'Anexar à OC existente'}</Button>
          ) : (
            <Button size="sm" className="h-7 text-[11px]" onClick={() => void criar()}
              disabled={motivoDoCriar != null || gravando || criada != null} title={motivoDoCriar ?? undefined} data-testid="importar-criar">
              {gravando ? 'Criando…' : 'Criar OC e lançamentos'}</Button>
          )}
        </div>

        {criada && (
          <AnexarOsPdfs operacaoId={criada} clienteId={clienteId} arquivos={arquivosPorEspecie}
            aoTerminar={falhas => {
              setAnexos(falhas === 0 ? (anexada ? 'Documentos anexados à OC existente.' : 'OC criada com os PDFs anexados.')
                : `${anexada ? 'Documentos registrados' : 'OC criada'} · ${falhas} PDF(s) não anexaram: anexe na aba Documentos.`);
              onAbrirOperacao(criada);
            }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
