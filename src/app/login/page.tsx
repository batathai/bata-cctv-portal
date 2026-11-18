import LoginVisualShell from "@/components/login/LoginVisualShell";
import LoginForm from "@/components/login/LoginForm";
import "./login.css";

/* The background is the approved reference image (static); the form is the existing Supabase login form. */
export default function LoginPage() {
  return (
    <LoginVisualShell>
      <LoginForm />
    </LoginVisualShell>
  );
}
