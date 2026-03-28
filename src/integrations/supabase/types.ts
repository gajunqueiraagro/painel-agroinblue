export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analise_consultor: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string
          fazenda_id: string | null
          id: string
          json_blocos: Json
          mes: number
          observacoes_manuais: string | null
          periodo_texto: string
          status_fechamento: string
          updated_at: string
          usuario_gerador: string | null
          versao: number
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_blocos?: Json
          mes: number
          observacoes_manuais?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_blocos?: Json
          mes?: number
          observacoes_manuais?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "analise_consultor_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analise_consultor_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_rebanho: {
        Row: {
          codigo: string
          id: string
          nome: string
          ordem_exibicao: number
        }
        Insert: {
          codigo: string
          id?: string
          nome: string
          ordem_exibicao?: number
        }
        Update: {
          codigo?: string
          id?: string
          nome?: string
          ordem_exibicao?: number
        }
        Relationships: []
      }
      chuvas: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          data: string
          fazenda_id: string
          id: string
          milimetros: number
          observacao: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data: string
          fazenda_id: string
          id?: string
          milimetros?: number
          observacao?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          fazenda_id?: string
          id?: string
          milimetros?: number
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chuvas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chuvas_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_membros: {
        Row: {
          ativo: boolean
          cliente_id: string
          created_at: string
          id: string
          perfil: Database["public"]["Enums"]["perfil_acesso"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          created_at?: string
          id?: string
          perfil?: Database["public"]["Enums"]["perfil_acesso"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          id?: string
          perfil?: Database["public"]["Enums"]["perfil_acesso"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_membros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          config: Json | null
          created_at: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          config?: Json | null
          created_at?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          config?: Json | null
          created_at?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      fazenda_cadastros: {
        Row: {
          area_produtiva: number | null
          area_total: number | null
          banco: string | null
          cliente_id: string
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          fazenda_id: string
          id: string
          ie: string | null
          inscricao_rural: string | null
          municipio: string | null
          pix: string | null
          proprietario_nome: string | null
          roteiro: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          area_produtiva?: number | null
          area_total?: number | null
          banco?: string | null
          cliente_id: string
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          fazenda_id: string
          id?: string
          ie?: string | null
          inscricao_rural?: string | null
          municipio?: string | null
          pix?: string | null
          proprietario_nome?: string | null
          roteiro?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          area_produtiva?: number | null
          area_total?: number | null
          banco?: string | null
          cliente_id?: string
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          fazenda_id?: string
          id?: string
          ie?: string | null
          inscricao_rural?: string | null
          municipio?: string | null
          pix?: string | null
          proprietario_nome?: string | null
          roteiro?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fazenda_cadastros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fazenda_cadastros_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: true
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fazenda_membros: {
        Row: {
          created_at: string
          fazenda_id: string
          id: string
          papel: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fazenda_id: string
          id?: string
          papel?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fazenda_id?: string
          id?: string
          papel?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fazenda_membros_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fazendas: {
        Row: {
          cliente_id: string
          codigo_importacao: string | null
          created_at: string
          id: string
          nome: string
          owner_id: string
          tem_pecuaria: boolean
        }
        Insert: {
          cliente_id: string
          codigo_importacao?: string | null
          created_at?: string
          id?: string
          nome: string
          owner_id: string
          tem_pecuaria?: boolean
        }
        Update: {
          cliente_id?: string
          codigo_importacao?: string | null
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          tem_pecuaria?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fazendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_execucoes: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          fechamento_id: string
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          fechamento_id: string
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          fechamento_id?: string
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_execucoes_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_executivo: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string
          fazenda_id: string | null
          id: string
          json_snapshot_indicadores: Json
          json_snapshot_textos: Json
          mes: number
          observacoes_manuais: string | null
          pdf_url: string | null
          periodo_texto: string
          status_fechamento: string
          updated_at: string
          usuario_gerador: string | null
          versao: number
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_snapshot_indicadores?: Json
          json_snapshot_textos?: Json
          mes: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          json_snapshot_indicadores?: Json
          json_snapshot_textos?: Json
          mes?: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_executivo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_executivo_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_graficos: {
        Row: {
          created_at: string
          fechamento_id: string
          id: string
          json_config: Json | null
          json_dados: Json
          ordem: number
          secao: string
          subtitulo: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          fechamento_id: string
          id?: string
          json_config?: Json | null
          json_dados?: Json
          ordem?: number
          secao: string
          subtitulo?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          fechamento_id?: string
          id?: string
          json_config?: Json | null
          json_dados?: Json
          ordem?: number
          secao?: string
          subtitulo?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_graficos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_indicadores: {
        Row: {
          chave: string
          created_at: string
          fechamento_id: string
          formato: string | null
          grupo: string
          id: string
          json_origem: Json | null
          label: string
          ordem: number
          subgrupo: string | null
          unidade: string | null
          valor_ano_anterior: number | null
          valor_meta: number | null
          valor_real: number | null
        }
        Insert: {
          chave: string
          created_at?: string
          fechamento_id: string
          formato?: string | null
          grupo: string
          id?: string
          json_origem?: Json | null
          label: string
          ordem?: number
          subgrupo?: string | null
          unidade?: string | null
          valor_ano_anterior?: number | null
          valor_meta?: number | null
          valor_real?: number | null
        }
        Update: {
          chave?: string
          created_at?: string
          fechamento_id?: string
          formato?: string | null
          grupo?: string
          id?: string
          json_origem?: Json | null
          label?: string
          ordem?: number
          subgrupo?: string | null
          unidade?: string | null
          valor_ano_anterior?: number | null
          valor_meta?: number | null
          valor_real?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_indicadores_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_pasto_itens: {
        Row: {
          categoria_id: string
          created_at: string
          fechamento_id: string
          id: string
          lote: string | null
          observacoes: string | null
          origem_dado: string
          peso_medio_kg: number | null
          quantidade: number
        }
        Insert: {
          categoria_id: string
          created_at?: string
          fechamento_id: string
          id?: string
          lote?: string | null
          observacoes?: string | null
          origem_dado?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Update: {
          categoria_id?: string
          created_at?: string
          fechamento_id?: string
          id?: string
          lote?: string | null
          observacoes?: string | null
          origem_dado?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_pasto_itens_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_rebanho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pasto_itens_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamento_pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_pastos: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          lote_mes: string | null
          observacao_mes: string | null
          pasto_id: string
          qualidade_mes: number | null
          responsavel_nome: string | null
          status: string
          tipo_uso_mes: string | null
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          lote_mes?: string | null
          observacao_mes?: string | null
          pasto_id: string
          qualidade_mes?: number | null
          responsavel_nome?: string | null
          status?: string
          tipo_uso_mes?: string | null
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          lote_mes?: string | null
          observacao_mes?: string | null
          pasto_id?: string
          qualidade_mes?: number | null
          responsavel_nome?: string | null
          status?: string
          tipo_uso_mes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_pastos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pastos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_pastos_pasto_id_fkey"
            columns: ["pasto_id"]
            isOneToOne: false
            referencedRelation: "pastos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamento_textos: {
        Row: {
          created_at: string
          editado_em: string | null
          fechamento_id: string
          gerado_em: string | null
          id: string
          modelo_ia: string | null
          prompt_usado: string | null
          secao: string
          texto_editado: string | null
          texto_final: string | null
          texto_ia: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          editado_em?: string | null
          fechamento_id: string
          gerado_em?: string | null
          id?: string
          modelo_ia?: string | null
          prompt_usado?: string | null
          secao: string
          texto_editado?: string | null
          texto_final?: string | null
          texto_ia?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          editado_em?: string | null
          fechamento_id?: string
          gerado_em?: string | null
          id?: string
          modelo_ia?: string | null
          prompt_usado?: string | null
          secao?: string
          texto_editado?: string | null
          texto_final?: string | null
          texto_ia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_textos_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_executivos"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos_executivos: {
        Row: {
          ano: number
          cliente_id: string
          created_at: string
          data_fechamento: string | null
          data_geracao: string
          fazenda_id: string | null
          id: string
          mes: number
          observacoes_manuais: string | null
          pdf_url: string | null
          periodo_texto: string
          status_fechamento: string
          updated_at: string
          usuario_gerador: string | null
          versao: number
        }
        Insert: {
          ano: number
          cliente_id: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          mes: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Update: {
          ano?: number
          cliente_id?: string
          created_at?: string
          data_fechamento?: string | null
          data_geracao?: string
          fazenda_id?: string | null
          id?: string
          mes?: number
          observacoes_manuais?: string | null
          pdf_url?: string | null
          periodo_texto?: string
          status_fechamento?: string
          updated_at?: string
          usuario_gerador?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_executivos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamentos_executivos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_centros_custo: {
        Row: {
          ativo: boolean
          centro_custo: string
          cliente_id: string
          codigo: string | null
          created_at: string
          fazenda_id: string
          grupo_custo: string
          id: string
          macro_custo: string
          subcentro: string | null
          tipo_operacao: string
        }
        Insert: {
          ativo?: boolean
          centro_custo: string
          cliente_id: string
          codigo?: string | null
          created_at?: string
          fazenda_id: string
          grupo_custo: string
          id?: string
          macro_custo: string
          subcentro?: string | null
          tipo_operacao: string
        }
        Update: {
          ativo?: boolean
          centro_custo?: string
          cliente_id?: string
          codigo?: string | null
          created_at?: string
          fazenda_id?: string
          grupo_custo?: string
          id?: string
          macro_custo?: string
          subcentro?: string | null
          tipo_operacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_centros_custo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_centros_custo_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_contas: {
        Row: {
          agencia_conta: string | null
          ativo: boolean
          banco: string | null
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          instrumento: string | null
          nome_conta: string
          tipo: string | null
          uso: string | null
        }
        Insert: {
          agencia_conta?: string | null
          ativo?: boolean
          banco?: string | null
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          instrumento?: string | null
          nome_conta: string
          tipo?: string | null
          uso?: string | null
        }
        Update: {
          agencia_conta?: string | null
          ativo?: boolean
          banco?: string | null
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          instrumento?: string | null
          nome_conta?: string
          tipo?: string | null
          uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_contas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_contas_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_fornecedores: {
        Row: {
          ativo: boolean
          cliente_id: string
          cpf_cnpj: string | null
          created_at: string
          fazenda_id: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          cliente_id: string
          cpf_cnpj?: string | null
          created_at?: string
          fazenda_id: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string
          cpf_cnpj?: string | null
          created_at?: string
          fazenda_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_fornecedores_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_fornecedores_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_importacoes: {
        Row: {
          cliente_id: string
          created_at: string
          data_importacao: string
          fazenda_id: string
          id: string
          nome_arquivo: string
          status: string
          total_com_erro: number
          total_linhas: number
          total_validas: number
          usuario_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_importacao?: string
          fazenda_id: string
          id?: string
          nome_arquivo: string
          status?: string
          total_com_erro?: number
          total_linhas?: number
          total_validas?: number
          usuario_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_importacao?: string
          fazenda_id?: string
          id?: string
          nome_arquivo?: string
          status?: string
          total_com_erro?: number
          total_linhas?: number
          total_validas?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_importacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_importacoes_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          ano_mes: string
          centro_custo: string | null
          cliente_id: string
          conta_destino: string | null
          conta_origem: string | null
          cpf_cnpj: string | null
          created_at: string
          data_pagamento: string | null
          data_realizacao: string
          escopo_negocio: string | null
          fazenda_id: string
          forma_pagamento: string | null
          fornecedor: string | null
          grupo_custo: string | null
          id: string
          importacao_id: string | null
          macro_custo: string | null
          nota_fiscal: string | null
          obs: string | null
          origem_dado: string
          produto: string | null
          recorrencia: string | null
          status_transacao: string | null
          subcentro: string | null
          tipo_operacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_mes: string
          centro_custo?: string | null
          cliente_id: string
          conta_destino?: string | null
          conta_origem?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_realizacao: string
          escopo_negocio?: string | null
          fazenda_id: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          grupo_custo?: string | null
          id?: string
          importacao_id?: string | null
          macro_custo?: string | null
          nota_fiscal?: string | null
          obs?: string | null
          origem_dado?: string
          produto?: string | null
          recorrencia?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ano_mes?: string
          centro_custo?: string | null
          cliente_id?: string
          conta_destino?: string | null
          conta_origem?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_realizacao?: string
          escopo_negocio?: string | null
          fazenda_id?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          grupo_custo?: string | null
          id?: string
          importacao_id?: string | null
          macro_custo?: string | null
          nota_fiscal?: string | null
          obs?: string | null
          origem_dado?: string
          produto?: string | null
          recorrencia?: string | null
          status_transacao?: string | null
          subcentro?: string | null
          tipo_operacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_resumo_caixa: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          entradas: number
          fazenda_id: string
          id: string
          importacao_id: string | null
          saidas: number
          saldo_final_total: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          entradas?: number
          fazenda_id: string
          id?: string
          importacao_id?: string | null
          saidas?: number
          saldo_final_total?: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          entradas?: number
          fazenda_id?: string
          id?: string
          importacao_id?: string | null
          saidas?: number
          saldo_final_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_resumo_caixa_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_resumo_caixa_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_resumo_caixa_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_saldos_bancarios: {
        Row: {
          ano_mes: string
          cliente_id: string
          conta_banco: string
          created_at: string
          fazenda_id: string
          id: string
          importacao_id: string | null
          saldo_final: number
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          conta_banco: string
          created_at?: string
          fazenda_id: string
          id?: string
          importacao_id?: string | null
          saldo_final?: number
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          conta_banco?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          importacao_id?: string | null
          saldo_final?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_saldos_bancarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_bancarios_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_saldos_bancarios_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "financeiro_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          acrescimos: number | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          categoria: string
          categoria_destino: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          data: string
          deducoes: number | null
          desconto_funrural: number | null
          desconto_qualidade: number | null
          fazenda_destino: string | null
          fazenda_id: string
          fazenda_origem: string | null
          id: string
          nota_fiscal: string | null
          observacao: string | null
          outros_descontos: number | null
          peso_carcaca_kg: number | null
          peso_medio_arrobas: number | null
          peso_medio_kg: number | null
          preco_arroba: number | null
          preco_medio_cabeca: number | null
          quantidade: number
          status_operacional: string
          tipo: string
          tipo_peso: string | null
          transferencia_par_id: string | null
          updated_at: string
          updated_by: string | null
          valor_total: number | null
        }
        Insert: {
          acrescimos?: number | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          categoria: string
          categoria_destino?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data: string
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          fazenda_destino?: string | null
          fazenda_id: string
          fazenda_origem?: string | null
          id?: string
          nota_fiscal?: string | null
          observacao?: string | null
          outros_descontos?: number | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          quantidade: number
          status_operacional?: string
          tipo: string
          tipo_peso?: string | null
          transferencia_par_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
        }
        Update: {
          acrescimos?: number | null
          bonus_lista_trace?: number | null
          bonus_precoce?: number | null
          bonus_qualidade?: number | null
          categoria?: string
          categoria_destino?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          deducoes?: number | null
          desconto_funrural?: number | null
          desconto_qualidade?: number | null
          fazenda_destino?: string | null
          fazenda_id?: string
          fazenda_origem?: string | null
          id?: string
          nota_fiscal?: string | null
          observacao?: string | null
          outros_descontos?: number | null
          peso_carcaca_kg?: number | null
          peso_medio_arrobas?: number | null
          peso_medio_kg?: number | null
          preco_arroba?: number | null
          preco_medio_cabeca?: number | null
          quantidade?: number
          status_operacional?: string
          tipo?: string
          tipo_peso?: string | null
          transferencia_par_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_transferencia_par_id_fkey"
            columns: ["transferencia_par_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pastos: {
        Row: {
          area_produtiva_ha: number | null
          ativo: boolean
          cliente_id: string
          created_at: string
          entra_conciliacao: boolean
          fazenda_id: string
          id: string
          lote_padrao: string | null
          nome: string
          observacoes: string | null
          qualidade: number | null
          tipo_uso: string
          updated_at: string
        }
        Insert: {
          area_produtiva_ha?: number | null
          ativo?: boolean
          cliente_id: string
          created_at?: string
          entra_conciliacao?: boolean
          fazenda_id: string
          id?: string
          lote_padrao?: string | null
          nome: string
          observacoes?: string | null
          qualidade?: number | null
          tipo_uso?: string
          updated_at?: string
        }
        Update: {
          area_produtiva_ha?: number | null
          ativo?: boolean
          cliente_id?: string
          created_at?: string
          entra_conciliacao?: boolean
          fazenda_id?: string
          id?: string
          lote_padrao?: string | null
          nome?: string
          observacoes?: string | null
          qualidade?: number | null
          tipo_uso?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastos_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cliente_id: string | null
          created_at: string
          id: string
          nome: string | null
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_iniciais: {
        Row: {
          ano: number
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          peso_medio_kg: number | null
          quantidade: number
        }
        Insert: {
          ano: number
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Update: {
          ano?: number
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_iniciais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldos_iniciais_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_fechamento: {
        Row: {
          ano_mes: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          reaberto_em: string | null
          reaberto_por: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ano_mes: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          reaberto_em?: string | null
          reaberto_por?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_fechamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_fechamento_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
      valor_rebanho_mensal: {
        Row: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at: string
          fazenda_id: string
          id: string
          preco_kg: number
          updated_at: string
        }
        Insert: {
          ano_mes: string
          categoria: string
          cliente_id: string
          created_at?: string
          fazenda_id: string
          id?: string
          preco_kg?: number
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          categoria?: string
          cliente_id?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          preco_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "valor_rebanho_mensal_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valor_rebanho_mensal_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_cliente_id: { Args: { _user_id?: string }; Returns: string }
      get_user_cliente_ids: { Args: { _user_id?: string }; Returns: string[] }
      get_user_perfil: {
        Args: { _cliente_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["perfil_acesso"]
      }
      is_admin_agroinblue: { Args: { _user_id?: string }; Returns: boolean }
      is_cliente_member: {
        Args: { _cliente_id: string; _user_id: string }
        Returns: boolean
      }
      is_fazenda_member: {
        Args: { _fazenda_id: string; _user_id: string }
        Returns: boolean
      }
      resolve_transfer_destination_fazenda: {
        Args: { _destino_nome: string; _origem_fazenda_id: string }
        Returns: string
      }
      shares_fazenda: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
    }
    Enums: {
      perfil_acesso:
        | "admin_agroinblue"
        | "gestor_cliente"
        | "financeiro"
        | "campo"
        | "leitura"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      perfil_acesso: [
        "admin_agroinblue",
        "gestor_cliente",
        "financeiro",
        "campo",
        "leitura",
      ],
    },
  },
} as const
