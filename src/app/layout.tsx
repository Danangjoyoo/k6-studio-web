import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "k6 Studio",
  description: "k6 load test management UI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
