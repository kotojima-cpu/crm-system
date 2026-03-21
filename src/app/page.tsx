import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const role = session.user?.role;
  if (role === "platform_master" || role === "platform_operator" || role === "platform_admin") {
    redirect("/platform/tenants");
  }
  redirect("/customers");
}
