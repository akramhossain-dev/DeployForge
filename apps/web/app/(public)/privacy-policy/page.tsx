import { LegalDocument, LegalSection, SystemCta, SystemHero } from '@/components/system/PublicSystem';

const sections: LegalSection[] = [
    {
        title: 'Data Collection Policy',
        body: 'DeployForge collects only the data needed to operate a self-hosted deployment workflow.',
        points: [
            'GitHub OAuth data can include account identity, username, email, avatar, repository metadata, branch data, and webhook configuration details.',
            'VPS data can include hostnames, IP addresses, ports, usernames, encrypted credentials, health checks, and deployment target metadata.',
            'Operational data can include deployment logs, terminal session metadata, system metrics, queue activity, errors, and audit-style administrative activity.',
        ],
    },
    {
        title: 'Encryption & Storage',
        body: 'Sensitive infrastructure material is handled as security-critical data.',
        points: [
            'GitHub tokens, SSH private keys, SSH passwords, deployment environment values, and other secrets are intended to be encrypted before storage.',
            'Database records are retained in PostgreSQL and accessed through server-side APIs with authenticated route protection where required.',
            'DeployForge does not expose raw secrets in public pages or unauthenticated UI surfaces.',
        ],
    },
    {
        title: 'Third-Party Services',
        body: 'DeployForge integrates with external systems required for deployment and messaging workflows.',
        points: [
            'GitHub is used for OAuth, repository synchronization, and webhook automation.',
            'VPS providers host the servers you connect to DeployForge; their own infrastructure and network policies also apply.',
            'SMTP providers may be used for account verification and system email delivery.',
        ],
    },
    {
        title: 'Cookies Policy',
        body: 'DeployForge uses local browser storage and session-related mechanisms to keep authenticated workflows available.',
        points: [
            'Authentication sessions are maintained with HttpOnly cookies rather than browser-readable token storage.',
            'DeployForge does not require marketing cookies for the core deployment console.',
            'Signing out clears DeployForge session cookies.',
        ],
    },
    {
        title: 'Data Retention',
        body: 'Retention is designed around operational traceability and user control.',
        points: [
            'Deployment records, logs, server metadata, repository records, and contact submissions may be retained for support, security, and audit purposes.',
            'Disconnected integrations should stop future sync activity while historical records may remain until removed by an authorized user or administrator.',
            'Administrators can remove users, GitHub accounts, repositories, and related operational records where the product workflow permits.',
        ],
    },
    {
        title: 'User Rights & Control',
        body: 'Users should remain in control of connected accounts and infrastructure data.',
        points: [
            'Users can disconnect GitHub from the authenticated settings area.',
            'Users can remove VPS records and stop using deployment targets from the dashboard.',
            'For privacy or support requests, contact DeployForge through the contact page with the email connected to the account.',
        ],
    },
];

export default function PrivacyPolicyPage() {
    return (
        <main className="overflow-hidden bg-slate-950 text-white">
            <SystemHero
                eyebrow="Privacy Policy"
                title="How DeployForge handles deployment and infrastructure data."
                description="This policy explains the operational data DeployForge collects, how sensitive values are protected, and how users control connected services."
            />
            <LegalDocument sections={sections} />
            <SystemCta title="Questions about privacy?" description="Send a focused message to the team and include the account email tied to your request." href="/contact" label="Contact Us" />
        </main>
    );
}
