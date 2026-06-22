"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getValidAdminIdToken,
  signOutAdmin,
} from "@/lib/admin-auth";

type AdminGuardProps = {
  children: React.ReactNode;
};

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function verifyAdminSession() {
      try {
        await getValidAdminIdToken();

        if (isMounted) {
          setIsReady(true);
        }
      } catch {
        signOutAdmin();
        router.replace("/admin/login");
      }
    }

    void verifyAdminSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (!isReady) {
    return (
      <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
        <p className="text-sm text-slate-500">
          Đang kiểm tra quyền quản trị...
        </p>
      </main>
    );
  }

  return <>{children}</>;
}

