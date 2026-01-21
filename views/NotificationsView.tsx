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
    const [invitations, setInvitations] = useState<(Attendee & { appointments: { title: string, date: string, created_by: string }, profiles?: { full_name: string, avatar: string | null } })[]>([]);
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
    const [viewTab, setViewTab] = useState<'pending' | 'sent' | 'history'>('pending');

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
        <div className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-hidden">
            <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
                <div className="h-16 px-4 md:px-8 flex items-center justify-between max-w-7xl mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onToggleSidebar}
                            className="p-2 -ml-2 hover:bg-slate-100 rounded-xl transition-colors md:hidden"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Notificações</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Solicitações e Convites</p>
                        </div>
                    </div>

                    {/* Tab Switcher - Premium Style */}
                    <div className="hidden md:flex bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50 backdrop-blur-sm">
                        <button
                            onClick={() => setViewTab('pending')}
                            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewTab === 'pending' ? 'bg-white text-primary-dark shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                            Pendentes
                            {(invitations.length + pendingRequests.length) > 0 && <span className="size-2 rounded-full bg-orange-500 animate-pulse"></span>}
                        </button>
                        <button
                            onClick={() => setViewTab('sent')}
                            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewTab === 'sent' ? 'bg-white text-primary-dark shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">outbox</span>
                            Enviados
                        </button>
                        <button
                            onClick={() => setViewTab('history')}
                            className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${viewTab === 'history' ? 'bg-white text-primary-dark shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">history</span>
                            Histórico
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {loading && <div className="size-2 bg-primary-dark rounded-full animate-ping"></div>}
                        <div className="size-8 md:size-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <span className="material-symbols-outlined text-slate-400 text-[20px]">notifications</span>
                        </div>
                    </div>
                </div>

                {/* Mobile Tab Switcher */}
                <div className="md:hidden border-t border-slate-100 flex p-2 gap-1 overflow-x-auto custom-scrollbar-hide bg-white/50">
                    <button
                        onClick={() => setViewTab('pending')}
                        className={`flex-1 shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${viewTab === 'pending' ? 'bg-primary-dark text-white' : 'text-slate-400 bg-transparent'}`}
                    >
                        Pendentes
                        {(invitations.length + pendingRequests.length) > 0 && <span className="size-1.5 rounded-full bg-orange-400"></span>}
                    </button>
                    <button
                        onClick={() => setViewTab('sent')}
                        className={`flex-1 shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${viewTab === 'sent' ? 'bg-primary-dark text-white' : 'text-slate-400 bg-transparent'}`}
                    >
                        Enviados
                    </button>
                    <button
                        onClick={() => setViewTab('history')}
                        className={`flex-1 shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${viewTab === 'history' ? 'bg-primary-dark text-white' : 'text-slate-400 bg-transparent'}`}
                    >
                        Histórico
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar mt-4">
                <div className="p-4 md:p-8 max-w-7xl mx-auto w-full pb-24">

                    {/* PENDING TAB */}
                    {viewTab === 'pending' && (
                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {/* Invitations Sub-Section */}
                            <section>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-2xl bg-primary-dark/10 text-primary-dark flex items-center justify-center shadow-sm">
                                            <span className="material-symbols-outlined">mail</span>
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Convites para Você</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{invitations.length} pendentes</p>
                                        </div>
                                    </div>
                                </div>

                                {invitations.length === 0 ? (
                                    <div className="bg-white/40 backdrop-blur-md border border-slate-200/60 rounded-[32px] p-12 text-center group hover:bg-white/60 transition-all duration-500 shadow-sm">
                                        <div className="size-20 bg-slate-100 rounded-[24px] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                                            <span className="material-symbols-outlined text-4xl text-slate-300">notifications_off</span>
                                        </div>
                                        <h4 className="text-base font-black text-slate-800 mb-2">Tudo em dia!</h4>
                                        <p className="text-xs text-slate-500 font-medium max-w-[240px] mx-auto">Você não tem novos convites para eventos no momento.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                                        {invitations.map(inv => (
                                            <div key={inv.id} className="bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-[28px] p-5 md:p-6 shadow-sm hover:shadow-xl hover:shadow-slate-200/40 hover:-translate-y-1 transition-all duration-500 group relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-dark/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary-dark/10 transition-colors"></div>

                                                <div className="relative flex flex-col h-full">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-primary-dark uppercase tracking-widest bg-primary-dark/5 px-2.5 py-1 rounded-lg border border-primary-dark/10">Evento</span>
                                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                                                {new Date(inv.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <h4 className="text-lg font-black text-slate-900 mb-2 group-hover:text-primary-dark transition-colors line-clamp-1">{inv.appointments.title}</h4>
                                                    <p className="text-xs text-slate-500 font-medium mb-6 leading-relaxed">Você foi convidado para participar deste evento por <span className="text-slate-800 font-bold">{inv.profiles?.full_name || 'um organizador'}</span>.</p>

                                                    <div className="mt-auto pt-6 border-t border-slate-100/80 flex flex-wrap gap-2">
                                                        <div className="flex gap-2 w-full sm:w-auto">
                                                            <button
                                                                onClick={() => onNavigateToChat?.(inv.appointments.created_by)}
                                                                className="flex-1 size-10 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center tooltip-trigger"
                                                                title="Abrir Conversa"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">chat</span>
                                                            </button>
                                                            <button
                                                                onClick={() => onViewAppointment(inv.appointment_id)}
                                                                className="flex-1 px-4 h-10 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center gap-2"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                                                                Ver
                                                            </button>
                                                        </div>
                                                        <div className="flex gap-2 w-full sm:flex-1">
                                                            <button
                                                                onClick={() => handleResponse(inv.id, 'accepted')}
                                                                disabled={actionLoading}
                                                                className="flex-1 h-10 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                            >
                                                                Aceitar
                                                            </button>
                                                            <button
                                                                onClick={() => handleResponse(inv.id, 'declined')}
                                                                disabled={actionLoading}
                                                                className="flex-1 h-10 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                            >
                                                                Recusar
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <div className="h-px bg-slate-200/50 w-full"></div>

                            {/* Participation Requests Sub-Section */}
                            <section>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                                            <span className="material-symbols-outlined">group_add</span>
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Pedidos de Participação</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{pendingRequests.length} solicitações</p>
                                        </div>
                                    </div>
                                </div>

                                {pendingRequests.length === 0 ? (
                                    <div className="bg-white/40 backdrop-blur-md border border-slate-200/60 rounded-[32px] p-12 text-center group hover:bg-white/60 transition-all duration-500 shadow-sm">
                                        <div className="size-20 bg-slate-100 rounded-[24px] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                                            <span className="material-symbols-outlined text-4xl text-slate-300">person_off</span>
                                        </div>
                                        <h4 className="text-base font-black text-slate-800 mb-2">Sem solicitações</h4>
                                        <p className="text-xs text-slate-500 font-medium max-w-[240px] mx-auto">Ninguém solicitou participar dos seus eventos recentemente.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {pendingRequests.map(req => (
                                            <div key={req.id} className="bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-[28px] p-5 md:p-6 shadow-sm hover:shadow-xl hover:shadow-indigo-200/30 transition-all duration-500 flex flex-col md:flex-row gap-5 md:items-center group">
                                                <div className="flex items-center gap-5 flex-1 min-w-0">
                                                    <div
                                                        className="size-16 rounded-[22px] bg-slate-200 bg-cover bg-center shrink-0 border-2 border-white shadow-md cursor-pointer hover:scale-105 transition-transform duration-300 relative overflow-hidden group/avatar"
                                                        style={{ backgroundImage: req.profiles?.avatar ? `url(${req.profiles.avatar})` : 'none' }}
                                                        onClick={async () => {
                                                            const { data: fullProfile } = await supabase.from('profiles').select('*').eq('id', req.user_id).single();
                                                            let sectorName = '';
                                                            if (fullProfile?.sector_id) {
                                                                const { data: sector } = await supabase.from('sectors').select('name').eq('id', fullProfile.sector_id).single();
                                                                if (sector) sectorName = sector.name;
                                                            }
                                                            if (fullProfile) {
                                                                setSelectedUserProfile({ ...fullProfile, email: '' } as User);
                                                                setSelectedSectorName(sectorName);
                                                                setIsProfileModalOpen(true);
                                                            }
                                                        }}
                                                    >
                                                        {!req.profiles?.avatar && <span className="flex items-center justify-center h-full text-2xl font-black text-slate-400">{req.profiles?.full_name?.charAt(0)}</span>}
                                                        <div className="absolute inset-0 bg-indigo-600/0 group-hover/avatar:bg-indigo-600/20 transition-colors flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-white opacity-0 group-hover/avatar:opacity-100 scale-50 group-hover/avatar:scale-100 transition-all">visibility</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">{req.profiles?.full_name}</h4>
                                                            <span className="size-1.5 rounded-full bg-indigo-500"></span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 font-medium">Solicitou entrada no evento:</p>
                                                        <p className="text-sm font-black text-slate-800 truncate">{req.appointments?.title}</p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0 md:bg-slate-50 md:p-2 md:rounded-2xl">
                                                    <button
                                                        onClick={() => onNavigateToChat?.(req.user_id)}
                                                        className="flex-1 md:size-11 h-11 px-4 md:px-0 bg-white md:bg-white text-slate-600 rounded-xl md:rounded-lg text-xs font-black shadow-sm hover:shadow-md hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                                                        title="Conversar"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">chat</span>
                                                        <span className="md:hidden">Conversar</span>
                                                    </button>
                                                    <button
                                                        onClick={() => onViewAppointment(req.appointment_id)}
                                                        className="flex-1 md:size-11 h-11 px-4 md:px-0 bg-white md:bg-white text-slate-600 rounded-xl md:rounded-lg text-xs font-black shadow-sm hover:shadow-md hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                                                        title="Ver Evento"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                                                        <span className="md:hidden">Ver Evento</span>
                                                    </button>
                                                    <div className="w-px h-11 bg-slate-200 mx-1 hidden md:block"></div>
                                                    <button
                                                        onClick={() => handleResponse(req.id, 'accepted')}
                                                        disabled={actionLoading}
                                                        className="flex-[2] md:flex-none md:h-11 h-11 px-6 bg-emerald-500 text-white rounded-xl md:rounded-lg text-xs font-black hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        Aprovar
                                                    </button>
                                                    <button
                                                        onClick={() => handleResponse(req.id, 'declined')}
                                                        disabled={actionLoading}
                                                        className="flex-1 md:flex-none md:size-11 h-11 bg-rose-50 text-rose-500 rounded-xl md:rounded-lg text-xs font-black hover:bg-rose-500 hover:text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
                                                        title="Negar"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">close</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {/* SENT TAB */}
                    {viewTab === 'sent' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="size-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm">
                                    <span className="material-symbols-outlined text-2xl">outbox</span>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Solicitações Enviadas</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens aguardando resposta de outros</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* My Requests to Events */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 px-2">
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b-2 border-amber-400 pb-1">Meus Pedidos ({sentRequests.length})</span>
                                    </div>
                                    <div className="grid gap-4">
                                        {sentRequests.length === 0 ? (
                                            <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-[28px] p-10 text-center">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum pedido enviado</p>
                                            </div>
                                        ) : sentRequests.map(req => (
                                            <div key={req.id} className="bg-white border border-slate-200/80 rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all group">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-black uppercase rounded-lg border border-amber-100">Aguardando</span>
                                                    <span className="text-[10px] font-bold text-slate-400">{req.appointments?.date ? new Date(req.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}</span>
                                                </div>
                                                <h4 className="text-lg font-black text-slate-900 mb-2 truncate">{req.appointments?.title}</h4>
                                                <div className="flex gap-2 mt-4">
                                                    <button onClick={() => onViewAppointment(req.appointment_id)} className="flex-1 h-10 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                        Destaques
                                                    </button>
                                                    <button onClick={() => handleCancelAction(req.id)} disabled={actionLoading} className="px-4 h-10 bg-rose-50 text-rose-500 rounded-xl text-xs font-black hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Invitations I sent */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 px-2">
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] border-b-2 border-blue-400 pb-1">Convites Realizados ({sentInvitations.length})</span>
                                    </div>
                                    <div className="grid gap-4">
                                        {sentInvitations.length === 0 ? (
                                            <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-[28px] p-10 text-center">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum convite enviado</p>
                                            </div>
                                        ) : sentInvitations.map(inv => (
                                            <div key={inv.id} className="bg-white border border-slate-200/80 rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="size-12 rounded-2xl bg-slate-100 bg-cover bg-center border border-slate-200 shrink-0" style={{ backgroundImage: inv.profiles?.avatar ? `url(${inv.profiles.avatar})` : 'none' }}>
                                                        {!inv.profiles?.avatar && <span className="flex items-center justify-center h-full text-lg font-black text-slate-400">{inv.profiles?.full_name?.charAt(0)}</span>}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-base font-black text-slate-900 truncate uppercase tracking-tight">{inv.profiles?.full_name}</h4>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{inv.appointments?.title}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => onNavigateToChat?.(inv.user_id)} className="flex-1 h-10 bg-slate-50 text-slate-600 rounded-xl text-xs font-black hover:bg-primary-dark hover:text-white transition-all flex items-center justify-center gap-2 border border-slate-100">
                                                        <span className="material-symbols-outlined text-[18px]">chat</span>
                                                        Chat
                                                    </button>
                                                    <button onClick={() => onViewAppointment(inv.appointment_id)} className="flex-1 h-10 bg-slate-50 text-slate-600 rounded-xl text-xs font-black hover:bg-primary-dark hover:text-white transition-all flex items-center justify-center gap-2 border border-slate-100">
                                                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                        Ver
                                                    </button>
                                                    <button onClick={() => handleCancelAction(inv.id)} disabled={actionLoading} className="px-4 h-10 bg-rose-50 text-rose-500 rounded-xl text-xs font-black hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px]">person_remove</span>
                                                        Remover
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* HISTORY TAB */}
                    {viewTab === 'history' && (
                        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="size-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center shadow-sm">
                                        <span className="material-symbols-outlined text-2xl">history</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Histórico de Atividade</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Últimas interações resolvidas</p>
                                    </div>
                                </div>
                            </div>

                            {historyItems.length === 0 ? (
                                <div className="bg-white/40 border border-slate-200/60 rounded-[32px] p-20 text-center">
                                    <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">history_toggle_off</span>
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhuma atividade registrada</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {historyItems.map(item => (
                                        <div key={item.id} className="glass border border-slate-200/50 rounded-[24px] p-5 flex items-center gap-5 hover:bg-white hover:shadow-lg hover:shadow-slate-200/30 transition-all duration-300 group">
                                            <div className="size-12 rounded-[18px] bg-slate-100 bg-cover bg-center border border-slate-100 shrink-0 shadow-inner" style={{ backgroundImage: item.profiles?.avatar ? `url(${item.profiles.avatar})` : 'none' }}>
                                                {!item.profiles?.avatar && <span className="flex items-center justify-center h-full text-base font-black text-slate-400">{item.profiles?.full_name?.charAt(0)}</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${item.status === 'accepted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                        {item.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400">{new Date(item.appointments?.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                </div>
                                                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                                                    {item.iAmOrganizer ? (
                                                        <>Você {item.status === 'accepted' ? 'aprovou' : 'negou'} <strong>{item.profiles?.full_name}</strong> para <strong>{item.appointments?.title}</strong></>
                                                    ) : (
                                                        <>{item.status === 'accepted' ? 'Seu pedido para' : 'Sua entrada em'} <strong>{item.appointments?.title}</strong> foi <strong>{item.status === 'accepted' ? 'aceito' : 'recusada'}</strong></>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex gap-2 shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => onViewAppointment(item.appointment_id)}
                                                    className="size-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-xl hover:bg-primary-dark hover:text-white transition-all"
                                                    title="Ver Evento"
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">visibility</span>
                                                </button>
                                                {!item.iAmOrganizer && (
                                                    <button
                                                        onClick={() => onNavigateToChat?.(item.appointments?.created_by)}
                                                        className="size-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-xl hover:bg-primary-dark hover:text-white transition-all"
                                                        title="Chat"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">chat</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
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
