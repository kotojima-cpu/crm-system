import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { CustomerForm } from "@/components/customer-form";

export default async function NewCustomerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">顧客登録</h2>
        <CustomerForm mode="create" />
      </main>
    </div>
  );
}
