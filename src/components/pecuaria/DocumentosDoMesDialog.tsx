import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { REGRA_DO_DOCUMENTO_DO_MES, type DocumentosDoMesApi } from '@/hooks/useDocumentosDoMes';
import {
  CONVITE_DO_DOCUMENTO, ESPECIES_DO_DOCUMENTO, FRASE_MOTIVO_OBRIGATORIO, FRASE_SEM_DOCUMENTOS, ROTULO_DA_ESPECIE, dataETamanho, ehEspecie,
  tituloDosDocumentos, type DocumentoDoMes, type EspecieDoDocumento,
} from '@/lib/pecuaria/documentosDoMes';

/**
 * FECH-DOCS-01 — "Documentos do mês — <fazenda> · <mês/ano>" (mock v2 aprovado pelo Gabriel em 12/10/2026).
 *
 * Molde: os anexos do extrato do `SaldoRealDialog` (a área de 24px, a lista, visualizar / cancelar com motivo).
 * ⚠ NÃO É O MESMO COMPONENTE, de propósito: aqui a linha tem espécie e nasce em edição; o que se REUSA é a `AreaDeArquivo`, o dono
 *   do aceite e o padrão registrar-primeiro-subir-depois (no hook).
 * ⚠ TAMANHO FIXO: cabeçalho 36 · área 24 · lista 72 (três linhas de 24; rola sozinha a partir do 4º) · lugar reservado de 26 para o
 *   motivo do cancelamento / o recado · rodapé 32. Nada muda de altura ao soltar, editar, cancelar ou errar.
 * ⚠ SOLTAR GRAVA NA HORA com o nome que veio e espécie "Outro"; a linha nasce em EDIÇÃO: Enter grava espécie + nome num gesto, Esc
 *   deixa como veio (e NÃO fecha o diálogo). O lápis reabre.
 * ⚠ Recado e recusa ficam ESCRITOS no lugar reservado, nunca em toast.
 */

export const ALTURA_DA_LINHA = 24;
export const LINHAS_A_VISTA = 3;
/** Espécie 96 | Nome (o resto, o único que corta) | data · tamanho | visualizar | lápis | cancelar */
export const GRADE_DA_LINHA = 'grid grid-cols-[96px_minmax(0,1fr)_78px_56px_16px_48px] items-center gap-1.5';

export interface DocumentosDoMesDialogProps {
  aberto: boolean;
  aoFechar: () => void;
  fazendaNome: string;
  anoMes: string;
  api: DocumentosDoMesApi;
  /** Para o teste: quem abre o endereço assinado. Padrão: nova aba. */
  abrirEndereco?: (url: string) => void;
}

const abrirEmNovaAba = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); };

