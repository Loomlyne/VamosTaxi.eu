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
          flight_no: string | null
          id: string
          leg_seq: number
          note: string
          origin_zone_id: string | null
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
          flight_no?: string | null
          id?: string
          leg_seq: number
          note?: string
          origin_zone_id?: string | null
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
          flight_no?: string | null
          id?: string
          leg_seq?: number
          note?: string
          origin_zone_id?: string | null
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
          id: number
          snapshot_id: number
          status: string
          stripe_payment_intent_id: string
        }
        Insert: {
          booking_id: string
          captured_at?: string | null
          charged_currency?: string
          charged_rappen: number
          created_at?: string
          id?: never
          snapshot_id: number
          status: string
          stripe_payment_intent_id: string
        }
        Update: {
          booking_id?: string
          captured_at?: string | null
          charged_currency?: string
          charged_rappen?: number
          created_at?: string
          id?: never
          snapshot_id?: number
          status?: string
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
      booking_refunds: {
        Row: {
          basis_rappen: number
          booking_id: string
          booking_leg_id: string | null
          decided_at: string
          decided_by: string | null
          hours_before: number
          id: number
          payment_id: number
          reason: string
          refund_percent: number
          refund_rappen: number
          snapshot_id: number
          stripe_refund_id: string | null
          tier_applied: Json
        }
        Insert: {
          basis_rappen: number
          booking_id: string
          booking_leg_id?: string | null
          decided_at?: string
          decided_by?: string | null
          hours_before: number
          id?: never
          payment_id: number
          reason: string
          refund_percent: number
          refund_rappen: number
          snapshot_id: number
          stripe_refund_id?: string | null
          tier_applied: Json
        }
        Update: {
          basis_rappen?: number
          booking_id?: string
          booking_leg_id?: string | null
          decided_at?: string
          decided_by?: string | null
          hours_before?: number
          id?: never
          payment_id?: number
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
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          customer_id: string | null
          display_currency: Database["public"]["Enums"]["display_currency"]
          erased_at: string | null
          id: string
          idempotency_key: string | null
          is_return: boolean
          locale: string
          note: string
          price_snapshot_id: number | null
          price_total_rappen: number | null
          quote_id: string | null
          reference: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          contact_email: string
          contact_name: string
          contact_phone?: string
          created_at?: string
          customer_id?: string | null
          display_currency?: Database["public"]["Enums"]["display_currency"]
          erased_at?: string | null
          id?: string
          idempotency_key?: string | null
          is_return?: boolean
          locale?: string
          note?: string
          price_snapshot_id?: number | null
          price_total_rappen?: number | null
          quote_id?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          customer_id?: string | null
          display_currency?: Database["public"]["Enums"]["display_currency"]
          erased_at?: string | null
          id?: string
          idempotency_key?: string | null
          is_return?: boolean
          locale?: string
          note?: string
          price_snapshot_id?: number | null
          price_total_rappen?: number | null
          quote_id?: string | null
          reference?: string
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
      chauffeurs: {
        Row: {
          active: boolean
          created_at: string
          default_vehicle_id: string | null
          email: string | null
          full_name: string
          id: string
          languages: string[]
          licence_expires_on: string | null
          licence_number: string
          note: string
          phone: string
          photo_path: string | null
          status: Database["public"]["Enums"]["chauffeur_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_vehicle_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          languages?: string[]
          licence_expires_on?: string | null
          licence_number: string
          note?: string
          phone: string
          photo_path?: string | null
          status?: Database["public"]["Enums"]["chauffeur_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          default_vehicle_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          languages?: string[]
          licence_expires_on?: string | null
          licence_number?: string
          note?: string
          phone?: string
          photo_path?: string | null
          status?: Database["public"]["Enums"]["chauffeur_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chauffeurs_default_vehicle_id_fkey"
            columns: ["default_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
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
        }
        Insert: {
          booking_id: string
          coupon_id: number
          customer_id?: string | null
          id?: never
          payment_id: number
          redeemed_at?: string
        }
        Update: {
          booking_id?: string
          coupon_id?: number
          customer_id?: string | null
          id?: never
          payment_id?: number
          redeemed_at?: string
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
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
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
      distance_rates: {
        Row: {
          available: boolean
          base_fare_rappen: number | null
          id: number
          max_pax: number
          min_fare_rappen: number | null
          per_km_rappen: number | null
          rate_version_id: number
          vehicle_class_id: string
        }
        Insert: {
          available?: boolean
          base_fare_rappen?: number | null
          id?: never
          max_pax: number
          min_fare_rappen?: number | null
          per_km_rappen?: number | null
          rate_version_id: number
          vehicle_class_id: string
        }
        Update: {
          available?: boolean
          base_fare_rappen?: number | null
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
          rate_version_id: number
          rate_version_is_live: boolean
          settings_version_id: number
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
          rate_version_id: number
          rate_version_is_live: boolean
          settings_version_id: number
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
          rate_version_id?: number
          rate_version_is_live?: boolean
          settings_version_id?: number
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
      rate_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          label: string
          note: string
          published_at: string | null
          published_by: string | null
          slug: string
          status: Database["public"]["Enums"]["rate_version_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          label: string
          note?: string
          published_at?: string | null
          published_by?: string | null
          slug: string
          status?: Database["public"]["Enums"]["rate_version_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          label?: string
          note?: string
          published_at?: string | null
          published_by?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["rate_version_status"]
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_name: string
          author_role: string
          avatar_path: string | null
          body: string
          created_at: string
          external_ref: string | null
          id: string
          locked: boolean
          published: boolean
          rating: number
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
          created_at?: string
          external_ref?: string | null
          id?: string
          locked?: boolean
          published?: boolean
          rating?: number
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
          created_at?: string
          external_ref?: string | null
          id?: string
          locked?: boolean
          published?: boolean
          rating?: number
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
          id: number
          ops_alerts: boolean
          phone: string
          sms_reminder: boolean
          uid_number: string
          updated_at: string
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
          id?: number
          ops_alerts?: boolean
          phone?: string
          sms_reminder?: boolean
          uid_number?: string
          updated_at?: string
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
          id?: number
          ops_alerts?: boolean
          phone?: string
          sms_reminder?: boolean
          uid_number?: string
          updated_at?: string
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
          user_id?: string
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "surcharges_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_classes: {
        Row: {
          active: boolean
          id: string
          luggage_capacity: number
          passenger_capacity: number
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          luggage_capacity: number
          passenger_capacity: number
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          luggage_capacity?: number
          passenger_capacity?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
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
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      manage_booking_cancel: {
        Args: { p_leg_seq?: number; p_token_hash: string }
        Returns: {
          booking_id: string
          refund_percent: number
        }[]
      }
      next_booking_reference: { Args: never; Returns: string }
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

