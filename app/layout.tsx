import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phố Việt Online — Cả khu phố. Cùng anh em.",
  description: "Khám phá khu phố Việt Nam 3D, lái xe máy, giao cà phê và gặp bạn bè trong phòng chơi chung.",
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
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
