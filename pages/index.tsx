import dynamic from "next/dynamic";
import React from "react";

// Dynamically import the client-only component and disable SSR to avoid hydration mismatches
const TransactionForm = dynamic(() => import("../frontend/TransactionForm"), { ssr: false });

export default function Page() {
  return <TransactionForm />;
}