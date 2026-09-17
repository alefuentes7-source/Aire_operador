export type UserRole = "admin" | "operator";
export type MaintenanceStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type MaintenanceResult = "ok" | "warning" | "critical";
export type PointStatus = "ok" | "warning" | "critical";

interface Table<Row, Insert = Partial<Row>, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      clients: Table<{
        id: string;
        name: string;
        description: string | null;
        logo_url: string | null;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      equipment_types: Table<{
        id: string;
        client_id: string;
        code: string;
        name: string;
        description: string | null;
        active: boolean;
        display_order: number | null;
        created_at: string;
        updated_at: string;
      }>;
      equipment: Table<{
        id: string;
        equipment_type_id: string;
        code: string;
        description: string | null;
        location: string | null;
        serial_number: string | null;
        brand: string | null;
        model: string | null;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      maintenance_plans: Table<{
        id: string;
        equipment_type_id: string;
        frequency_months: number;
        start_month: number;
        start_year: number;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      review_points: Table<{
        id: string;
        equipment_type_id: string;
        code: string;
        client_description: string;
        operator_description: string;
        mandatory: boolean;
        photo_required: boolean;
        comments_allowed: boolean;
        display_order: number | null;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      users: Table<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      operator_clients: Table<{
        operator_id: string;
        client_id: string;
      }>;
      maintenances: Table<
        {
          id: string;
          equipment_id: string;
          assigned_to: string | null;
          scheduled_date: string | null;
          started_at: string | null;
          completed_at: string | null;
          status: MaintenanceStatus;
          overall_result: MaintenanceResult | null;
          operator_comments: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          equipment_id: string;
          assigned_to?: string | null;
          scheduled_date?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          status: MaintenanceStatus;
          overall_result?: MaintenanceResult | null;
          operator_comments?: string | null;
        }
      >;
      maintenance_items: Table<
        {
          id: string;
          maintenance_id: string;
          review_point_id: string;
          code: string;
          client_description: string;
          operator_description: string;
          display_order: number | null;
          status: PointStatus;
          comments: string | null;
          reviewed_at: string | null;
        },
        {
          id?: string;
          maintenance_id: string;
          review_point_id: string;
          code: string;
          client_description: string;
          operator_description: string;
          display_order?: number | null;
          status: PointStatus;
          comments?: string | null;
          reviewed_at?: string | null;
        }
      >;
      maintenance_photos: Table<
        {
          id: string;
          maintenance_id: string;
          review_point_id: string | null;
          file_url: string;
          photo_type: string | null;
          created_at: string;
        },
        {
          id?: string;
          maintenance_id: string;
          review_point_id?: string | null;
          file_url: string;
          photo_type?: string | null;
        }
      >;
    };
  };
}
