import { redirect } from 'next/navigation';

export default function DashboardNewDeploymentRedirect() {
    redirect('/deployments/new');
}
