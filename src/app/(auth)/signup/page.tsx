import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div>
      <h2 className="font-serif text-[26px] font-medium text-[#F5F3EE]">Create your account</h2>
      <p className="mt-2.5 mb-8 text-[13.5px] text-[#7E7871]">Join AKPA University as staff.</p>
      <SignupForm />
    </div>
  );
}
