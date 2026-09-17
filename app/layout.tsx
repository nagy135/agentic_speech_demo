import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "First Note — Find your instrument",
  description:
    "A little conversation. A world of sound. Find the instrument you will love learning with Melody, your AI music guide.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
