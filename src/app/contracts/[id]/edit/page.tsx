import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/header";
import { ContractForm } from "@/components/contract-form";

type Props = { params: Promise<{ id: string }> };

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default async function EditContractPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const contractId = Number(id);
  if (isNaN(contractId)) notFound();

  const contract = await prisma.leaseContract.findUnique({
    where: { id: contractId },
    include: {
      customer: { select: { id: true, companyName: true } },
    },
  });

  if (!contract) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">契約編集</h2>
        <ContractForm
          mode="edit"
          customerId={contract.customer.id}
          customerName={contract.customer.companyName}
          contractId={contract.id}
          initialData={{
            contractNumber: contract.contractNumber || "",
            productName: contract.productName,
            leaseCompanyName: contract.leaseCompanyName || "",
            contractStartDate: toDateString(contract.contractStartDate),
            contractEndDate: toDateString(contract.contractEndDate),
            contractMonths: String(contract.contractMonths),
            monthlyFee: contract.monthlyFee ? String(Number(contract.monthlyFee)) : "",
            counterBaseFee: contract.counterBaseFee != null ? String(contract.counterBaseFee) : "",
            monoCounterRate: contract.monoCounterRate != null ? String(contract.monoCounterRate) : "",
            colorCounterRate: contract.colorCounterRate != null ? String(contract.colorCounterRate) : "",
            billingBaseDay: contract.billingBaseDay ? String(contract.billingBaseDay) : "",
            notes: contract.notes || "",
          }}
        />
      </main>
    </div>
  );
}
