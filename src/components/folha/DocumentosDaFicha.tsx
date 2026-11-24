/**
 * FOLHA-01 · PR B (telas) — os DOCUMENTOS da ficha (o molde do Patrimônio; contrato §3.1): arrastar ou escolher (a `AreaDeArquivo` da casa),
 * o tipo, a data e o vencimento escolhidos ANTES, e a lista.
 * ⚠ REGISTRAR → SUBIR → DETALHAR (`folhaApi.enviarDocumento`): o caminho vem do banco, no bucket privado `folha-documentos`; a subida que
 *   falha cancela o registro. UM registro só (`folha_documentos`): a ficha, a folha e o lançamento apontam para ele.
 * ⚠ VER = O VISUALIZADOR ÚNICO (PDF); imagem e planilha abrem em aba nova pelo endereço assinado. REMOVER pede o motivo e o arquivo fica
 *   guardado (nada se apaga).
 * ⚠ O VENCIMENTO: `dias` vem do banco — ≤ 30 âmbar "vence em N dias", < 0 vermelho "vencido há N dias".
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { PedirMotivo } from '@/components/patrimonio/pecas';
import type { RegraDeAceite, VereditoDoArquivo } from '@/lib/arquivo/aceitarArquivo';
import { useFolhaApi, useRelerFolha } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import { avisoDoVencimento, dataBR, ehEspecie, ESPECIES_DE_DOCUMENTO, rotuloEspecie, type DocumentoDoFuncionario, type EspecieDocumento } from '@/lib/folha/folhaTela';
import { useVerDocumento } from './useVerDocumento';

const REGRA: RegraDeAceite = { tipos: ['pdf', 'jpg', 'png', 'xml', 'xlsx'], tamanhoMaxBytes: 20 * 1024 * 1024, varios: true };
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');

export function DocumentosDaFicha({ clienteId, funcionarioId, documentos }: { clienteId: string; funcionarioId: string; documentos: DocumentoDoFuncionario[] }) {
  const api = useFolhaApi();
  const reler = useRelerFolha();
  const [especie, setEspecie] = useState<EspecieDocumento>('contrato');
  const [dataDoc, setDataDoc] = useState<string>('');
  const [vencimento, setVencimento] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<DocumentoDoFuncionario | null>(null);
  const { ver, visualizador } = useVerDocumento(setErro);

  const receber = async (vereditos: VereditoDoArquivo[]) => {
    setEnviando(true); setErro(null);
    let ok = 0;
    for (const v of vereditos) {
      if (v.motivo) { setErro(v.motivo); continue; }
      const e = await api.enviarDocumento(clienteId, funcionarioId, v.arquivo, especie, {
        ...(dataDoc ? { data_documento: dataDoc } : {}), ...(vencimento ? { vencimento } : {}),
      });
      if (e) setErro(e); else ok += 1;
    }
    setEnviando(false);
    if (ok) { toast.success(ok === 1 ? 'Documento anexado.' : `${ok} documentos anexados.`); setVencimento(''); await reler(); }
  };
  const abrir = (d: DocumentoDoFuncionario) => ver(d.bucket, d.storage_path, d.nome);

  return (
    <div className="flex flex-col gap-1.5 pt-1" data-testid="folha-ficha-documentos">
      <div className="grid h-[40px] shrink-0 gap-1.5" style={{ gridTemplateColumns: 'minmax(0,1fr) 96px 96px' }}>
        <label className="flex min-w-0 flex-col justify-end">
          <span className="mb-0.5 truncate text-[9.5px] text-muted-foreground">tipo do próximo arquivo</span>
          <SearchableSelect value={especie} onValueChange={v => { if (ehEspecie(v)) setEspecie(v); }} semTodos allLabel="tipo" allValue=""
            options={ESPECIES_DE_DOCUMENTO.map(e => ({ value: e.valor, label: e.rotulo }))} triggerClassName="h-[24px] text-[10.5px]" />
        </label>
        <label className="flex min-w-0 flex-col justify-end">
          <span className="mb-0.5 truncate text-[9.5px] text-muted-foreground">data</span>
          <DatePicker size="compact" value={dataDoc} onChange={v => setDataDoc(v ?? '')} />
        </label>
        <label className="flex min-w-0 flex-col justify-end">
          <span className="mb-0.5 truncate text-[9.5px] text-muted-foreground" title="opcional: ASO, experiência, EPI">vencimento</span>
          <DatePicker size="compact" value={vencimento} onChange={v => setVencimento(v ?? '')} />
        </label>
      </div>
      <AreaDeArquivo regra={REGRA} modo="lote" onArquivos={(_a, v) => void receber(v)} desabilitado={enviando} motivoDesabilitado="enviando…"
        motivoExterno={erro} convite="Arraste ou clique para escolher" detalhe="até 20 MB"
        className="h-[40px] shrink-0" testId="folha-area-documentos" />
      <div className="rounded border bg-card" data-testid="folha-documentos">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col style={{ width: 74 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 18 }} /></colgroup>
          <thead className="text-primary-foreground">
            <tr className="h-[22px]"><th className={TH}>Tipo</th><th className={TH}>Arquivo</th><th className={TH}>Vencimento</th><th className={TH} /></tr>
          </thead>
          <tbody>
            {documentos.map(d => {
              const aviso = avisoDoVencimento(d.dias);
              return (
                <tr key={d.id} className="h-[19px] border-b border-border/40" data-testid="folha-documento">
                  <td className={TD_REGUA_TEXTO} title={rotuloEspecie(d.especie)}>{rotuloEspecie(d.especie)}</td>
                  <td className={TD_REGUA_TEXTO} title={`${d.nome}${d.data_documento ? ` · ${dataBR(d.data_documento)}` : ''}`}>
                    <button type="button" className="max-w-full truncate text-left text-primary hover:underline" onClick={() => void abrir(d)}>{d.nome}</button>
                  </td>
                  <td className={cn(TD_REGUA_NUM, 'text-left', aviso?.tom === 'ambar' && 'text-amber-700', aviso?.tom === 'vermelho' && 'font-semibold text-red-700', !d.vencimento && 'text-muted-foreground')}
                    title={aviso ? `${aviso.texto} (${dataBR(d.vencimento)})` : undefined} data-testid="folha-documento-vencimento">
                    {d.vencimento ? dataBR(d.vencimento) : '—'}
                    {/* o aviso é um PONTO desenhado (sem texto): a célula de data guarda só a data dd/mm/aaaa (gate `data`) */}
                    {aviso && <span aria-hidden className="ml-1 inline-block h-[5px] w-[5px] rounded-full bg-current align-middle" />}
                  </td>
                  <td className={cn(TD_REGUA, 'px-0 text-center')}>
                    <button type="button" className="text-muted-foreground hover:text-destructive" title="Remover (o arquivo fica guardado)" onClick={() => setRemovendo(d)}>
                      <X className="mx-auto h-3 w-3" /></button>
                  </td>
                </tr>
              );
            })}
            {documentos.length === 0 && (
              <tr className="h-[19px]"><td colSpan={4} className={cn(TD_REGUA, 'py-3 text-center text-muted-foreground')}>Nenhum documento.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {documentos.some(d => avisoDoVencimento(d.dias)) && (
        <p className="h-[14px] truncate text-[9.5px] leading-[14px] text-amber-800" data-testid="folha-documentos-aviso"
          title={documentos.map(d => ({ d, a: avisoDoVencimento(d.dias) })).filter(x => x.a).map(x => `${rotuloEspecie(x.d.especie)}: ${x.a?.texto}`).join(' · ')}>
          • {documentos.map(d => ({ d, a: avisoDoVencimento(d.dias) })).filter(x => x.a).map(x => `${rotuloEspecie(x.d.especie)} ${x.a?.texto}`).join(' · ')}
        </p>
      )}
      <PedirMotivo aberto={removendo != null} aoFechar={() => setRemovendo(null)} titulo="Remover documento" rotuloDoBotao="Remover"
        frase="O documento sai da lista; o arquivo fica guardado. Por quê?"
        aoConfirmar={async motivo => {
          if (!removendo) return null;
          const r = await api.removerDocumento(removendo.id, motivo);
          if (!r.ok) return r.erro;
          await reler();
          return null;
        }} />
      {visualizador}
    </div>
  );
}
