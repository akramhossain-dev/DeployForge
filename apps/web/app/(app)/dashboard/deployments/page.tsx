import { redirect } from 'next/navigation';

export default function DashboardDeploymentsRedirect() {
    redirect('/deployments');
}
