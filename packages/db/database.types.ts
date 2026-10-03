export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_agreement_records: {
        Row: {
          booking_id: string | null
          choice: string
          email: string
          id: number
          ip_truncated: unknown
          locale: string
          record_kind: string
          recorded_at: string
          surface: string
          text_version: string
          user_agent: string | null
        }
        Insert: {
          booking_id?: string | null
          choice: string
          email: string
          id?: never
          ip_truncated?: unknown
          locale: string
          record_kind: string
          recorded_at?: string
          surface: string
          text_version: string
          user_agent?: string | null
        }
        Update: {
          booking_id?: string | null
          choice?: string
          email?: string
          id?: never
          ip_truncated?: unknown
          locale?: string
          record_kind?: string
          recorded_at?: string
          surface?: string
          text_version?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_agreement_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      account_finish_pending: {
        Row: {
          created_at: string
          finished_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          after_value: Json | null
          before_value: Json | null
          created_at: string
          id: number
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: never
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: never
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      booking_access_tokens: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          purpose: string
          revoked_at: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          purpose?: string
          revoked_at?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          purpose?: string
          revoked_at?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_disputes: {
        Row: {
          amount_rappen: number | null
          booking_id: string
          id: number
          payment_id: number
          reason: string | null
          status: string
          stripe_created: string
          stripe_dispute_id: string
          updated_at: string
        }
        Insert: {
          amount_rappen?: number | null
          booking_id: string
          id?: never
          payment_id: number
          reason?: string | null
          status: string
          stripe_created: string
          stripe_dispute_id: string
          updated_at?: string
        }
        Update: {
          amount_rappen?: number | null
          booking_id?: string
          id?: never
          payment_id?: number
          reason?: string | null
          status?: string
          stripe_created?: string
          stripe_dispute_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_edit_requests: {
        Row: {
          accepted_at: string | null
          actor: string
          actor_id: string | null
          booking_id: string
          created_at: string
          extra_payment_id: number | null
          extra_session_id: string | null
          extra_snapshot_id: number | null
          id: string
          payload: Json
          quote_snapshot_id: number
          status: string
        }
        Insert: {
          accepted_at?: string | null
          actor: string
          actor_id?: string | null
          booking_id: string
          created_at?: string
          extra_payment_id?: number | null
          extra_session_id?: string | null
          extra_snapshot_id?: number | null
          id?: string
          payload?: Json
          quote_snapshot_id: number
          status: string
        }
        Update: {
          accepted_at?: string | null
          actor?: string
          actor_id?: string | null
          booking_id?: string
          created_at?: string
          extra_payment_id?: number | null
          extra_session_id?: string | null
          extra_snapshot_id?: number | null
          id?: string
          payload?: Json
          quote_snapshot_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_edit_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_edit_requests_extra_payment_id_fkey"
            columns: ["extra_payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_edit_requests_extra_snapshot_id_fkey"
            columns: ["extra_snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_edit_requests_quote_snapshot_id_fkey"
            columns: ["quote_snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          actor_label: string
          at: string
          booking_id: string
          booking_leg_id: string | null
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: number
          kind: string
          payload: Json
          payment_id: number | null
          refund_id: number | null
          snapshot_id: number | null
          to_status: Database["public"]["Enums"]["booking_status"] | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          actor_label?: string
          at?: string
          booking_id: string
          booking_leg_id?: string | null
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: never
          kind: string
          payload?: Json
          payment_id?: number | null
          refund_id?: number | null
          snapshot_id?: number | null
          to_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          actor_label?: string
          at?: string
          booking_id?: string
          booking_leg_id?: string | null
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: never
          kind?: string
          payload?: Json
          payment_id?: number | null
          refund_id?: number | null
          snapshot_id?: number | null
          to_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_booking_leg_id_fkey"
            columns: ["booking_leg_id"]
            isOneToOne: false
            referencedRelation: "booking_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "booking_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_legs: {
        Row: {
          arrived_at: string | null
          assigned_chauffeur_id: string | null
          assigned_vehicle_id: string | null
          bags: number
          booking_id: string
          created_at: string
          dest_zone_id: string | null
          direction: Database["public"]["Enums"]["leg_direction"]
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_place_id: string | null
          dropoff_text: string
          estimated_duration_minutes: number | null
          flight_checked_at: string | null
          flight_no: string | null
          flight_time_source: string | null
          id: string
          leg_seq: number
          note: string
          origin_zone_id: string | null
          original_scheduled_at: string
          overlap_kept_range: unknown
          pax: number
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_place_id: string | null
          pickup_text: string
          scheduled_at: string
          scheduled_local: string
          scheduled_range: unknown
          status: Database["public"]["Enums"]["booking_status"]
          turnaround_buffer_minutes: number | null
          updated_at: string
          vehicle_class_id: string
        }
        Insert: {
          arrived_at?: string | null
          assigned_chauffeur_id?: string | null
          assigned_vehicle_id?: string | null
          bags?: number
          booking_id: string
          created_at?: string
          dest_zone_id?: string | null
          direction: Database["public"]["Enums"]["leg_direction"]
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_place_id?: string | null
          dropoff_text: string
          estimated_duration_minutes?: number | null
          flight_checked_at?: string | null
          flight_no?: string | null
          flight_time_source?: string | null
          id?: string
          leg_seq: number
          note?: string
          origin_zone_id?: string | null
          original_scheduled_at: string
          overlap_kept_range?: unknown
          pax?: number
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_place_id?: string | null
          pickup_text: string
          scheduled_at: string
          scheduled_local: string
          scheduled_range?: unknown
          status?: Database["public"]["Enums"]["booking_status"]
          turnaround_buffer_minutes?: number | null
          updated_at?: string
          vehicle_class_id: string
        }
        Update: {
          arrived_at?: string | null
          assigned_chauffeur_id?: string | null
          assigned_vehicle_id?: string | null
          bags?: number
          booking_id?: string
          created_at?: string
          dest_zone_id?: string | null
          direction?: Database["public"]["Enums"]["leg_direction"]
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_place_id?: string | null
          dropoff_text?: string
          estimated_duration_minutes?: number | null
          flight_checked_at?: string | null
          flight_no?: string | null
          flight_time_source?: string | null
          id?: string
          leg_seq?: number
          note?: string
          origin_zone_id?: string | null
          original_scheduled_at?: string
          overlap_kept_range?: unknown
          pax?: number
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_place_id?: string | null
          pickup_text?: string
          scheduled_at?: string
          scheduled_local?: string
          scheduled_range?: unknown
          status?: Database["public"]["Enums"]["booking_status"]
          turnaround_buffer_minutes?: number | null
          updated_at?: string
          vehicle_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_legs_assigned_chauffeur_id_fkey"
            columns: ["assigned_chauffeur_id"]
            isOneToOne: false
            referencedRelation: "chauffeurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_dest_zone_id_fkey"
            columns: ["dest_zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_origin_zone_id_fkey"
            columns: ["origin_zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_legs_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notifications: {
        Row: {
          booking_id: string
          booking_leg_id: string | null
          channel: string
          created_at: string
          dedupe_key: string
          error: string | null
          failed_at: string | null
          id: number
          kind: string
          locale: string
          provider_message_id: string | null
          sent_at: string | null
          template_version: string
        }
        Insert: {
          booking_id: string
          booking_leg_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key: string
          error?: string | null
          failed_at?: string | null
          id?: never
          kind: string
          locale: string
          provider_message_id?: string | null
          sent_at?: string | null
          template_version?: string
        }
        Update: {
          booking_id?: string
          booking_leg_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string
          error?: string | null
          failed_at?: string | null
          id?: never
          kind?: string
          locale?: string
          provider_message_id?: string | null
          sent_at?: string | null
          template_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notifications_booking_leg_id_fkey"
            columns: ["booking_leg_id"]
            isOneToOne: false
            referencedRelation: "booking_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          booking_id: string
          captured_at: string | null
          charged_currency: string
          charged_rappen: number
          created_at: string
          fx_quoted_at: string | null
          fx_rate: number | null
          fx_source: string | null
          id: number
          payment_method_type: string | null
          presentment_amount_minor: number | null
          presentment_currency: string | null
          snapshot_id: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_fee_rappen: number | null
          stripe_payment_intent_id: string
        }
        Insert: {
          booking_id: string
          captured_at?: string | null
          charged_currency?: string
          charged_rappen: number
          created_at?: string
          fx_quoted_at?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: never
          payment_method_type?: string | null
          presentment_amount_minor?: number | null
          presentment_currency?: string | null
          snapshot_id: number
          status: string
          stripe_checkout_session_id?: string | null
          stripe_fee_rappen?: number | null
          stripe_payment_intent_id: string
        }
        Update: {
          booking_id?: string
          captured_at?: string | null
          charged_currency?: string
          charged_rappen?: number
          created_at?: string
          fx_quoted_at?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: never
          payment_method_type?: string | null
          presentment_amount_minor?: number | null
          presentment_currency?: string | null
          snapshot_id?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_fee_rappen?: number | null
          stripe_payment_intent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reference_counters: {
        Row: {
          last_serial: number
          year_2: number
        }
        Insert: {
          last_serial?: number
          year_2: number
        }
        Update: {
          last_serial?: number
          year_2?: number
        }
        Relationships: []
      }
      booking_refund_intents: {
        Row: {
          actor_id: string | null
          amount_rappen: number
          attempts: number
          batch_id: string
          booking_id: string
          created_at: string
          decided_percent: number | null
          id: number
          last_error: string | null
          payment_id: number
          reason: string
          refund_id: number | null
          state: string
          stripe_refund_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          amount_rappen: number
          attempts?: number
          batch_id: string
          booking_id: string
          created_at?: string
          decided_percent?: number | null
          id?: never
          last_error?: string | null
          payment_id: number
          reason: string
          refund_id?: number | null
          state?: string
          stripe_refund_id?: string | null
          tier: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          amount_rappen?: number
          attempts?: number
          batch_id?: string
          booking_id?: string
          created_at?: string
          decided_percent?: number | null
          id?: never
          last_error?: string | null
          payment_id?: number
          reason?: string
          refund_id?: number | null
          state?: string
          stripe_refund_id?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_refund_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refund_intents_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refund_intents_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "booking_refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_refunds: {
        Row: {
          available_on: string | null
          basis_rappen: number
          booking_id: string
          booking_leg_id: string | null
          decided_at: string
          decided_by: string | null
          hours_before: number
          id: number
          payment_id: number
          payout_country: string | null
          reason: string
          refund_percent: number
          refund_rappen: number
          snapshot_id: number
          stripe_refund_id: string | null
          tier_applied: Json
        }
        Insert: {
          available_on?: string | null
          basis_rappen: number
          booking_id: string
          booking_leg_id?: string | null
          decided_at?: string
          decided_by?: string | null
          hours_before: number
          id?: never
          payment_id: number
          payout_country?: string | null
          reason: string
          refund_percent: number
          refund_rappen: number
          snapshot_id: number
          stripe_refund_id?: string | null
          tier_applied: Json
        }
        Update: {
          available_on?: string | null
          basis_rappen?: number
          booking_id?: string
          booking_leg_id?: string | null
          decided_at?: string
          decided_by?: string | null
          hours_before?: number
          id?: never
          payment_id?: number
          payout_country?: string | null
          reason?: string
          refund_percent?: number
          refund_rappen?: number
          snapshot_id?: number
          stripe_refund_id?: string | null
          tier_applied?: Json
        }
        Relationships: [
          {
            foreignKeyName: "booking_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_booking_leg_id_fkey"
            columns: ["booking_leg_id"]
            isOneToOne: false
            referencedRelation: "booking_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_refunds_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          billing_kind: string
          checkout_trip_query: string
          company_address: string
          company_name: string
          company_vat: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          customer_id: string | null
          display_currency: Database["public"]["Enums"]["display_currency"]
          erased_at: string | null
          hold_until: string | null
          id: string
          idempotency_key: string | null
          is_return: boolean
          is_test: boolean
          locale: string
          note: string
          pay_link_sent_at: string | null
          payer_email: string | null
          price_snapshot_id: number | null
          price_total_rappen: number | null
          quote_id: string | null
          reference: string
          refund_owed_rappen: number | null
          refund_status: string
          refunded_rappen: number
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          billing_kind?: string
          checkout_trip_query?: string
          company_address?: string
          company_name?: string
          company_vat?: string
          contact_email: string
          contact_name: string
          contact_phone?: string
          created_at?: string
          customer_id?: string | null
          display_currency?: Database["public"]["Enums"]["display_currency"]
          erased_at?: string | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string | null
          is_return?: boolean
          is_test?: boolean
          locale?: string
          note?: string
          pay_link_sent_at?: string | null
          payer_email?: string | null
          price_snapshot_id?: number | null
          price_total_rappen?: number | null
          quote_id?: string | null
          reference?: string
          refund_owed_rappen?: number | null
          refund_status?: string
          refunded_rappen?: number
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          billing_kind?: string
          checkout_trip_query?: string
          company_address?: string
          company_name?: string
          company_vat?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          customer_id?: string | null
          display_currency?: Database["public"]["Enums"]["display_currency"]
          erased_at?: string | null
          hold_until?: string | null
          id?: string
          idempotency_key?: string | null
          is_return?: boolean
          is_test?: boolean
          locale?: string
          note?: string
          pay_link_sent_at?: string | null
          payer_email?: string | null
          price_snapshot_id?: number | null
          price_total_rappen?: number | null
          quote_id?: string | null
          reference?: string
          refund_owed_rappen?: number | null
          refund_status?: string
          refunded_rappen?: number
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_price_snapshot_fk"
            columns: ["price_snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      chauffeur_leave_ranges: {
        Row: {
          chauffeur_id: string
          from_date: string
          id: string
          until_date: string
        }
        Insert: {
          chauffeur_id: string
          from_date: string
          id?: string
          until_date: string
        }
        Update: {
          chauffeur_id?: string
          from_date?: string
          id?: string
          until_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "chauffeur_leave_ranges_chauffeur_id_fkey"
            columns: ["chauffeur_id"]
            isOneToOne: false
            referencedRelation: "chauffeurs"
            referencedColumns: ["id"]
          },
        ]
      }
      chauffeurs: {
        Row: {
          active: boolean
          created_at: string
          default_vehicle_id: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          languages: string[]
          licence_expires_on: string | null
          licence_number: string
          note: string
          phone: string
          photo_path: string | null
          plate: string | null
          shift_end: string | null
          shift_start: string | null
          shift_tz: string
          shift_weekdays: number[]
          status: Database["public"]["Enums"]["chauffeur_status"]
          updated_at: string
          user_id: string | null
          vehicle_class_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_vehicle_id?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          languages?: string[]
          licence_expires_on?: string | null
          licence_number: string
          note?: string
          phone: string
          photo_path?: string | null
          plate?: string | null
          shift_end?: string | null
          shift_start?: string | null
          shift_tz?: string
          shift_weekdays?: number[]
          status?: Database["public"]["Enums"]["chauffeur_status"]
          updated_at?: string
          user_id?: string | null
          vehicle_class_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          default_vehicle_id?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          languages?: string[]
          licence_expires_on?: string | null
          licence_number?: string
          note?: string
          phone?: string
          photo_path?: string | null
          plate?: string | null
          shift_end?: string | null
          shift_start?: string | null
          shift_tz?: string
          shift_weekdays?: number[]
          status?: Database["public"]["Enums"]["chauffeur_status"]
          updated_at?: string
          user_id?: string | null
          vehicle_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chauffeurs_default_vehicle_id_fkey"
            columns: ["default_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chauffeurs_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_pay_presses: {
        Row: {
          idempotency_key: string
          pressed_at: string
          quote_id: string
        }
        Insert: {
          idempotency_key: string
          pressed_at?: string
          quote_id: string
        }
        Update: {
          idempotency_key?: string
          pressed_at?: string
          quote_id?: string
        }
        Relationships: []
      }
      consent_log: {
        Row: {
          analytics: boolean
          booking_id: string | null
          consent_subject_id: string
          customer_id: string | null
          functional: boolean
          id: number
          ip_truncated: unknown
          locale: string
          marketing: boolean
          method: string
          necessary: boolean
          policy_version: string
          recorded_at: string
          user_agent: string | null
        }
        Insert: {
          analytics?: boolean
          booking_id?: string | null
          consent_subject_id: string
          customer_id?: string | null
          functional?: boolean
          id?: never
          ip_truncated?: unknown
          locale: string
          marketing?: boolean
          method: string
          necessary?: boolean
          policy_version: string
          recorded_at?: string
          user_agent?: string | null
        }
        Update: {
          analytics?: boolean
          booking_id?: string | null
          consent_subject_id?: string
          customer_id?: string | null
          functional?: boolean
          id?: never
          ip_truncated?: unknown
          locale?: string
          marketing?: boolean
          method?: string
          necessary?: boolean
          policy_version?: string
          recorded_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_delivery_outbox: {
        Row: {
          correlation_id: string
          created_at: string
          customer_accepted_at: string | null
          customer_failed_at: string | null
          customer_lease_expires_at: string | null
          customer_lease_token: string | null
          customer_provider_suffix: string | null
          customer_state: string
          revision: number
          submission_id: string
          support_accepted_at: string | null
          support_failed_at: string | null
          support_lease_expires_at: string | null
          support_lease_token: string | null
          support_provider_suffix: string | null
          support_state: string
          updated_at: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          customer_accepted_at?: string | null
          customer_failed_at?: string | null
          customer_lease_expires_at?: string | null
          customer_lease_token?: string | null
          customer_provider_suffix?: string | null
          customer_state?: string
          revision?: number
          submission_id: string
          support_accepted_at?: string | null
          support_failed_at?: string | null
          support_lease_expires_at?: string | null
          support_lease_token?: string | null
          support_provider_suffix?: string | null
          support_state?: string
          updated_at?: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          customer_accepted_at?: string | null
          customer_failed_at?: string | null
          customer_lease_expires_at?: string | null
          customer_lease_token?: string | null
          customer_provider_suffix?: string | null
          customer_state?: string
          revision?: number
          submission_id?: string
          support_accepted_at?: string | null
          support_failed_at?: string | null
          support_lease_expires_at?: string | null
          support_lease_token?: string | null
          support_provider_suffix?: string | null
          support_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_delivery_outbox_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "contact_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          booking_ref: string
          closed_at: string | null
          created_at: string
          email: string
          handled_at: string | null
          id: string
          idempotency_key: string
          last_activity_at: string
          locale: string
          message: string
          name: string
          phone: string
          reply_token: string
          ticket_status: string
        }
        Insert: {
          booking_ref?: string
          closed_at?: string | null
          created_at?: string
          email: string
          handled_at?: string | null
          id?: string
          idempotency_key: string
          last_activity_at?: string
          locale?: string
          message: string
          name: string
          phone?: string
          reply_token?: string
          ticket_status?: string
        }
        Update: {
          booking_ref?: string
          closed_at?: string | null
          created_at?: string
          email?: string
          handled_at?: string | null
          id?: string
          idempotency_key?: string
          last_activity_at?: string
          locale?: string
          message?: string
          name?: string
          phone?: string
          reply_token?: string
          ticket_status?: string
        }
        Relationships: []
      }
      content_strings: {
        Row: {
          ar: string | null
          de: string | null
          en: string
          fr: string | null
          key: string
          no_param_reason: string | null
          non_translatable: boolean
          pending_value: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ar?: string | null
          de?: string | null
          en: string
          fr?: string | null
          key: string
          no_param_reason?: string | null
          non_translatable?: boolean
          pending_value?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ar?: string | null
          de?: string | null
          en?: string
          fr?: string | null
          key?: string
          no_param_reason?: string | null
          non_translatable?: boolean
          pending_value?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          booking_id: string
          coupon_id: number
          customer_id: string | null
          id: number
          payment_id: number
          redeemed_at: string
          released_at: string | null
          released_reason: string | null
        }
        Insert: {
          booking_id: string
          coupon_id: number
          customer_id?: string | null
          id?: never
          payment_id: number
          redeemed_at?: string
          released_at?: string | null
          released_reason?: string | null
        }
        Update: {
          booking_id?: string
          coupon_id?: number
          customer_id?: string | null
          id?: never
          payment_id?: number
          redeemed_at?: string
          released_at?: string | null
          released_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          amount_rappen: number | null
          code: string
          created_at: string
          global_limit: number | null
          id: number
          kind: Database["public"]["Enums"]["coupon_kind"]
          note: string
          per_user_limit: number | null
          percent: number | null
          rate_version_id: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          amount_rappen?: number | null
          code: string
          created_at?: string
          global_limit?: number | null
          id?: never
          kind?: Database["public"]["Enums"]["coupon_kind"]
          note?: string
          per_user_limit?: number | null
          percent?: number | null
          rate_version_id?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          amount_rappen?: number | null
          code?: string
          created_at?: string
          global_limit?: number | null
          id?: never
          kind?: Database["public"]["Enums"]["coupon_kind"]
          note?: string
          per_user_limit?: number | null
          percent?: number | null
          rate_version_id?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          company: string
          created_at: string
          email: string
          erased_at: string | null
          full_name: string
          id: string
          note: string
          phone: string
          since: string
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company?: string
          created_at?: string
          email: string
          erased_at?: string | null
          full_name: string
          id?: string
          note?: string
          phone?: string
          since?: string
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          erased_at?: string | null
          full_name?: string
          id?: string
          note?: string
          phone?: string
          since?: string
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      distance_bands: {
        Row: {
          from_km: number
          id: number
          per_km_rappen: number
          rate_version_id: number
          to_km: number | null
          vehicle_class_id: string | null
        }
        Insert: {
          from_km: number
          id?: never
          per_km_rappen: number
          rate_version_id: number
          to_km?: number | null
          vehicle_class_id?: string | null
        }
        Update: {
          from_km?: number
          id?: never
          per_km_rappen?: number
          rate_version_id?: number
          to_km?: number | null
          vehicle_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distance_bands_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distance_bands_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      distance_rates: {
        Row: {
          airport_start_rappen: number | null
          available: boolean
          base_fare_rappen: number | null
          city_price_rappen: number | null
          hide_from_public: boolean
          id: number
          max_pax: number
          min_fare_rappen: number | null
          per_km_rappen: number | null
          rate_version_id: number
          vehicle_class_id: string
        }
        Insert: {
          airport_start_rappen?: number | null
          available?: boolean
          base_fare_rappen?: number | null
          city_price_rappen?: number | null
          hide_from_public?: boolean
          id?: never
          max_pax: number
          min_fare_rappen?: number | null
          per_km_rappen?: number | null
          rate_version_id: number
          vehicle_class_id: string
        }
        Update: {
          airport_start_rappen?: number | null
          available?: boolean
          base_fare_rappen?: number | null
          city_price_rappen?: number | null
          hide_from_public?: boolean
          id?: never
          max_pax?: number
          min_fare_rappen?: number | null
          per_km_rappen?: number | null
          rate_version_id?: number
          vehicle_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distance_rates_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distance_rates_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_labels: {
        Row: {
          code: string
          id: number
          label_ar: string | null
          label_de: string | null
          label_en: string
          label_fr: string | null
          machine_langs: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          id?: never
          label_ar?: string | null
          label_de?: string | null
          label_en: string
          label_fr?: string | null
          machine_langs?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          id?: never
          label_ar?: string | null
          label_de?: string | null
          label_en?: string
          label_fr?: string | null
          machine_langs?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fixed_routes: {
        Row: {
          dest_zone_id: string
          id: number
          live: boolean
          origin_zone_id: string
          price_rappen: number | null
          rate_version_id: number
          vehicle_class_id: string
        }
        Insert: {
          dest_zone_id: string
          id?: never
          live?: boolean
          origin_zone_id: string
          price_rappen?: number | null
          rate_version_id: number
          vehicle_class_id: string
        }
        Update: {
          dest_zone_id?: string
          id?: never
          live?: boolean
          origin_zone_id?: string
          price_rappen?: number | null
          rate_version_id?: number
          vehicle_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_routes_dest_zone_id_fkey"
            columns: ["dest_zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_routes_origin_zone_id_fkey"
            columns: ["origin_zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_routes_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_routes_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      price_snapshot_legs: {
        Row: {
          booking_leg_id: string | null
          distance_km: number | null
          duration_min: number | null
          leg_seq: number
          leg_subtotal_rappen: number | null
          snapshot_id: number
        }
        Insert: {
          booking_leg_id?: string | null
          distance_km?: number | null
          duration_min?: number | null
          leg_seq: number
          leg_subtotal_rappen?: number | null
          snapshot_id: number
        }
        Update: {
          booking_leg_id?: string | null
          distance_km?: number | null
          duration_min?: number | null
          leg_seq?: number
          leg_subtotal_rappen?: number | null
          snapshot_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_snapshot_legs_booking_leg_id_fkey"
            columns: ["booking_leg_id"]
            isOneToOne: false
            referencedRelation: "booking_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshot_legs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      price_snapshots: {
        Row: {
          bags: number
          booking_id: string | null
          computed_at: string
          computed_by: string | null
          coupon_code: string | null
          coupon_id: number | null
          currency: string
          discount_rappen: number | null
          display_currency: Database["public"]["Enums"]["display_currency"]
          distance_km: number | null
          duration_min: number | null
          engine_version: string
          expires_at: string
          id: number
          is_chargeable: boolean
          lines: Json
          pax: number
          policy: Json
          quote_id: string
          quote_lock_expires_at: string
          rate_version_id: number
          rate_version_is_live: boolean
          settings_version_id: number
          shown_alternatives: Json
          source: string
          subtotal_rappen: number | null
          supersedes_id: number | null
          surcharges_rappen: number | null
          total_rappen: number | null
          vehicle_class_id: string
        }
        Insert: {
          bags: number
          booking_id?: string | null
          computed_at?: string
          computed_by?: string | null
          coupon_code?: string | null
          coupon_id?: number | null
          currency?: string
          discount_rappen?: number | null
          display_currency?: Database["public"]["Enums"]["display_currency"]
          distance_km?: number | null
          duration_min?: number | null
          engine_version: string
          expires_at: string
          id?: never
          is_chargeable?: boolean
          lines: Json
          pax: number
          policy: Json
          quote_id: string
          quote_lock_expires_at: string
          rate_version_id: number
          rate_version_is_live: boolean
          settings_version_id: number
          shown_alternatives?: Json
          source?: string
          subtotal_rappen?: number | null
          supersedes_id?: number | null
          surcharges_rappen?: number | null
          total_rappen?: number | null
          vehicle_class_id: string
        }
        Update: {
          bags?: number
          booking_id?: string | null
          computed_at?: string
          computed_by?: string | null
          coupon_code?: string | null
          coupon_id?: number | null
          currency?: string
          discount_rappen?: number | null
          display_currency?: Database["public"]["Enums"]["display_currency"]
          distance_km?: number | null
          duration_min?: number | null
          engine_version?: string
          expires_at?: string
          id?: never
          is_chargeable?: boolean
          lines?: Json
          pax?: number
          policy?: Json
          quote_id?: string
          quote_lock_expires_at?: string
          rate_version_id?: number
          rate_version_is_live?: boolean
          settings_version_id?: number
          shown_alternatives?: Json
          source?: string
          subtotal_rappen?: number | null
          supersedes_id?: number | null
          surcharges_rappen?: number | null
          total_rappen?: number | null
          vehicle_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_snapshots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshots_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshots_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshots_settings_version_id_fkey"
            columns: ["settings_version_id"]
            isOneToOne: false
            referencedRelation: "settings_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshots_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "price_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_snapshots_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_version_rules: {
        Row: {
          id: number
          kind: string
          payload: Json
          rate_version_id: number
        }
        Insert: {
          id?: never
          kind: string
          payload?: Json
          rate_version_id: number
        }
        Update: {
          id?: never
          kind?: string
          payload?: Json
          rate_version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_version_rules_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_versions: {
        Row: {
          created_at: string
          created_by: string | null
          free_wait_minutes: number | null
          id: number
          label: string
          max_extra_stops: number | null
          note: string
          published_at: string | null
          published_by: string | null
          quote_lock_minutes: number | null
          service_area_geojson: Json | null
          slug: string
          status: Database["public"]["Enums"]["rate_version_status"]
          vat_rate_bps: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          free_wait_minutes?: number | null
          id?: never
          label: string
          max_extra_stops?: number | null
          note?: string
          published_at?: string | null
          published_by?: string | null
          quote_lock_minutes?: number | null
          service_area_geojson?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["rate_version_status"]
          vat_rate_bps?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          free_wait_minutes?: number | null
          id?: never
          label?: string
          max_extra_stops?: number | null
          note?: string
          published_at?: string | null
          published_by?: string | null
          quote_lock_minutes?: number | null
          service_area_geojson?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["rate_version_status"]
          vat_rate_bps?: number | null
        }
        Relationships: []
      }
      region_premiums: {
        Row: {
          id: number
          percent: number
          rate_version_id: number
          zone_id: string
        }
        Insert: {
          id?: never
          percent: number
          rate_version_id: number
          zone_id: string
        }
        Update: {
          id?: never
          percent?: number
          rate_version_id?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_premiums_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_premiums_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "service_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string
          author_role: string
          avatar_path: string | null
          body: string
          booking_id: string | null
          created_at: string
          external_ref: string | null
          id: string
          locked: boolean
          photo_path: string | null
          published: boolean
          rating: number
          rating_chauffeur: number | null
          rating_company: number | null
          rating_overall: number | null
          route_label: string
          sort_order: number
          source: Database["public"]["Enums"]["review_source"]
          source_url: string | null
          updated_at: string
          vehicle_class_id: string | null
          verified: boolean
        }
        Insert: {
          author_name?: string
          author_role?: string
          avatar_path?: string | null
          body?: string
          booking_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          locked?: boolean
          photo_path?: string | null
          published?: boolean
          rating?: number
          rating_chauffeur?: number | null
          rating_company?: number | null
          rating_overall?: number | null
          route_label?: string
          sort_order?: number
          source?: Database["public"]["Enums"]["review_source"]
          source_url?: string | null
          updated_at?: string
          vehicle_class_id?: string | null
          verified?: boolean
        }
        Update: {
          author_name?: string
          author_role?: string
          avatar_path?: string | null
          body?: string
          booking_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          locked?: boolean
          photo_path?: string | null
          published?: boolean
          rating?: number
          rating_chauffeur?: number | null
          rating_company?: number | null
          rating_overall?: number | null
          route_label?: string
          sort_order?: number
          source?: Database["public"]["Enums"]["review_source"]
          source_url?: string | null
          updated_at?: string
          vehicle_class_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      service_zones: {
        Row: {
          active: boolean
          iata: string | null
          id: string
          slug: string
          tags: string[]
          zone_type: string
        }
        Insert: {
          active?: boolean
          iata?: string | null
          id?: string
          slug: string
          tags?: string[]
          zone_type?: string
        }
        Update: {
          active?: boolean
          iata?: string | null
          id?: string
          slug?: string
          tags?: string[]
          zone_type?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          accepts_card: boolean
          accepts_cash: boolean
          accepts_invoice: boolean
          accepts_twint: boolean
          address: string
          chauffeur_turnaround_minutes: number
          company: string
          default_currency: Database["public"]["Enums"]["display_currency"]
          default_lang: string
          email: string
          email_confirmation: boolean
          email_reminder: boolean
          guest_accounts_live: boolean
          id: number
          ops_alerts: boolean
          phone: string
          public_chf: boolean
          sms_reminder: boolean
          uid_number: string
          updated_at: string
          vat_rate_bps: number
        }
        Insert: {
          accepts_card?: boolean
          accepts_cash?: boolean
          accepts_invoice?: boolean
          accepts_twint?: boolean
          address?: string
          chauffeur_turnaround_minutes?: number
          company?: string
          default_currency?: Database["public"]["Enums"]["display_currency"]
          default_lang?: string
          email?: string
          email_confirmation?: boolean
          email_reminder?: boolean
          guest_accounts_live?: boolean
          id?: number
          ops_alerts?: boolean
          phone?: string
          public_chf?: boolean
          sms_reminder?: boolean
          uid_number?: string
          updated_at?: string
          vat_rate_bps?: number
        }
        Update: {
          accepts_card?: boolean
          accepts_cash?: boolean
          accepts_invoice?: boolean
          accepts_twint?: boolean
          address?: string
          chauffeur_turnaround_minutes?: number
          company?: string
          default_currency?: Database["public"]["Enums"]["display_currency"]
          default_lang?: string
          email?: string
          email_confirmation?: boolean
          email_reminder?: boolean
          guest_accounts_live?: boolean
          id?: number
          ops_alerts?: boolean
          phone?: string
          public_chf?: boolean
          sms_reminder?: boolean
          uid_number?: string
          updated_at?: string
          vat_rate_bps?: number
        }
        Relationships: []
      }
      settings_policy_draft: {
        Row: {
          airport_waiting_minutes: number | null
          city_waiting_minutes: number | null
          free_cancel_hours: number | null
          id: number
          min_advance_minutes: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          airport_waiting_minutes?: number | null
          city_waiting_minutes?: number | null
          free_cancel_hours?: number | null
          id?: number
          min_advance_minutes?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          airport_waiting_minutes?: number | null
          city_waiting_minutes?: number | null
          free_cancel_hours?: number | null
          id?: number
          min_advance_minutes?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      settings_versions: {
        Row: {
          airport_waiting_minutes: number | null
          cancellation_tiers: Json
          checkout_window_minutes: number | null
          city_waiting_minutes: number | null
          created_by: string | null
          effective_from: string
          free_cancel_hours: number | null
          id: number
          label: string
          manage_link_validity_days: number | null
          min_advance_minutes: number | null
          modification_deadline_hours: number | null
          night_window_end: string | null
          night_window_start: string | null
          night_window_tz: string
          policy_doc_slug: string | null
          policy_doc_version: string | null
          quote_lock_minutes: number | null
          round_trip_discount_percent: number | null
          service_area_geojson: Json | null
          slug: string
        }
        Insert: {
          airport_waiting_minutes?: number | null
          cancellation_tiers?: Json
          checkout_window_minutes?: number | null
          city_waiting_minutes?: number | null
          created_by?: string | null
          effective_from?: string
          free_cancel_hours?: number | null
          id?: never
          label: string
          manage_link_validity_days?: number | null
          min_advance_minutes?: number | null
          modification_deadline_hours?: number | null
          night_window_end?: string | null
          night_window_start?: string | null
          night_window_tz?: string
          policy_doc_slug?: string | null
          policy_doc_version?: string | null
          quote_lock_minutes?: number | null
          round_trip_discount_percent?: number | null
          service_area_geojson?: Json | null
          slug: string
        }
        Update: {
          airport_waiting_minutes?: number | null
          cancellation_tiers?: Json
          checkout_window_minutes?: number | null
          city_waiting_minutes?: number | null
          created_by?: string | null
          effective_from?: string
          free_cancel_hours?: number | null
          id?: never
          label?: string
          manage_link_validity_days?: number | null
          min_advance_minutes?: number | null
          modification_deadline_hours?: number | null
          night_window_end?: string | null
          night_window_start?: string | null
          night_window_tz?: string
          policy_doc_slug?: string | null
          policy_doc_version?: string | null
          quote_lock_minutes?: number | null
          round_trip_discount_percent?: number | null
          service_area_geojson?: Json | null
          slug?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          accepted_at: string | null
          active: boolean
          avatar_path: string | null
          digest_email: boolean
          full_name: string
          invited_at: string
          invited_by: string | null
          lang: string
          mfa_enrolled: boolean
          phone: string
          role: Database["public"]["Enums"]["staff_role"]
          sign_in_method: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          active?: boolean
          avatar_path?: string | null
          digest_email?: boolean
          full_name?: string
          invited_at?: string
          invited_by?: string | null
          lang?: string
          mfa_enrolled?: boolean
          phone?: string
          role: Database["public"]["Enums"]["staff_role"]
          sign_in_method?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          active?: boolean
          avatar_path?: string | null
          digest_email?: boolean
          full_name?: string
          invited_at?: string
          invited_by?: string | null
          lang?: string
          mfa_enrolled?: boolean
          phone?: string
          role?: Database["public"]["Enums"]["staff_role"]
          sign_in_method?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_daily_digests: {
        Row: {
          attempt_count: number
          claimed_at: string
          created_at: string
          digest_date: string
          failed_at: string | null
          sent_at: string | null
          staff_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string
          created_at?: string
          digest_date: string
          failed_at?: string | null
          sent_at?: string | null
          staff_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_at?: string
          created_at?: string
          digest_date?: string
          failed_at?: string | null
          sent_at?: string | null
          staff_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_daily_digests_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          attempts: number
          id: string
          last_error: string | null
          object_id: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          stripe_created: string
          type: string
        }
        Insert: {
          attempts?: number
          id: string
          last_error?: string | null
          object_id?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          stripe_created: string
          type: string
        }
        Update: {
          attempts?: number
          id?: string
          last_error?: string | null
          object_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          stripe_created?: string
          type?: string
        }
        Relationships: []
      }
      support_inbound_events: {
        Row: {
          created_at: string
          email_id: string
        }
        Insert: {
          created_at?: string
          email_id: string
        }
        Update: {
          created_at?: string
          email_id?: string
        }
        Relationships: []
      }
      support_message_files: {
        Row: {
          byte_size: number
          content_type: string
          created_at: string
          filename: string
          id: string
          kept: boolean
          message_id: string
          r2_key: string | null
        }
        Insert: {
          byte_size: number
          content_type: string
          created_at?: string
          filename: string
          id?: string
          kept: boolean
          message_id: string
          r2_key?: string | null
        }
        Update: {
          byte_size?: number
          content_type?: string
          created_at?: string
          filename?: string
          id?: string
          kept?: boolean
          message_id?: string
          r2_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_message_files_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          actor_user_id: string | null
          body_html: string | null
          body_text: string
          created_at: string
          direction: string
          from_address: string | null
          id: string
          resend_email_id: string | null
          rfc_message_id: string | null
          submission_id: string
        }
        Insert: {
          actor_user_id?: string | null
          body_html?: string | null
          body_text: string
          created_at?: string
          direction: string
          from_address?: string | null
          id?: string
          resend_email_id?: string | null
          rfc_message_id?: string | null
          submission_id: string
        }
        Update: {
          actor_user_id?: string | null
          body_html?: string | null
          body_text?: string
          created_at?: string
          direction?: string
          from_address?: string | null
          id?: string
          resend_email_id?: string | null
          rfc_message_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "contact_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      surcharges: {
        Row: {
          active: boolean
          amount_rappen: number | null
          applies_to: string
          code: string
          id: number
          kind: Database["public"]["Enums"]["surcharge_kind"]
          percent: number | null
          predicate: Json
          quantity_source: string | null
          rate_version_id: number
          rule_id: number | null
        }
        Insert: {
          active?: boolean
          amount_rappen?: number | null
          applies_to?: string
          code: string
          id?: never
          kind?: Database["public"]["Enums"]["surcharge_kind"]
          percent?: number | null
          predicate?: Json
          quantity_source?: string | null
          rate_version_id: number
          rule_id?: number | null
        }
        Update: {
          active?: boolean
          amount_rappen?: number | null
          applies_to?: string
          code?: string
          id?: never
          kind?: Database["public"]["Enums"]["surcharge_kind"]
          percent?: number | null
          predicate?: Json
          quantity_source?: string | null
          rate_version_id?: number
          rule_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "surcharges_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surcharges_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rate_version_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_classes: {
        Row: {
          active: boolean
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          luggage_capacity: number
          name: string | null
          passenger_capacity: number
          photo_path: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          luggage_capacity: number
          name?: string | null
          passenger_capacity: number
          photo_path?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          luggage_capacity?: number
          name?: string | null
          passenger_capacity?: number
          photo_path?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      vehicle_seats: {
        Row: {
          chauffeur_id: string
          seat: string
          vehicle_id: string
        }
        Insert: {
          chauffeur_id: string
          seat: string
          vehicle_id: string
        }
        Update: {
          chauffeur_id?: string
          seat?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_seats_chauffeur_id_fkey"
            columns: ["chauffeur_id"]
            isOneToOne: true
            referencedRelation: "chauffeurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_seats_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          bags: number
          created_at: string
          first_registered: number | null
          id: string
          model: string
          note: string
          photo_path: string | null
          plate: string
          seats: number
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          vehicle_class_id: string
        }
        Insert: {
          bags?: number
          created_at?: string
          first_registered?: number | null
          id?: string
          model: string
          note?: string
          photo_path?: string | null
          plate: string
          seats?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_class_id: string
        }
        Update: {
          bags?: number
          created_at?: string
          first_registered?: number | null
          id?: string
          model?: string
          note?: string
          photo_path?: string | null
          plate?: string
          seats?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "vehicle_classes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      settings_public: {
        Row: {
          accepts_card: boolean | null
          accepts_cash: boolean | null
          accepts_twint: boolean | null
          default_currency:
            | Database["public"]["Enums"]["display_currency"]
            | null
          default_lang: string | null
          email: string | null
          phone: string | null
        }
        Insert: {
          accepts_card?: boolean | null
          accepts_cash?: boolean | null
          accepts_twint?: boolean | null
          default_currency?:
            | Database["public"]["Enums"]["display_currency"]
            | null
          default_lang?: string | null
          email?: string | null
          phone?: string | null
        }
        Update: {
          accepts_card?: boolean | null
          accepts_cash?: boolean | null
          accepts_twint?: boolean | null
          default_currency?:
            | Database["public"]["Enums"]["display_currency"]
            | null
          default_lang?: string | null
          email?: string | null
          phone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      __seed_apply: { Args: never; Returns: undefined }
      account_finish_done: {
        Args: { p_full_name: string; p_phone: string; p_user_id: string }
        Returns: undefined
      }
      account_finish_mark: { Args: { p_email: string }; Returns: undefined }
      account_finish_required: { Args: { p_user_id: string }; Returns: boolean }
      booking_cancel_change_pages: {
        Args: { p_booking_id: string }
        Returns: {
          extra_session_id: string
        }[]
      }
      booking_cancel_resend_facts: {
        Args: { p_booking_id: string }
        Returns: {
          contact_email: string
          dropoff_text: string
          locale: string
          pickup_text: string
          reference: string
          refund_mode: string
          refund_rappen: number
          scheduled_local: string
        }[]
      }
      booking_captured_payment: {
        Args: { p_booking_id: string }
        Returns: {
          charged_rappen: number
          id: number
          stripe_payment_intent_id: string
        }[]
      }
      booking_change_mail_facts: {
        Args: { p_booking_id: string; p_chauffeur_id: string }
        Returns: {
          dropoff_text: string
          email: string
          languages_csv: string
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      booking_change_request_facts: {
        Args: { p_request_id: string }
        Returns: {
          assigned_chauffeur_id: string
          booking_id: string
          class_changed: boolean
          party_changed: boolean
          places_changed: boolean
          time_changed: boolean
        }[]
      }
      booking_change_withdraw: {
        Args: { p_actor_id: string; p_booking_id: string; p_request_id: string }
        Returns: {
          booking_id: string
          extra_session_id: string
          request_id: string
        }[]
      }
      booking_edit_apply_payload: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_actor_label: string
          p_booking_id: string
          p_payload: Json
          p_quote_snapshot_id: number
        }
        Returns: undefined
      }
      booking_edit_clone_quote_snapshot: {
        Args: {
          p_booking_id: string
          p_quote_id: string
          p_total_rappen: unknown
        }
        Returns: number
      }
      booking_edit_mint_extra_snapshot: {
        Args: {
          p_booking_id: string
          p_difference_rappen: unknown
          p_original_snapshot_id: number
          p_quote_snapshot_id: number
        }
        Returns: number
      }
      booking_edit_refund_record: {
        Args: {
          p_actor_id: string
          p_refund_rappen: unknown
          p_request_id: string
          p_stripe_refund_id: string
        }
        Returns: {
          booking_id: string
          refund_id: number
          request_id: string
        }[]
      }
      booking_edit_request_accept: {
        Args: { p_actor_id: string; p_request_id: string }
        Returns: {
          booking_id: string
          difference_rappen: number
          extra_session_id: string
          extra_snapshot_id: number
          hours_before: number
          original_intent_id: string
          original_payment_id: number
          outcome: string
          request_id: string
        }[]
      }
      booking_edit_request_set_extra_session: {
        Args: { p_extra_session_id: string; p_request_id: string }
        Returns: undefined
      }
      booking_edit_request_upsert: {
        Args: {
          p_actor: string
          p_actor_id: string
          p_booking_id: string
          p_payload: Json
          p_quote_snapshot_id: number
        }
        Returns: {
          old_extra_session_id: string
          old_extra_snapshot_id: number
          request_id: string
          superseded_id: string
        }[]
      }
      booking_flight_write: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_booking_id: string
          p_flight_no: string
        }
        Returns: {
          booking_id: string
          booking_leg_id: string
          chauffeur_email: string
          contact_email: string
          dropoff_text: string
          locale: string
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      booking_refund_processing_mark: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      booking_snapshot_policy: { Args: { p_booking_id: string }; Returns: Json }
      booking_staff_change: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_engine_version: string
          p_expected_paid_rappen: number
          p_lines: Json
          p_rate_version_id: number
          p_total_rappen: number
          p_vehicle_class_slug: string
        }
        Returns: {
          booking_id: string
          difference_rappen: number
          extra_snapshot_id: number
          new_total_rappen: number
          old_extra_session_id: string
          old_extra_snapshot_id: number
          outcome: string
          paid_rappen: number
          quote_snapshot_id: number
          request_id: string
          unassigned_chauffeur_id: string
        }[]
      }
      booking_staff_contact_update: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_flight_no: string
          p_note: string
        }
        Returns: {
          assigned_chauffeur_id: string
          booking_id: string
          changed_fields: string
          flight_changed: boolean
        }[]
      }
      booking_staff_trip_change: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_distance_km: number
          p_driver: string
          p_duration_min: number
          p_engine_version: string
          p_expected_paid_rappen: number
          p_lines: Json
          p_rate_version_id: number
          p_shown_alternatives: Json
          p_total_rappen: number
          p_trip: Json
          p_vehicle_class_slug: string
        }
        Returns: {
          booking_id: string
          difference_rappen: number
          extra_snapshot_id: number
          kept_chauffeur_id: string
          new_total_rappen: number
          old_extra_session_id: string
          old_extra_snapshot_id: number
          outcome: string
          paid_rappen: number
          quote_snapshot_id: number
          request_id: string
          unassigned_chauffeur_id: string
        }[]
      }
      booking_trip_for_mail: {
        Args: { p_booking_id: string }
        Returns: {
          booking_id: string
          booking_leg_id: string
          chauffeur_email: string
          contact_email: string
          dropoff_text: string
          locale: string
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      bookings_set_refund_failed: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      checkout_abandon_gate: {
        Args: { p_quote_id: string }
        Returns: {
          cancellable: boolean
          stripe_checkout_session_id: string
        }[]
      }
      checkout_abandon_unpaid: {
        Args: { p_quote_id: string }
        Returns: {
          booking_id: string
          reference: string
        }[]
      }
      checkout_account_request_for_booking: {
        Args: { p_booking_id: string }
        Returns: {
          choice: string
          email: string
          full_name: string
          locale: string
        }[]
      }
      checkout_account_settings: { Args: never; Returns: boolean }
      checkout_account_user_state: {
        Args: { p_email: string }
        Returns: {
          checkout_origin: boolean
          confirmed: boolean
          user_exists: boolean
        }[]
      }
      checkout_attach_payment: {
        Args: {
          p_charged_rappen: unknown
          p_quote_id: string
          p_stripe_checkout_session_id: string
          p_stripe_payment_intent_id: string
        }
        Returns: {
          booking_id: string
          payment_id: number
          reference: string
          snapshot_id: number
        }[]
      }
      checkout_booking_for_email: {
        Args: { p_booking_id: string }
        Returns: {
          bags: number
          charged_rappen: number
          contact_email: string
          contact_name: string
          coupon_code: string
          coupon_rappen: number
          dropoff_text: string
          flight_no: string
          lines: Json
          locale: string
          pax: number
          payer_email: string
          pickup_text: string
          policy_extras: Json
          presentment_amount_minor: number
          presentment_currency: string
          price_total_rappen: number
          reference: string
          scheduled_local: string
          vat_rate_bps: number
          vehicle_class_name: string
          vehicle_class_slug: string
        }[]
      }
      checkout_booking_hold_until: {
        Args: { p_quote_id: string }
        Returns: string
      }
      checkout_booking_is_test: {
        Args: { p_quote_id: string }
        Returns: boolean
      }
      checkout_booking_is_test_by_id: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      checkout_booking_session_ids: {
        Args: { p_booking_id: string }
        Returns: string[]
      }
      checkout_cancel_unpaid: {
        Args: { p_reference: string }
        Returns: {
          booking_id: string
          reference: string
          stripe_checkout_session_ids: string[]
        }[]
      }
      checkout_capture_gate: {
        Args: { p_payment_intent_id: string; p_session_id: string }
        Returns: {
          expired: boolean
          is_test: boolean
          status: string
        }[]
      }
      checkout_create_booking: {
        Args: {
          p_actor_customer_id: string
          p_charged_rappen: unknown
          p_contact: Json
          p_coupon_code: string
          p_coupon_id: number
          p_display_currency: string
          p_idempotency_key: string
          p_legs: Json
          p_locale: string
          p_manage_token_expires_at: string
          p_manage_token_hash: string
          p_quote_id: string
          p_snapshot: Json
          p_stripe_checkout_session_id: string
          p_stripe_payment_intent_id: string
        }
        Returns: {
          booking_id: string
          payment_id: number
          reference: string
          replayed: boolean
          snapshot_id: number
        }[]
      }
      checkout_duplicate_refund_record: {
        Args: {
          p_payment_id: number
          p_reason: string
          p_refund_rappen: unknown
          p_stripe_refund_id: string
        }
        Returns: {
          booking_id: string
          refund_id: number
        }[]
      }
      checkout_email_has_account: {
        Args: { p_email: string }
        Returns: boolean
      }
      checkout_expire_unpaid: {
        Args: never
        Returns: {
          booking_id: string
          reference: string
          stripe_checkout_session_ids: string[]
        }[]
      }
      checkout_extra_payment_settle: {
        Args: {
          p_charged_currency: string
          p_event_id: string
          p_fx_quoted_at: string
          p_fx_rate: number
          p_fx_source: string
          p_outcome: string
          p_payment_intent_id: string
          p_presentment_amount_minor: number
          p_session_id: string
        }
        Returns: {
          already_settled: boolean
          applied: boolean
          booking_id: string
          class_changed: boolean
          contact_email: string
          locale: string
          reference: string
          request_id: string
          unassigned_chauffeur_id: string
        }[]
      }
      checkout_issue_manage_token: {
        Args: {
          p_booking_id: string
          p_expires_at: string
          p_token_hash: string
        }
        Returns: undefined
      }
      checkout_note_pay_press: {
        Args: { p_idempotency_key: string; p_quote_id: string }
        Returns: string
      }
      checkout_open_payment: {
        Args: { p_quote_id: string }
        Returns: {
          booking_id: string
          reference: string
          stripe_checkout_session_id: string
        }[]
      }
      checkout_pay_link_by_hash: {
        Args: { p_token_hash: string }
        Returns: {
          booking_id: string
          charged_rappen: unknown
          contact_email: string
          dropoff_text: string
          locale: string
          payer_email: string
          pickup_text: string
          quote_id: string
          reference: string
          snapshot_expires_at: string
          status: Database["public"]["Enums"]["booking_status"]
          token_expires_at: string
        }[]
      }
      checkout_pay_link_lines: {
        Args: { p_token_hash: string }
        Returns: {
          amount_rappen: number
          code: string
          destination: string
          discount_rappen: number
          kind: string
          list_rappen: number
          names: Json
          origin: string
          seq: number
          vat_rate_bps: number
        }[]
      }
      checkout_pay_link_state: {
        Args: { p_session_id?: string; p_token_hash: string }
        Returns: {
          reference: string
          state: string
        }[]
      }
      checkout_payment_method_record: {
        Args: { p_method: string; p_payment_intent_id: string }
        Returns: boolean
      }
      checkout_payment_settle: {
        Args: {
          p_charged_currency: string
          p_event_id: string
          p_fx_quoted_at: string
          p_fx_rate: number
          p_fx_source: string
          p_outcome: string
          p_payment_intent_id: string
          p_presentment_amount_minor: number
          p_presentment_currency?: string
          p_session_id: string
        }
        Returns: {
          already_settled: boolean
          booking_id: string
          charged_rappen: number
          contact_email: string
          duplicate: boolean
          locale: string
          other_open_session_ids: string[]
          payment_id: number
          reference: string
          refund_reason: string
          refund_required: boolean
          revived: boolean
          snapshot_id: number
        }[]
      }
      checkout_quote_left: { Args: { p_quote_id: string }; Returns: boolean }
      checkout_reference_for_session: {
        Args: { p_session_id: string }
        Returns: string
      }
      checkout_requote_cancel: {
        Args: { p_quote_id: string }
        Returns: {
          booking_id: string
          reference: string
        }[]
      }
      checkout_resume_read: {
        Args: { p_manage_hash: string; p_quote_id: string }
        Returns: {
          booking_id: string
          charged_rappen: number
          checkout_trip_query: string
          class_slug: string
          company_address: string
          company_name: string
          company_vat: string
          contact_email: string
          contact_name: string
          contact_phone: string
          coupon_code: string
          extra_codes: string[]
          latest_session_id: string
          note: string
          pay_link_sent: boolean
          quote_id: string
          reference: string
          status: Database["public"]["Enums"]["booking_status"]
        }[]
      }
      checkout_set_booking_details: {
        Args: {
          p_booking_id: string
          p_company_address: string
          p_company_name: string
          p_company_vat: string
          p_driver_note: string
          p_trip_query: string
        }
        Returns: undefined
      }
      checkout_set_pay_link: {
        Args: {
          p_billing_kind: string
          p_booking_id: string
          p_company_address: string
          p_company_name: string
          p_company_vat: string
          p_payer_email: string
          p_token_expires_at: string
          p_token_hash: string
        }
        Returns: string
      }
      claim_contact_delivery: {
        Args: { p_channel: string; p_submission_id: string }
        Returns: {
          claim_state: string
          correlation_id: string
          lease_expires_at: string
          lease_token: string
          revision: number
        }[]
      }
      compute_cancellation_refund: {
        Args: { p_booking_id: string }
        Returns: {
          basis_rappen: unknown
          hours_before: number
          refund_mode: string
          refund_percent: number
          refund_rappen: unknown
        }[]
      }
      confirmation_payload: { Args: { p_booking_id: string }; Returns: Json }
      consent_choice: {
        Args: { p_as_of?: string; p_policy_version: string }
        Returns: {
          analytics: boolean
          functional: boolean
          marketing: boolean
          method: string
          necessary: boolean
          recorded_at: string
        }[]
      }
      create_quote_snapshot: {
        Args: {
          p_bags: number
          p_booking_id?: string
          p_coupon_code?: string
          p_coupon_id?: number
          p_discount_rappen?: unknown
          p_display_currency?: Database["public"]["Enums"]["display_currency"]
          p_distance_km?: number
          p_duration_min?: number
          p_engine_version: string
          p_legs: Json
          p_lines: Json
          p_lock_exp: string
          p_pax: number
          p_policy: Json
          p_quote_id: string
          p_rate_version_id: number
          p_settings_version_id: number
          p_shown_alternatives: Json
          p_source?: string
          p_subtotal_rappen?: unknown
          p_surcharges_rappen?: unknown
          p_total_rappen?: unknown
          p_vehicle_class_id: string
        }
        Returns: number
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      customer_booking_extras: { Args: { p_reference: string }; Returns: Json }
      customer_claim_guest_bookings: { Args: never; Returns: number }
      customer_confirmation_read: {
        Args: { p_customer_id: string; p_reference: string }
        Returns: Json
      }
      customer_id_for_user: { Args: { p_user_id: string }; Returns: string }
      customer_paid_cancel: {
        Args: { p_booking_id: string }
        Returns: {
          basis_rappen: unknown
          booking_id: string
          hours_before: number
          refund_mode: string
          refund_percent: number
          refund_rappen: unknown
          stripe_payment_intent_id: string
        }[]
      }
      edit_request_booking_contact: {
        Args: { p_booking_id: string }
        Returns: {
          contact_email: string
          locale: string
          reference: string
        }[]
      }
      edit_request_extra_session: {
        Args: { p_key: string }
        Returns: {
          booking_id: string
          extra_session_id: string
        }[]
      }
      edit_request_pending_payload: {
        Args: { p_key: string }
        Returns: {
          payload: Json
        }[]
      }
      edit_request_refuse: {
        Args: { p_key: string }
        Returns: {
          booking_id: string
          request_id: string
        }[]
      }
      edit_request_snapshot_total: {
        Args: { p_snapshot_id: number }
        Returns: number
      }
      evaluate_coupon: {
        Args: {
          p_code: string
          p_contact_email?: string
          p_customer_id?: string
        }
        Returns: Json
      }
      expired_booking_contact: {
        Args: { p_booking_id: string }
        Returns: {
          contact_email: string
          id: string
          is_test: boolean
          locale: string
          locked_rappen: number
        }[]
      }
      extra_labels_read: {
        Args: never
        Returns: {
          code: string
          id: number
          label_ar: string | null
          label_de: string | null
          label_en: string
          label_fr: string | null
          machine_langs: string[]
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "extra_labels"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finalize_contact_delivery: {
        Args: {
          p_accepted: boolean
          p_channel: string
          p_lease_token: string
          p_provider_suffix: string
          p_submission_id: string
        }
        Returns: string
      }
      guest_confirmation_read: {
        Args: { p_reference: string; p_token_hash: string }
        Returns: Json
      }
      manage_booking_cancel: {
        Args: { p_leg_seq?: number; p_token_hash: string }
        Returns: {
          basis_rappen: unknown
          booking_id: string
          hours_before: number
          refund_mode: string
          refund_percent: number
          refund_rappen: unknown
          stripe_payment_intent_id: string
        }[]
      }
      manage_booking_extras: { Args: { p_token_hash: string }; Returns: Json }
      manage_booking_read: {
        Args: { p_token_hash: string }
        Returns: {
          available_on: string
          bags: number
          booking_id: string
          contact_email: string
          contact_name: string
          contact_phone: string
          dropoff_text: string
          flight_no: string
          locale: string
          original_scheduled_at: string
          pax: number
          payout_country: string
          pickup_text: string
          reference: string
          refund_owed_rappen: unknown
          refund_status: string
          refunded_rappen: unknown
          scheduled_at: string
          scheduled_local: string
          status: Database["public"]["Enums"]["booking_status"]
        }[]
      }
      manage_booking_review_state: {
        Args: { p_booking_id: string }
        Returns: {
          price_total_rappen: number
          review_submitted: boolean
        }[]
      }
      manage_driver_for: { Args: { p_booking_id: string }; Returns: Json }
      manage_money_for: { Args: { p_booking_id: string }; Returns: Json }
      must_fix_trip_read: {
        Args: { p_key: string }
        Returns: {
          dropoff_text: string
          locale: string
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      next_booking_reference: { Args: never; Returns: string }
      notification_claim: {
        Args: {
          p_booking_id: string
          p_booking_leg_id: string
          p_channel: string
          p_kind: string
          p_locale: string
          p_template_version: string
        }
        Returns: number
      }
      notification_confirmation_missing: {
        Args: { p_older_than: string }
        Returns: {
          booking_id: string
          locale: string
        }[]
      }
      notification_settle: {
        Args: { p_error: string; p_id: number; p_provider_message_id: string }
        Returns: undefined
      }
      notification_sweep: {
        Args: { p_kinds?: string[]; p_older_than: string }
        Returns: {
          booking_id: string
          booking_leg_id: string
          channel: string
          created_at: string
          id: number
          kind: string
          locale: string
          template_version: string
        }[]
      }
      ops_assign_leg: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_chauffeur_id: string
        }
        Returns: {
          booking_id: string
          chauffeur_id: string
          leg_id: string
          vehicle_id: string
        }[]
      }
      ops_cancel_booking: {
        Args: { p_actor_id: string; p_booking_id: string }
        Returns: {
          booking_id: string
          email: string
          locale: string
          name: string
          paid: boolean
          reference: string
          refund_mode: string
          refund_rappen: number
          stripe_checkout_session_ids: string[]
        }[]
      }
      ops_delete_chauffeur: {
        Args: { p_actor_id: string; p_chauffeur_id: string }
        Returns: {
          reference: string
        }[]
      }
      ops_fill_canton_pairs: {
        Args: { p_price_rappen: unknown; p_rate_version_id: number }
        Returns: number
      }
      ops_mark_complete: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_review_token_hash?: string
        }
        Returns: {
          booking_id: string
          dropoff_text: string
          email: string
          locale: string
          name: string
          paid: boolean
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      ops_mark_no_show: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_review_token_hash?: string
        }
        Returns: {
          booking_id: string
          dropoff_text: string
          email: string
          locale: string
          name: string
          paid: boolean
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      ops_refund_decide: {
        Args: { p_booking_id: string; p_decision: string }
        Returns: {
          booking_id: string
          reference: string
          refund_status: string
        }[]
      }
      ops_refund_intent_failed: {
        Args: { p_error: string; p_intent_id: number; p_void?: boolean }
        Returns: {
          attempts: number
          booking_id: string
          due_rappen: number
          intent_id: number
          open_intents: number
          refund_status: string
          refunded_rappen: number
          state: string
        }[]
      }
      ops_refund_intent_sent: {
        Args: {
          p_available_on?: string
          p_intent_id: number
          p_payout_country?: string
          p_stripe_fee_rappen?: unknown
          p_stripe_refund_id: string
        }
        Returns: {
          booking_id: string
          contact_email: string
          contact_name: string
          due_rappen: number
          locale: string
          open_intents: number
          payer_email: string
          payment_id: number
          reference: string
          refund_id: number
          refund_rappen: number
          refund_status: string
          refunded_rappen: number
        }[]
      }
      ops_refund_plan: {
        Args: {
          p_actor_id: string
          p_amount_rappen?: number
          p_booking_id: string
          p_payment_id?: number
          p_percent?: number
          p_reason?: string
          p_resume_only?: boolean
        }
        Returns: {
          amount_rappen: number
          attempts: number
          idempotency_key: string
          intent_id: number
          payment_id: number
          resumed: boolean
          state: string
          stripe_payment_intent_id: string
        }[]
      }
      ops_refund_record: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_payment_id: number
          p_reason?: string
          p_refund_rappen?: unknown
          p_stripe_fee_rappen?: unknown
          p_stripe_refund_id: string
        }
        Returns: {
          booking_id: string
          contact_email: string
          contact_name: string
          locale: string
          payer_email: string
          payment_id: number
          reference: string
          refund_id: number
          refund_rappen: number
        }[]
      }
      ops_unassign_leg: {
        Args: { p_actor_id: string; p_booking_id: string }
        Returns: {
          booking_id: string
          leg_id: string
        }[]
      }
      ops_vehicle_class_delete_or_hide: {
        Args: { p_id: string; p_reason: string }
        Returns: string
      }
      paid_cancel_mail_read: {
        Args: { p_booking_id: string }
        Returns: {
          assigned_chauffeur_id: string
          chauffeur_email: string
          contact_email: string
          dropoff_text: string
          locale: string
          pickup_text: string
          reference: string
          scheduled_local: string
        }[]
      }
      phone_booking_unpaid_read: {
        Args: { p_key: string }
        Returns: {
          bags: number
          billing_kind: string
          captured_at: string
          charged_rappen: number
          class_slug: string
          company_address: string
          company_name: string
          company_vat: string
          contact_email: string
          contact_name: string
          contact_phone: string
          dropoff_text: string
          flight_no: string
          id: string
          is_test: boolean
          locale: string
          pax: number
          payer_email: string
          pickup_text: string
          quote_id: string
          reference: string
          scheduled_local: string
          snap_expires_at: string
          snap_total_rappen: number
          status: string
          stripe_checkout_session_id: string
        }[]
      }
      policy_publish_draft: { Args: { p_actor: string }; Returns: number }
      price_changed_unpaid_contacts: {
        Args: never
        Returns: {
          contact_email: string
          id: string
          is_test: boolean
          locale: string
          locked_rappen: number
        }[]
      }
      purge_candidates: {
        Args: { p_older_than: string }
        Returns: {
          booking_id: string
          reference: string
          session_ids: string[]
        }[]
      }
      purge_unpaid_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: boolean
      }
      quote_lock_deadline: {
        Args: { p_settings_version_id: number }
        Returns: string
      }
      quote_rate_book: { Args: { p_prefer_draft?: boolean }; Returns: Json }
      quote_settings_version: { Args: { p_as_of: string }; Returns: Json }
      recompute_booking_status: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      record_account_agreement: {
        Args: {
          p_booking_id: string
          p_choice: string
          p_email: string
          p_ip_truncated: unknown
          p_locale: string
          p_surface: string
          p_text_version: string
          p_user_agent: string
        }
        Returns: number
      }
      record_booking_refund: {
        Args: {
          p_available_on?: string
          p_booking_id: string
          p_payout_country?: string
          p_refund_rappen?: unknown
          p_stripe_refund_id: string
        }
        Returns: {
          booking_id: string
          refund_id: number
        }[]
      }
      record_consent: {
        Args: {
          p_analytics: boolean
          p_booking_id?: string
          p_functional: boolean
          p_ip_truncated?: unknown
          p_locale: string
          p_marketing: boolean
          p_method: string
          p_necessary: boolean
          p_policy_version: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      reminder_24h_candidates: {
        Args: { p_from: string; p_to: string }
        Returns: {
          assigned_chauffeur_id: string
          booking_id: string
          booking_leg_id: string
          chauffeur_name: string
          contact_email: string
          dropoff_text: string
          locale: string
          pickup_text: string
          plate: string
          reference: string
          scheduled_local: string
          vehicle: string
        }[]
      }
      staff_claim_invite: { Args: never; Returns: undefined }
      staff_digest_claim: {
        Args: { p_digest_date: string; p_staff_user_id: string }
        Returns: boolean
      }
      staff_digest_legs: {
        Args: { p_digest_date: string }
        Returns: {
          dropoff_text: string
          pickup_text: string
          reference: string
          scheduled_local: string
          status: string
        }[]
      }
      staff_digest_mark_failed: {
        Args: { p_digest_date: string; p_staff_user_id: string }
        Returns: undefined
      }
      staff_digest_mark_sent: {
        Args: { p_digest_date: string; p_staff_user_id: string }
        Returns: undefined
      }
      staff_digest_recipients: {
        Args: never
        Returns: {
          email: string
          full_name: string
          lang: string
          user_id: string
        }[]
      }
      staff_extra_label_upsert: {
        Args: {
          p_ar: string
          p_code: string
          p_de: string
          p_en: string
          p_fr: string
          p_machine_langs: string[]
        }
        Returns: {
          code: string
          id: number
          label_ar: string | null
          label_de: string | null
          label_en: string
          label_fr: string | null
          machine_langs: string[]
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "extra_labels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_extra_labels_prune: { Args: never; Returns: number }
      staff_set_sign_in_method: {
        Args: { p_method: string }
        Returns: undefined
      }
      staff_update_self: {
        Args: {
          p_avatar_path: string
          p_digest_email: boolean
          p_full_name: string
          p_lang: string
          p_phone: string
        }
        Returns: undefined
      }
      stripe_charge_refunded_record: {
        Args: {
          p_app_source: boolean
          p_created: string
          p_payment_intent_id: string
          p_refund_rappen: unknown
          p_session_id: string
          p_stripe_refund_id: string
        }
        Returns: {
          booking_id: string
          outcome: string
          refund_id: number
        }[]
      }
      stripe_dispute_upsert: {
        Args: {
          p_amount_rappen: unknown
          p_payment_intent_id: string
          p_reason: string
          p_session_id: string
          p_status: string
          p_stripe_created: string
          p_stripe_dispute_id: string
        }
        Returns: {
          booking_id: string
          dispute_id: number
        }[]
      }
      stripe_event_begin: {
        Args: {
          p_event_id: string
          p_object_ids: string[]
          p_stripe_created: string
        }
        Returns: {
          reason: string
          should_process: boolean
        }[]
      }
      stripe_event_record: {
        Args: {
          p_id: string
          p_object_id: string
          p_payload: Json
          p_stripe_created: string
          p_type: string
        }
        Returns: boolean
      }
      stripe_event_settle: {
        Args: { p_error: string; p_event_id: string }
        Returns: undefined
      }
      submit_contact_message: {
        Args: {
          p_booking_ref: string
          p_email: string
          p_idempotency_key: string
          p_locale: string
          p_message: string
          p_name: string
          p_phone: string
        }
        Returns: {
          created: boolean
          id: string
        }[]
      }
      submit_review: {
        Args: {
          p_chauffeur: number
          p_comment: string
          p_company: number
          p_overall: number
          p_photo_path: string
          p_token_hash: string
        }
        Returns: {
          booking_id: string
          review_id: string
        }[]
      }
      submit_review_customer: {
        Args: {
          p_booking_id: string
          p_chauffeur: number
          p_comment: string
          p_company: number
          p_overall: number
          p_photo_path: string
        }
        Returns: {
          booking_id: string
          review_id: string
        }[]
      }
    }
    Enums: {
      booking_status:
        | "quote"
        | "pending"
        | "paid"
        | "confirmed"
        | "assigned"
        | "completed"
        | "cancelled"
        | "partially_cancelled"
        | "partially_completed"
        | "refunded"
        | "no_show"
      chauffeur_status: "shift" | "off" | "leave"
      coupon_kind: "percent" | "amount"
      customer_type: "private" | "corporate"
      display_currency: "CHF" | "EUR" | "USD" | "AED"
      leg_direction: "outbound" | "return"
      rate_version_status: "draft" | "live" | "retired"
      review_source: "google" | "tripadvisor" | "trustpilot" | "manual"
      staff_role: "dispatcher" | "admin"
      surcharge_kind: "amount" | "percent" | "included"
      vehicle_status: "service" | "idle" | "workshop"
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
      booking_status: [
        "quote",
        "pending",
        "paid",
        "confirmed",
        "assigned",
        "completed",
        "cancelled",
        "partially_cancelled",
        "partially_completed",
        "refunded",
        "no_show",
      ],
      chauffeur_status: ["shift", "off", "leave"],
      coupon_kind: ["percent", "amount"],
      customer_type: ["private", "corporate"],
      display_currency: ["CHF", "EUR", "USD", "AED"],
      leg_direction: ["outbound", "return"],
      rate_version_status: ["draft", "live", "retired"],
      review_source: ["google", "tripadvisor", "trustpilot", "manual"],
      staff_role: ["dispatcher", "admin"],
      surcharge_kind: ["amount", "percent", "included"],
      vehicle_status: ["service", "idle", "workshop"],
    },
  },
} as const

