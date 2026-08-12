import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "DeployForge",
    description: "Self-hosted deployment platform",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <body className={`${inter.className} bg-black text-white antialiased selection:bg-[#333333] selection:text-white min-h-screen min-h-[100dvh]`}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
