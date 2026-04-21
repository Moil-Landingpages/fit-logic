"use client";

import { Suspense } from "react";
import Patients from "@/page-components/Patients";

export default function ContactsPage() {
  return (
    <Suspense>
      <Patients />
    </Suspense>
  );
}
