"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DepartmentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/employees");
  }, [router]);

  return null;
}
