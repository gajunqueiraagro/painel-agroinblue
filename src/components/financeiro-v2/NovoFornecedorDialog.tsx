import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  conferirCadastro, reativarDoCadastro, fraseDoDocumento, fraseDoInativo, FRASE_JA_EXISTE,
  type FonteDoCadastro, type FornecedorDoCadastro,
} from '@/lib/fornecedores/cadastroDaCasa';
import { fonteDoCadastroNoBanco } from '@/lib/fornecedores/cadastroDaCasaBanco';

/**
 * O CADASTRO DA CASA — o "+" de todo seletor de fornecedor abre ESTE diálogo.
 *
 * FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a: ele NÃO DUPLICA. Antes de criar pergunta à regra única
 * (`src/lib/fornecedores/cadastroDaCasa.ts`): nome que já existe ATIVO é só selecionado; nome que existe INATIVO oferece
 * reativar; CPF/CNPJ que já é de outro fornecedor ativo mostra de quem é e oferece selecioná-lo. Só sem nada disso chama o
 * `onSave` do hospedeiro, que cria como sempre (com a fazenda que a tela passar).
 * ⚠ NENHUMA TELA REIMPLEMENTA: o hospedeiro só diz o que fazer com o fornecedor escolhido (`onSelecionar`).
 * ⚠ TAMANHO FIXO: o recado tem lugar reservado (duas linhas) e a linha dos botões tem a mesma altura em todo estado; aviso e
 *   recusa ficam ali, ao lado do botão — nunca em toast.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** O cliente em que o fornecedor é procurado e criado. Sem ele o diálogo não grava. */
  clienteId: string | null | undefined;
  /** Cria (o caminho de sempre do hospedeiro). Só é chamado quando a regra diz que pode criar. */
  onSave: (nome: string, cpfCnpj?: string) => Promise<void>;
  /** O fornecedor que JÁ EXISTIA foi o escolhido (o de mesmo nome, o reativado ou o dono do documento). Não fecha o diálogo. */
  onSelecionar: (fornecedor: FornecedorDoCadastro) => void | Promise<void>;
  defaultNome?: string;
  /** só para teste: a fonte do cadastro (padrão: o banco) */
  fonte?: FonteDoCadastro;
}

type Estado =
  | { tipo: 'form' }
  | { tipo: 'selecionado' }
  | { tipo: 'inativo'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'documento'; fornecedor: FornecedorDoCadastro };

