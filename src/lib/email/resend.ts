import "server-only";

// Minimal Resend wrapper -- no SDK dependency needed for one endpoint.
// EMAIL_FROM defaults to Resend's shared sandbox sender, which can only
// deliver to the Resend account's own registered email until a domain is
// verified at resend.com/domains. Once a domain is verified, set EMAIL_FROM
// to an address on that domain and sends will reach real recipients with no
// other code changes.
const DEFAULT_FROM = "AKPA University <onboarding@resend.dev>";

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  /** Overrides EMAIL_FROM. Must be on a domain verified in Resend. */
  from?: string;
  /** Where replies land, when that differs from the sending domain. */
  replyTo?: string;
  /**
   * Files to attach. `content` is the raw string; it is base64-encoded here
   * so callers never have to think about the wire format.
   */
  attachments?: { filename: string; content: string; contentType?: string }[];
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from || process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [params.to],
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      ...(params.attachments?.length
        ? {
            attachments: params.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, "utf8").toString("base64"),
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: body };
  }

  return { ok: true };
}
