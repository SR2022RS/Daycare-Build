import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getMonday, getTimecard } from "@/lib/attendance/timecard";

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const weekParam = request.nextUrl.searchParams.get("week");
  const weekStart = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : getMonday(new Date());

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", session.profile.tenantId)
    .order("full_name");

  const rows = await Promise.all(
    (staff ?? []).map(async (s) => {
      const card = await getTimecard(supabase, s.id, weekStart);
      return { name: s.full_name, card };
    }),
  );

  const lines = ["Name,Regular Hours,OT Hours,Period Start,Period End"];
  for (const { name, card } of rows) {
    if (card.totalMinutes === 0) continue;
    lines.push(
      [
        csvCell(name),
        (card.regularMinutes / 60).toFixed(2),
        (card.otMinutes / 60).toFixed(2),
        card.weekStart,
        card.weekEnd,
      ].join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${weekStart}.csv"`,
    },
  });
}
