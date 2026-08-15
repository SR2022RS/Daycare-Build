import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceList } from "@/lib/billing/queries";
import { InvoiceTable } from "@/components/billing/invoice-table";
import { GenerateNowForm } from "@/components/billing/generate-now-form";

export default async function BillingPage() {
  const session = await requireRole(["director", "platform_admin"]);
  const supabase = await createClient();

  const rows = await getInvoiceList(supabase, session.profile.tenantId);

  return (
    <div className="max-w-[1240px]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-xl font-semibold text-gray-900">Invoices</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            Tuition generates automatically each period. Use Generate now to catch up a missed run.
          </p>
        </div>
        <Link
          href="/billing/revenue"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Revenue dashboard
        </Link>
        <GenerateNowForm />
      </div>

      <InvoiceTable rows={rows} />
    </div>
  );
}
