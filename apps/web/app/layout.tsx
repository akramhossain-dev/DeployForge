import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://deployforge.dev'),
    title: {
        default: 'DeployForge — Self-Hosted PaaS & VPS Deployment Platform',
        template: '%s | DeployForge',
    },
    description: 'Production-grade, self-hosted deployment platform automating application builds, VPS deployments, and real-time container monitoring.',
    keywords: [
        'self-hosted paas',
        'vps deployment',
        'docker deployment',
        'deployment orchestrator',
        'github auto deploy',
        'deployforge',
        'cloud hosting',
        'vercel alternative',
    ],
    authors: [{ name: 'DeployForge Team' }],
    creator: 'DeployForge',
    publisher: 'DeployForge',
    openGraph: {
        type: 'website',
        locale: 'en_US',
        url: 'https://deployforge.dev',
        siteName: 'DeployForge',
        title: 'DeployForge — Self-Hosted PaaS & VPS Deployment Platform',
        description: 'Production-grade, self-hosted deployment platform automating application builds, VPS deployments, and real-time container monitoring.',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'DeployForge — Self-Hosted PaaS & VPS Deployment Platform',
        description: 'Production-grade, self-hosted deployment platform automating application builds, VPS deployments, and real-time container monitoring.',
        creator: '@deployforge',
    },
    robots: {
        index: true,
        follow: true,
    },
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
