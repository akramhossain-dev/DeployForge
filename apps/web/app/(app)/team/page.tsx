'use client';

import React, { useState, useMemo } from 'react';
import { 
    Users, UserPlus, Mail, Shield, Trash2, Check, X, Clock, 
    ChevronDown, AlertCircle, Loader2 
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { 
    useProjects, useProjectMembers, useInvitations, 
    useInviteCollaborator, useRevokeInvitation, useUpdateMemberRole, 
    useRemoveMember, useAcceptInvitation, useDeclineInvitation 
} from '@/hooks/useDeployForgeData';
import { formatDate } from '@/components/ui';
import clsx from 'clsx';

const EMPTY_ARRAY: any[] = [];
const INPUT_STYLE = 'w-full rounded-md border border-[#1F1F1F] bg-[#000000] px-3 py-2 text-xs font-mono text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#333333]';

function StatusTag({ status }: { status?: string }) {
    const s = String(status || 'VIEWER').toUpperCase();
    const style = s === 'OWNER'
        ? 'border-white bg-white text-black font-bold'
        : s === 'ADMIN'
        ? 'border-[#1F1F1F] bg-[#000000] text-emerald-400 font-semibold'
        : s === 'DEVELOPER'
        ? 'border-[#1F1F1F] bg-[#000000] text-cyan-400 font-semibold'
        : 'border-[#1F1F1F] bg-[#111111] text-[#A1A1A1]';

    return (
        <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider', style)}>
            {s}
        </span>
    );
}

export default function TeamPage() {
    const { user: currentUser } = useAuthStore();
    const projectsQuery = useProjects();
    const invitationsQuery = useInvitations();

    const projects = useMemo(() => projectsQuery.data || EMPTY_ARRAY, [projectsQuery.data]);
    const receivedInvitations = invitationsQuery.data || EMPTY_ARRAY;

    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

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

    const currentUserRole = useMemo(() => {
        if (!selectedProject || !currentUser) return 'VIEWER';
        if (selectedProject.userId === currentUser.id) return 'OWNER';
        const memberRecord = members.find((m: any) => m.userId === currentUser.id);
        return memberRecord?.role || 'VIEWER';
    }, [selectedProject, currentUser, members]);

    const canManage = ['OWNER', 'ADMIN'].includes(currentUserRole);

    const inviteMutation = useInviteCollaborator();
    const revokeMutation = useRevokeInvitation();
    const updateRoleMutation = useUpdateMemberRole();
    const removeMemberMutation = useRemoveMember();
    const acceptMutation = useAcceptInvitation();
    const declineMutation = useDeclineInvitation();

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
            <div className="flex h-64 items-center justify-center font-mono text-xs text-[#666666]">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading team members & invitations...
            </div>
        );
    }

    return (
        <div className="space-y-6 font-mono text-xs">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#1F1F1F] pb-5">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                        Team Collaboration
                    </h1>
                    <p className="mt-1 text-xs text-[#A1A1A1]">
                        Manage access controls, invite project collaborators, and review pending invitations.
                    </p>
                </div>
            </div>

            {/* Received Invitations */}
            {receivedInvitations.length > 0 && (
                <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                    <div className="flex items-center gap-2 text-white font-bold">
                        <Clock size={14} />
                        <span>Pending Received Invitations ({receivedInvitations.length})</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {receivedInvitations.map((invite: any) => (
                            <div key={invite.id} className="rounded border border-[#1F1F1F] bg-[#000000] p-4 flex flex-col justify-between gap-3">
                                <div>
                                    <p className="font-bold text-white text-sm">{invite.project?.name}</p>
                                    <p className="text-[11px] text-[#A1A1A1] mt-1">Invited by: {invite.project?.user?.email || 'Owner'}</p>
                                    <div className="mt-2">
                                        <StatusTag status={invite.role} />
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2 border-t border-[#1F1F1F]">
                                    <button
                                        onClick={() => acceptMutation.mutate(invite.id)}
                                        disabled={acceptMutation.isPending}
                                        className="flex h-7 flex-1 items-center justify-center gap-1 rounded border border-[#1F1F1F] bg-white font-semibold text-black hover:bg-[#E5E5E5] text-xs"
                                    >
                                        <Check size={12} /> Accept
                                    </button>
                                    <button
                                        onClick={() => declineMutation.mutate(invite.id)}
                                        disabled={declineMutation.isPending}
                                        className="flex h-7 flex-1 items-center justify-center gap-1 rounded border border-rose-900/40 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30 text-xs"
                                    >
                                        <X size={12} /> Decline
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#1F1F1F] bg-[#0A0A0A] p-10 text-center text-[#666666]">
                    <Users size={24} className="mx-auto mb-2 text-[#666666]" />
                    <p className="text-white font-semibold">No Projects Found</p>
                    <p className="mt-1 text-xs">Create a project deployment first before adding team collaborators.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Left 2 Cols: Member & Invites List */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Active Project Selector */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-4">
                            <div className="flex items-center gap-2 text-white">
                                <Users size={14} />
                                <span className="font-bold">Active Project:</span>
                                <span className="text-white font-bold">{selectedProject?.name}</span>
                            </div>
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className={clsx(INPUT_STYLE, 'sm:w-56')}
                            >
                                {projects.map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Members Panel */}
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                            <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-3">
                                <span className="font-bold text-white text-sm">Project Members</span>
                                <span className="text-[#666666]">Your Role: {currentUserRole}</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="text-[10px] uppercase text-[#666666] border-b border-[#1F1F1F]">
                                        <tr>
                                            <th className="pb-2 font-semibold">Member</th>
                                            <th className="pb-2 font-semibold">Role</th>
                                            <th className="pb-2 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1F1F1F]">
                                        {/* Owner row */}
                                        <tr className="align-middle">
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-full bg-[#111111] border border-[#1F1F1F] flex items-center justify-center font-bold text-white text-[10px]">
                                                        {selectedProject?.user?.email?.[0]?.toUpperCase() || 'O'}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white">{selectedProject?.user?.name || 'Owner'}</p>
                                                        <p className="text-[10px] text-[#666666]">{selectedProject?.user?.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3">
                                                <StatusTag status="OWNER" />
                                            </td>
                                            <td className="py-3 text-right text-[10px] text-[#666666]">
                                                Project Creator
                                            </td>
                                        </tr>

                                        {/* Members list */}
                                        {members.filter((m: any) => m.userId !== selectedProject?.userId).map((member: any) => (
                                            <tr key={member.id} className="align-middle">
                                                <td className="py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full bg-[#111111] border border-[#1F1F1F] flex items-center justify-center font-bold text-white text-[10px]">
                                                            {member.user?.email?.[0]?.toUpperCase() || 'M'}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-white">
                                                                {member.user?.name || 'Member'}
                                                                {member.userId === currentUser?.id && <span className="ml-1 text-[9px] text-cyan-400">(You)</span>}
                                                            </p>
                                                            <p className="text-[10px] text-[#666666]">{member.user?.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3">
                                                    {canManage && member.userId !== currentUser?.id ? (
                                                        <select
                                                            value={member.role}
                                                            onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                            className="rounded border border-[#1F1F1F] bg-[#000000] px-2 py-1 text-xs text-white outline-none"
                                                            disabled={updateRoleMutation.isPending}
                                                        >
                                                            <option value="ADMIN">ADMIN</option>
                                                            <option value="DEVELOPER">DEVELOPER</option>
                                                            <option value="VIEWER">VIEWER</option>
                                                        </select>
                                                    ) : (
                                                        <StatusTag status={member.role} />
                                                    )}
                                                </td>
                                                <td className="py-3 text-right">
                                                    {canManage && member.userId !== currentUser?.id ? (
                                                        <button
                                                            onClick={() => handleRemoveMember(member.id)}
                                                            disabled={removeMemberMutation.isPending}
                                                            className="h-7 w-7 inline-flex items-center justify-center rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30"
                                                            title="Remove Member"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    ) : (
                                                        <span className="text-[#666666]">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Invites list */}
                        {invites.length > 0 && (
                            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                                <span className="font-bold text-white text-sm">Pending Outgoing Invites</span>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="text-[10px] uppercase text-[#666666] border-b border-[#1F1F1F]">
                                            <tr>
                                                <th className="pb-2 font-semibold">Email</th>
                                                <th className="pb-2 font-semibold">Role</th>
                                                <th className="pb-2 font-semibold">Sent At</th>
                                                <th className="pb-2 font-semibold text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1F1F1F]">
                                            {invites.map((invite: any) => (
                                                <tr key={invite.id} className="align-middle">
                                                    <td className="py-3 text-white font-bold">{invite.email}</td>
                                                    <td className="py-3"><StatusTag status={invite.role} /></td>
                                                    <td className="py-3 text-[#666666]">{formatDate(invite.createdAt)}</td>
                                                    <td className="py-3 text-right">
                                                        {canManage ? (
                                                            <button
                                                                onClick={() => handleRevokeInvite(invite.id)}
                                                                disabled={revokeMutation.isPending}
                                                                className="h-7 w-7 inline-flex items-center justify-center rounded border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30"
                                                                title="Revoke Invite"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        ) : (
                                                            <span className="text-[#666666]">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right 1 Col: Invite Form & Role Guide */}
                    <div className="space-y-6">
                        {canManage ? (
                            <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-4">
                                <div className="flex items-center gap-2 text-white font-bold">
                                    <UserPlus size={14} />
                                    <span>Invite Collaborator</span>
                                </div>
                                <form onSubmit={handleInvite} className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Email Address</label>
                                        <input
                                            type="email"
                                            placeholder="collaborator@example.com"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            className={INPUT_STYLE}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold uppercase text-[#666666] mb-1">Role Permission</label>
                                        <select
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value as any)}
                                            className={INPUT_STYLE}
                                        >
                                            <option value="DEVELOPER">DEVELOPER (Deploy & Modify)</option>
                                            <option value="ADMIN">ADMIN (Full Member Control)</option>
                                            <option value="VIEWER">VIEWER (Read-Only access)</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={inviteMutation.isPending}
                                        className="w-full flex h-8 items-center justify-center gap-1 rounded border border-[#1F1F1F] bg-white font-semibold text-black hover:bg-[#E5E5E5] disabled:opacity-50"
                                    >
                                        {inviteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                                        <span>Send Invitation</span>
                                    </button>
                                </form>
                            </div>
                        ) : (
                            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-4 text-rose-300">
                                <p className="font-bold">Access Restricted</p>
                                <p className="text-xs text-[#A1A1A1] mt-1">
                                    Project OWNER or ADMIN role required to invite members. Current role: <strong>{currentUserRole}</strong>.
                                </p>
                            </div>
                        )}

                        {/* Role Permissions Reference */}
                        <div className="rounded-md border border-[#1F1F1F] bg-[#0A0A0A] p-5 space-y-3">
                            <span className="font-bold text-white text-xs">Role Permissions</span>
                            <div className="space-y-2 text-[11px] text-[#A1A1A1]">
                                <div>
                                    <span className="font-bold text-white block">OWNER</span>
                                    <span>Full project control, delete project, manage members.</span>
                                </div>
                                <div>
                                    <span className="font-bold text-white block">ADMIN</span>
                                    <span>Manage team members, update environment variables, trigger redeploys.</span>
                                </div>
                                <div>
                                    <span className="font-bold text-white block">DEVELOPER</span>
                                    <span>Trigger deployments and edit environment variables.</span>
                                </div>
                                <div>
                                    <span className="font-bold text-[#666666] block">VIEWER</span>
                                    <span>Read-only access to deployment logs and metadata.</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
