// Gerado a partir do Supabase (projeto ripgenhykaajcnzdxoid) em 06/11/2026; tabelas de manutenção adicionadas (migração maintenance).
// NÃO editar manualmente — regenerar após cada migração.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          motorcycle_id: string | null
          new_data: Json | null
          organization_id: string | null
          previous_data: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          motorcycle_id?: string | null
          new_data?: Json | null
          organization_id?: string | null
          previous_data?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          motorcycle_id?: string | null
          new_data?: Json | null
          organization_id?: string | null
          previous_data?: Json | null
        }
        Relationships: []
      }
      maintenance_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          brand: string | null
          maintenance_record_id: string
          notes: string | null
          part_number: string | null
          quantity: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      maintenance_records: {
        Row: {
          category: Database["public"]["Enums"]["maintenance_category"]
          correction_reason: string | null
          corrects_record_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_void: boolean
          mileage: number | null
          mileage_record_id: string | null
          motorcycle_id: string
          notes: string | null
          organization_id: string | null
          service_date: string
          service_value_cents: number | null
          source_type: Database["public"]["Enums"]["record_source"]
          title: string
          workshop_name: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      mileage_records: {
        Row: {
          below_previous: boolean
          corrects_record_id: string | null
          created_at: string
          created_by: string | null
          evidence_id: string | null
          id: string
          mileage: number
          motorcycle_id: string
          note: string | null
          organization_id: string | null
          recorded_at: string
          source_type: Database["public"]["Enums"]["record_source"]
        }
        Insert: {
          below_previous?: boolean
          corrects_record_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence_id?: string | null
          id?: string
          mileage: number
          motorcycle_id: string
          note?: string | null
          organization_id?: string | null
          recorded_at: string
          source_type: Database["public"]["Enums"]["record_source"]
        }
        Update: {
          below_previous?: boolean
          corrects_record_id?: string | null
          created_at?: string
          created_by?: string | null
          evidence_id?: string | null
          id?: string
          mileage?: number
          motorcycle_id?: string
          note?: string | null
          organization_id?: string | null
          recorded_at?: string
          source_type?: Database["public"]["Enums"]["record_source"]
        }
        Relationships: [
          {
            foreignKeyName: "mileage_records_corrects_record_id_fkey"
            columns: ["corrects_record_id"]
            isOneToOne: false
            referencedRelation: "mileage_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_records_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "motorcycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_records_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "my_motorcycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      motorcycle_claim_requests: {
        Row: {
          created_at: string
          id: string
          motorcycle_id: string | null
          plate: string
          requested_by: string
          requester_note: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["claim_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          motorcycle_id?: string | null
          plate: string
          requested_by: string
          requester_note?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
        }
        Update: {
          created_at?: string
          id?: string
          motorcycle_id?: string | null
          plate?: string
          requested_by?: string
          requester_note?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
        }
        Relationships: [
          {
            foreignKeyName: "motorcycle_claim_requests_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "motorcycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorcycle_claim_requests_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "my_motorcycles"
            referencedColumns: ["id"]
          },
        ]
      }
      motorcycle_ownerships: {
        Row: {
          acquisition_date: string | null
          created_at: string
          end_reason: string | null
          ended_at: string | null
          id: string
          motorcycle_id: string
          owner_user_id: string
          started_at: string
          transfer_id: string | null
        }
        Insert: {
          acquisition_date?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          motorcycle_id: string
          owner_user_id: string
          started_at?: string
          transfer_id?: string | null
        }
        Update: {
          acquisition_date?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          motorcycle_id?: string
          owner_user_id?: string
          started_at?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motorcycle_ownerships_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "motorcycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorcycle_ownerships_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "my_motorcycles"
            referencedColumns: ["id"]
          },
        ]
      }
      motorcycle_plates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          motorcycle_id: string
          plate: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          motorcycle_id: string
          plate: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          motorcycle_id?: string
          plate?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motorcycle_plates_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "motorcycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorcycle_plates_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: false
            referencedRelation: "my_motorcycles"
            referencedColumns: ["id"]
          },
        ]
      }
      motorcycle_private: {
        Row: {
          chassis: string | null
          motorcycle_id: string
          updated_at: string
        }
        Insert: {
          chassis?: string | null
          motorcycle_id: string
          updated_at?: string
        }
        Update: {
          chassis?: string | null
          motorcycle_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorcycle_private_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: true
            referencedRelation: "motorcycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorcycle_private_motorcycle_id_fkey"
            columns: ["motorcycle_id"]
            isOneToOne: true
            referencedRelation: "my_motorcycles"
            referencedColumns: ["id"]
          },
        ]
      }
      motorcycles: {
        Row: {
          brand: string
          color: string | null
          created_at: string
          created_by: string | null
          displacement_cc: number | null
          id: string
          initial_notes: string | null
          manufacturing_year: number
          model: string
          model_year: number | null
          public_id: string
          status: Database["public"]["Enums"]["motorcycle_status"]
          updated_at: string
          version: string | null
        }
        Insert: {
          brand: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          displacement_cc?: number | null
          id?: string
          initial_notes?: string | null
          manufacturing_year: number
          model: string
          model_year?: number | null
          public_id?: string
          status?: Database["public"]["Enums"]["motorcycle_status"]
          updated_at?: string
          version?: string | null
        }
        Update: {
          brand?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          displacement_cc?: number | null
          id?: string
          initial_notes?: string | null
          manufacturing_year?: number
          model?: string
          model_year?: number | null
          public_id?: string
          status?: Database["public"]["Enums"]["motorcycle_status"]
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          status: Database["public"]["Enums"]["org_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["org_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: Database["public"]["Enums"]["org_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["organization_status"]
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["organization_status"]
          type: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["organization_status"]
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          privacy_accepted_at: string | null
          privacy_version: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          privacy_accepted_at?: string | null
          privacy_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workshops: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
          cnpj: string | null
          created_at: string
          description: string | null
          email: string | null
          is_public: boolean
          legal_name: string | null
          logo_url: string | null
          opening_hours: string | null
          organization_id: string
          phone: string | null
          public_slug: string
          responsible_name: string | null
          specialties: string[]
          state: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["workshop_verification"]
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          city?: string | null
          cnpj?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          is_public?: boolean
          legal_name?: string | null
          logo_url?: string | null
          opening_hours?: string | null
          organization_id: string
          phone?: string | null
          public_slug: string
          responsible_name?: string | null
          specialties?: string[]
          state?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["workshop_verification"]
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          city?: string | null
          cnpj?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          is_public?: boolean
          legal_name?: string | null
          logo_url?: string | null
          opening_hours?: string | null
          organization_id?: string
          phone?: string | null
          public_slug?: string
          responsible_name?: string | null
          specialties?: string[]
          state?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["workshop_verification"]
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      maintenance_timeline: {
        Row: {
          category: Database["public"]["Enums"]["maintenance_category"] | null
          correction_reason: string | null
          corrects_record_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_void: boolean | null
          items: Json | null
          mileage: number | null
          motorcycle_id: string | null
          notes: string | null
          organization_id: string | null
          service_date: string | null
          service_value_cents: number | null
          source_type: Database["public"]["Enums"]["record_source"] | null
          status: string | null
          title: string | null
          workshop_name: string | null
        }
        Relationships: []
      }
      my_motorcycles: {
        Row: {
          acquisition_date: string | null
          brand: string | null
          color: string | null
          current_plate: string | null
          displacement_cc: number | null
          id: string | null
          latest_mileage: number | null
          latest_mileage_at: string | null
          manufacturing_year: number | null
          model: string | null
          model_year: number | null
          owned_since: string | null
          passport_created_at: string | null
          public_id: string | null
          status: Database["public"]["Enums"]["motorcycle_status"] | null
          version: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      change_motorcycle_plate: {
        Args: { p_motorcycle_id: string; p_new_plate: string }
        Returns: undefined
      }
      create_maintenance_record: {
        Args: {
          p_category: Database["public"]["Enums"]["maintenance_category"]
          p_correction_reason?: string
          p_corrects_record_id?: string
          p_description?: string
          p_items?: Json
          p_mileage?: number
          p_motorcycle_id: string
          p_notes?: string
          p_service_date: string
          p_service_value_cents?: number
          p_title: string
          p_workshop_name?: string
        }
        Returns: Json
      }
      void_maintenance_record: {
        Args: { p_reason: string; p_record_id: string }
        Returns: string
      }
      create_workshop: {
        Args: {
          p_business_name: string
          p_city?: string
          p_cnpj?: string
          p_email?: string
          p_legal_name?: string
          p_phone?: string
          p_public_slug: string
          p_state?: string
          p_whatsapp?: string
        }
        Returns: string
      }
      get_public_passport: { Args: { p_public_id: string }; Returns: Json }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_current_owner: { Args: { p_motorcycle: string }; Returns: boolean }
      is_org_active: { Args: { p_org: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_responsible: { Args: { p_org: string }; Returns: boolean }
      is_valid_plate: { Args: { p_plate: string }; Returns: boolean }
      normalize_plate: { Args: { p_value: string }; Returns: string }
      record_mileage: {
        Args: {
          p_corrects_record_id?: string
          p_mileage: number
          p_motorcycle_id: string
          p_note?: string
          p_recorded_at?: string
        }
        Returns: Json
      }
      register_motorcycle: {
        Args: {
          p_acquisition_date?: string
          p_brand: string
          p_chassis?: string
          p_color?: string
          p_current_mileage: number
          p_displacement_cc?: number
          p_initial_notes?: string
          p_manufacturing_year: number
          p_model: string
          p_model_year?: number
          p_plate: string
          p_version?: string
        }
        Returns: Json
      }
      write_audit: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_motorcycle_id?: string
          p_new?: Json
          p_organization_id?: string
          p_previous?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "workshop" | "admin"
      claim_status: "pending" | "approved" | "rejected" | "canceled"
      maintenance_category:
        | "revision"
        | "oil_change"
        | "filters"
        | "brakes"
        | "tires"
        | "suspension"
        | "engine"
        | "transmission"
        | "electrical"
        | "battery"
        | "cooling"
        | "accessories"
        | "modifications"
        | "repairs"
        | "accident"
        | "inspection"
        | "other"
      motorcycle_status: "active" | "archived"
      org_member_role: "responsible" | "staff"
      org_member_status: "active" | "removed"
      organization_status: "active" | "suspended" | "blocked"
      organization_type: "workshop"
      record_source: "owner" | "workshop" | "document"
      workshop_verification: "unverified" | "verified" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "workshop", "admin"],
      claim_status: ["pending", "approved", "rejected", "canceled"],
      maintenance_category: [
        "revision", "oil_change", "filters", "brakes", "tires", "suspension", "engine",
        "transmission", "electrical", "battery", "cooling", "accessories", "modifications",
        "repairs", "accident", "inspection", "other",
      ],
      motorcycle_status: ["active", "archived"],
      org_member_role: ["responsible", "staff"],
      org_member_status: ["active", "removed"],
      organization_status: ["active", "suspended", "blocked"],
      organization_type: ["workshop"],
      record_source: ["owner", "workshop", "document"],
      workshop_verification: ["unverified", "verified", "rejected"],
    },
  },
} as const
