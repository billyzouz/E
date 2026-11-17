import type { ReactNode } from "react";
import { MobileNav, Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata = { title: "E-dropship" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <MobileNav />
            <main className="mx-auto max-w-7xl px-5 py-8 md:px-10 md:py-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
