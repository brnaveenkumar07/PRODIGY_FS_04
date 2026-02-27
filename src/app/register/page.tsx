import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/lib/server-auth";

export default async function RegisterPage() {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/chat");
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <RegisterForm />
    </main>
  );
}
