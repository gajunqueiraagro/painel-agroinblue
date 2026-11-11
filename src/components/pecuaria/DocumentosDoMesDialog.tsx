import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAlturaDaJanela } from '@/hooks/useLarguraDaJanela';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { REGRA_DO_DOCUMENTO_DO_MES, type DocumentosDoMesApi } from '@/hooks/useDocumentosDoMes';
import {
  CONVITE_DO_DOCUMENTO, FRASE_MOTIVO_OBRIGATORIO, FRASE_SEM_DOCUMENTOS, NOME_DO_TIPO_AO_NASCER, dataDoEnvio, mesCurtoDoDocumento, mesVizinho,
  nomeDoTipo, ordenarPorTipo, prefixoDoTituloDosDocumentos, textoDoTamanho, tituloDosDocumentos, type DocumentoDoMes,
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
 * ⚠ FECH-DOCS-01b — O MÊS SE TROCA NO TÍTULO: "… · ‹ set/26 ›". As setas pedem o mês vizinho ao hospedeiro (`aoTrocarMes`), que
 *   troca o `anoMes` e a `api` (a lista). O mês tem largura fixa (as setas não andam) e o cabeçalho segue com 36px. Trocar de mês
 *   desfaz edição / cancelamento em curso. Quem conta no botão da tela é o hospedeiro, pelo mês de ABERTURA — não este diálogo.
 * ⚠ FECH-DOCS-02 (Gabriel 05/11; D1 a D5 pela recomendação — confirmar de manhã):
 *   - A LISTA CRESCE ATÉ CABER (`alturaDaLista`): linhas × 24, no mínimo 3, até o teto de 85% da janela menos as partes fixas (cabeçalho,
 *     área, recado, rodapé); passou disso, SÓ a lista rola, com a barra numa calha própria (`scrollbar-gutter: stable`: nunca em cima do
 *     "cancelar"). O TOPO DO DIÁLOGO É PRESO (7,5% da janela, D1): crescer ou trocar de mês nunca move o título com ‹ ›; só o rodapé desce.
 *   - O TIPO VEM DO CATÁLOGO (`api.tipos`) e se escolhe com BUSCA (`SearchableSelect`, os grupos como cabeçalho); a lista vem ordenada por
 *     tipo e nome (`ordenarPorTipo`, D4 a). Data dd/mm/aaaa e tamanho em colunas próprias (ALINHAMENTO SOBERANO).
 */

export const ALTURA_DA_LINHA = 24;
export const LINHAS_A_VISTA = 3;
/** cabeçalho 36 + área (8 + 24 + 4) + recado 26 + rodapé 32: o que não rola */
export const PARTES_FIXAS = 130;
/** Tipo 132 | Nome (o resto: `null`; com o tipo, os únicos que cortam, "…" + `title`) | data 66 | tamanho 52 | visualizar | lápis | cancelar.
 *  Uma TABELA de régua fixa (`table-layout: fixed` + `colgroup` em px; 3px de cada lado da célula = os 6px entre colunas): o corte com "…"
 *  só vale em célula de tabela (REGRA DE CORTE; o gate de tela recusa "…" fora de `td`). */
export const COLUNAS_DA_LINHA: ReadonlyArray<number | null> = [132 + 6, null, 66 + 6, 52 + 6, 56 + 6, 16 + 6, 48 + 6];
const CELULA = 'px-[3px] align-middle';

/** A altura da lista: linhas × 24 (mínimo 3), até o teto de 85% da janela menos as partes fixas (inteiro em linhas). */
export function alturaDaLista(quantidade: number, alturaDaJanela: number): number {
  const teto = Math.max(LINHAS_A_VISTA, Math.floor((alturaDaJanela * 0.85 - PARTES_FIXAS) / ALTURA_DA_LINHA));
  return Math.min(Math.max(quantidade, LINHAS_A_VISTA), teto) * ALTURA_DA_LINHA;
}

export interface DocumentosDoMesDialogProps {
  aberto: boolean;
  aoFechar: () => void;
  fazendaNome: string;
  /** O mês que o diálogo mostra agora ('AAAA-MM'). */
  anoMes: string;
  /** As setas do título: o hospedeiro troca o mês (e a `api`). */
  aoTrocarMes: (anoMes: string) => void;
  api: DocumentosDoMesApi;
  /** Para o teste: quem abre o endereço assinado. Padrão: nova aba. */
  abrirEndereco?: (url: string) => void;
}

/** As setas do mês no título: 16px, dentro dos 36px do cabeçalho. */
const SETA_DO_MES = 'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[13px] leading-none text-primary hover:bg-primary/15 disabled:opacity-40';

const abrirEmNovaAba = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); };

