import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export interface Closure {
  name: string;
  start_date: string;
  end_date: string;
}

export async function getNextClosure(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<Closure | null> {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("org_calendar")
    .select("name, start_date, end_date")
    .eq("tenant_id", tenantId)
    .gte("end_date", today)
    .order("start_date")
    .limit(1)
    .maybeSingle();

  return data;
}
