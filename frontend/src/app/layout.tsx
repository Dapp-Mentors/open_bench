import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "OpenBench",
  description: "Open infrastructure for reproducible AI benchmark curation and evaluation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise scanlines">
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
