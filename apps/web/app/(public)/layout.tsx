import { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getOrganizationSchema, getWebSiteSchema, getSoftwareApplicationSchema } from '@/lib/seo/jsonLd';

export default function PublicLayout({ children }: { children: ReactNode }) {
    const orgSchema = getOrganizationSchema();
    const websiteSchema = getWebSiteSchema();
    const appSchema = getSoftwareApplicationSchema();

    return (
        <div className="min-h-screen min-h-[100dvh] bg-black text-white flex flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }}
            />
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
        </div>
    );
}
