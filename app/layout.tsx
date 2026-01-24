import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "SmallSteps - Reduce Overwhelm, One Step at a Time",
    description: "A calm, minimal app to help you break down ideas into small, actionable steps and gently guide you through follow-through.",
};

import AppShell from "@/components/AppShell";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
                <AppShell>
                    {children}
                </AppShell>
            </body>
        </html>
    );
}
