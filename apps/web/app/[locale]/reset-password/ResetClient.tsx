"use client";

import { useState, useTransition } from "react";
import { ResetForm } from "@/components/auth";
import { updatePasswordAction } from "@/lib/auth/actions";

export function ResetClient({
  email,
  initialStage,
}: {
  email: string;
  initialStage: "form" | "expired";
}) {
  const [stage, setStage] = useState<"form" | "saved" | "expired">(initialStage);
  const [pending, startTransition] = useTransition();

  return (
    <ResetForm
      stage={stage}
      email={email}
      pending={pending}
      onSubmit={(password) => {
        startTransition(async () => {
          const result = await updatePasswordAction(password);
          if ("ok" in result && result.ok) {
            setStage("saved");
            return;
          }
          setStage("form");
        });
      }}
    />
  );
}
