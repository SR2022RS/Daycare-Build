// Hand-authored to match supabase/migrations/*.sql, since this project isn't
// linked via `supabase link` yet (see plan notes on Supabase MCP/CLI access).
// Regenerate once linked: `supabase gen types typescript --linked > src/types/database.types.ts`
// Shape (Relationships/Views/Functions/CompositeTypes) mirrors real codegen
// output -- @supabase/postgrest-js's generics require it or Row types resolve to `never`.

export type AppRole = "platform_admin" | "director" | "staff";
export type TrainingProgressStatus = "not_started" | "in_progress" | "completed";
export type WriteUpSeverity = "minor" | "moderate" | "severe";
export type AttendanceSource = "web" | "mobile" | "admin" | "kiosk";
export type CredentialType =
  | "cari"
  | "chri"
  | "mantoux"
  | "medical_exam"
  | "orientation_new_hire"
  | "orientation_annual"
  | "understanding_licensing";
export type ChildStatus = "active" | "waitlisted" | "inactive";
export type FundingType = "private" | "4cs" | "mixed";
export type ChildSchedule = "full_time" | "part_time";
export type BillingCadence = "weekly" | "biweekly" | "monthly";
export type IncidentStatus = "filed" | "signed" | "parent_notified";
export type SopAudience = "all" | "staff" | "site_lead";
export type ContentBlockType = "video" | "text" | "file";
export type FormSendStatus = "sent" | "completed" | "expired";
export type FormAccessOutcome = "viewed" | "not_found" | "expired" | "submitted";
export type KioskPinOutcome = "success" | "invalid_pin" | "locked";
export type SupportTicketCategory = "question" | "bug" | "feature_request" | "account_access" | "other";
export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type ChargeType = "tuition" | "fee" | "credit" | "adjustment";
export type InvoiceStatus = "open" | "partial" | "paid" | "void";
export type PaymentMethod = "cash" | "check" | "zelle" | "venmo" | "other" | "stripe";

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          primary_color: string;
          accent_color: string;
          powered_by_akpa: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          logo_url?: string | null;
          primary_color?: string;
          accent_color?: string;
          powered_by_akpa?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: string;
          role: AppRole;
          title: string | null;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          is_site_lead: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          role?: AppRole;
          title?: string | null;
          full_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_site_lead?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          address: string | null;
          timezone: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          address?: string | null;
          timezone?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["locations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_locations: {
        Row: {
          staff_id: string;
          location_id: string;
        };
        Insert: {
          staff_id: string;
          location_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["staff_locations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "staff_locations_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_locations_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      training_modules: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          category: string;
          content_url: string | null;
          required: boolean;
          sort_order: number;
          credential_type: CredentialType | null;
          renewal_months: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          category: string;
          content_url?: string | null;
          required?: boolean;
          sort_order?: number;
          credential_type?: CredentialType | null;
          renewal_months?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_modules"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "training_modules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      training_content_blocks: {
        Row: {
          id: string;
          module_id: string;
          block_type: ContentBlockType;
          sort_order: number;
          video_url: string | null;
          text_content: string | null;
          file_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          module_id: string;
          block_type: ContentBlockType;
          sort_order?: number;
          video_url?: string | null;
          text_content?: string | null;
          file_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_content_blocks"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "training_content_blocks_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_attempts: {
        Row: {
          id: string;
          staff_id: string;
          module_id: string;
          score: number;
          passed: boolean;
          attempted_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          module_id: string;
          score: number;
          passed: boolean;
          attempted_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_attempts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_attempts_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      training_quizzes: {
        Row: {
          id: string;
          module_id: string;
          questions: unknown;
          passing_score: number;
        };
        Insert: {
          id?: string;
          module_id: string;
          questions?: unknown;
          passing_score?: number;
        };
        Update: Partial<Database["public"]["Tables"]["training_quizzes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "training_quizzes_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_training_progress: {
        Row: {
          id: string;
          staff_id: string;
          module_id: string;
          status: TrainingProgressStatus;
          completed_at: string | null;
          quiz_score: number | null;
          certificate_url: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          module_id: string;
          status?: TrainingProgressStatus;
          completed_at?: string | null;
          quiz_score?: number | null;
          certificate_url?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["staff_training_progress"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "staff_training_progress_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_training_progress_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          staff_id: string;
          clock_in_at: string | null;
          clock_out_at: string | null;
          date: string;
          source: AttendanceSource;
          note: string | null;
          edited_by: string | null;
          edited_at: string | null;
          original_clock_in_at: string | null;
          original_clock_out_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          staff_id: string;
          clock_in_at?: string | null;
          clock_out_at?: string | null;
          date?: string;
          source?: AttendanceSource;
          note?: string | null;
          edited_by?: string | null;
          edited_at?: string | null;
          original_clock_in_at?: string | null;
          original_clock_out_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attendance"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "attendance_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_edited_by_fkey";
            columns: ["edited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      write_ups: {
        Row: {
          id: string;
          tenant_id: string;
          staff_id: string;
          issued_by: string;
          reason: string;
          notes: string | null;
          severity: WriteUpSeverity;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          staff_id: string;
          issued_by: string;
          reason: string;
          notes?: string | null;
          severity?: WriteUpSeverity;
          date?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["write_ups"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "write_ups_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      policies: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          category: string;
          file_url: string;
          version: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          category: string;
          file_url: string;
          version?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["policies"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "policies_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_credentials: {
        Row: {
          id: string;
          tenant_id: string;
          staff_id: string;
          credential_type: CredentialType;
          date_submitted: string | null;
          date_cleared: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          staff_id: string;
          credential_type: CredentialType;
          date_submitted?: string | null;
          date_cleared?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["staff_credentials"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "staff_credentials_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_calendar: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          start_date: string;
          end_date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          start_date: string;
          end_date: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_calendar"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "org_calendar_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      policy_acknowledgments: {
        Row: {
          id: string;
          tenant_id: string;
          policy_id: string;
          staff_id: string;
          acknowledged_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          policy_id: string;
          staff_id: string;
          acknowledged_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["policy_acknowledgments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "policy_acknowledgments_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "policy_acknowledgments_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      timecard_approvals: {
        Row: {
          id: string;
          tenant_id: string;
          staff_id: string;
          week_start: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          staff_id: string;
          week_start: string;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["timecard_approvals"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "timecard_approvals_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timecard_approvals_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      children: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          full_name: string;
          dob: string;
          classroom: string | null;
          status: ChildStatus;
          funding_type: FundingType;
          schedule: ChildSchedule;
          weekly_rate: number | null;
          subsidy_weekly_amount: number | null;
          rate_note: string | null;
          cadence: BillingCadence;
          start_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          full_name: string;
          dob: string;
          classroom?: string | null;
          status?: ChildStatus;
          funding_type?: FundingType;
          schedule?: ChildSchedule;
          weekly_rate?: number | null;
          subsidy_weekly_amount?: number | null;
          rate_note?: string | null;
          cadence?: BillingCadence;
          start_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["children"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "children_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      guardians: {
        Row: {
          id: string;
          tenant_id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guardians"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "guardians_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      child_guardians: {
        Row: {
          child_id: string;
          guardian_id: string;
          relationship: string | null;
          is_payer: boolean;
        };
        Insert: {
          child_id: string;
          guardian_id: string;
          relationship?: string | null;
          is_payer?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["child_guardians"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "child_guardians_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_guardians_guardian_id_fkey";
            columns: ["guardian_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          guardian_id: string;
          period_start: string;
          period_end: string;
          status: InvoiceStatus;
          total_amount: number;
          amount_paid: number;
          due_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          guardian_id: string;
          period_start: string;
          period_end: string;
          status?: InvoiceStatus;
          total_amount?: number;
          amount_paid?: number;
          due_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "invoices_guardian_id_fkey";
            columns: ["guardian_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id"];
          },
        ];
      };
      charges: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          child_id: string;
          invoice_id: string | null;
          type: ChargeType;
          period_start: string | null;
          period_end: string | null;
          description: string;
          subsidy_amount: number;
          parent_amount: number;
          created_by: string | null;
          void: boolean;
          voided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          child_id: string;
          invoice_id?: string | null;
          type: ChargeType;
          period_start?: string | null;
          period_end?: string | null;
          description: string;
          subsidy_amount?: number;
          parent_amount?: number;
          created_by?: string | null;
          void?: boolean;
          voided_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["charges"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "charges_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          tenant_id: string;
          invoice_id: string;
          amount: number;
          method: PaymentMethod;
          paid_at: string;
          recorded_by: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          invoice_id: string;
          amount: number;
          method: PaymentMethod;
          paid_at: string;
          recorded_by: string;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      incident_reports: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          filed_by: string;
          child_name: string;
          child_id: string | null;
          what_happened: string;
          action_taken: string;
          photo_url: string | null;
          status: IncidentStatus;
          signed_by: string | null;
          signed_at: string | null;
          parent_notified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          filed_by: string;
          child_name: string;
          child_id?: string | null;
          what_happened: string;
          action_taken: string;
          photo_url?: string | null;
          status?: IncidentStatus;
          signed_by?: string | null;
          signed_at?: string | null;
          parent_notified_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["incident_reports"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "incident_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_reports_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_reports_filed_by_fkey";
            columns: ["filed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_reports_signed_by_fkey";
            columns: ["signed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incident_reports_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
        ];
      };
      sops: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          category: string;
          audience: SopAudience;
          content: string | null;
          version: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          category: string;
          audience?: SopAudience;
          content?: string | null;
          version?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sops"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sops_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      form_sends: {
        Row: {
          id: string;
          tenant_id: string;
          child_id: string;
          guardian_id: string;
          form_keys: string[];
          token: string;
          status: FormSendStatus;
          sent_by: string;
          sent_at: string;
          completed_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          child_id: string;
          guardian_id: string;
          form_keys: string[];
          token?: string;
          status?: FormSendStatus;
          sent_by: string;
          sent_at?: string;
          completed_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["form_sends"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "form_sends_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_sends_guardian_id_fkey";
            columns: ["guardian_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_sends_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      child_form_submissions: {
        Row: {
          id: string;
          tenant_id: string;
          child_id: string;
          send_id: string;
          form_key: string;
          data: unknown;
          submitted_by_name: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          child_id: string;
          send_id: string;
          form_key: string;
          data: unknown;
          submitted_by_name?: string | null;
          submitted_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["child_form_submissions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "child_form_submissions_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_form_submissions_send_id_fkey";
            columns: ["send_id"];
            isOneToOne: false;
            referencedRelation: "form_sends";
            referencedColumns: ["id"];
          },
        ];
      };
      form_send_access_log: {
        Row: {
          id: string;
          token: string;
          ip: string | null;
          outcome: FormAccessOutcome;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          ip?: string | null;
          outcome: FormAccessOutcome;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["form_send_access_log"]["Insert"]>;
        Relationships: [];
      };
      profile_pins: {
        Row: {
          profile_id: string;
          tenant_id: string;
          pin_hash: string;
          failed_attempts: number;
          locked_until: string | null;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          tenant_id: string;
          pin_hash: string;
          failed_attempts?: number;
          locked_until?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profile_pins"]["Insert"]>;
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
        Relationships: [];
      };
      kiosk_devices: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          name: string;
          device_token: string;
          is_active: boolean;
          failed_attempts: number;
          locked_until: string | null;
          last_seen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          name: string;
          device_token?: string;
          is_active?: boolean;
          failed_attempts?: number;
          locked_until?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kiosk_devices"]["Insert"]>;
        Relationships: [];
      };
      kiosk_sessions: {
        Row: {
          id: string;
          device_id: string;
          profile_id: string;
          tenant_id: string;
          location_id: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          profile_id: string;
          tenant_id: string;
          location_id: string;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kiosk_sessions"]["Insert"]>;
        Relationships: [];
      };
      kiosk_pin_attempts: {
        Row: {
          id: string;
          device_id: string;
          profile_id: string | null;
          outcome: KioskPinOutcome;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          profile_id?: string | null;
          outcome: KioskPinOutcome;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kiosk_pin_attempts"]["Insert"]>;
        Relationships: [];
      };
      attendance_breaks: {
        Row: {
          id: string;
          attendance_id: string;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          attendance_id: string;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["attendance_breaks"]["Insert"]>;
        Relationships: [];
      };
      room_transfers: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          staff_id: string;
          room_id: string;
          transferred_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          staff_id: string;
          room_id: string;
          transferred_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["room_transfers"]["Insert"]>;
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          tenant_id: string;
          created_by: string;
          category: SupportTicketCategory;
          priority: SupportTicketPriority;
          status: SupportTicketStatus;
          subject: string;
          description: string;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          created_by: string;
          category?: SupportTicketCategory;
          priority?: SupportTicketPriority;
          status?: SupportTicketStatus;
          subject: string;
          description: string;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["support_tickets"]["Insert"]>;
        Relationships: [];
      };
      support_ticket_messages: {
        Row: {
          id: string;
          ticket_id: string;
          tenant_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          tenant_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_ticket_messages"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      support_ticket_attachments: {
        Row: {
          id: string;
          ticket_id: string;
          tenant_id: string;
          file_path: string;
          file_name: string;
          content_type: string | null;
          size_bytes: number | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          tenant_id: string;
          file_path: string;
          file_name: string;
          content_type?: string | null;
          size_bytes?: number | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_ticket_attachments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      child_balance_status: {
        Row: {
          child_id: string;
          tenant_id: string;
          balance_status: "overdue" | "current";
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_set_staff_pin: {
        Args: { p_staff_id: string; p_pin: string };
        Returns: undefined;
      };
      kiosk_identify_pin: {
        Args: { p_device_token: string; p_pin: string };
        Returns: string | null;
      };
      generate_recurring_charges: {
        Args: { p_tenant_id: string; p_on: string };
        Returns: number;
      };
    };
    Enums: {
      app_role: AppRole;
      credential_type: CredentialType;
      child_status: ChildStatus;
      funding_type: FundingType;
      child_schedule: ChildSchedule;
      billing_cadence: BillingCadence;
      incident_status: IncidentStatus;
      sop_audience: SopAudience;
      content_block_type: ContentBlockType;
      kiosk_pin_outcome: KioskPinOutcome;
      support_ticket_category: SupportTicketCategory;
      support_ticket_priority: SupportTicketPriority;
      support_ticket_status: SupportTicketStatus;
      charge_type: ChargeType;
      invoice_status: InvoiceStatus;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<string, never>;
  };
}
