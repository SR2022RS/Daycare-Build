/**
 * TODO(ghl): push a saved tour request to GoHighLevel as a lead.
 *
 * Do not send email, SMS, or a webhook from this function until that work
 * is actually built. The form must succeed without it.
 */
export async function pushTourLeadToGhl(lead: {
  id: string;
  parentName: string;
  email: string;
  phone: string;
  campusName: string;
}): Promise<void> {
  void lead;
  return;
}
