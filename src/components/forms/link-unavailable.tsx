// Deliberately generic -- shown for every non-actionable state (invalid
// token, expired, completed, rate-limited) with no branching per reason.
// Never reveals which case it is: that would give a token-guesser an oracle,
// and a parent doesn't need to know why, just what to do next.
export function LinkUnavailable() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10 text-center">
      <div className="max-w-[420px] rounded-xl border border-gray-200 bg-white p-8">
        <h1 className="font-serif text-lg font-semibold text-gray-900">This link isn&apos;t available</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-gray-500">
          It may have expired or already been completed. Please contact your child&apos;s school and ask
          them to send you a new link.
        </p>
      </div>
    </div>
  );
}
