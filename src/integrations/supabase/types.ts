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
      fazenda_cadastros: {
        Row: {
          area_produtiva: number | null
          area_total: number | null
          banco: string | null
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
          created_at: string
          id: string
          nome: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          acrescimos: number | null
          bonus_lista_trace: number | null
          bonus_precoce: number | null
          bonus_qualidade: number | null
          categoria: string
          categoria_destino: string | null
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
          tipo?: string
          tipo_peso?: string | null
          transferencia_par_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valor_total?: number | null
        }
        Relationships: [
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
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saldos_iniciais: {
        Row: {
          ano: number
          categoria: string
          created_at: string
          fazenda_id: string
          id: string
          peso_medio_kg: number | null
          quantidade: number
        }
        Insert: {
          ano: number
          categoria: string
          created_at?: string
          fazenda_id: string
          id?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Update: {
          ano?: number
          categoria?: string
          created_at?: string
          fazenda_id?: string
          id?: string
          peso_medio_kg?: number | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldos_iniciais_fazenda_id_fkey"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
