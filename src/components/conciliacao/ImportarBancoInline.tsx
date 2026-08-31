import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useImportacaoExtrato } from '@/hooks/useImportacaoExtrato';

/**
 * ImportarBancoInline — a aba "Importar Extrato" do Financas, clonada INTEIRA:
 * casca E fluxo. FIN-CONCIL-INTEGRAR-01, correção do B-24.
 *
 * ⚠ A CASCA SOZINHA NÃO BASTAVA, e a homologação mostrou por quê: o botão
 * clonado abria o modal antigo ("Gerar preview", aviso de parser PDF, passos
 * numerados) — a linha era do original e o miolo era o legado. Igual = igual
 * inclui o GESTO: escolher o arquivo abre um `input file` ali mesmo, o arquivo é
 * lido no navegador e a prévia nasce NA PRÓPRIA ABA, sem modal nenhum.
 *
 * ⚠ O MOTOR É O NOSSO, e de propósito: `useImportacaoExtrato` já lê o OFX no
 * navegador, calcula o hash, marca o que já existe e grava. Portar o motor do
 * Financas seria trocar um mecanismo testado por outro para ganhar aparência —
 * e a aparência é o que se pediu para trocar. Aqui muda a APRESENTAÇÃO.
 *
 * ⚠ O MODAL ANTIGO NÃO ABRE MAIS DESTA ABA. Ele segue existindo nas telas
 * velhas, que só morrem na rodada 2 — nada é derrubado antes da homologação.
 */
interface Props {
  contas: { id: string; label: string }[];
  contaId: string;
  onContaChange: (id: string) => void;
  /** Recarrega a lista do mês depois de gravar. */
  onImportado?: () => void;
  /** O "Ver importações (N)" que vive na mesma linha, montado por quem tem o modal. */
  acoes?: React.ReactNode;
}

