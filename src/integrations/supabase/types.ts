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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      beacon_enrollments: {
        Row: {
          beacon_id: string | null
          claimed_at: string | null
          device_label: string
          enrollment_code_hash: string
          expires_at: string
          id: string
          pairing_word: string
          requested_at: string
          status: string
        }
        Insert: {
          beacon_id?: string | null
          claimed_at?: string | null
          device_label?: string
          enrollment_code_hash: string
          expires_at?: string
          id?: string
          pairing_word: string
          requested_at?: string
          status?: string
        }
        Update: {
          beacon_id?: string | null
          claimed_at?: string | null
          device_label?: string
          enrollment_code_hash?: string
          expires_at?: string
          id?: string
          pairing_word?: string
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "beacon_enrollments_beacon_id_fkey"
            columns: ["beacon_id"]
            isOneToOne: false
            referencedRelation: "beacons"
            referencedColumns: ["id"]
          },
        ]
      }
      beacon_positions: {
        Row: {
          accuracy_m: number | null
          battery_level: number | null
          beacon_id: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
        }
        Insert: {
          accuracy_m?: number | null
          battery_level?: number | null
          beacon_id: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
        }
        Update: {
          accuracy_m?: number | null
          battery_level?: number | null
          beacon_id?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beacon_positions_beacon_id_fkey"
            columns: ["beacon_id"]
            isOneToOne: false
            referencedRelation: "beacons"
            referencedColumns: ["id"]
          },
        ]
      }
      beacon_watchers: {
        Row: {
          beacon_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          label: string | null
          note: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          beacon_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          label?: string | null
          note?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          beacon_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          label?: string | null
          note?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beacon_watchers_beacon_id_fkey"
            columns: ["beacon_id"]
            isOneToOne: false
            referencedRelation: "beacons"
            referencedColumns: ["id"]
          },
        ]
      }
      beacons: {
        Row: {
          approved_by: string | null
          battery_level: number | null
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          secret_code: string
        }
        Insert: {
          approved_by?: string | null
          battery_level?: number | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          secret_code: string
        }
        Update: {
          approved_by?: string | null
          battery_level?: number | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          secret_code?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          battery_level: number | null
          child_name: string
          created_at: string
          id: string
          is_demo: boolean
          last_seen_at: string | null
          owner_id: string
          pairing_key: string
        }
        Insert: {
          battery_level?: number | null
          child_name?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          last_seen_at?: string | null
          owner_id: string
          pairing_key?: string
        }
        Update: {
          battery_level?: number | null
          child_name?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          last_seen_at?: string | null
          owner_id?: string
          pairing_key?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          accuracy_m: number | null
          battery_level: number | null
          device_id: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
        }
        Insert: {
          accuracy_m?: number | null
          battery_level?: number | null
          device_id: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
        }
        Update: {
          accuracy_m?: number | null
          battery_level?: number | null
          device_id?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
