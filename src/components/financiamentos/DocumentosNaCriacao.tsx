import { useState } from 'react';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { DocumentosPendentes } from '@/components/financeiro-v2/DocumentosPendentes';
import { ParcelasDaCompra, type ParcelaPrevistaLinha } from '@/components/financeiro-v2/ParcelasDaCompra';
import { AnexarBoletosDialog } from '@/components/financeiro-v2/AnexarBoletosDialog';
import { novoPendente, numeroDaNotaDaCompra, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';
import { arquivoXmlDaNota } from '@/lib/financeiro/nfePrefill';

/**
 * DOCUMENTOS AO CRIAR O CONTRATO — PARC-CONTRATO-01 item 3 (Gabriel, 07/10/2026: "no modal de criação ele não dá espaço para
 * inserir a nota fiscal nem o boleto, nem para visualizar").
 *
 * NENHUM CADASTRO NOVO: são as MESMAS peças do Novo lançamento parcelado — `DocumentosPendentes` (os documentos da compra,
 * que valem para todas as parcelas) e `ParcelasDaCompra` (o boleto de cada parcela) — sobre a MESMA lista de pendentes em
 * memória. NADA É GRAVADO AQUI: quem grava é o Salvar do contrato, depois de as parcelas existirem (o pós-salvar do
 * `gravarDocumentosDoParcelamento`). O arquivo se VÊ antes de salvar (abre do próprio navegador, sem subir).
 * "Importar XML" só LÊ a nota (`lerNFe`, o leitor único) e a entrega a quem preenche o contrato; a NF vira pendente com o XML.
 */
const REGRA_DO_XML: RegraDeAceite = { tipos: ['xml'] };

interface Props {
  pendentes: DocumentoPendente[];
  onMudar: (f: (l: DocumentoPendente[]) => DocumentoPendente[]) => void;
  /** as parcelas que o contrato VAI criar (a prévia mensal ou a lista livre); vazia = a grade escreve o motivo */
  parcelas: readonly ParcelaPrevistaLinha[];
  /** o credor escolhido no contrato: é o emitente oferecido no formulário do documento */
  credor: { id: string; nome: string } | null;
  /** depois do Salvar (contrato gravado, documento que falhou): nada mais se edita aqui */
  travado: boolean;
  /** a nota lida do XML, com o arquivo pronto para o bucket — quem preenche o contrato é o diálogo */
  onNotaDoXml: (nota: NotaLida, arquivo: File) => void;
  /** o que o XML preencheu (âmbar), escrito ao lado da área */
  recadoDoXml: string | null;
}

/** Abre o arquivo que ainda está só na memória (antes de salvar). */
function verArquivo(arquivo: File | null) {
  if (!arquivo) return;
  const url = URL.createObjectURL(arquivo);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function DocumentosNaCriacao({ pendentes, onMudar, parcelas, credor, travado, onNotaDoXml, recadoDoXml }: Props) {
  const [recusaXml, setRecusaXml] = useState<string | null>(null);
  const [anexarVarios, setAnexarVarios] = useState(false);
  const n = parcelas.length;
  const daCompra = pendentes.filter(p => p.parcela == null);
  const comArquivo = daCompra.filter(p => p.arquivo);

  const lerXml = async (arquivo: File) => {
    setRecusaXml(null);
    const bytes = await arquivo.arrayBuffer();
    const r = lerNFe(bytes);
    if (r.ok === false) { setRecusaXml(r.frase); return; }
    onNotaDoXml(r.nota, arquivoXmlDaNota(bytes, arquivo.name));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5" data-testid="documentos-na-criacao">
      <div className="flex h-[22px] shrink-0 items-center gap-2">
        <p className="shrink-0 text-[11px] font-semibold">Documentos da compra <span className="font-normal text-muted-foreground">· valem para todas as parcelas</span></p>
        <span className={`min-w-0 flex-1 truncate text-[10px] ${recusaXml ? 'text-destructive' : 'text-amber-700'}`}
          data-testid="recado-do-xml" title={recusaXml ?? recadoDoXml ?? undefined}>{recusaXml ?? recadoDoXml ?? ''}</span>
        <AreaDeArquivo regra={REGRA_DO_XML} convite="Importar XML da nota" detalhe="" className="h-[22px] w-[200px] shrink-0"
          inputTestId="criacao-xml-input" desabilitado={travado} motivoDesabilitado="Contrato já gravado"
          onArquivos={(arquivos) => { if (arquivos[0]) void lerXml(arquivos[0]); }} />
      </div>
      <div className="shrink-0">
        <DocumentosPendentes pendentes={daCompra}
          onMudar={f => onMudar(l => [...f(l.filter(p => p.parcela == null)), ...l.filter(p => p.parcela != null)])}
          fornecedores={credor ? [{ id: credor.id, nome: credor.nome }] : []}
          ligadoA={n} travado={travado} />
      </div>
      {/* VER antes de salvar: lugar fixo de 16px (existe mesmo vazio) com os arquivos dos documentos da compra */}
      <div className="flex h-[16px] shrink-0 items-center gap-2 overflow-hidden text-[10px]" data-testid="arquivos-da-compra">
        {comArquivo.map(p => (
          <button key={p.chave} type="button" className="min-w-0 truncate text-primary hover:underline" title={`Abrir ${p.arquivo?.name ?? ''}`}
            onClick={() => verArquivo(p.arquivo)}>ver {p.arquivo?.name}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ParcelasDaCompra parcelas={parcelas}
          notaFiscal={numeroDaNotaDaCompra(pendentes, '')}
          qtdNotas={daCompra.filter(p => p.payload.especie === 'nf').length}
          boletos={pendentes.filter(p => p.parcela != null && p.parcela <= n)}
          foraDoPlano={pendentes.filter(p => p.parcela != null && p.parcela > n)}
          onBoleto={(parcela, arquivo) => onMudar(l => [...l, novoPendente({ especie: 'boleto' }, arquivo, parcela)])}
          onTirarBoleto={chave => onMudar(l => l.filter(p => p.chave !== chave))}
          onAnexarVarios={() => setAnexarVarios(true)}
          onVerBoleto={chave => verArquivo(pendentes.find(p => p.chave === chave)?.arquivo ?? null)}
          travado={travado} />
      </div>
      {anexarVarios && (
        <AnexarBoletosDialog subtitulo={`${n} parcelas`}
          parcelas={parcelas.map(r => ({ numero: r.numero, vencimento: r.dataVencimento, valor: r.valor, temBoleto: pendentes.some(p => p.parcela === r.numero) }))}
          onConfirmar={async (itens) => { onMudar(l => [...l, ...itens.map(i => novoPendente({ especie: 'boleto' }, i.arquivo, i.parcela))]); return null; }}
          onFechar={() => setAnexarVarios(false)} />
      )}
    </div>
  );
}