export function ImportarBancoInline({ contas, contaId, onContaChange, onImportado, acoes }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const { preview, loading, gerarPreview, confirmarImportacao, reset } = useImportacaoExtrato();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);

  const escolher = async (a: File) => {
    setArquivo(a);
    try { await gerarPreview({ arquivo: a, contaBancariaId: contaId }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao ler o arquivo.'); setArquivo(null); }
  };

  const cancelar = () => { reset(); setArquivo(null); };

  const importar = async () => {
    if (!arquivo) return;
    setGravando(true);
    try {
      await confirmarImportacao({ contaBancariaId: contaId, nomeArquivo: arquivo.name, formato: 'OFX' });
      toast.success('Extrato importado.');
      cancelar();
      onImportado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gravar o extrato.');
    } finally {
      setGravando(false);
    }
  };

  const seletor = (
    <div className="w-[190px]">
      <Select value={contaId || '__none__'} onValueChange={v => onContaChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Conta" /></SelectTrigger>
        <SelectContent>
          {contas.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept=".ofx,.OFX" className="hidden"
        onChange={e => {
          const a = e.target.files?.[0];
          if (a) void escolher(a);
          // permite reescolher o MESMO arquivo depois de cancelar
          e.target.value = '';
        }} />

      {/* ⚠ UMA LINHA — o card de quatro linhas do legado explicava o que a prévia
          já mostra, e ocupava o topo da tela inclusive nas dezenas de vezes em
          que o operador já sabe o que é um OFX. O resto do texto virou `title`:
          continua disponível, deixa de custar altura. */}
      {!preview && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          {seletor}
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs"
            disabled={!contaId || loading}
            title={contaId ? undefined : 'Escolha a conta primeiro'}
            onClick={() => input.current?.click()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Escolher arquivo OFX
          </Button>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
            title="O arquivo é lido aqui no navegador e não sai dele — o que vai para o banco de dados são os movimentos. Antes de gravar, você confere linha a linha o que é novo e o que já foi importado.">
            O arquivo é lido no navegador; você confere antes de gravar.
          </span>
          {acoes}
        </div>
      )}

      {preview && (
        <div className="rounded-lg border border-border bg-card">
          {/* cabeçalho da prévia — o seletor NÃO some: saber de qual conta é o
              arquivo prestes a ser gravado é o contexto mais importante agora */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            {seletor}
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Prévia</span>
            <span className="truncate font-mono text-[10px] text-foreground">{arquivo?.name}</span>
            <div className="flex-1" />
            <Badge className="h-5 gap-1 px-1.5 text-[9px]">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {preview.novosParaSalvar} novo{preview.novosParaSalvar === 1 ? '' : 's'}
            </Badge>
            {preview.existentesNoBanco > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[9px]">
                {preview.existentesNoBanco} já existe{preview.existentesNoBanco === 1 ? '' : 'm'}
              </Badge>
            )}
          </div>

          {/* ⚠ O QUE O BANCO DECLAROU — e agora declara mesmo: FIN-OFX-LEDGERBAL-PARSER-01
              fez o `parseOFX` ler `LEDGERBAL/BALAMT` + `DTASOF`, que ele descartava.
              O número é do BANCO, atravessou o motor sem transformação e existe para
              ser comparado com o que a casa apurou — é a única conferência da
              prévia que confere com alguém de fora.
              ⚠ O TRAÇO CONTINUA SENDO TRAÇO quando o arquivo não traz a tag. Somar os
              movimentos aqui daria um número que bate consigo mesmo e não confere
              nada — pior que o vazio, porque parece conferência. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-3 py-2 sm:grid-cols-4">
            <Campo rotulo="Período">
              {periodo(preview.movimentos)}
            </Campo>
            <Campo rotulo="Movimentos">{preview.movimentos.length}</Campo>
            <Campo rotulo="Saldo declarado pelo banco">
              {preview.saldoDeclarado == null ? (
                <span title="Este arquivo não traz a tag LEDGERBAL — o banco não declarou saldo nele. O traço é ausência, não zero: somar os movimentos daria um número nosso, não o do banco.">—</span>
              ) : (
                <span title="Tag LEDGERBAL/BALAMT do arquivo — o saldo contábil que o próprio banco afirma. Não é a soma dos movimentos acima nem o saldo gerencial da casa.">
                  {formatMoeda(preview.saldoDeclarado)}
                </span>
              )}
            </Campo>
            <Campo rotulo="Na data de">
              {preview.saldoDeclaradoData == null ? (
                <span title="Vem junto do saldo declarado (tag DTASOF). Sem LEDGERBAL no arquivo, não há data.">—</span>
              ) : (
                <span title="Tag LEDGERBAL/DTASOF — a data a que o saldo declarado se refere. Pode não ser o último dia do período acima.">
                  {brData(preview.saldoDeclaradoData)}
                </span>
              )}
            </Campo>
          </div>

          {/* linha a linha, com o que já existe apagado */}
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted/60">
                <tr>
                  <Th className="text-left">Data</Th>
                  <Th className="text-left">Descrição</Th>
                  <Th className="text-left">Doc</Th>
                  <Th className="text-right">Valor</Th>
                  <Th className="text-center">Situação</Th>
                </tr>
              </thead>
              <tbody>
                {preview.movimentos.map((m, i) => {
                  const repetido = m.existeNoDB || !!m.jaExistenteChave;
                  return (
                    <tr key={`${m.data}-${m.documento ?? i}-${i}`}
                      className={cn('border-b border-border/60', repetido && 'opacity-45')}>
                      <td className="whitespace-nowrap px-2 py-0.5 font-mono">{brData(m.data)}</td>
                      <td className="max-w-[280px] truncate px-2 py-0.5" title={m.descricao}>{m.descricao || '—'}</td>
                      <td className="px-2 py-0.5 font-mono text-muted-foreground">{m.documento ?? '—'}</td>
                      <td className={cn('whitespace-nowrap px-2 py-0.5 text-right font-medium tabular-nums',
                        m.valor < 0 ? 'text-destructive' : 'text-success')}>
                        {formatMoeda(m.valor)}
                      </td>
                      <td className="px-2 py-0.5 text-center">
                        <span className={cn('rounded px-1 py-0 text-[9px] font-semibold uppercase',
                          repetido ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success')}>
                          {repetido ? 'já existe' : 'novo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-accent px-3 py-2">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={cancelar}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <div className="flex-1" />
            {/* ⚠ O BOTÃO DIZ QUANTOS VAI GRAVAR, e desabilita com o motivo quando
                não há nada novo — a regra do botão que explica. */}
            <Button type="button" size="sm" className="h-8 gap-1.5 px-5 text-xs font-semibold"
              disabled={gravando || preview.novosParaSalvar === 0}
              title={preview.novosParaSalvar === 0 ? 'Todos os movimentos já foram importados' : undefined}
              onClick={() => { void importar(); }}>
              {gravando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Importar {preview.novosParaSalvar}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** O período do arquivo — do primeiro ao último movimento lido. */
function periodo(movs: readonly { data: string }[]): string {
  if (movs.length === 0) return '—';
  const datas = movs.map(m => m.data).sort();
  return `${brData(datas[0])} – ${brData(datas[datas.length - 1])}`;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ''}`}>
      {children}
    </th>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="truncate text-[11px] font-medium tabular-nums text-foreground">{children}</p>
    </div>
  );
}

const brData = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
