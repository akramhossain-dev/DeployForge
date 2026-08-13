import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'DeployForge — Self-Hosted PaaS Orchestrator';
export const size = {
    width: 1200,
    height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    backgroundColor: '#000000',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    padding: '80px',
                    fontFamily: 'monospace',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '24px',
                    }}
                >
                    <div
                        style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: '#34D399',
                        }}
                    />
                    <span
                        style={{
                            color: '#A1A1A1',
                            fontSize: '20px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                        }}
                    >
                        v1.0.0 — PaaS Orchestrator
                    </span>
                </div>

                <div
                    style={{
                        color: '#FFFFFF',
                        fontSize: '64px',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        marginBottom: '20px',
                    }}
                >
                    DeployForge
                </div>

                <div
                    style={{
                        color: '#A1A1A1',
                        fontSize: '28px',
                        lineHeight: 1.4,
                        maxWidth: '900px',
                    }}
                >
                    Self-hosted application deployments on your own infrastructure over agentless SSH.
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '24px',
                        marginTop: '48px',
                        borderTop: '1px solid #1F1F1F',
                        paddingTop: '24px',
                        width: '100%',
                        color: '#666666',
                        fontSize: '18px',
                    }}
                >
                    <span>Agentless SSH</span>
                    <span>•</span>
                    <span>Blue-Green Releases</span>
                    <span>•</span>
                    <span>Nginx SSL Proxy</span>
                    <span>•</span>
                    <span>AES-256 Vault</span>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
