"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ChildContactKind } from "@/types/database.types";

/**
 * Emergency contacts and the two pickup lists.
 *
 * These had nowhere to live before -- no column, no table -- while being
 * exactly the information a centre is asked for at the worst possible moment.
 * "Who can I call?" and "is this person allowed to take her?" are questions
 * that get answered from a paper folder in an office nobody is standing in.
 *
 * Open to staff, because the people who take these details at the door are
 * the ones who should be able to write them down.
 */

const PEOPLE_ROLES = ["director", "platform_admin", "staff"] as const;

const KINDS: ChildContactKind[] = ["emergency", "pickup_allowed", "pickup_denied"];

export type ContactActionState = { message?: string; ok?: boolean } | undefined;

export async function addChildContact(
  prevState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const session = await requireRole([...PEOPLE_ROLES]);

  const childId = text(formData, "childId");
  const fullName = text(formData, "fullName");
  const kindRaw = text(formData, "kind");

  if (!childId) return { message: "Missing child." };
  if (!fullName) return { message: "Enter a name." };

  // Validated against the list rather than cast: `kind` drives whether the
  // kiosk releases a child, so an unrecognised value must not reach the
  // database and land in a list nobody meant to put them on.
  const kind = KINDS.find((k) => k === kindRaw);
  if (!kind) return { message: "Choose whether this is an emergency contact or a pickup entry." };

  const phone = text(formData, "phone");
  if (kind === "emergency" && !phone) {
    // The entire point of an emergency contact is being able to ring them.
    return { message: "An emergency contact needs a phone number." };
  }

  const supabase = await createClient();

  // The child must belong to this tenant. child_id comes from a form field,
  // and the table's own tenant_id is supplied by us -- without this check a
  // crafted post could attach a contact to another centre's child while
  // still passing the RLS check on our own tenant_id.
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("tenant_id", session.profile.tenantId)
    .maybeSingle();

  if (!child) return { message: "That child could not be found." };

  const { error } = await supabase.from("child_contacts").insert({
    tenant_id: session.profile.tenantId,
    child_id: childId,
    kind,
    full_name: fullName,
    relationship: text(formData, "relationship"),
    phone,
    note: text(formData, "note"),
  });

  if (error) return { message: "That contact could not be saved. Please try again." };

  revalidatePath(`/children/${childId}`);
  return { ok: true, message: `${fullName} added.` };
}

export async function removeChildContact(
  prevState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const session = await requireRole([...PEOPLE_ROLES]);

  const contactId = text(formData, "contactId");
  const childId = text(formData, "childId");
  if (!contactId || !childId) return { message: "Missing contact." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("child_contacts")
    .delete()
    .eq("id", contactId)
    .eq("tenant_id", session.profile.tenantId);

  if (error) return { message: "That contact could not be removed." };

  revalidatePath(`/children/${childId}`);
  return { ok: true };
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
