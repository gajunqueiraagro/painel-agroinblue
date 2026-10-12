import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocumentosDoMes, type FonteDeDocumentosDoMes } from '@/hooks/useDocumentosDoMes';
import { MOTIVO_SEM_FAZENDA, rotuloDoBotaoDeDocumentos } from '@/lib/pecuaria/documentosDoMes';
import { DocumentosDoMesDialog } from './DocumentosDoMesDialog';

/**
 * FECH-DOCS-01 — o botão "Documentos do mês · N", o MESMO nas duas telas (Fechamento Área e Lançar › Pecuária).
 *
 * ⚠ APARECE SEMPRE, com zero também (lugar reservado): sem fazenda (Global) fica APAGADO com o motivo no `title`, nunca some.
 * ⚠ N = documentos NÃO cancelados da fazenda + mês recebidos; enquanto a leitura não chega, "…" — nunca um zero inventado.
 * ⚠ FECH-DOCS-01b — O DIÁLOGO NAVEGA DE MÊS, O BOTÃO NÃO: o diálogo abre no `anoMes` da tela e as setas do título trocam o mês
 *   DELE (e a lista); o N do botão continua sendo o do mês de ABERTURA (`anoMes`). Fechar esquece o mês navegado. No mês de
 *   abertura o diálogo usa a MESMA leitura do botão (anexar ali muda o N); em outro mês, uma leitura própria, só com ele aberto.
 * ⚠ A aparência é do hospedeiro (`className`): cada tela o veste como os botões vizinhos. Aqui mora a leitura e o diálogo.
 */
export interface BotaoDocumentosDoMesProps {
  clienteId: string | null;
  /** Nulo ou "__global__" = sem fazenda. */
  fazendaId: string | null;
  fazendaNome: string;
  /** 'AAAA-MM' */
  anoMes: string;
  className?: string;
  classeDoIcone?: string;
  classeDoTexto?: string;
  fonte?: FonteDeDocumentosDoMes;
}

export function BotaoDocumentosDoMes({
  clienteId, fazendaId, fazendaNome, anoMes, className, classeDoIcone = 'h-3.5 w-3.5 shrink-0', classeDoTexto, fonte,
}: BotaoDocumentosDoMesProps) {
  const [aberto, setAberto] = useState(false);
  const fazenda = fazendaId && fazendaId !== '__global__' ? fazendaId : null;
  const semFazenda = !clienteId || !fazenda;
  const api = useDocumentosDoMes(clienteId, fazenda, anoMes, fonte);
  const rotulo = rotuloDoBotaoDeDocumentos(api.lendo || api.erro ? null : api.documentos.length, semFazenda);
  /* O mês que o diálogo mostra: nulo = o de abertura (o da tela). */
  const [mesNavegado, setMesNavegado] = useState<string | null>(null);
  const mesDoDialogo = mesNavegado ?? anoMes;
  const emOutroMes = aberto && mesDoDialogo !== anoMes;
  const apiDoOutroMes = useDocumentosDoMes(clienteId, emOutroMes ? fazenda : null, emOutroMes ? mesDoDialogo : null, fonte);
  const fechar = () => { setAberto(false); setMesNavegado(null); };

  return (
    <>
      <button
        type="button"
        data-testid="botao-documentos-do-mes"
        disabled={semFazenda}
        title={semFazenda ? MOTIVO_SEM_FAZENDA : api.erro ?? rotulo}
        aria-label={rotulo}
        onClick={() => setAberto(true)}
        className={cn('disabled:cursor-not-allowed disabled:opacity-50', className)}
      >
        <FolderOpen className={classeDoIcone} />
        <span className={cn('min-w-0 truncate', classeDoTexto)}>{rotulo}</span>
      </button>
      {!semFazenda && (
        <DocumentosDoMesDialog aberto={aberto} aoFechar={fechar} fazendaNome={fazendaNome} anoMes={mesDoDialogo}
          aoTrocarMes={(m) => setMesNavegado(m === anoMes ? null : m)} api={emOutroMes ? apiDoOutroMes : api} />
      )}
    </>
  );
}
