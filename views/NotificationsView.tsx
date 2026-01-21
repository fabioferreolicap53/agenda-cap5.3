import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Attendee, Appointment } from '../types';
import { UserProfileModal } from '../components/UserProfileModal';

interface NotificationsViewProps {
    user: User | null;
    onViewAppointment: (appointmentId: string) => void;
    onNavigateToChat?: (userId: string) => void;
    onToggleSidebar?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ user, onViewAppointment, onNavigateToChat, onToggleSidebar }) => {
    const [invitations, setInvitations] = useState<(Attendee & { appointments: { title: string, date: string, created_by: string } })[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [historyItems, setHistoryItems] = useState<any[]>([]);
    const [sentRequests, setSentRequests] = useState<any[]>([]);
    const [sentInvitations, setSentInvitations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null);
    const [selectedSectorName, setSelectedSectorName] = useState<string>('');
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

    const fetchNotifications = async () => {
        const userId = user?.id;
        if (!userId) return;

        setLoading(true);
        setError(null);

        try {
            // ---------------------------------------------------------
            // 1. INVITATIONS (I am the attendee)
            // ---------------------------------------------------------
            // Get my invitations
            const { data: myInvites, error: invError } = await supabase
                .from('appointment_attendees')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'pending');

            if (invError) throw invError;

            let enrichedInvitations: any[] = [];
            if (myInvites && myInvites.length > 0) {
                const appIds = myInvites.map(inv => inv.appointment_id);
                const { data: apps } = await supabase
                    .from('appointments')
                    .select('id, title, date, created_by')
                    .in('id', appIds);

                // Map apps to invites
                enrichedInvitations = myInvites.map(inv => {
                    const app = apps?.find(a => a.id === inv.appointment_id);
                    return app ? { ...inv, appointments: app } : null;
                }).filter(Boolean);
            }
            setInvitations(enrichedInvitations);

            // ---------------------------------------------------------
            // 2. REQUESTS (I am the organizer)
            // ---------------------------------------------------------
            const { data: allRequests, error: reqError } = await supabase
                .from('appointment_attendees')
                .select('*')
                .eq('status', 'requested');

            if (reqError) throw reqError;

            let myPendingRequests: any[] = [];
            if (allRequests && allRequests.length > 0) {
                const reqAppIds = allRequests.map(r => r.appointment_id);
                // Fetch appointments for these requests
                const { data: reqApps } = await supabase
                    .from('appointments')
                    .select('id, title, date, created_by')
                    .in('id', reqAppIds);

                // Filter requests where I am the creator
                const validRequests = allRequests.filter(req => {
                    const app = reqApps?.find(a => a.id === req.appointment_id);
                    return app && app.created_by === userId;
                });

                // Now fetch profiles for these valid requests
                if (validRequests.length > 0) {
                    const userIds = validRequests.map(r => r.user_id);
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar')
                        .in('id', userIds);

                    myPendingRequests = validRequests.map(req => {
                        const app = reqApps?.find(a => a.id === req.appointment_id);
                        const profile = profiles?.find(p => p.id === req.user_id);
                        return {
                            ...req,
                            appointments: app,
                            profiles: profile
                        };
                    });
                }
            }

            setPendingRequests(myPendingRequests);

            // ---------------------------------------------------------
            // 3. HISTORY (Resolved requests where I am involved)
            // ---------------------------------------------------------
            const { data: resolvedItems, error: historyError } = await supabase
                .from('appointment_attendees')
                .select('*')
                .in('status', ['accepted', 'declined'])
                .order('id', { ascending: false }); // Sort by latest (ID is a good proxy if no created_at)

            if (historyError) throw historyError;

            let myHistory: any[] = [];
            if (resolvedItems && resolvedItems.length > 0) {
                const histAppIds = resolvedItems.map(r => r.appointment_id);
                const { data: histApps } = await supabase
                    .from('appointments')
                    .select('id, title, date, created_by')
                    .in('id', histAppIds);

                const histUserIds = resolvedItems.map(r => r.user_id);
                const { data: histProfiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar')
                    .in('id', histUserIds);

                myHistory = resolvedItems.map(req => {
                    const app = histApps?.find(a => a.id === req.appointment_id);
                    const profile = histProfiles?.find(p => p.id === req.user_id);

                    // Filter: I am the participant OR I am the organizer
                    const isIBeingParticipant = req.user_id === userId;
                    const isIBeingOrganizer = app && app.created_by === userId;

                    if (isIBeingParticipant || isIBeingOrganizer) {
                        return {
                            ...req,
                            appointments: app,
                            profiles: profile,
                            iAmOrganizer: isIBeingOrganizer
                        };
                    }
                    return null;
                }).filter(Boolean);
            }
            setHistoryItems(myHistory);

            // ---------------------------------------------------------
            // 4. SENT REQUESTS (Made by me to others)
            // ---------------------------------------------------------
            const { data: rawSentReqs, error: sentReqError } = await supabase
                .from('appointment_attendees')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'requested');

            if (sentReqError) throw sentReqError;

            let enrichedSentReqs: any[] = [];
            if (rawSentReqs && rawSentReqs.length > 0) {
                const sAppIds = rawSentReqs.map(r => r.appointment_id);
                const { data: sApps } = await supabase
                    .from('appointments')
                    .select('id, title, date, created_by')
                    .in('id', sAppIds);

                enrichedSentReqs = rawSentReqs.map(req => ({
                    ...req,
                    appointments: sApps?.find(a => a.id === req.appointment_id)
                }));
            }
            setSentRequests(enrichedSentReqs);

            // ---------------------------------------------------------
            // 5. SENT INVITATIONS (Invitations I sent to others)
            // ---------------------------------------------------------
            // To find invitations I sent, we find pending attendees in appointments I created
            const { data: myOwnedApps } = await supabase
                .from('appointments')
                .select('id')
                .eq('created_by', userId);

            let enrichedSentInvs: any[] = [];
            if (myOwnedApps && myOwnedApps.length > 0) {
                const myAppIds = myOwnedApps.map(a => a.id);
                const { data: rawSentInvs, error: sentInvError } = await supabase
                    .from('appointment_attendees')
                    .select('*')
                    .in('appointment_id', myAppIds)
                    .eq('status', 'pending');

                if (sentInvError) throw sentInvError;

                if (rawSentInvs && rawSentInvs.length > 0) {
                    const invUserIds = rawSentInvs.map(r => r.user_id);
                    const { data: invProfiles } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar')
                        .in('id', invUserIds);

                    const invAppIds = rawSentInvs.map(r => r.appointment_id);
                    const { data: invApps } = await supabase
                        .from('appointments')
                        .select('id, title, date')
                        .in('id', invAppIds);

                    enrichedSentInvs = rawSentInvs.map(inv => ({
                        ...inv,
                        profiles: invProfiles?.find(p => p.id === inv.user_id),
                        appointments: invApps?.find(a => a.id === inv.appointment_id)
                    }));
                }
            }
            setSentInvitations(enrichedSentInvs);

        } catch (err: any) {
            console.error('Error fetching notifications:', err.message);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();

        const channel = supabase.channel('notifications_view_changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'appointment_attendees'
            }, () => {
                fetchNotifications();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const handleResponse = async (invitationId: string, status: 'accepted' | 'declined') => {
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('appointment_attendees')
                .update({ status })
                .eq('id', invitationId);

            if (error) throw error;
            await fetchNotifications();
        } catch (err: any) {
            alert('Erro ao processar: ' + err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelAction = async (itemId: string) => {
        if (!window.confirm('Tem certeza que deseja cancelar esta solicitação/convite?')) return;
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('appointment_attendees')
                .delete()
                .eq('id', itemId);

            if (error) throw error;
            await fetchNotifications();
        } catch (err: any) {
            alert('Erro ao cancelar: ' + err.message);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-dark"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto">
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onToggleSidebar}
                        className="md:hidden size-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition-all text-slate-600"
                    >
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                    <h2 className="text-lg font-black text-slate-900 uppercase tracking-widest">Solicitações e Convites</h2>
                </div>
            </header>

            <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-8">
                {/* Invitations Section */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary-dark">mail</span>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Convites para Você ({invitations.length})</h3>
                    </div>
                    {invitations.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-20">notifications_off</span>
                            <p className="text-xs font-bold uppercase tracking-widest">Nenhum convite pendente</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {invitations.map(inv => (
                                <div key={inv.id} className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm flex flex-col md:flex-row gap-4 md:gap-6 md:items-center group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-[10px] font-black text-primary-dark uppercase tracking-widest bg-primary-dark/5 px-2 py-0.5 rounded">Compromisso</span>
                                            <span className="text-[10px] font-bold text-slate-400">{new Date(inv.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <h4 className="text-base font-black text-slate-900 mb-1 group-hover:text-primary-dark transition-colors line-clamp-1">{inv.appointments.title}</h4>
                                        <p className="text-xs text-slate-500 font-medium">Você foi convidado para participar deste evento.</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 md:gap-3 shrink-0 w-full md:w-auto">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <button
                                                onClick={() => onNavigateToChat?.(inv.appointments.created_by)}
                                                className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chat</span>
                                                <span className="md:hidden lg:inline">Conversa</span>
                                            </button>
                                            <button
                                                onClick={() => onViewAppointment(inv.appointment_id)}
                                                className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                <span className="md:hidden lg:inline">Ver evento</span>
                                            </button>
                                        </div>
                                        <div className="w-px h-8 bg-slate-100 mx-1 hidden md:block"></div>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <button
                                                onClick={() => handleResponse(inv.id, 'accepted')}
                                                disabled={actionLoading}
                                                className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px] md:hidden">check</span>
                                                Aceitar
                                            </button>
                                            <button
                                                onClick={() => handleResponse(inv.id, 'declined')}
                                                disabled={actionLoading}
                                                className="flex-1 px-4 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px] md:hidden">close</span>
                                                Recusar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Requests Section */}
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-indigo-600">group_add</span>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Solicitações de Participação ({pendingRequests.length})</h3>
                    </div>
                    {pendingRequests.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-20">person_off</span>
                            <p className="text-xs font-bold uppercase tracking-widest">Nenhuma solicitação aguardando</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {pendingRequests.map(req => (
                                <div key={req.id} className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm flex flex-col md:flex-row gap-4 md:gap-6 md:items-center group">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="size-12 rounded-2xl bg-slate-100 bg-cover bg-center shrink-0 border border-slate-200" style={{ backgroundImage: req.profiles?.avatar ? `url(${req.profiles.avatar})` : 'none' }}>
                                            {!req.profiles?.avatar && <span className="flex items-center justify-center h-full text-lg font-black text-slate-400">{req.profiles?.full_name?.charAt(0)}</span>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4
                                                onClick={async () => {
                                                    // Fetch full user profile and sectors
                                                    const { data: fullProfile } = await supabase
                                                        .from('profiles')
                                                        .select('*')
                                                        .eq('id', req.user_id)
                                                        .single();

                                                    let sectorName = '';
                                                    if (fullProfile?.sector_id) {
                                                        const { data: sector } = await supabase
                                                            .from('sectors')
                                                            .select('name')
                                                            .eq('id', fullProfile.sector_id)
                                                            .single();
                                                        if (sector) sectorName = sector.name;
                                                    }

                                                    if (fullProfile) {
                                                        setSelectedUserProfile({
                                                            id: fullProfile.id,
                                                            full_name: fullProfile.full_name,
                                                            role: fullProfile.role,
                                                            email: '',
                                                            observations: fullProfile.observations,
                                                            avatar: fullProfile.avatar,
                                                            username: fullProfile.username,
                                                            phone: fullProfile.phone,
                                                            status: fullProfile.status // Ensure status is passed
                                                        } as User);
                                                        setSelectedSectorName(sectorName); // Set sector name
                                                        setIsProfileModalOpen(true);
                                                    }
                                                }}
                                                className="text-base font-black text-slate-900 hover:text-indigo-600 transition-colors uppercase tracking-tight line-clamp-1 cursor-pointer"
                                            >
                                                {req.profiles?.full_name}
                                            </h4>
                                            <p className="text-xs text-slate-500 font-medium truncate">Quer participar de: <span className="font-black text-slate-900">{req.appointments?.title}</span></p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 md:gap-3 shrink-0 w-full md:w-auto">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <button
                                                onClick={() => onNavigateToChat?.(req.user_id)}
                                                className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chat</span>
                                                <span className="md:hidden lg:inline">Conversa</span>
                                            </button>
                                            <button
                                                onClick={() => onViewAppointment(req.appointment_id)}
                                                className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                <span className="md:hidden lg:inline">Ver evento</span>
                                            </button>
                                        </div>
                                        <div className="w-px h-8 bg-slate-100 mx-1 hidden md:block"></div>
                                        <div className="grid grid-cols-2 gap-2 sm:flex">
                                            <button
                                                onClick={() => handleResponse(req.id, 'accepted')}
                                                disabled={actionLoading}
                                                className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px] md:hidden">check</span>
                                                Aprovar
                                            </button>
                                            <button
                                                onClick={() => handleResponse(req.id, 'declined')}
                                                disabled={actionLoading}
                                                className="flex-1 px-4 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[18px] md:hidden">close</span>
                                                Negar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sent Items Section */}
                {(sentRequests.length > 0 || sentInvitations.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* My Requests */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-amber-500">outbox</span>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Suas Solicitações Enviadas ({sentRequests.length})</h3>
                            </div>
                            <div className="space-y-3">
                                {sentRequests.map(req => (
                                    <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 group">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Pendente</span>
                                                <span className="text-[10px] font-bold text-slate-400">{req.appointments?.date ? new Date(req.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data'}</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-amber-600 transition-colors">{req.appointments?.title}</h4>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => onViewAppointment(req.appointment_id)}
                                                className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5 border border-slate-100"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                Ver
                                            </button>
                                            <button
                                                onClick={() => handleCancelAction(req.id)}
                                                disabled={actionLoading}
                                                className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-black hover:bg-rose-100 transition-all flex items-center justify-center gap-1.5 border border-rose-100"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Sent Invitations */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-blue-500">rocket_launch</span>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Convites Enviados ({sentInvitations.length})</h3>
                            </div>
                            <div className="space-y-3">
                                {sentInvitations.map(inv => (
                                    <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 group">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 rounded-xl bg-slate-100 bg-cover bg-center shrink-0 border border-slate-200" style={{ backgroundImage: inv.profiles?.avatar ? `url(${inv.profiles.avatar})` : 'none' }}>
                                                {!inv.profiles?.avatar && <span className="flex items-center justify-center h-full text-sm font-black text-slate-400">{inv.profiles?.full_name?.charAt(0)}</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors uppercase tracking-tight">{inv.profiles?.full_name}</h4>
                                                <p className="text-[10px] text-slate-500 truncate italic">Evento: {inv.appointments?.title}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => onNavigateToChat?.(inv.user_id)}
                                                className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-black hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5 border border-slate-100"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">chat</span>
                                                Chat
                                            </button>
                                            <button
                                                onClick={() => handleCancelAction(inv.id)}
                                                disabled={actionLoading}
                                                className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-black hover:bg-rose-100 transition-all flex items-center justify-center gap-1.5 border border-rose-100"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">person_remove</span>
                                                Remover
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* History Section */}
                <div className="pt-4">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-slate-400">history</span>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Histórico de Atividades ({historyItems.length})</h3>
                    </div>
                    {historyItems.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-10">history_toggle_off</span>
                            <p className="text-xs font-bold uppercase tracking-widest">Nenhuma atividade recente</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {historyItems.slice(0, 15).map(item => (
                                <div key={item.id} className="bg-white/60 border border-slate-200 rounded-xl p-4 flex items-center gap-4 group hover:bg-white transition-all">
                                    <div className="size-10 rounded-xl bg-slate-100 bg-cover bg-center shrink-0 border border-slate-100" style={{ backgroundImage: item.profiles?.avatar ? `url(${item.profiles.avatar})` : 'none' }}>
                                        {!item.profiles?.avatar && <span className="flex items-center justify-center h-full text-sm font-black text-slate-400">{item.profiles?.full_name?.charAt(0)}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${item.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {item.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400">{new Date(item.appointments?.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium truncate">
                                            {item.iAmOrganizer ? (
                                                <>Você {item.status === 'accepted' ? 'aprovou' : 'negou'} <strong>{item.profiles?.full_name}</strong> em <strong>{item.appointments?.title}</strong></>
                                            ) : (
                                                <>{item.status === 'accepted' ? 'Sua participação' : 'Seu pedido'} em <strong>{item.appointments?.title}</strong> foi <strong>{item.status === 'accepted' ? 'aceito' : 'recusada'}</strong></>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => onViewAppointment(item.appointment_id)}
                                            className="size-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-primary-dark hover:text-white transition-all shadow-sm"
                                            title="Ver evento"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                                        </button>
                                        {!item.iAmOrganizer && (
                                            <button
                                                onClick={() => onNavigateToChat?.(item.appointments?.created_by)}
                                                className="size-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-primary-dark hover:text-white transition-all shadow-sm"
                                                title="Falar com organizador"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chat</span>
                                            </button>
                                        )}
                                        {item.iAmOrganizer && (
                                            <button
                                                onClick={() => onNavigateToChat?.(item.user_id)}
                                                className="size-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-primary-dark hover:text-white transition-all shadow-sm"
                                                title="Falar com solicitante"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chat</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <UserProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                user={selectedUserProfile}
                onNavigateToChat={onNavigateToChat}
                currentUser={user}
                sectorName={selectedSectorName}
            />
        </div>
    );
};