export function NovoFornecedorDialog({ open, onClose, clienteId, onSave, onSelecionar, defaultNome, fonte = fonteDoCadastroNoBanco }: Props) {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [saving, setSaving] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'form' });
  const [recado, setRecado] = useState<{ texto: string; tom: 'aviso' | 'erro' | 'ok' } | null>(null);

  useEffect(() => {
    if (open) {
      setNome(defaultNome || '');
      setCpfCnpj('');
      setEstado({ tipo: 'form' });
      setRecado(null);
    }
  }, [open, defaultNome]);

  const limpar = () => { setNome(''); setCpfCnpj(''); setEstado({ tipo: 'form' }); setRecado(null); };
  const voltarAoFormulario = () => { setEstado({ tipo: 'form' }); setRecado(null); };

  const handleSubmit = async () => {
    if (!nome.trim() || saving) return;
    if (!clienteId) { setRecado({ texto: 'Selecione o cliente antes de cadastrar o fornecedor.', tom: 'erro' }); return; }
    setSaving(true);
    const r = await conferirCadastro(fonte, clienteId, { nome: nome.trim(), cpfCnpj: cpfCnpj.trim() });
    if (r.tipo === 'erro') { setRecado({ texto: r.frase, tom: 'erro' }); setSaving(false); return; }
    if (r.tipo === 'ja_existe') {
      await onSelecionar(r.fornecedor);
      setEstado({ tipo: 'selecionado' });
      setRecado({ texto: FRASE_JA_EXISTE, tom: 'ok' });
      setSaving(false);
      return;
    }
    if (r.tipo === 'inativo') {
      setEstado({ tipo: 'inativo', fornecedor: r.fornecedor });
      setRecado({ texto: fraseDoInativo(r.fornecedor), tom: 'aviso' });
      setSaving(false);
      return;
    }
    if (r.tipo === 'documento_de_outro') {
      setEstado({ tipo: 'documento', fornecedor: r.fornecedor });
      setRecado({ texto: fraseDoDocumento(r.fornecedor), tom: 'aviso' });
      setSaving(false);
      return;
    }
    /* o criar do hospedeiro que FALHA com exceção: o motivo fica aqui, ao lado do botão, e o digitado fica */
    try {
      await onSave(nome.trim(), cpfCnpj.trim() || undefined);
    } catch (e) {
      setRecado({ texto: `Não foi possível cadastrar o fornecedor. (${e instanceof Error ? e.message : String(e)})`, tom: 'erro' });
      setSaving(false);
      return;
    }
    setSaving(false);
    setNome('');
    setCpfCnpj('');
  };

  const reativar = async (f: FornecedorDoCadastro) => {
    if (!clienteId || saving) return;
    setSaving(true);
    const r = await reativarDoCadastro(fonte, clienteId, f);
    if (r.ok === false) { setRecado({ texto: r.frase, tom: 'erro' }); setSaving(false); return; }
    await onSelecionar(r.fornecedor);
    setSaving(false);
    limpar();
    onClose();
  };

  const selecionarODono = async (f: FornecedorDoCadastro) => {
    if (saving) return;
    setSaving(true);
    await onSelecionar(f);
    setSaving(false);
    limpar();
    onClose();
  };

  const travado = estado.tipo !== 'form';
  const corDoRecado = recado?.tom === 'erro' ? 'text-destructive' : recado?.tom === 'ok' ? 'text-emerald-700' : 'text-amber-700';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); limpar(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Novo Fornecedor</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cadastre um novo fornecedor ou frigorífico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => { setNome(e.target.value); setRecado(null); }} className="h-9" placeholder="Nome do fornecedor" autoFocus disabled={travado} />
          </div>
          <div>
            <Label className="text-xs">CPF/CNPJ</Label>
            <Input value={cpfCnpj} onChange={e => { setCpfCnpj(e.target.value); setRecado(null); }} className="h-9" placeholder="Opcional" disabled={travado} />
          </div>
          {/* o recado tem lugar RESERVADO (duas linhas): o diálogo não muda de tamanho com aviso, recusa ou nada */}
          <div data-testid="novo-fornecedor-recado" title={recado?.texto ?? undefined}
            className={`h-[30px] overflow-hidden text-[11px] leading-[15px] ${corDoRecado}`}>
            {recado?.texto ?? ''}
          </div>
          <div className="flex h-10 items-center gap-2">
            {estado.tipo === 'form' && (
              <Button onClick={handleSubmit} disabled={saving || !nome.trim()} className="w-full">
                {saving ? 'Salvando...' : 'Salvar Fornecedor'}
              </Button>
            )}
            {estado.tipo === 'selecionado' && (
              <Button onClick={() => { limpar(); onClose(); }} className="w-full">Fechar</Button>
            )}
            {estado.tipo === 'inativo' && (<>
              <Button onClick={() => reativar(estado.fornecedor)} disabled={saving} className="min-w-0 flex-1">
                {saving ? 'Reativando...' : 'Reativar e selecionar'}
              </Button>
              <Button variant="outline" onClick={voltarAoFormulario} disabled={saving} className="shrink-0">Não reativar</Button>
            </>)}
            {estado.tipo === 'documento' && (<>
              <Button onClick={() => selecionarODono(estado.fornecedor)} disabled={saving} className="min-w-0 flex-1" title={`Selecionar ${estado.fornecedor.nome}`}>
                <span className="truncate">Selecionar {estado.fornecedor.nome}</span>
              </Button>
              <Button variant="outline" onClick={voltarAoFormulario} disabled={saving} className="shrink-0">Voltar</Button>
            </>)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
