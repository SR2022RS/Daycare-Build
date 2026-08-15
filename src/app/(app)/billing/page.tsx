import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceList } from "@/lib/billing/queries";
import { generateNow } from "@/lib/billing/actions";
import { InvoiceTable } from "@/components/billing/invoice-table";

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
        <form action={generateNow}>
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90"
          >
            Generate now
          </button>
        </form>
      </div>

      <InvoiceTable rows={rows} />
    </div>
  );
}