export function DocumentosDoMesDialog({ aberto, aoFechar, fazendaNome, anoMes, api, abrirEndereco = abrirEmNovaAba }: DocumentosDoMesDialogProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [especie, setEspecie] = useState<EspecieDoDocumento>('outro');
  const [nome, setNome] = useState('');
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [recado, setRecado] = useState<string | null>(null);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campoDoNome = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) { setEditandoId(null); setCancelandoId(null); setMotivo(''); setRecado(null); setErroAnexo(null); }
  }, [aberto]);

  const editar = (d: DocumentoDoMes) => {
    setCancelandoId(null); setMotivo(''); setRecado(null);
    setEditandoId(d.id); setEspecie(d.especie); setNome(d.nome);
  };
  const sairDaEdicao = () => { setEditandoId(null); setRecado(null); };

  const soltar = async (arquivo: File | undefined) => {
    if (!arquivo || ocupado) return;
    setOcupado(true); setErroAnexo(null); setRecado(null);
    try {
      const r = await api.anexar(arquivo);
      if (!r.ok) setErroAnexo(r.erro ?? 'Não foi possível anexar o documento.');
      /* A linha nasce em edição — também quando o arquivo não subiu (a linha existe, "sem arquivo"). */
      if (r.id) { setCancelandoId(null); setEditandoId(r.id); setEspecie('outro'); setNome(arquivo.name.trim() || 'documento'); }
    } finally { setOcupado(false); }
  };

  const gravarEdicao = async (d: DocumentoDoMes) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await api.renomear({ id: d.id, versao: d.versao }, { especie, nome });
      if (r.ok) { setEditandoId(null); setRecado(null); } else setRecado(r.erro);
    } finally { setOcupado(false); }
  };

  const confirmarCancelamento = async () => {
    if (!cancelandoId || ocupado || !motivo.trim()) return;
    setOcupado(true);
    try {
      const r = await api.cancelar(cancelandoId, motivo);
      if (r.ok) { setCancelandoId(null); setMotivo(''); setRecado(null); } else setRecado(r.erro);
    } finally { setOcupado(false); }
  };

  const visualizar = async (caminho: string) => {
    const url = await api.urlAssinada(caminho);
    if (url) abrirEndereco(url); else setRecado('Não foi possível abrir o arquivo.');
  };

  const titulo = tituloDosDocumentos(fazendaNome, anoMes);
  const docs = api.documentos;
  const cancelando = cancelandoId ? docs.find(d => d.id === cancelandoId) ?? null : null;
  const recadoDaLista = recado ?? api.erro;

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent
        className="flex w-[94vw] max-w-md flex-col gap-0 overflow-hidden p-0"
        data-testid="documentos-do-mes"
        onEscapeKeyDown={(e) => {
          /* Esc na edição / no motivo desfaz o gesto e o diálogo FICA. */
          if (editandoId) { e.preventDefault(); sairDaEdicao(); }
          else if (cancelandoId) { e.preventDefault(); setCancelandoId(null); setMotivo(''); setRecado(null); }
        }}
      >
        <DialogHeader className="flex h-9 shrink-0 flex-row items-center border-b bg-primary/10 px-3 pr-10 text-left">
          <DialogTitle className="min-w-0 truncate text-[13px] font-medium leading-none text-primary" title={titulo}>
            {titulo}
          </DialogTitle>
          <DialogDescription className="sr-only">Arquivos que o campo mandou neste mês.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-3 pt-2">
          <AreaDeArquivo regra={REGRA_DO_DOCUMENTO_DO_MES} className="h-6" testId="area-documento-do-mes"
            inputTestId="input-documento-do-mes" convite={CONVITE_DO_DOCUMENTO} detalhe=""
            desabilitado={ocupado} motivoDesabilitado="Gravando…" motivoExterno={erroAnexo}
            onArquivos={([f]) => { void soltar(f); }} />

          <div className="mt-1 overflow-y-auto" style={{ height: ALTURA_DA_LINHA * LINHAS_A_VISTA }} data-testid="lista-documentos-do-mes">
            {docs.length === 0 ? (
              <div className="pt-1 text-[10px] text-muted-foreground" data-testid="sem-documentos">
                {api.lendo ? 'Lendo…' : FRASE_SEM_DOCUMENTOS}
              </div>
            ) : (
              <ul>
                {docs.map(d => {
                  const emEdicao = editandoId === d.id;
                  return (
                    <li key={d.id} data-testid="linha-documento" data-edicao={emEdicao ? 'sim' : undefined}
                      className={`${GRADE_DA_LINHA} whitespace-nowrap border-b text-[10px] ${cancelandoId === d.id ? 'bg-destructive/5' : ''}`}
                      style={{ height: ALTURA_DA_LINHA }}>
                      {emEdicao ? (
                        <Select value={especie} onValueChange={(v) => { if (ehEspecie(v)) setEspecie(v); campoDoNome.current?.focus(); }}>
                          <SelectTrigger className="h-5 px-1.5 py-0 text-[10px]" data-testid="edicao-especie" aria-label="Espécie">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ESPECIES_DO_DOCUMENTO.map(e => <SelectItem key={e} value={e}>{ROTULO_DA_ESPECIE[e]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="truncate text-muted-foreground" title={ROTULO_DA_ESPECIE[d.especie]} data-testid="cel-especie">
                          {ROTULO_DA_ESPECIE[d.especie]}
                        </span>
                      )}
                      {emEdicao ? (
                        <Input ref={campoDoNome} autoFocus value={nome} aria-label="Nome do documento" data-testid="edicao-nome"
                          className="h-5 min-w-0 px-1.5 py-0 text-[10px]"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setNome(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); void gravarEdicao(d); }
                            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sairDaEdicao(); }
                          }} />
                      ) : (
                        <span className="min-w-0 truncate" title={d.nome} data-testid="cel-nome">{d.nome}</span>
                      )}
                      <span className="text-right tabular-nums text-muted-foreground" data-testid="cel-data">{dataETamanho(d)}</span>
                      {d.url ? (
                        <button type="button" className="text-left text-primary underline"
                          onClick={() => { void visualizar(d.url ?? ''); }}>visualizar</button>
                      ) : (
                        <span className="text-warning" title="O arquivo não subiu. Cancele e envie de novo.">sem arquivo</span>
                      )}
                      <button type="button" className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                        title="Editar espécie e nome" aria-label="Editar espécie e nome" data-testid="lapis-documento"
                        onClick={() => editar(d)}>
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button type="button" className="text-left text-destructive underline" data-testid="cancelar-documento"
                        onClick={() => { setEditandoId(null); setRecado(null); setCancelandoId(d.id); setMotivo(''); }}>cancelar</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Lugar reservado: o motivo do cancelamento, ou o recado. Existe sempre. */}
          <div className="flex h-[26px] items-center gap-1" data-testid="lugar-do-recado">
            {cancelando && recado ? (
              <>
                <span className="min-w-0 flex-1 truncate text-[10px] text-destructive" role="alert" title={recado} data-testid="recado-documentos">
                  {recado}
                </span>
                <Button type="button" size="sm" variant="ghost" className="h-[22px] shrink-0 px-2 text-[10px]"
                  onClick={() => setRecado(null)}>Tentar de novo</Button>
              </>
            ) : cancelando ? (
              <>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus data-testid="motivo-do-cancelamento"
                  className="h-[22px] min-w-0 flex-1 px-1.5 py-0 text-[10px]" placeholder={`Motivo para cancelar “${cancelando.nome}”`}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmarCancelamento(); } }} />
                <Button type="button" size="sm" variant="destructive" className="h-[22px] shrink-0 px-2 text-[10px]"
                  data-testid="confirmar-cancelamento" disabled={ocupado || !motivo.trim()}
                  title={motivo.trim() ? undefined : FRASE_MOTIVO_OBRIGATORIO}
                  onClick={() => { void confirmarCancelamento(); }}>Confirmar</Button>
                <Button type="button" size="sm" variant="ghost" className="h-[22px] shrink-0 px-2 text-[10px]"
                  onClick={() => { setCancelandoId(null); setMotivo(''); setRecado(null); }}>Voltar</Button>
              </>
            ) : recadoDaLista ? (
              <span className="min-w-0 truncate text-[10px] text-destructive" role="alert" title={recadoDaLista} data-testid="recado-documentos">
                {recadoDaLista}
              </span>
            ) : editandoId ? (
              <span className="truncate text-[10px] text-muted-foreground">Enter grava · Esc deixa como veio</span>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex h-8 shrink-0 flex-row items-center justify-between gap-2 border-t bg-accent px-3 sm:justify-between">
          <span className="text-[10px] text-muted-foreground" data-testid="contagem-documentos">
            {docs.length === 1 ? '1 documento' : `${docs.length} documentos`}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-[22px] px-2.5 text-[10px]" onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
