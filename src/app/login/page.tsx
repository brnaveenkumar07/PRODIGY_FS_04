import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/server-auth";

export default async function LoginPage() {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/chat");
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
