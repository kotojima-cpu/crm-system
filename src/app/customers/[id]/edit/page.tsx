import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/header";
import { CustomerForm } from "@/components/customer-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditCustomerPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const customerId = Number(id);
  if (isNaN(customerId)) notFound();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false },
  });

  if (!customer) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">顧客編集</h2>
        <CustomerForm
          mode="edit"
          customerId={customer.id}
          initialData={{
            companyName: customer.companyName,
            companyNameKana: customer.companyNameKana || "",
            zipCode: customer.zipCode || "",
            address: customer.address || "",
            phone: customer.phone || "",
            fax: customer.fax || "",
            contactName: customer.contactName || "",
            contactPhone: customer.contactPhone || "",
            contactEmail: customer.contactEmail || "",
            notes: customer.notes || "",
          }}
        />
      </main>
    </div>
  );
}
