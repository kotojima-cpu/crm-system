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

  const editWhere: Record<string, unknown> = { id: customerId, isDeleted: false };
  if (session.user.tenantId) {
    editWhere.tenantId = Number(session.user.tenantId);
  }
  if (session.user.role === "sales") {
    editWhere.assignedUserId = Number(session.user.id);
  }

  const customer = await prisma.customer.findFirst({
    where: editWhere,
  });

  if (!customer) notFound();

  // tenant_admin の場合、同一テナント内の担当者候補を取得
  let assigneeOptions: { id: number; name: string }[] | undefined;
  if (session.user.role === "tenant_admin" && session.user.tenantId) {
    const users = await prisma.user.findMany({
      where: {
        tenantId: Number(session.user.tenantId),
        isActive: true,
        role: { in: ["tenant_admin", "sales"] },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    assigneeOptions = users;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">顧客編集</h2>
        <CustomerForm
          mode="edit"
          customerId={customer.id}
          initialData={{
            customerType: customer.customerType ?? "new",
            companyName: customer.companyName,
            companyNameKana: customer.companyNameKana || "",
            zipCode: customer.zipCode || "",
            prefecture: customer.prefecture || "",
            city: customer.city || "",
            addressLine1: customer.addressLine1 || "",
            addressLine2: customer.addressLine2 || "",
            phone: customer.phone || "",
            fax: customer.fax || "",
            contactName: customer.contactName || "",
            contactPhone: customer.contactPhone || "",
            contactEmail: customer.contactEmail || "",
            notes: customer.notes || "",
            assignedUserId: customer.assignedUserId ? String(customer.assignedUserId) : "",
          }}
          assigneeOptions={assigneeOptions}
        />
      </main>
    </div>
  );
}
