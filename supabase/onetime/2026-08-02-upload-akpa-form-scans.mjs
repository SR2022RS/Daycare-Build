import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SUPABASE_URL = "https://trezwfirgugzuphaflwm.supabase.co";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY env var required");

const supabase = createClient(SUPABASE_URL, SECRET_KEY);

const FORMS_DIR =
  "/private/tmp/claude-501/-Users-rodneywilliams-Documents-Main-GitHub-Folder-Daycare-Build/3436655a-e474-4e78-92c3-71cccd3f37e0/scratchpad/akpa-forms";

const BUCKET = "policy-documents";

// page number -> exact policies.title match already seeded in the DB
const PAGE_TO_TITLE = {
  1: "Child Records Checklist",
  2: "Staff Records Checklist",
  3: "Staff Receipt of Information",
  4: "Contract & Rate Agreement",
  16: "Expulsion Policy",
  17: "Irreversible Payments",
  18: "Annual Application Renewal",
  19: "On Time Payments",
  20: "Private Payments",
};

// No existing row for this one -- net-new insert, same low-risk pattern as
// the other 20 seeded rows.
const NEW_POLICY = {
  page: 21,
  title: "Required Items Upon Arrival",
  category: "Parent Policies",
};

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw error;
  console.log(`Created bucket "${BUCKET}"`);
}

async function uploadPage(page, slug) {
  const path = `${FORMS_DIR}/page-${String(page).padStart(2, "0")}.png`;
  const bytes = readFileSync(path);
  const objectKey = `${slug}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(objectKey, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectKey);
  return data.publicUrl;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  await ensureBucket();

  for (const [page, title] of Object.entries(PAGE_TO_TITLE)) {
    const url = await uploadPage(page, slugify(title));
    const { error, count } = await supabase
      .from("policies")
      .update({ file_url: url }, { count: "exact" })
      .eq("title", title);
    if (error) throw error;
    console.log(`${title}: uploaded + linked (matched ${count} row)`);
  }

  const newUrl = await uploadPage(NEW_POLICY.page, slugify(NEW_POLICY.title));
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).single();
  const { error: insertError } = await supabase.from("policies").insert({
    tenant_id: tenant.id,
    title: NEW_POLICY.title,
    category: NEW_POLICY.category,
    file_url: newUrl,
    version: "1.0",
  });
  if (insertError) throw insertError;
  console.log(`${NEW_POLICY.title}: uploaded + inserted new row`);
}

main().then(() => {
  console.log("Done.");
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
