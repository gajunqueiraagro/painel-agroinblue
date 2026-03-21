import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Save, FileText, Share2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import logoUrl from '@/assets/logo.png';

interface CadastroData {
  id?: string;
  ie: string;
  proprietario_nome: string;
  cpf_cnpj: string;
  endereco: string;
  email: string;
  telefone: string;
  banco: string;
  pix: string;
  area_total: string;
  area_produtiva: string;
  inscricao_rural: string;
  roteiro: string;
}

const EMPTY: CadastroData = {
  ie: '', proprietario_nome: '', cpf_cnpj: '', endereco: '',
  email: '', telefone: '', banco: '', pix: '',
  area_total: '', area_produtiva: '', inscricao_rural: '', roteiro: '',
};

function loadLogoBase64(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = logoUrl;
  });
}

export function CadastrosTab() {
  const { fazendaAtual } = useFazenda();
  const [data, setData] = useState<CadastroData>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  useEffect(() => {
    loadLogoBase64().then(setLogoBase64).catch(() => setLogoBase64(null));
  }, []);

  const load = useCallback(async () => {
    if (!fazendaAtual) return;
    setLoading(true);
    const { data: row } = await supabase
      .from('fazenda_cadastros')
      .select('*')
      .eq('fazenda_id', fazendaAtual.id)
      .maybeSingle();
    if (row) {
      setData({
        id: row.id,
        ie: row.ie || '',
        proprietario_nome: row.proprietario_nome || '',
        cpf_cnpj: row.cpf_cnpj || '',
        endereco: row.endereco || '',
        email: row.email || '',
        telefone: row.telefone || '',
        banco: row.banco || '',
        pix: row.pix || '',
        area_total: row.area_total ? String(row.area_total) : '',
        area_produtiva: row.area_produtiva ? String(row.area_produtiva) : '',
        inscricao_rural: row.inscricao_rural || '',
        roteiro: row.roteiro || '',
      });
      setEditing(false);
    } else {
      setData(EMPTY);
      setEditing(true);
    }
    setLoading(false);
  }, [fazendaAtual]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!fazendaAtual) return;
    setSaving(true);
    const payload = {
      fazenda_id: fazendaAtual.id,
      ie: data.ie || null,
      proprietario_nome: data.proprietario_nome || null,
      cpf_cnpj: data.cpf_cnpj || null,
      endereco: data.endereco || null,
      email: data.email || null,
      telefone: data.telefone || null,
      banco: data.banco || null,
      pix: data.pix || null,
      area_total: data.area_total ? Number(data.area_total) : null,
      area_produtiva: data.area_produtiva ? Number(data.area_produtiva) : null,
      inscricao_rural: data.inscricao_rural || null,
      roteiro: data.roteiro || null,
    };

    let error;
    if (data.id) {
      ({ error } = await supabase.from('fazenda_cadastros').update(payload).eq('id', data.id));
    } else {
      const res = await supabase.from('fazenda_cadastros').insert(payload).select().single();
      error = res.error;
      if (res.data) setData(prev => ({ ...prev, id: res.data.id }));
    }

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Cadastro salvo!');
      setEditing(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!data.id) return;
    if (!confirm('Tem certeza que deseja apagar todos os dados de cadastro?')) return;
    const { error } = await supabase.from('fazenda_cadastros').delete().eq('id', data.id);
    if (error) {
      toast.error('Erro ao apagar: ' + error.message);
    } else {
      setData(EMPTY);
      setEditing(true);
      toast.success('Cadastro apagado!');
    }
  };

  const field = (label: string, key: keyof CadastroData, type = 'text', placeholder = '') => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={data[key] || ''}
          onChange={e => setData(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder || label}
          className="h-9 text-sm"
        />
      ) : (
        <p className="text-sm font-medium text-foreground min-h-[36px] flex items-center px-3 py-2 rounded-md bg-muted/50">
          {data[key] || <span className="text-muted-foreground italic">—</span>}
        </p>
      )}
    </div>
  );

  const downloadPdf = (doc: jsPDF, fileName: string) => {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);

    try {
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = fileName;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isEmbedded = window.self !== window.top;

      if (isMobile || isEmbedded) {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
          const fallbackLink = document.createElement('a');
          fallbackLink.href = url;
          fallbackLink.target = '_blank';
          fallbackLink.rel = 'noopener noreferrer';
          fallbackLink.style.display = 'none';
          document.body.appendChild(fallbackLink);
          fallbackLink.click();
          document.body.removeChild(fallbackLink);
        }
        toast.info('PDF aberto em nova aba para garantir o download.');
      }
    } catch (error) {
      console.error('Erro ao iniciar download do PDF:', error);
      toast.error('Não foi possível iniciar o download do PDF.');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };

  const generateRoteiroPDF = () => {
    try {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = 10;

      if (logoBase64) {
        const logoH = 14;
        const logoW = logoH * 2;
        doc.addImage(logoBase64, 'PNG', pageW / 2 - logoW / 2, y, logoW, logoH);
        y += logoH + 5;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Roteiro para Embarque', pageW / 2, y, { align: 'center' });
      y += 12;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const lines = [
        ['Fazenda', fazendaAtual?.nome || ''],
        ['IE', data.ie],
        ['Proprietário', data.proprietario_nome],
        ['Roteiro', data.roteiro],
      ];
      lines.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}: `, 20, y);
        doc.setFont('helvetica', 'normal');
        const labelW = doc.getTextWidth(`${label}: `);
        if (label === 'Roteiro' && value) {
          const splitText = doc.splitTextToSize(value, pageW - 40 - labelW);
          doc.text(splitText, 20 + labelW, y);
          y += splitText.length * 6;
        } else {
          doc.text(value || '—', 20 + labelW, y);
          y += 8;
        }
      });

      downloadPdf(doc, `roteiro_${fazendaAtual?.nome || 'fazenda'}.pdf`);
      toast.success('PDF do roteiro exportado!');
    } catch (error) {
      console.error('Erro ao exportar PDF de roteiro:', error);
      toast.error('Não foi possível exportar o PDF do roteiro.');
    }
  };

  const generateCadastroPDF = () => {
    try {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      let y = 10;

      if (logoBase64) {
        const logoH = 14;
        const logoW = logoH * 2;
        doc.addImage(logoBase64, 'PNG', pageW / 2 - logoW / 2, y, logoW, logoH);
        y += logoH + 5;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Dados para Cadastro', pageW / 2, y, { align: 'center' });
      y += 12;

      doc.setFontSize(11);
      const lines = [
        ['Fazenda', fazendaAtual?.nome || ''],
        ['IE', data.ie],
        ['Proprietário', data.proprietario_nome],
        ['CPF/CNPJ', data.cpf_cnpj],
        ['Endereço', data.endereco],
        ['Email', data.email],
        ['Telefone', data.telefone],
      ];
      lines.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${label}: `, 20, y);
        doc.setFont('helvetica', 'normal');
        const labelW = doc.getTextWidth(`${label}: `);
        doc.text(value || '—', 20 + labelW, y);
        y += 8;
      });

      downloadPdf(doc, `cadastro_${fazendaAtual?.nome || 'fazenda'}.pdf`);
      toast.success('PDF do cadastro exportado!');
    } catch (error) {
      console.error('Erro ao exportar PDF de cadastro:', error);
      toast.error('Não foi possível exportar o PDF do cadastro.');
    }
  };

  const shareWhatsApp = (type: 'roteiro' | 'cadastro') => {
    let text = '';
    const nome = fazendaAtual?.nome || '';
    if (type === 'roteiro') {
      text = `*Roteiro para Embarque*\n\n*Fazenda:* ${nome}\n*IE:* ${data.ie || '—'}\n*Proprietário:* ${data.proprietario_nome || '—'}\n*Roteiro:* ${data.roteiro || '—'}`;
    } else {
      text = `*Dados para Cadastro*\n\n*Fazenda:* ${nome}\n*IE:* ${data.ie || '—'}\n*Proprietário:* ${data.proprietario_nome || '—'}\n*CPF/CNPJ:* ${data.cpf_cnpj || '—'}\n*Endereço:* ${data.endereco || '—'}\n*Email:* ${data.email || '—'}\n*Telefone:* ${data.telefone || '—'}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="pb-24 pt-2 px-3 max-w-lg mx-auto space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        {!editing && data.id && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Apagar
            </Button>
          </>
        )}
        {editing && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        )}
      </div>

      {/* Main cadastro card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados da Fazenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {field('Inscrição Estadual (IE)', 'ie')}
          {field('Nome do Proprietário', 'proprietario_nome')}
          {field('CPF ou CNPJ', 'cpf_cnpj')}
          {field('Área Total (ha)', 'area_total', 'number', 'Hectares')}
          {field('Área Produtiva (ha)', 'area_produtiva', 'number', 'Hectares')}
          {field('Inscrição Rural (IR)', 'inscricao_rural')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contato e Endereço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {field('Endereço para Correspondência', 'endereco')}
          {field('Email', 'email', 'email')}
          {field('Telefone', 'telefone', 'tel')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados Bancários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {field('Banco', 'banco')}
          {field('PIX', 'pix')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Roteiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground">Roteiro para Embarque</Label>
            {editing ? (
              <Textarea
                value={data.roteiro}
                onChange={e => setData(prev => ({ ...prev, roteiro: e.target.value }))}
                placeholder="Descreva o roteiro de acesso à fazenda..."
                className="text-sm min-h-[100px]"
              />
            ) : (
              <p className="text-sm font-medium text-foreground min-h-[36px] px-3 py-2 rounded-md bg-muted/50 whitespace-pre-wrap">
                {data.roteiro || <span className="text-muted-foreground italic">—</span>}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Export: Roteiro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exportar Roteiro para Embarque</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generateRoteiroPDF} className="flex-1">
            <FileText className="h-4 w-4 mr-1 text-destructive" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => shareWhatsApp('roteiro')} className="flex-1">
            <Share2 className="h-4 w-4 mr-1 text-success" /> WhatsApp
          </Button>
        </CardContent>
      </Card>

      {/* Export: Cadastro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exportar Dados para Cadastro</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generateCadastroPDF} className="flex-1">
            <FileText className="h-4 w-4 mr-1 text-destructive" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => shareWhatsApp('cadastro')} className="flex-1">
            <Share2 className="h-4 w-4 mr-1 text-success" /> WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
