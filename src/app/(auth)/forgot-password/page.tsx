import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div>
      <h2 className="font-serif text-[26px] font-medium text-[#F5F3EE]">Reset your password</h2>
      <p className="mt-2.5 mb-8 text-[13.5px] text-[#7E7871]">We&apos;ll email you a reset link.</p>
      <ForgotPasswordForm />
    </div>
  );
}
