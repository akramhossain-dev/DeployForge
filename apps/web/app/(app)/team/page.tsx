'use client';

import React, { useState, useMemo } from 'react';
import { 
    Users, UserPlus, Mail, Shield, Trash2, Check, X, Clock, 
    ArrowRight, ChevronDown, UserCheck, AlertCircle 
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { 
    useProjects, useProjectMembers, useInvitations, 
    useInviteCollaborator, useRevokeInvitation, useUpdateMemberRole, 
    useRemoveMember, useAcceptInvitation, useDeclineInvitation 
} from '@/hooks/useDeployForgeData';
import { 
    PageHeader, Panel, Button, EmptyState, ErrorState, 
    SkeletonBlock, StatusBadge, formatDate, inputClassName 
} from '@/components/ui';

export default function TeamPage() {
    const { user: currentUser } = useAuthStore();
    const projectsQuery = useProjects();
    const invitationsQuery = useInvitations();

    const projects = projectsQuery.data || [];
    const receivedInvitations = invitationsQuery.data || [];

    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    // Set initial selected project once loaded
    React.useEffect(() => {
        if (projects.length > 0 && !selectedProjectId) {
            setSelectedProjectId(projects[0].id);
        }
    }, [projects, selectedProjectId]);

    const selectedProject = useMemo(() => {
        return projects.find(p => p.id === selectedProjectId);
    }, [projects, selectedProjectId]);

    const membersQuery = useProjectMembers(selectedProjectId);
    const { members = [], invites = [] } = membersQuery.data || {};

    // Determine current user's role in the selected project
    const currentUserRole = useMemo(() => {
        if (!selectedProject || !currentUser) return 'VIEWER';
        if (selectedProject.userId === currentUser.id) return 'OWNER';
        const memberRecord = members.find(m => m.userId === currentUser.id);
        return memberRecord?.role || 'VIEWER';
    }, [selectedProject, currentUser, members]);

    const canManage = ['OWNER', 'ADMIN'].includes(currentUserRole);

    // Mutations
    const inviteMutation = useInviteCollaborator();
    const revokeMutation = useRevokeInvitation();
    const updateRoleMutation = useUpdateMemberRole();
    const removeMemberMutation = useRemoveMember();
    const acceptMutation = useAcceptInvitation();
    const declineMutation = useDeclineInvitation();

    // Invite Form State
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'DEVELOPER' | 'VIEWER'>('DEVELOPER');

    const handleInvite = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail) return;
        inviteMutation.mutate(
            { projectId: selectedProjectId, email: inviteEmail, role: inviteRole },
            {
                onSuccess: () => {
                    setInviteEmail('');
                }
            }
        );
    };

    const handleRoleChange = (memberId: string, role: string) => {
        updateRoleMutation.mutate({ projectId: selectedProjectId, memberId, role });
    };

    const handleRemoveMember = (memberId: string) => {
        if (window.confirm('Are you sure you want to remove this member from the project?')) {
            removeMemberMutation.mutate({ projectId: selectedProjectId, memberId });
        }
    };

    const handleRevokeInvite = (inviteId: string) => {
        if (window.confirm('Are you sure you want to revoke this invitation?')) {
            revokeMutation.mutate({ projectId: selectedProjectId, inviteId });
        }
    };

    const isLoading = projectsQuery.isLoading || invitationsQuery.isLoading;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="Team Collaboration" description="Manage project members, roles, and collaborate." />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <SkeletonBlock className="h-48 lg:col-span-2" />
                    <SkeletonBlock className="h-48" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader 
                title="Team Collaboration" 
                description="Manage access control, invite collaborators, and view project invitations." 
            />

            {/* Received Invitations Section */}
            {receivedInvitations.length > 0 && (
                <Panel className="border-cyan-500/30 bg-cyan-950/15">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                            <Clock size={16} />
                        </div>
                        <h2 className="text-lg font-black text-white">Pending Invitations ({receivedInvitations.length})</h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {receivedInvitations.map((invite) => (
                            <div key={invite.id} className="rounded-xl border border-white/[0.07] bg-slate-950/45 p-4 flex flex-col justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-100">{invite.project?.name}</p>
                                    <p className="text-xs text-slate-400 mt-1">Invited by: {invite.project?.user?.email || 'Owner'}</p>
                                    <div className="mt-2.5">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300 ring-1 ring-cyan-400/20">
                                            <Shield size={10} />
                                            {invite.role}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-1">
                                    <Button 
                                        variant="primary" 
                                        className="h-8 flex-1 text-xs" 
                                        loading={acceptMutation.isPending}
                                        onClick={() => acceptMutation.mutate(invite.id)}
                                    >
                                        <Check size={14} /> Accept
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        className="h-8 flex-1 text-xs border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400" 
                                        loading={declineMutation.isPending}
                                        onClick={() => declineMutation.mutate(invite.id)}
                                    >
                                        <X size={14} /> Decline
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            {projects.length === 0 ? (
                <EmptyState 
                    title="No projects found" 
                    description="You must have a deployment project before you can manage team members."
                />
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Left: Members & Invites List */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Selector panel */}
                        <Panel className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400">
                                    <Users size={18} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Active Project</p>
                                    <h3 className="text-sm font-black text-white">{selectedProject?.name}</h3>
                                </div>
                            </div>
                            <div className="relative min-w-[200px]">
                                <select 
                                    value={selectedProjectId}
                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                    className={`${inputClassName} appearance-none pr-10`}
                                >
                                    {projects.map((p) => (
                                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                        </Panel>

                        {/* Members Panel */}
                        <Panel>
                            <div className="flex items-center justify-between gap-3 mb-5">
                                <div className="flex items-center gap-2">
                                    <Users size={16} className="text-cyan-300" />
                                    <h2 className="font-black text-white">Project Members</h2>
                                </div>
                                <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase text-slate-400">
                                    Role: {currentUserRole}
                                </span>
                            </div>

                            {membersQuery.isLoading ? (
                                <div className="space-y-2">
                                    <SkeletonBlock className="h-12" />
                                    <SkeletonBlock className="h-12" />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm" style={{ minWidth: 600 }}>
                                        <thead className="text-xs uppercase text-slate-500 border-b border-white/10">
                                            <tr>
                                                <th className="px-3 py-3 font-black">Member</th>
                                                <th className="px-3 py-3 font-black">Role</th>
                                                <th className="px-3 py-3 font-black text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                            {/* Owner row */}
                                            <tr className="align-middle transition-colors hover:bg-white/[0.01]">
                                                <td className="px-3 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-xs font-black text-white">
                                                            {selectedProject?.user?.name?.[0] || selectedProject?.user?.email?.[0]?.toUpperCase() || 'O'}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-black text-white">{selectedProject?.user?.name || 'Owner'}</p>
                                                            <p className="text-[10px] text-slate-500">{selectedProject?.user?.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-4">
                                                    <StatusBadge status="OWNER" />
                                                </td>
                                                <td className="px-3 py-4 text-right">
                                                    <span className="text-[10px] font-bold text-slate-600">Project Creator</span>
                                                </td>
                                            </tr>
                                            {/* Members list */}
                                            {members.filter(m => m.userId !== selectedProject?.userId).map((member) => (
                                                <tr key={member.id} className="align-middle transition-colors hover:bg-white/[0.01]">
                                                    <td className="px-3 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-xs font-black text-white">
                                                                {member.user?.name?.[0] || member.user?.email?.[0]?.toUpperCase() || 'U'}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-black text-white">
                                                                    {member.user?.name || 'Member'}
                                                                    {member.userId === currentUser?.id && <span className="ml-1.5 text-[9px] font-bold text-cyan-300 bg-cyan-400/10 px-1 py-0.5 rounded">You</span>}
                                                                </p>
                                                                <p className="text-[10px] text-slate-500">{member.user?.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-4">
                                                        {canManage && member.userId !== currentUser?.id ? (
                                                            <div className="relative inline-block text-left">
                                                                <select
                                                                    value={member.role}
                                                                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                                    className="bg-slate-900 text-xs font-black text-white border border-white/10 rounded px-2 py-1 outline-none focus:border-cyan-300"
                                                                    disabled={updateRoleMutation.isPending}
                                                                >
                                                                    <option value="ADMIN">ADMIN</option>
                                                                    <option value="DEVELOPER">DEVELOPER</option>
                                                                    <option value="VIEWER">VIEWER</option>
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <StatusBadge status={member.role} />
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-4 text-right">
                                                        {canManage && member.userId !== currentUser?.id ? (
                                                            <Button
                                                                variant="danger"
                                                                className="h-8 w-8 p-0"
                                                                loading={removeMemberMutation.isPending}
                                                                onClick={() => handleRemoveMember(member.id)}
                                                                title="Remove Member"
                                                            >
                                                                <Trash2 size={13} />
                                                            </Button>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-600">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>

                        {/* Invites list */}
                        {invites.length > 0 && (
                            <Panel>
                                <div className="flex items-center gap-2 mb-4">
                                    <Clock size={16} className="text-cyan-300" />
                                    <h2 className="font-black text-white">Pending Invites</h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm" style={{ minWidth: 600 }}>
                                        <thead className="text-xs uppercase text-slate-500 border-b border-white/10">
                                            <tr>
                                                <th className="px-3 py-3 font-black">Email</th>
                                                <th className="px-3 py-3 font-black">Role</th>
                                                <th className="px-3 py-3 font-black">Sent At</th>
                                                <th className="px-3 py-3 font-black text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/10">
                                            {invites.map((invite) => (
                                                <tr key={invite.id} className="align-middle transition-colors hover:bg-white/[0.01]">
                                                    <td className="px-3 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <Mail size={14} className="text-slate-500" />
                                                            <span className="text-xs font-bold text-white">{invite.email}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-4">
                                                        <span className="inline-flex rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300 ring-1 ring-cyan-400/20">
                                                            {invite.role}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-4 text-xs text-slate-500">
                                                        {formatDate(invite.createdAt)}
                                                    </td>
                                                    <td className="px-3 py-4 text-right">
                                                        {canManage ? (
                                                            <Button
                                                                variant="danger"
                                                                className="h-8 w-8 p-0"
                                                                loading={revokeMutation.isPending}
                                                                onClick={() => handleRevokeInvite(invite.id)}
                                                                title="Revoke Invitation"
                                                            >
                                                                <X size={13} />
                                                            </Button>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-600">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>
                        )}
                    </div>

                    {/* Right: Invite Form / Role Guide */}
                    <div className="space-y-6">
                        {/* Invite Form */}
                        {canManage ? (
                            <Panel>
                                <div className="flex items-center gap-2 mb-4">
                                    <UserPlus size={16} className="text-cyan-300" />
                                    <h2 className="font-black text-white">Invite Collaborator</h2>
                                </div>
                                <form onSubmit={handleInvite} className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
                                        <input
                                            type="email"
                                            placeholder="collaborator@example.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            className={inputClassName}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Role Permission</label>
                                        <div className="relative">
                                            <select
                                                value={inviteRole}
                                                onChange={(e) => setInviteRole(e.target.value as any)}
                                                className={`${inputClassName} appearance-none pr-10`}
                                            >
                                                <option value="DEVELOPER">DEVELOPER (Deploy & Modify)</option>
                                                <option value="ADMIN">ADMIN (Full Member Control)</option>
                                                <option value="VIEWER">VIEWER (Read-Only access)</option>
                                            </select>
                                            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        </div>
                                    </div>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="w-full mt-2"
                                        loading={inviteMutation.isPending}
                                    >
                                        Send Invitation
                                    </Button>
                                </form>
                            </Panel>
                        ) : (
                            <Panel className="border-rose-400/20 bg-rose-500/5">
                                <div className="flex gap-3">
                                    <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={18} />
                                    <div>
                                        <h3 className="text-sm font-black text-rose-300">Access Restricted</h3>
                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                            You must be a project OWNER or ADMIN to invite new members or manage roles. Your current role is <strong>{currentUserRole}</strong>.
                                        </p>
                                    </div>
                                </div>
                            </Panel>
                        )}

                        {/* Roles Guide */}
                        <Panel>
                            <h3 className="text-sm font-black text-white mb-3">Roles & Permissions</h3>
                            <div className="space-y-3.5 text-xs">
                                <div className="flex gap-2">
                                    <div className="mt-0.5">
                                        <StatusBadge status="OWNER" />
                                    </div>
                                    <p className="text-slate-400 leading-relaxed">
                                        Full management access. Can delete the project, manage members, roles, environment overrides, and trigger deployments.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <div className="mt-0.5">
                                        <StatusBadge status="ADMIN" />
                                    </div>
                                    <p className="text-slate-400 leading-relaxed">
                                        Can manage members/invitations, configure environments, trigger redeployments, and view configurations.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <div className="mt-0.5">
                                        <StatusBadge status="DEVELOPER" />
                                    </div>
                                    <p className="text-slate-400 leading-relaxed">
                                        Can configure environment variables, trigger redeployments, and view project logs. Cannot manage team members.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <div className="mt-0.5">
                                        <StatusBadge status="VIEWER" />
                                    </div>
                                    <p className="text-slate-400 leading-relaxed">
                                        Read-only access to deployments, logs, and public variables. Cannot trigger deployments or edit settings.
                                    </p>
                                </div>
                            </div>
                        </Panel>
                    </div>
                </div>
            )}
        </div>
    );
}
