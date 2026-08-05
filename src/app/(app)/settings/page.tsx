import { requireRole } from "@/lib/auth/dal";

export default async function SettingsPage() {
  await requireRole(["director", "platform_admin"]);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
      <p className="text-sm text-gray-500">Tenant branding and account settings coming soon.</p>
    </div>
  );
}
