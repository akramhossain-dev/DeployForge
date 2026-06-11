import { redirect } from 'next/navigation';

export default function DashboardDeploymentDetailsRedirect({ params }: { params: { id: string } }) {
    redirect(`/deployments/${params.id}`);
}
