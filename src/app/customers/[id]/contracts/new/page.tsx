import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/header";
import { ContractForm } from "@/components/contract-form";

type Props = { params: Promise<{ id: string }> };

export default async function NewContractPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const customerId = Number(id);
  if (isNaN(customerId)) notFound();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false },
    select: { id: true, companyName: true },
  });
  if (!customer) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">契約登録</h2>
        <ContractForm mode="create" customerId={customer.id} customerName={customer.companyName} />
      </main>
    </div>
  );
}
