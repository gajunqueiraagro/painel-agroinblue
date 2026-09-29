/**
 * A aba Documentos do "Novo lançamento" — FIN-NFE-PARCELAS-01, PR 1.
 *
 * Antes de o lançamento existir não há onde registrar documento (a FK é para o lançamento), então
 * a lista mora em memória e vai ao banco depois do salvar (`gravarDocumentosPendentes`). O
 * formulário é o MESMO da aba de um lançamento salvo (`FormDocumento`), com uma `api` que guarda
 * aqui em vez de chamar RPC — mesmos campos, mesma validação, uma tela só.
 *
 * ⚠ A LISTA É A31 (tabela da casa): 10px nas linhas, 9,5px no cabeçalho navy, linha de 18px, datas
 * dd/mm/aa, número à direita, nada cortado com reticência.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, X } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { FormDocumento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import {
  rotuloEspecieDoc, type LancDocumento, type LancDocPayload, type LancamentoDocumentosApi,
} from '@/hooks/useLancamentoDocumentos';
import { motivoArquivoRecusado, novoPendente, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';

const TH = 'sticky top-0 z-10 h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
const TD = 'h-[18px] border-b border-[#eceae4] px-[4px] text-[10px] align-middle';

const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
};

/** O pendente no formato que o `FormDocumento` lê — só para editar; nada disto vai ao banco. */
function comoDocumento(p: DocumentoPendente): LancDocumento {
  const x = p.payload;
  return {
    id: p.chave, origem: 'lancamento', operacaoId: null, especie: x.especie ?? 'outro', especieOC: null,
    nome: p.arquivo?.name ?? '', numero: x.numero ?? null, serie: x.serie ?? null, chaveAcesso: x.chaveAcesso ?? null,
    dataEmissao: x.dataEmissao ?? null, valorDocumento: x.valorDocumento ?? null, url: null,
    tipo: p.arquivo?.type ?? null, tamanhoBytes: p.arquivo?.size ?? null, observacao: x.observacao ?? null,
    emitenteId: x.emitenteId ?? null, emitenteNome: x.emitenteNome ?? null, emitenteDocumento: x.emitenteDocumento ?? null,
    cancelado: false, canceladoMotivo: null, versao: 1,
  };
}

/**
 * A `api` do formulário, em memória. `registrar` põe na lista; `anexar` põe o arquivo.
 * ⚠ ANEXO RECUSADO DESFAZ O REGISTRO: o formulário registra e anexa no mesmo clique, e se o
 * arquivo não serve ele fica aberto para trocar — sem o desfazer, o segundo clique criaria um
 * segundo pendente igual ao primeiro.
 */
export function apiDePendentes(
  lista: readonly DocumentoPendente[], mudar: (f: (l: DocumentoPendente[]) => DocumentoPendente[]) => void,
): LancamentoDocumentosApi {
  const nao = async () => false;
  return {
    documentos: lista.map(comoDocumento), confronto: null, loading: false, saving: false,
    operacaoId: null, operacaoTipo: null,
    registrar: async (p: LancDocPayload) => {
      const novo = novoPendente(p, null);
      mudar(l => [...l, novo]);
      return { id: novo.chave, origem: 'lancamento', operacaoId: null };
    },
    editar: async (chave, _v, p) => {
      mudar(l => l.map(x => (x.chave === chave ? { ...x, payload: { ...x.payload, ...p } } : x)));
      return true;
    },
    cancelar: nao,
    anexar: async (chave, versao, file) => {
      const recusa = motivoArquivoRecusado(file);
      if (recusa) {
        /* versão 1 = acabou de ser registrado neste clique: sai da lista. Na edição, fica como estava. */
        if (versao === 1) mudar(l => l.filter(x => x.chave !== chave));
        throw new Error(recusa);
      }
      mudar(l => l.map(x => (x.chave === chave ? { ...x, arquivo: file } : x)));
      return true;
    },
    urlAssinada: async () => null,
    recarregar: async () => {},
  };
}

