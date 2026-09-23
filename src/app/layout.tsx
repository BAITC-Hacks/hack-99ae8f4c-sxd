import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FARSIGHT — Astana Strategy & Impact", description: "2-Year Official Simulation for Astana using the HackAlem strategy model, with a separate optional 2050 scenario outlook." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
