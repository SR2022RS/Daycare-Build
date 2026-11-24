import { oolDeadline } from "@/lib/accidents/deadlines";

/** The only reminder. Nothing is emailed or texted. */
export function ParentNotifiedReminder({ notified }: { notified: boolean }) {
  if (notified) return null;
  return (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-900">
      Parent notified?
    </p>
  );
}

export function OolDeadline({ occurredOn, reportable }: { occurredOn: string; reportable: boolean }) {
  if (!reportable) return null;
  const deadline = oolDeadline(occurredOn);
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-950">
      <p className="font-semibold">Office of Licensing</p>
      <p className="mt-1">
        Verbal notice by the next working day: <span className="font-semibold">{deadline.verbalBy}</span>
      </p>
      <p>
        Written documentation within one week:{" "}
        <span className="font-semibold">{deadline.documentationBy}</span>
      </p>
      <p className="mt-1 text-[11.5px] text-red-800">
        N.J.A.C. 3A:52-7.10. This screen does not send the notice.
      </p>
    </div>
  );
}
