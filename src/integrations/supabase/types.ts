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
      audit_log: {
        Row: {
          action: string
          id: string
          new_data: Json | null
          old_data: Json | null
          performed_at: string
          performed_by: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          created_at: string
          current_step: number | null
          email: string
          id: string
          last_error: string | null
          name: string | null
          opened_at: string | null
          patient_id: string | null
          sent_at: string | null
          source: string
          status: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          created_at?: string
          current_step?: number | null
          email: string
          id?: string
          last_error?: string | null
          name?: string | null
          opened_at?: string | null
          patient_id?: string | null
          sent_at?: string | null
          source?: string
          status?: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string
          current_step?: number | null
          email?: string
          id?: string
          last_error?: string | null
          name?: string | null
          opened_at?: string | null
          patient_id?: string | null
          sent_at?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_send_log: {
        Row: {
          bounce_type: string | null
          campaign_id: string
          clicked_at: string | null
          complaint_at: string | null
          created_at: string
          error_message: string | null
          id: string
          opened_at: string | null
          provider: string | null
          provider_message_id: string | null
          recipient_id: string
          sent_at: string | null
          status: string
          step_number: number
          tracking_id: string | null
        }
        Insert: {
          bounce_type?: string | null
          campaign_id: string
          clicked_at?: string | null
          complaint_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_id: string
          sent_at?: string | null
          status?: string
          step_number?: number
          tracking_id?: string | null
        }
        Update: {
          bounce_type?: string | null
          campaign_id?: string
          clicked_at?: string | null
          complaint_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string
          sent_at?: string | null
          status?: string
          step_number?: number
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_send_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_send_log_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sequences: {
        Row: {
          body_html_override: string | null
          campaign_id: string
          created_at: string
          delay_days: number
          id: string
          step_number: number
          subject_override: string | null
          template_id: string | null
        }
        Insert: {
          body_html_override?: string | null
          campaign_id: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject_override?: string | null
          template_id?: string | null
        }
        Update: {
          body_html_override?: string | null
          campaign_id?: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject_override?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sequences_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_unsubscribes: {
        Row: {
          campaign_id: string | null
          email: string
          id: string
          unsubscribed_at: string
        }
        Insert: {
          campaign_id?: string | null
          email: string
          id?: string
          unsubscribed_at?: string
        }
        Update: {
          campaign_id?: string | null
          email?: string
          id?: string
          unsubscribed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_unsubscribes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          auto_schedule: boolean | null
          business_days: string[] | null
          business_hours_end: number | null
          business_hours_start: number | null
          campaign_type: string
          created_at: string
          id: string
          max_sends_per_day: number | null
          name: string
          next_send_at: string | null
          recipient_count: number | null
          scheduled_at: string | null
          segment_id: string | null
          sent_at: string | null
          sent_count: number | null
          stats: Json | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          auto_schedule?: boolean | null
          business_days?: string[] | null
          business_hours_end?: number | null
          business_hours_start?: number | null
          campaign_type?: string
          created_at?: string
          id?: string
          max_sends_per_day?: number | null
          name: string
          next_send_at?: string | null
          recipient_count?: number | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number | null
          stats?: Json | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_schedule?: boolean | null
          business_days?: string[] | null
          business_hours_end?: number | null
          business_hours_start?: number | null
          campaign_type?: string
          created_at?: string
          id?: string
          max_sends_per_day?: number | null
          name?: string
          next_send_at?: string | null
          recipient_count?: number | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number | null
          stats?: Json | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          campaign_id: string | null
          created_at: string
          email: string
          id: string
          reason: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email: string
          id?: string
          reason: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_suppressions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string | null
          category: string
          created_at: string
          id: string
          name: string
          preview_text: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          category?: string
          created_at?: string
          id?: string
          name: string
          preview_text?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          category?: string
          created_at?: string
          id?: string
          name?: string
          preview_text?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          active: boolean
          answer: string
          category: string
          created_at: string
          id: string
          question: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          answer: string
          category?: string
          created_at?: string
          id?: string
          question: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          answer?: string
          category?: string
          created_at?: string
          id?: string
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          assigned_to: string | null
          category: string
          category_confidence: number | null
          created_at: string
          id: string
          is_faq_match: boolean | null
          patient_email: string | null
          patient_id: string | null
          patient_name: string
          raw_content: string
          resolved_at: string | null
          response_text: string | null
          source: string
          staff_notes: string | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          category_confidence?: number | null
          created_at?: string
          id?: string
          is_faq_match?: boolean | null
          patient_email?: string | null
          patient_id?: string | null
          patient_name: string
          raw_content: string
          resolved_at?: string | null
          response_text?: string | null
          source?: string
          staff_notes?: string | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          category_confidence?: number | null
          created_at?: string
          id?: string
          is_faq_match?: boolean | null
          patient_email?: string | null
          patient_id?: string | null
          patient_name?: string
          raw_content?: string
          resolved_at?: string | null
          response_text?: string | null
          source?: string
          staff_notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_forms: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          questions: Json
          submission_count: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          questions?: Json
          submission_count?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          questions?: Json
          submission_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      intake_submissions: {
        Row: {
          completion_status: string
          created_at: string
          form_id: string
          id: string
          patient_email: string | null
          patient_id: string | null
          patient_name: string
          review_status: string
          staff_notes: string | null
          submission_data: Json
          submitted_at: string | null
        }
        Insert: {
          completion_status?: string
          created_at?: string
          form_id: string
          id?: string
          patient_email?: string | null
          patient_id?: string | null
          patient_name: string
          review_status?: string
          staff_notes?: string | null
          submission_data?: Json
          submitted_at?: string | null
        }
        Update: {
          completion_status?: string
          created_at?: string
          form_id?: string
          id?: string
          patient_email?: string | null
          patient_id?: string | null
          patient_name?: string
          review_status?: string
          staff_notes?: string | null
          submission_data?: Json
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "intake_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          category: string
          content: string
          created_at: string | null
          document_name: string
          id: string
          section_title: string
          tags: string[] | null
          token_estimate: number | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          document_name: string
          id?: string
          section_title: string
          tags?: string[] | null
          token_estimate?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          document_name?: string
          id?: string
          section_title?: string
          tags?: string[] | null
          token_estimate?: number | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          address: string | null
          city: string | null
          company: string | null
          created_at: string
          date_of_birth: string | null
          deal_value: number | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          insurance_id: string | null
          insurance_provider: string | null
          last_name: string
          lead_source: string | null
          notes: string | null
          phone: string | null
          pipeline_stage: string
          state: string | null
          status: string
          tags: string[] | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          date_of_birth?: string | null
          deal_value?: number | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          insurance_id?: string | null
          insurance_provider?: string | null
          last_name: string
          lead_source?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          date_of_birth?: string | null
          deal_value?: number | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          insurance_id?: string | null
          insurance_provider?: string | null
          last_name?: string
          lead_source?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string
          state?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      practice_settings: {
        Row: {
          business_days: string[]
          business_hours_end: number
          business_hours_start: number
          created_at: string
          email_from_address: string | null
          email_from_name: string | null
          email_provider: string
          email_provider_api_key: string | null
          escalation_staff_id: string | null
          google_calendar_token: Json | null
          google_gmail_token: Json | null
          id: string
          max_sends_per_day: number
          practice_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_days?: string[]
          business_hours_end?: number
          business_hours_start?: number
          created_at?: string
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string
          email_provider_api_key?: string | null
          escalation_staff_id?: string | null
          google_calendar_token?: Json | null
          google_gmail_token?: Json | null
          id?: string
          max_sends_per_day?: number
          practice_name?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_days?: string[]
          business_hours_end?: number
          business_hours_start?: number
          created_at?: string
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string
          email_provider_api_key?: string | null
          escalation_staff_id?: string | null
          google_calendar_token?: Json | null
          google_gmail_token?: Json | null
          id?: string
          max_sends_per_day?: number
          practice_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_settings_escalation_staff_id_fkey"
            columns: ["escalation_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_email: string | null
          referred_name: string | null
          referrer_email: string
          referrer_name: string
          status: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_name?: string | null
          referrer_email: string
          referrer_name: string
          status?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_name?: string | null
          referrer_email?: string
          referrer_name?: string
          status?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          estimated_count: number
          id: string
          name: string
          rules: Json
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          estimated_count?: number
          id?: string
          name: string
          rules?: Json
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          estimated_count?: number
          id?: string
          name?: string
          rules?: Json
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          categories_handled: string[] | null
          created_at: string
          email: string
          id: string
          name: string
          role: string
        }
        Insert: {
          active?: boolean
          categories_handled?: string[] | null
          created_at?: string
          email: string
          id?: string
          name: string
          role?: string
        }
        Update: {
          active?: boolean
          categories_handled?: string[] | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_or_create_patient: {
        Args: { p_email?: string; p_name: string }
        Returns: string
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
