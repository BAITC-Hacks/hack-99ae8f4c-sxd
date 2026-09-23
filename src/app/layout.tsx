import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FARSIGHT — Astana Strategy & Impact", description: "Official two-year HackAlem strategy simulation for Astana, with a separate optional 2050 scenario outlook." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
