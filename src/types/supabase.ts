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
      attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          maintenance_record_id: string | null
          diary_entry_id: string | null
          organization_id: string | null
          mime_type: string
          motorcycle_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      motorcycle_diary: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["diary_category"]
          created_at: string
          entry_date: string
          id: string
          location: string | null
          motorcycle_id: string
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["diary_visibility"]
        }
        Insert: never
        Update: never
        Relationships: []
      }
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
          can_register_services: boolean
          can_request_access: boolean
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
      motorcycle_diary_feed: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["diary_category"] | null
          created_at: string | null
          entry_date: string | null
          id: string | null
          is_mine: boolean | null
          location: string | null
          motorcycle_id: string | null
          photos: Json | null
          title: string | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["diary_visibility"] | null
        }
        Relationships: []
      }
      maintenance_timeline: {
        Row: {
          attachments: Json | null
          evidence_level: Database["public"]["Enums"]["record_source"] | null
          recorded_by_name: string | null
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
      register_attachment: {
        Args: {
          p_file_name: string
          p_kind: Database["public"]["Enums"]["attachment_kind"]
          p_maintenance_record_id?: string
          p_diary_entry_id?: string
          p_motorcycle_id: string
          p_storage_path: string
        }
        Returns: string
      }
      get_storage_usage: { Args: never; Returns: Json }
      get_public_plans: { Args: never; Returns: Json }
      get_payment_public_config: { Args: never; Returns: Json }
      get_my_subscription: { Args: never; Returns: Json }
      get_my_invoices: {
        Args: never
        Returns: {
          amount_cents: number
          attempts: number
          currency: string
          due_date: string
          id: string
          number: string
          paid_at: string | null
          period_end: string
          period_start: string
          plan_name: string
          status: string
        }[]
      }
      get_invoice_receipt: { Args: { p_invoice_id: string }; Returns: Json }
      admin_list_invoices: {
        Args: { p_limit?: number }
        Returns: {
          amount_cents: number
          attempts: number
          due_date: string
          environment: string
          id: string
          number: string
          paid_at: string | null
          period_end: string
          period_start: string
          plan_name: string
          status: string
          user_name: string
        }[]
      }
      get_motorcycle_reminders: { Args: { p_motorcycle_id: string }; Returns: Json }
      get_my_due_reminders: { Args: never; Returns: Json }
      create_reminder: {
        Args: {
          p_base_date?: string | null
          p_base_mileage?: number | null
          p_category?: Database['public']['Enums']['maintenance_category'] | null
          p_due_date?: string | null
          p_every_km?: number | null
          p_every_months?: number | null
          p_motorcycle_id: string
          p_notes?: string | null
          p_title: string
        }
        Returns: string
      }
      update_reminder: {
        Args: {
          p_category: Database['public']['Enums']['maintenance_category'] | null
          p_due_date: string | null
          p_every_km: number | null
          p_every_months: number | null
          p_notes: string | null
          p_reminder_id: string
          p_title: string
        }
        Returns: undefined
      }
      set_reminder_paused: { Args: { p_paused: boolean; p_reminder_id: string }; Returns: undefined }
      complete_reminder: { Args: { p_date?: string | null; p_mileage?: number | null; p_reminder_id: string }; Returns: undefined }
      delete_reminder: { Args: { p_reminder_id: string }; Returns: undefined }
      register_motorcycle_report: { Args: { p_motorcycle_id: string }; Returns: Json }
      get_my_payments: {
        Args: never
        Returns: { amount_cents: number; created_at: string; currency: string; id: string; paid_at: string | null; plan_name: string; status: string }[]
      }
      admin_set_billing_enabled: { Args: { p_enabled: boolean }; Returns: undefined }
      admin_list_subscriptions: {
        Args: { p_limit?: number }
        Returns: {
          billing_period: string
          created_at: string
          current_period_end: string | null
          environment: string
          id: string
          last_synced_at: string | null
          payments_approved: number
          plan_name: string
          price_cents: number
          provider_status: string | null
          status: string
          user_name: string
        }[]
      }
      admin_list_payment_events: {
        Args: { p_limit?: number }
        Returns: {
          action: string | null
          detail: string | null
          event_type: string | null
          id: number
          processed_at: string | null
          provider: string
          received_at: string
          request_id: string | null
          resource_id: string | null
          result: string
          signature_valid: boolean
        }[]
      }
      admin_get_payment_settings: { Args: never; Returns: Json }
      admin_save_payment_settings: {
        Args: { p_access_token?: string | null; p_environment: string; p_public_key: string | null; p_webhook_secret?: string | null }
        Returns: undefined
      }
      get_my_plan: { Args: never; Returns: Json }
      admin_list_plans: {
        Args: never
        Returns: {
            id: string
            code: string
            kind: string
            billing_period: string
            name: string
            description: string | null
            price_cents: number
            currency: string
            price_note: string | null
            max_motorcycles: number
            storage_quota_mb: number
            features: string[]
            trial_days: number
            cancellation_text: string | null
            is_active: boolean
            is_public: boolean
            sort_order: number
            version: number
            created_at: string
            updated_at: string
            updated_by: string | null
            entitlements: string[]
            max_share_links: number
          }[]
      }
      admin_save_plan: {
        Args: {
          p_billing_period: string | null
          p_cancellation_text: string | null
          p_code: string | null
          p_description: string | null
          p_features: string[]
          p_id: string | null
          p_is_public: boolean
          p_kind: string | null
          p_max_motorcycles: number
          p_name: string
          p_price_cents: number
          p_price_note: string | null
          p_sort_order: number
          p_storage_quota_mb: number
          p_trial_days: number
        }
        Returns: string
      }
      admin_set_plan_benefits: {
        Args: { p_entitlements: string[]; p_id: string; p_max_share_links: number | null }
        Returns: undefined
      }
      admin_set_plan_active: { Args: { p_active: boolean; p_id: string }; Returns: undefined }
      admin_get_plan_history: {
        Args: { p_id: string }
        Returns: { changed_at: string; changed_by_name: string; snapshot: Json; version: number }[]
      }
      create_diary_entry: {
        Args: {
          p_body?: string
          p_category: Database["public"]["Enums"]["diary_category"]
          p_entry_date: string
          p_location?: string
          p_motorcycle_id: string
          p_title: string
          p_visibility?: Database["public"]["Enums"]["diary_visibility"]
        }
        Returns: string
      }
      update_diary_entry: {
        Args: {
          p_body?: string
          p_category: Database["public"]["Enums"]["diary_category"]
          p_entry_date: string
          p_entry_id: string
          p_location?: string
          p_title: string
          p_visibility?: Database["public"]["Enums"]["diary_visibility"]
        }
        Returns: undefined
      }
      search_motorcycle_by_plate: { Args: { p_organization_id: string; p_plate: string }; Returns: Json }
      request_workshop_access: { Args: { p_message?: string; p_organization_id: string; p_origin?: boolean; p_plate: string }; Returns: Json }
      cancel_workshop_access_request: { Args: { p_access_id: string }; Returns: undefined }
      decide_workshop_access: { Args: { p_access_id: string; p_approve: boolean; p_as_origin?: boolean }; Returns: undefined }
      set_origin_workshop: { Args: { p_access_id: string; p_origin: boolean }; Returns: undefined }
      revoke_workshop_access: { Args: { p_access_id: string }; Returns: undefined }
      workshop_has_access: { Args: { p_motorcycle: string; p_organization?: string }; Returns: boolean }
      get_motorcycle_workshop_access: {
        Args: { p_motorcycle_id: string }
        Returns: {
          access_type: Database["public"]["Enums"]["workshop_access_type"]
          decided_at: string | null
          end_reason: string | null
          ended_at: string | null
          id: string
          message: string | null
          origin_available: boolean
          requested_at: string
          status: Database["public"]["Enums"]["workshop_access_status"]
          workshop_active: boolean
          workshop_city: string | null
          workshop_name: string
          workshop_slug: string | null
          workshop_state: string | null
          workshop_verified: boolean
        }[]
      }
      get_my_pending_access_requests: {
        Args: never
        Returns: {
          id: string
          message: string | null
          motorcycle_id: string
          motorcycle_label: string
          requested_at: string
          workshop_city: string | null
          workshop_name: string
          workshop_state: string | null
        }[]
      }
      get_workshop_access_list: {
        Args: { p_organization_id: string }
        Returns: {
          access_type: Database["public"]["Enums"]["workshop_access_type"]
          brand: string
          decided_at: string | null
          ended_at: string | null
          id: string
          latest_mileage: number | null
          latest_mileage_at: string | null
          manufacturing_year: number
          model: string
          motorcycle_id: string | null
          plate: string | null
          requested_at: string
          status: Database["public"]["Enums"]["workshop_access_status"]
        }[]
      }
      has_org_permission: { Args: { p_organization: string; p_permission: string }; Returns: boolean }
      create_org_invite: {
        Args: { p_can_register_services?: boolean; p_can_request_access?: boolean; p_email: string; p_organization_id: string }
        Returns: Json
      }
      revoke_org_invite: { Args: { p_invite_id: string }; Returns: undefined }
      get_invite_preview: { Args: { p_token: string }; Returns: Json }
      accept_org_invite: { Args: { p_token: string }; Returns: string }
      get_org_members: {
        Args: { p_organization_id: string }
        Returns: {
          can_register_services: boolean
          can_request_access: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_me: boolean
          role: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }[]
      }
      get_org_invites: {
        Args: { p_organization_id: string }
        Returns: {
          can_register_services: boolean
          can_request_access: boolean
          created_at: string
          email: string
          expires_at: string
          id: string
        }[]
      }
      update_org_member: {
        Args: {
          p_can_register_services: boolean
          p_can_request_access: boolean
          p_member_id: string
          p_role: Database["public"]["Enums"]["org_member_role"]
        }
        Returns: undefined
      }
      remove_org_member: { Args: { p_member_id: string }; Returns: undefined }
      leave_organization: { Args: { p_organization_id: string }; Returns: undefined }
      create_workshop_service: {
        Args: {
          p_category: Database["public"]["Enums"]["maintenance_category"]
          p_correction_reason?: string
          p_corrects_record_id?: string
          p_description?: string
          p_items?: Json
          p_mileage?: number
          p_motorcycle_id: string
          p_notes?: string
          p_organization_id: string
          p_service_date: string
          p_service_value_cents?: number
          p_title: string
        }
        Returns: Json
      }
      get_workshop_timeline: {
        Args: { p_motorcycle_id: string; p_organization_id: string }
        Returns: {
          attachments: Json
          category: Database["public"]["Enums"]["maintenance_category"]
          correction_reason: string | null
          corrects_record_id: string | null
          created_at: string
          description: string | null
          evidence_level: Database["public"]["Enums"]["record_source"]
          id: string
          is_own: boolean
          is_void: boolean
          items: Json
          mileage: number | null
          notes: string | null
          recorded_by_name: string | null
          service_date: string
          service_value_cents: number | null
          source_type: Database["public"]["Enums"]["record_source"]
          status: string
          title: string
          workshop_name: string | null
        }[]
      }
      register_workshop_attachment: {
        Args: {
          p_file_name: string
          p_kind: Database["public"]["Enums"]["attachment_kind"]
          p_maintenance_record_id: string
          p_organization_id: string
          p_storage_path: string
        }
        Returns: string
      }
      get_workshop_storage_usage: { Args: { p_organization_id: string }; Returns: Json }
      create_transfer_request: { Args: { p_message?: string; p_motorcycle_id: string; p_to_email: string }; Returns: string }
      cancel_transfer_request: { Args: { p_transfer_id: string }; Returns: undefined }
      reject_transfer_request: { Args: { p_transfer_id: string }; Returns: undefined }
      accept_transfer_request: { Args: { p_acquisition_date?: string; p_transfer_id: string }; Returns: string }
      get_motorcycle_transfers: {
        Args: { p_motorcycle_id: string }
        Returns: { created_at: string; decided_at: string | null; expires_at: string; id: string; message: string | null; status: string; to_email: string }[]
      }
      get_my_incoming_transfers: {
        Args: never
        Returns: {
          brand: string
          created_at: string
          expires_at: string
          from_name: string | null
          id: string
          latest_mileage: number | null
          maintenance_count: number
          manufacturing_year: number
          message: string | null
          model: string
          plate: string | null
          version: string | null
        }[]
      }
      get_my_previous_motorcycles: {
        Args: never
        Returns: {
          brand: string
          manufacturing_year: number
          model: string
          motorcycle_id: string
          my_diary_entries: number
          owned_from: string
          owned_until: string
          version: string | null
        }[]
      }
      create_passport_share: {
        Args: {
          p_expires_in_days?: number
          p_label?: string
          p_motorcycle_id: string
          p_show_attachments?: boolean
          p_show_diary?: boolean
          p_show_history?: boolean
          p_show_mileage?: boolean
          p_show_plate?: boolean
          p_show_values?: boolean
        }
        Returns: Json
      }
      revoke_passport_share: { Args: { p_share_id: string }; Returns: undefined }
      get_motorcycle_shares: {
        Args: { p_motorcycle_id: string }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          label: string | null
          last_viewed_at: string | null
          revoked_at: string | null
          show_attachments: boolean
          show_diary: boolean
          show_history: boolean
          show_mileage: boolean
          show_plate: boolean
          show_values: boolean
          status: string
          token: string
          view_count: number
        }[]
      }
      get_shared_passport: { Args: { p_token: string }; Returns: Json }
      get_passport_settings: { Args: { p_motorcycle_id: string }; Returns: Json }
      set_public_page_enabled: { Args: { p_enabled: boolean; p_motorcycle_id: string }; Returns: undefined }
      delete_diary_entry: { Args: { p_entry_id: string }; Returns: string[] }
      delete_diary_photo: { Args: { p_attachment_id: string }; Returns: string }
      can_access_attachment_object: { Args: { p_name: string }; Returns: boolean }
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
      workshop_access_status: "pending" | "approved" | "rejected" | "canceled" | "revoked" | "ended"
      workshop_access_type: "regular" | "origin"
      diary_category: "first_ride" | "trip" | "meetup" | "accessory" | "customization" | "photo" | "other"
      diary_visibility: "private" | "shareable"
      attachment_kind: "photo" | "invoice" | "service_order" | "receipt" | "document" | "other"
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