export function DocumentosDoMesDialog({ aberto, aoFechar, fazendaNome, anoMes, aoTrocarMes, api, abrirEndereco = abrirEmNovaAba }: DocumentosDoMesDialogProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipoId, setTipoId] = useState('');
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

  /* Outro mês, outra lista: o gesto em curso (edição, cancelamento, recado) era do mês que saiu. */
  useEffect(() => {
    setEditandoId(null); setCancelandoId(null); setMotivo(''); setRecado(null); setErroAnexo(null);
  }, [anoMes]);

  const editar = (d: DocumentoDoMes) => {
    setCancelandoId(null); setMotivo(''); setRecado(null);
    setEditandoId(d.id); setTipoId(d.tipoId); setNome(d.nome);
  };
  const sairDaEdicao = () => { setEditandoId(null); setRecado(null); };

  const soltar = async (arquivo: File | undefined) => {
    if (!arquivo || ocupado) return;
    setOcupado(true); setErroAnexo(null); setRecado(null);
    try {
      const r = await api.anexar(arquivo);
      if (!r.ok) setErroAnexo(r.erro ?? 'Não foi possível anexar o documento.');
      /* A linha nasce em edição — também quando o arquivo não subiu (a linha existe, "sem arquivo"). */
      if (r.id) {
        setCancelandoId(null); setEditandoId(r.id); setNome(arquivo.name.trim() || 'documento');
        setTipoId(api.tipos.find(t => t.nome === NOME_DO_TIPO_AO_NASCER)?.id ?? '');
      }
    } finally { setOcupado(false); }
  };

  const gravarEdicao = async (d: DocumentoDoMes) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await api.renomear({ id: d.id, versao: d.versao }, { tipoId, nome });
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
  const docs = ordenarPorTipo(api.documentos, api.tipos);
  const alturaDaJanela = useAlturaDaJanela();
  const opcoesDoTipo = api.tipos.map(t => ({ value: t.id, label: t.nome, grupo: t.grupo ?? undefined }));
  const cancelando = cancelandoId ? docs.find(d => d.id === cancelandoId) ?? null : null;
  const recadoDaLista = recado ?? api.erro;

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent
        className="top-[7.5vh] flex w-[94vw] max-w-[560px] translate-y-0 flex-col gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0"
        data-testid="documentos-do-mes"
        onEscapeKeyDown={(e) => {
          /* Esc na edição / no motivo desfaz o gesto e o diálogo FICA. */
          if (editandoId) { e.preventDefault(); sairDaEdicao(); }
          else if (cancelandoId) { e.preventDefault(); setCancelandoId(null); setMotivo(''); setRecado(null); }
        }}
      >
        <DialogHeader className="flex h-9 shrink-0 flex-row items-center border-b bg-primary/10 px-3 pr-10 text-left">
          <DialogTitle className="flex min-w-0 items-center gap-1 text-[13px] font-medium leading-none text-primary" title={titulo}
            data-testid="titulo-documentos-do-mes">
            <span className="min-w-0 truncate">{prefixoDoTituloDosDocumentos(fazendaNome)}</span>
            {' '}
            <button type="button" className={SETA_DO_MES} data-testid="mes-anterior" aria-label="Mês anterior" title="Mês anterior"
              disabled={ocupado} onClick={() => aoTrocarMes(mesVizinho(anoMes, -1))}>‹</button>
            {' '}
            <span className="w-[42px] shrink-0 text-center tabular-nums" data-testid="mes-do-dialogo">{mesCurtoDoDocumento(anoMes)}</span>
            {' '}
            <button type="button" className={SETA_DO_MES} data-testid="mes-seguinte" aria-label="Próximo mês" title="Próximo mês"
              disabled={ocupado} onClick={() => aoTrocarMes(mesVizinho(anoMes, 1))}>›</button>
          </DialogTitle>
          <DialogDescription className="sr-only">Arquivos que o campo mandou neste mês.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-3 pt-2">
          <AreaDeArquivo regra={REGRA_DO_DOCUMENTO_DO_MES} className="h-6" testId="area-documento-do-mes"
            inputTestId="input-documento-do-mes" convite={CONVITE_DO_DOCUMENTO} detalhe=""
            desabilitado={ocupado} motivoDesabilitado="Gravando…" motivoExterno={erroAnexo}
            onArquivos={([f]) => { void soltar(f); }} />

          <div className="mt-1 overflow-y-auto" style={{ height: alturaDaLista(docs.length, alturaDaJanela), scrollbarGutter: 'stable' }}
            data-testid="lista-documentos-do-mes">
            {docs.length === 0 ? (
              <div className="pt-1 text-[10px] text-muted-foreground" data-testid="sem-documentos">
                {api.lendo ? 'Lendo…' : FRASE_SEM_DOCUMENTOS}
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-[10px]" data-testid="tabela-documentos-do-mes">
                <colgroup>{COLUNAS_DA_LINHA.map((w, i) => <col key={i} style={w === null ? undefined : { width: w }} />)}</colgroup>
                <tbody>
                {docs.map(d => {
                  const emEdicao = editandoId === d.id;
                  return (
                    <tr key={d.id} data-testid="linha-documento" data-edicao={emEdicao ? 'sim' : undefined}
                      className={`whitespace-nowrap border-b ${cancelandoId === d.id ? 'bg-destructive/5' : ''}`}
                      style={{ height: ALTURA_DA_LINHA }}>
                      {emEdicao ? (
                        <td className={CELULA} data-testid="edicao-especie">
                          <SearchableSelect value={tipoId} options={opcoesDoTipo} semTodos allValue="" allLabel="Tipo…"
                            placeholder="Buscar tipo…" triggerClassName="h-5 px-1.5 py-0 text-[10px]"
                            onValueChange={(v) => { if (v) setTipoId(v); campoDoNome.current?.focus(); }} />
                        </td>
                      ) : (
                        <td className={`${CELULA} truncate text-muted-foreground`} title={nomeDoTipo(api.tipos, d.tipoId)} data-testid="cel-especie">
                          {nomeDoTipo(api.tipos, d.tipoId)}
                        </td>
                      )}
                      {emEdicao ? (
                        <td className={CELULA}>
                          <Input ref={campoDoNome} autoFocus value={nome} aria-label="Nome do documento" data-testid="edicao-nome"
                            className="h-5 min-w-0 px-1.5 py-0 text-[10px]"
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setNome(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); void gravarEdicao(d); }
                              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sairDaEdicao(); }
                            }} />
                        </td>
                      ) : (
                        <td className={`${CELULA} truncate`} title={d.nome} data-testid="cel-nome" data-nome-de-arquivo>{d.nome}</td>
                      )}
                      <td className={`${CELULA} text-right tabular-nums text-muted-foreground`} data-testid="cel-data">{dataDoEnvio(d.uploadedEm)}</td>
                      <td className={`${CELULA} text-right tabular-nums text-muted-foreground`} data-testid="cel-tamanho">{textoDoTamanho(d.tamanhoBytes)}</td>
                      <td className={CELULA}>
                        {d.url ? (
                          <button type="button" className="text-left text-primary underline"
                            onClick={() => { void visualizar(d.url ?? ''); }}>visualizar</button>
                        ) : (
                          <span className="text-warning" title="O arquivo não subiu. Cancele e envie de novo.">sem arquivo</span>
                        )}
                      </td>
                      <td className={CELULA}>
                        <button type="button" className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                          title="Editar tipo e nome" aria-label="Editar tipo e nome" data-testid="lapis-documento"
                          onClick={() => editar(d)}>
                          <Pencil className="h-3 w-3" />
                        </button>
                      </td>
                      <td className={CELULA}>
                        <button type="button" className="text-left text-destructive underline" data-testid="cancelar-documento"
                          onClick={() => { setEditandoId(null); setRecado(null); setCancelandoId(d.id); setMotivo(''); }}>cancelar</button>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
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
