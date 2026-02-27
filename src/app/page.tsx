import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server-auth";

export default async function Home() {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/chat");
  }

  redirect("/login");
}
