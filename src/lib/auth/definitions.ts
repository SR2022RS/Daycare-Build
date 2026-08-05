import * as z from "zod";

export const LoginFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Password is required." }),
});

export const SignupFormSchema = z.object({
  fullName: z.string().min(2, { error: "Name must be at least 2 characters." }).trim(),
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z
    .string()
    .min(8, { error: "Must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Must contain at least one letter." })
    .regex(/[0-9]/, { error: "Must contain at least one number." }),
});

export const NewPasswordFormSchema = z.object({
  password: z
    .string()
    .min(8, { error: "Must be at least 8 characters." })
    .regex(/[a-zA-Z]/, { error: "Must contain at least one letter." })
    .regex(/[0-9]/, { error: "Must contain at least one number." }),
});

export type AuthFormState =
  | {
      errors?: {
        email?: string[];
        password?: string[];
        fullName?: string[];
      };
      message?: string;
    }
  | undefined;
