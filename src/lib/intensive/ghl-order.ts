import { INTENSIVE } from "@/lib/intensive/config";
import type { GhlOrder } from "@/lib/ghl/client";

/**
 * Is this GoHighLevel order a seat at the class?
 *
 * "Order Submitted" fires for every order in the sub-account, and the same
 * account sells the $25 checklist and the rest of the digital funnel at
 * shop.akpadaycareblueprint.com. Without this check, any of those buyers would
 * be registered for the in-person class and sent its confirmation email.
 *
 * Matches on the product id, which survives a rename. The name only counts
 * when GHL sent no product ids at all, so an unexpected response shape does
 * not turn away a real buyer -- but once ids are present, a look-alike name
 * on a different product is rejected.
 */
export function isIntensiveOrder(
  order: Pick<GhlOrder, "items">,
  productId: string = INTENSIVE.ghlProductId,
): boolean {
  if (order.items.some((item) => item.productId === productId)) return true;
  if (order.items.some((item) => item.productId !== null)) return false;
  return order.items.some((item) => /daycare owner intensive/i.test(item.name));
}
