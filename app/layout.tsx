import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "똑똑 · 수업 컨설팅 노트",
  description: "교수님의 고민에서 수업의 변화까지, 찾아가는 교수법 똑-똑 상담 기록",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
