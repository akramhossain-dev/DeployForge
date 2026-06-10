import { LegalDocument, LegalSection, SystemCta, SystemHero } from '@/components/system/PublicSystem';

const sections: LegalSection[] = [
    {
        title: 'Platform Usage Rules',
        body: 'DeployForge is intended for legitimate deployment, server management, monitoring, and administrative workflows.',
        points: [
            'You are responsible for the applications, repositories, servers, credentials, and domains you connect to DeployForge.',
            'You must keep account credentials secure and immediately revoke access if a session or token is suspected to be compromised.',
            'You must only connect infrastructure and GitHub resources you own or are authorized to manage.',
        ],
    },
    {
        title: 'Acceptable Usage Policy',
        body: 'The platform must not be used to harm systems, evade policy, or abuse connected infrastructure.',
        points: [
            'Do not deploy malware, phishing infrastructure, credential harvesters, spam systems, or intentionally harmful workloads.',
            'Do not use DeployForge to attack, scan, overload, or exploit networks without explicit authorization.',
            'Do not interfere with the availability, integrity, or security of DeployForge or connected third-party services.',
        ],
    },
    {
        title: 'GitHub Integration Terms',
        body: 'GitHub integration is provided to support repository-based deployment workflows.',
        points: [
            'You authorize DeployForge to access GitHub data required for OAuth identity, repository sync, branch selection, and webhook automation.',
            'You are responsible for respecting GitHub organization policies and repository access boundaries.',
            'Disconnecting GitHub may disable repository sync, webhook-triggered deployments, and GitHub-backed release workflows.',
        ],
    },
    {
        title: 'VPS Usage Restrictions',
        body: 'VPS features are designed for servers you control and can lawfully administer.',
        points: [
            'Do not add servers without authorization from the owner or responsible operator.',
            'Do not use terminal access to bypass security controls, exfiltrate data, or perform unauthorized administrative actions.',
            'You are responsible for operating system updates, provider billing, firewall rules, network exposure, and application runtime security.',
        ],
    },
    {
        title: 'Abuse Prevention',
        body: 'DeployForge may limit or block activity that creates operational, legal, or security risk.',
        points: [
            'Rate limits, validation, audit logs, and administrative review may be used to protect the service.',
            'Suspicious contact submissions, repeated failed authentication, or abusive deployment patterns may be blocked or reviewed.',
            'Security-sensitive actions may be logged for investigation and platform integrity.',
        ],
    },
    {
        title: 'Account Termination',
        body: 'Access may be suspended or terminated when account activity violates these terms or threatens the platform.',
        points: [
            'DeployForge administrators may suspend or remove accounts involved in abuse, unauthorized access, or policy violations.',
            'Users may lose access to dashboard workflows when required credentials, integrations, or permissions are revoked.',
            'Termination may not remove all historical logs immediately where retention is needed for security, debugging, or legal obligations.',
        ],
    },
    {
        title: 'Liability Limitations',
        body: 'DeployForge provides deployment tooling, but you remain responsible for your infrastructure and workloads.',
        points: [
            'DeployForge is not responsible for outages, data loss, provider failures, misconfigured servers, unsafe application code, or credential misuse.',
            'You should maintain backups, rollback plans, monitoring, and access controls appropriate for production infrastructure.',
            'The platform is provided without guarantees that every deployment, integration, or monitoring workflow will be uninterrupted or error-free.',
        ],
    },
];

export default function TermsPage() {
    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <SystemHero
                eyebrow="Terms of Service"
                title="Rules for using DeployForge responsibly."
                description="These terms define acceptable platform use, connected infrastructure responsibilities, GitHub integration boundaries, and operational limitations."
            />
            <LegalDocument sections={sections} />
            <SystemCta title="Need clarification?" description="Contact DeployForge before connecting sensitive infrastructure or running production workloads with unclear ownership." href="/contact" label="Contact Us" />
        </main>
    );
}
