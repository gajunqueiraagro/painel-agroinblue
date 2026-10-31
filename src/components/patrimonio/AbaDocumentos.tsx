/**
 * PATR-01 · PR B — aba DOCUMENTOS do bem: arrastar ou clicar (a `AreaDeArquivo` da casa), o tipo escolhido antes, e a lista.
 * ⚠ REGISTRAR PRIMEIRO, SUBIR DEPOIS (o molde de `fn_financiamento_documento_*`): o caminho vem do banco, no bucket `fin-documentos`;
 * se a subida falha, o registro é cancelado. Remover pede motivo e o arquivo fica no bucket (nada se apaga).
 * ⚠ Coluna "Nº" do mock: o documento do bem não tem número no esquema aprovado — fica de fora (declarado no relatório).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BlocoFormulario } from '@/components/ui/bloco-formulario';
import type { RegraDeAceite, VereditoDoArquivo } from '@/lib/arquivo/aceitarArquivo';
import { cn } from '@/lib/utils';
import { usePatrimonioApi, useRelerPatrimonio } from '@/hooks/usePatrimonio';
import { dataBR, ESPECIES_DE_DOCUMENTO, rotuloEspecie, tamanhoDoArquivo } from '@/lib/patrimonio/patrimonio';
import type { DocumentoBem } from '@/lib/patrimonio/patrimonioApi';
import { PedirMotivo, QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TD_MODAL_TEXTO, TH_MODAL, TH_MODAL_NUM } from './pecas';

const REGRA: RegraDeAceite = { tipos: ['pdf', 'jpg', 'png', 'xml', 'xlsx'], tamanhoMaxBytes: 20 * 1024 * 1024, varios: true };

export function AbaDocumentos({ bemId, documentos }: { bemId: string; documentos: DocumentoBem[] }) {
  const api = usePatrimonioApi();
  const reler = useRelerPatrimonio();
  const [especie, setEspecie] = useState('nota_fiscal');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<DocumentoBem | null>(null);

  const receber = async (_arquivos: File[], vereditos: VereditoDoArquivo[]) => {
    setEnviando(true); setErro(null);
    let ok = 0;
    for (const v of vereditos) {
      if (v.motivo) { setErro(v.motivo); continue; }
      const e = await api.enviarDocumento(bemId, v.arquivo, especie);
      if (e) setErro(e); else ok += 1;
    }
    setEnviando(false);
    if (ok) { toast.success(ok === 1 ? 'Documento anexado.' : `${ok} documentos anexados.`); await reler(); }
  };
  const abrir = async (d: DocumentoBem) => {
    if (!d.storage_path) return;
    const url = await api.urlDoDocumento(d.storage_path);
    if (url) window.open(url, '_blank', 'noopener'); else setErro('Não consegui abrir o arquivo.');
  };

  return (
    <BlocoFormulario titulo="Documentos" dica="nota fiscal, contrato, apólice, laudo, matrícula, foto" className="min-h-0 flex-1">
      <div className="flex h-[48px] shrink-0 items-stretch gap-1.5">
        <div className="flex w-[170px] shrink-0 flex-col justify-center">
          <span className="mb-0.5 text-[10px] text-muted-foreground">tipo do próximo arquivo</span>
          <SearchableSelect value={especie} onValueChange={setEspecie} semTodos allLabel="tipo" allValue=""
            options={ESPECIES_DE_DOCUMENTO.map(e => ({ value: e.valor, label: e.rotulo }))} triggerClassName="h-[24px] text-[11px]" />
        </div>
        <AreaDeArquivo regra={REGRA} modo="lote" onArquivos={(a, v) => void receber(a, v)} desabilitado={enviando}
          motivoDesabilitado="enviando…" motivoExterno={erro}
          convite="Arraste aqui os arquivos ou clique para escolher" detalhe="PDF, imagem, XML ou Excel · até 20 MB" className="min-w-0 flex-1" testId="bem-area-documentos" />
      </div>
      <div className={cn(QUADRO_MODAL, 'mt-1.5')} data-testid="bem-documentos">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col style={{ width: 74 }} /><col style={{ width: 120 }} /><col /><col style={{ width: 76 }} /><col style={{ width: 20 }} /></colgroup>
          <thead className="text-primary-foreground">
            <tr className="h-[22px]"><th className={TH_MODAL}>Data</th><th className={TH_MODAL}>Tipo</th><th className={TH_MODAL}>Arquivo</th><th className={TH_MODAL_NUM}>Tamanho</th><th className={TH_MODAL} /></tr>
          </thead>
          <tbody>
            {documentos.map(d => (
              <tr key={d.id} className="h-[19px] border-b border-border/40">
                <td className={cn(TD_MODAL_NUM, 'text-left text-[9.5px]')}>{dataBR(d.criado_em.slice(0, 10))}</td>
                <td className={TD_MODAL_TEXTO}>{rotuloEspecie(d.especie)}</td>
                <td className={TD_MODAL_TEXTO} title={d.nome}>
                  <button type="button" className="max-w-full truncate text-left text-primary hover:underline" onClick={() => void abrir(d)}>{d.nome}</button>
                </td>
                <td className={TD_MODAL_NUM}>{tamanhoDoArquivo(d.tamanho_bytes)}</td>
                <td className={cn(TD_MODAL, 'px-0 text-center')}>
                  <button type="button" className="text-muted-foreground hover:text-destructive" title="Remover (o arquivo fica guardado)" onClick={() => setRemovendo(d)}>
                    <X className="mx-auto h-3 w-3" /></button>
                </td>
              </tr>
            ))}
            {documentos.length === 0 && (
              <tr className="h-[19px]"><td colSpan={5} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>Nenhum documento.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PedirMotivo aberto={removendo != null} aoFechar={() => setRemovendo(null)} titulo="Remover documento" rotuloDoBotao="Remover"
        frase="O documento sai da lista; o arquivo fica guardado. Por quê?"
        aoConfirmar={async motivo => {
          if (!removendo) return null;
          const r = await api.removerDocumento(removendo.id, motivo);
          if (!r.ok) return r.erro;
          await reler();
          return null;
        }} />
    </BlocoFormulario>
  );
}