export function DocumentosPendentes({ pendentes, onMudar, fornecedores, parcelado, travado }: {
  pendentes: DocumentoPendente[];
  onMudar: (f: (l: DocumentoPendente[]) => DocumentoPendente[]) => void;
  fornecedores: { id: string; nome: string }[];
  /** No parcelado os documentos vão só para a parcela 1 (a herança é o PR 2) — e a tela diz. */
  parcelado: boolean;
  /** Depois do salvar a lista é o que falta gravar: não se edita mais, só se tenta de novo. */
  travado?: boolean;
}) {
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<LancDocumento | null>(null);
  const api = useMemo(() => apiDePendentes(pendentes, onMudar), [pendentes, onMudar]);

  return (
    <div className="space-y-1.5" data-testid="documentos-pendentes">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {pendentes.length === 0
            ? 'Nenhum documento — os que você adicionar aqui são gravados junto com o lançamento.'
            : `${pendentes.length} ${pendentes.length === 1 ? 'documento pendente' : 'documentos pendentes'} · gravados ao salvar o lançamento`}
        </span>
        <Button type="button" size="sm" className="h-[22px] gap-1 px-[9px] text-[10px]" disabled={travado}
          onClick={() => { setEditando(null); setFormAberto(true); }}>
          <Plus className="h-3 w-3" /> Adicionar documento
        </Button>
      </div>
      {parcelado && (
        <p className="text-[10px] text-amber-700" data-testid="aviso-parcela-1">
          No parcelado, os documentos vão para a parcela 1; levar a NF para todas as parcelas vem no próximo passo.
        </p>
      )}

      {pendentes.length > 0 && (
        <div className="overflow-auto rounded border border-[#E0E2E6]">
          <table className="w-full border-separate border-spacing-0 tabular-nums">
            <thead>
              <tr>
                {['Espécie', 'Número', 'Emissão', 'Emitente', 'Valor', 'Arquivo', 'Situação', ''].map((h, i) => (
                  <th key={i} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendentes.map(p => {
                const d = comoDocumento(p);
                return (
                  <tr key={p.chave} className="bg-white">
                    <td className={TD}>{rotuloEspecieDoc(d)}</td>
                    <td className={TD}>{d.numero ? (d.serie ? `${d.numero} · série ${d.serie}` : d.numero) : '—'}</td>
                    <td className={`${TD} text-center`}>{dataCurta(d.dataEmissao)}</td>
                    <td className={TD}>{d.emitenteNome ?? '—'}</td>
                    <td className={`${TD} text-right`}>{d.valorDocumento == null ? '—' : formatMoeda(d.valorDocumento)}</td>
                    <td className={`${TD} break-all`}>{p.arquivo?.name ?? <span className="text-amber-700">sem arquivo</span>}</td>
                    <td className={`${TD} text-center`}>
                      {p.gravado
                        ? <span className="rounded bg-emerald-100 px-1 text-[9.5px] font-semibold text-emerald-700">gravado</span>
                        : p.erro
                          ? <span className="rounded bg-red-100 px-1 text-[9.5px] font-semibold text-red-700" title={p.erro}>não gravado</span>
                          : <span className="rounded bg-amber-100 px-1 text-[9.5px] font-semibold text-amber-800">pendente</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-center`}>
                      {!travado && (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <button type="button" title="Editar documento" aria-label="Editar documento"
                            onClick={() => { setEditando(d); setFormAberto(true); }} className="hover:text-foreground">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button type="button" title="Tirar da lista" aria-label="Tirar da lista"
                            onClick={() => onMudar(l => l.filter(x => x.chave !== p.chave))} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formAberto && (
        <FormDocumento api={api} documento={editando} fornecedores={fornecedores} pendente
          onFechar={() => { setFormAberto(false); setEditando(null); }} />
      )}
    </div>
  );
}
