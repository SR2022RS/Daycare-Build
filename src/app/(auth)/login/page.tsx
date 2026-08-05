import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div>
      <h2 className="font-serif text-[26px] font-medium text-[#F5F3EE]">Sign in</h2>
      <p className="mt-2.5 mb-8 text-[13.5px] text-[#7E7871]">
        Use the work email on your personnel file.
      </p>
      <LoginForm />
    </div>
  );
}
