"use client";

import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/AppHeader";
import { TripChatUI } from "@/components/TripChatUI";

const crumbs = [{ label: "My Trips", href: "/dashboard" }, { label: "Plan a New Trip" }];

export default function NewTripPage() {
  const { status } = useSession({ required: true });

  if (status === "loading") {
    return (
      <>
        <AppHeader crumbs={crumbs} />
        <div className="min-h-screen flex items-center justify-center bg-cream-100">
          <div className="w-8 h-8 border-4 border-coral-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader crumbs={crumbs} />
      <main className="bg-cream-100 h-[calc(100vh-57px)]">
        <TripChatUI redirectOnFinalize />
      </main>
    </>
  );
}
