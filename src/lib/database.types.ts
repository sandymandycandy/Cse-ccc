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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          club_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          happened_on: string | null
          id: string
          image_path: string | null
          title: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          happened_on?: string | null
          id?: string
          image_path?: string | null
          title: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          happened_on?: string | null
          id?: string
          image_path?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_invites: {
        Row: {
          club_id: string | null
          consumed_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          token_hash: string
        }
        Insert: {
          club_id?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          role: Database["public"]["Enums"]["admin_role"]
          token_hash: string
        }
        Update: {
          club_id?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invites_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_totp: {
        Row: {
          admin_id: string
          confirmed_at: string | null
          recovery_codes_hashed: string[]
          secret_encrypted: string
        }
        Insert: {
          admin_id: string
          confirmed_at?: string | null
          recovery_codes_hashed?: string[]
          secret_encrypted: string
        }
        Update: {
          admin_id?: string
          confirmed_at?: string | null
          recovery_codes_hashed?: string[]
          secret_encrypted?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_totp_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: true
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          club_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          password_hash: string | null
          role: Database["public"]["Enums"]["admin_role"]
          session_epoch: number
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash?: string | null
          role: Database["public"]["Enums"]["admin_role"]
          session_epoch?: number
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          session_epoch?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string | null
          body_markdown: string
          created_at: string
          id: string
          image_path: string | null
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_markdown: string
          created_at?: string
          id?: string
          image_path?: string | null
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_markdown?: string
          created_at?: string
          id?: string
          image_path?: string | null
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_scans: {
        Row: {
          created_at: string
          device_hash: string
          id: string
          registration_id: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          device_hash: string
          id?: string
          registration_id?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          device_hash?: string
          id?: string
          registration_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_scans_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_scans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          allowed_cidr: unknown
          closed_at: string | null
          event_id: string
          geo_radius_m: number | null
          id: string
          opened_at: string
          opened_by: string | null
          require_geo: boolean
          rotate_seconds: number
          round_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          venue_lat: number | null
          venue_lng: number | null
          window_seconds: number
        }
        Insert: {
          allowed_cidr?: unknown
          closed_at?: string | null
          event_id: string
          geo_radius_m?: number | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          require_geo?: boolean
          rotate_seconds?: number
          round_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          venue_lat?: number | null
          venue_lng?: number | null
          window_seconds?: number
        }
        Update: {
          allowed_cidr?: unknown
          closed_at?: string | null
          event_id?: string
          geo_radius_m?: number | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          require_geo?: boolean
          rotate_seconds?: number
          round_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          venue_lat?: number | null
          venue_lng?: number | null
          window_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "event_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: string
          ip: unknown
          ua: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          ua?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          ua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      blackout_dates: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          reason: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          reason: string
          starts_on: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          reason?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "blackout_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          download_path: string | null
          event_id: string
          hmac: string
          id: string
          issued_at: string
          issued_by: string | null
          placement: number | null
          registration_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          serial: string
          type: Database["public"]["Enums"]["certificate_type"]
        }
        Insert: {
          download_path?: string | null
          event_id: string
          hmac: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          placement?: number | null
          registration_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          serial: string
          type: Database["public"]["Enums"]["certificate_type"]
        }
        Update: {
          download_path?: string | null
          event_id?: string
          hmac?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          placement?: number | null
          registration_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          serial?: string
          type?: Database["public"]["Enums"]["certificate_type"]
        }
        Relationships: [
          {
            foreignKeyName: "certificates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      club_attendance: {
        Row: {
          id: string
          marked_at: string
          marked_by: string | null
          member_id: string
          session_id: string
        }
        Insert: {
          id?: string
          marked_at?: string
          marked_by?: string | null
          member_id: string
          session_id: string
        }
        Update: {
          id?: string
          marked_at?: string
          marked_by?: string | null
          member_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "club_attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      club_attendance_sessions: {
        Row: {
          closed_at: string | null
          club_id: string
          event_id: string | null
          id: string
          opened_at: string
          opened_by: string | null
          qr_ttl_seconds: number | null
          status: Database["public"]["Enums"]["club_session_status"]
          title: string
        }
        Insert: {
          closed_at?: string | null
          club_id: string
          event_id?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          qr_ttl_seconds?: number | null
          status?: Database["public"]["Enums"]["club_session_status"]
          title: string
        }
        Update: {
          closed_at?: string | null
          club_id?: string
          event_id?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          qr_ttl_seconds?: number | null
          status?: Database["public"]["Enums"]["club_session_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_attendance_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_attendance_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_attendance_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      club_member_auth: {
        Row: {
          activated_at: string | null
          created_at: string
          failed_attempts: number
          locked_until: string | null
          member_id: string
          pin_hash: string | null
          session_epoch: number
          totp_enrolled_at: string | null
          totp_secret_enc: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          member_id: string
          pin_hash?: string | null
          session_epoch?: number
          totp_enrolled_at?: string | null
          totp_secret_enc?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          member_id?: string
          pin_hash?: string | null
          session_epoch?: number
          totp_enrolled_at?: string | null
          totp_secret_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_member_auth_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_path: string | null
          role: Database["public"]["Enums"]["member_role"]
          roll_no: string | null
          socials: Json
          sort: number
        }
        Insert: {
          club_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_path?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          roll_no?: string | null
          socials?: Json
          sort?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_path?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          roll_no?: string | null
          socials?: Json
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          category: Database["public"]["Enums"]["club_category"]
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          short_name: string
          slug: string
          sort: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["club_category"]
          color: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          short_name: string
          slug: string
          sort?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["club_category"]
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          short_name?: string
          slug?: string
          sort?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          handled_at: string | null
          id: string
          message: string
          name: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          email: string
          handled_at?: string | null
          id?: string
          message: string
          name: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          handled_at?: string | null
          id?: string
          message?: string
          name?: string
          subject?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          priority: number
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          template: string
          to_email: string
          to_name: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          priority?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          template: string
          to_email: string
          to_name?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          priority?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          template?: string
          to_email?: string
          to_name?: string | null
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          created_at: string
          digest_opt_in: boolean
          email: string
          id: string
          reminders_opt_in: boolean
          roll_no: string | null
          token_hash: string
          unsubscribed_at: string | null
        }
        Insert: {
          created_at?: string
          digest_opt_in?: boolean
          email: string
          id?: string
          reminders_opt_in?: boolean
          roll_no?: string | null
          token_hash: string
          unsubscribed_at?: string | null
        }
        Update: {
          created_at?: string
          digest_opt_in?: boolean
          email?: string
          id?: string
          reminders_opt_in?: boolean
          roll_no?: string | null
          token_hash?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      event_clubs: {
        Row: {
          club_id: string
          event_id: string
          is_primary: boolean
        }
        Insert: {
          club_id: string
          event_id: string
          is_primary?: boolean
        }
        Update: {
          club_id?: string
          event_id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_clubs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_feedback: {
        Row: {
          comment: string | null
          created_at: string
          event_id: string
          id: string
          rating: number
          submitted_via_token: boolean
        }
        Insert: {
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          rating: number
          submitted_via_token?: boolean
        }
        Update: {
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          rating?: number
          submitted_via_token?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rounds: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          show_advanced: boolean
          show_remarks: boolean
          show_score: boolean
          sort: number
          starts_at: string | null
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          show_advanced?: boolean
          show_remarks?: boolean
          show_score?: boolean
          sort?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          show_advanced?: boolean
          show_remarks?: boolean
          show_score?: boolean
          sort?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          capacity: number | null
          certificate_template: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          is_all_day: boolean
          poster_path: string | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          rejection_reason: string | null
          reminder_sent: boolean
          rescheduled_from: string | null
          rules: string | null
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
          venue_id: string | null
          waitlist_enabled: boolean
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          certificate_template?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          is_all_day?: boolean
          poster_path?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejection_reason?: string | null
          reminder_sent?: boolean
          rescheduled_from?: string | null
          rules?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
          venue_id?: string | null
          waitlist_enabled?: boolean
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          certificate_template?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          is_all_day?: boolean
          poster_path?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejection_reason?: string | null
          reminder_sent?: boolean
          rescheduled_from?: string | null
          rules?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
          venue_id?: string | null
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery: {
        Row: {
          caption: string | null
          club_id: string | null
          created_at: string
          event_id: string | null
          id: string
          image_path: string
          sort: number
        }
        Insert: {
          caption?: string | null
          club_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          image_path: string
          sort?: number
        }
        Update: {
          caption?: string | null
          club_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          image_path?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "gallery_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          club_choices: string[]
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          roll_no: string
          status: string
        }
        Insert: {
          club_choices?: string[]
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          roll_no: string
          status?: string
        }
        Update: {
          club_choices?: string[]
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          roll_no?: string
          status?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          created_at: string
          height: number | null
          id: string
          mime: string
          original_name: string | null
          path: string
          size_bytes: number | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          mime: string
          original_name?: string | null
          path: string
          size_bytes?: number | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          mime?: string
          original_name?: string | null
          path?: string
          size_bytes?: number | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_invites: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          member_id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          member_id: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          member_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "club_members"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_drives: {
        Row: {
          club_id: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          slots: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["recruitment_status"]
        }
        Insert: {
          club_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          slots?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["recruitment_status"]
        }
        Update: {
          club_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          slots?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["recruitment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_drives_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          attended: boolean
          checked_in_at: string | null
          checked_in_by: string | null
          checkin_method: Database["public"]["Enums"]["checkin_method"] | null
          checkin_token_hash: string | null
          confirm_token_hash: string | null
          confirmed_at: string | null
          created_at: string
          department: string | null
          email: string
          event_id: string
          id: string
          phone: string | null
          roll_no: string
          student_name: string
          team_members: Json | null
          year: number | null
        }
        Insert: {
          attended?: boolean
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_method?: Database["public"]["Enums"]["checkin_method"] | null
          checkin_token_hash?: string | null
          confirm_token_hash?: string | null
          confirmed_at?: string | null
          created_at?: string
          department?: string | null
          email: string
          event_id: string
          id?: string
          phone?: string | null
          roll_no: string
          student_name: string
          team_members?: Json | null
          year?: number | null
        }
        Update: {
          attended?: boolean
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_method?: Database["public"]["Enums"]["checkin_method"] | null
          checkin_token_hash?: string | null
          confirm_token_hash?: string | null
          confirmed_at?: string | null
          created_at?: string
          department?: string | null
          email?: string
          event_id?: string
          id?: string
          phone?: string | null
          roll_no?: string
          student_name?: string
          team_members?: Json | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          club_id: string | null
          id: string
          kind: Database["public"]["Enums"]["resource_kind"]
          title: string
          updated_at: string
          updated_by: string | null
          url: string
        }
        Insert: {
          club_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["resource_kind"]
          title: string
          updated_at?: string
          updated_by?: string | null
          url: string
        }
        Update: {
          club_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["resource_kind"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          advanced: boolean
          created_at: string
          display_name: string | null
          event_id: string
          id: string
          published_at: string | null
          rank: number | null
          registration_id: string | null
          remarks: string | null
          roll_no: string
          round_id: string | null
          score: number | null
        }
        Insert: {
          advanced?: boolean
          created_at?: string
          display_name?: string | null
          event_id: string
          id?: string
          published_at?: string | null
          rank?: number | null
          registration_id?: string | null
          remarks?: string | null
          roll_no: string
          round_id?: string | null
          score?: number | null
        }
        Update: {
          advanced?: boolean
          created_at?: string
          display_name?: string | null
          event_id?: string
          id?: string
          published_at?: string | null
          rank?: number | null
          registration_id?: string | null
          remarks?: string | null
          roll_no?: string
          round_id?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "event_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      student_devices: {
        Row: {
          device_hash: string
          email: string
          enrolled_at: string
          id: string
          last_seen_at: string | null
          revoked_at: string | null
          roll_no: string
          user_agent: string | null
        }
        Insert: {
          device_hash: string
          email: string
          enrolled_at?: string
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          roll_no: string
          user_agent?: string | null
        }
        Update: {
          device_hash?: string
          email?: string
          enrolled_at?: string
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          roll_no?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      venue_bookings: {
        Row: {
          created_at: string
          ends_at: string
          event_id: string
          id: string
          starts_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_id: string
          id?: string
          starts_at: string
          venue_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_id?: string
          id?: string
          starts_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          building: string | null
          capacity: number | null
          created_at: string
          id: string
          is_bookable: boolean
          name: string
        }
        Insert: {
          building?: string | null
          capacity?: number | null
          created_at?: string
          id?: string
          is_bookable?: boolean
          name: string
        }
        Update: {
          building?: string | null
          capacity?: number | null
          created_at?: string
          id?: string
          is_bookable?: boolean
          name?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          position: number
          promoted_at: string | null
          roll_no: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          position: number
          promoted_at?: string | null
          roll_no: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          position?: number
          promoted_at?: string | null
          roll_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_event_clash: {
        Args: {
          p_editing_id?: string
          p_ends_at: string
          p_starts_at: string
          p_venue_id: string
        }
        Returns: {
          ends_at: string
          event_id: string
          starts_at: string
          title: string
        }[]
      }
      confirm_registration: { Args: { p_token_hash: string }; Returns: string }
      day_load_heatmap: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          event_count: number
        }[]
      }
      get_registration_count: { Args: { p_event_id: string }; Returns: number }
      get_registration_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          event_id: string
          registered: number
        }[]
      }
      promote_from_waitlist: {
        Args: { p_event_id: string }
        Returns: {
          email: string
          roll_no: string
        }[]
      }
      redeem_attendance_scan: {
        Args: {
          p_device_hash: string
          p_registration_id: string
          p_session_id: string
        }
        Returns: string
      }
      register_for_event: {
        Args: {
          p_confirm_token_hash: string
          p_department: string
          p_email: string
          p_event_id: string
          p_phone: string
          p_roll_no: string
          p_student_name: string
          p_year: number
        }
        Returns: {
          registration_id: string
          status: string
        }[]
      }
    }
    Enums: {
      admin_role:
        | "faculty_advisor"
        | "president"
        | "vice_president"
        | "tech_head"
        | "events_head"
        | "docs_head"
        | "social_media_head"
        | "club_head"
        | "vice_head"
      approval_status: "pending" | "approved" | "rejected"
      attendance_status: "open" | "closed"
      certificate_type: "participation" | "winner"
      checkin_method: "door" | "self" | "manual"
      club_category: "tech" | "media" | "cultural" | "wellness" | "career"
      club_session_status: "open" | "closed"
      email_status: "pending" | "sent" | "failed"
      event_status: "draft" | "published" | "cancelled" | "completed"
      member_role: "head" | "vice_head" | "member"
      recruitment_status: "open" | "closed" | "waitlist"
      resource_kind: "drive" | "doc" | "template"
      round_status: "pending" | "active" | "completed"
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
      admin_role: [
        "faculty_advisor",
        "president",
        "vice_president",
        "tech_head",
        "events_head",
        "docs_head",
        "social_media_head",
        "club_head",
        "vice_head",
      ],
      approval_status: ["pending", "approved", "rejected"],
      attendance_status: ["open", "closed"],
      certificate_type: ["participation", "winner"],
      checkin_method: ["door", "self", "manual"],
      club_category: ["tech", "media", "cultural", "wellness", "career"],
      club_session_status: ["open", "closed"],
      email_status: ["pending", "sent", "failed"],
      event_status: ["draft", "published", "cancelled", "completed"],
      member_role: ["head", "vice_head", "member"],
      recruitment_status: ["open", "closed", "waitlist"],
      resource_kind: ["drive", "doc", "template"],
      round_status: ["pending", "active", "completed"],
    },
  },
} as const
