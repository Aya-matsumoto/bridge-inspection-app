import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "維持対応報告書システム",
  description: "橋梁点検 維持対応報告書作成システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
