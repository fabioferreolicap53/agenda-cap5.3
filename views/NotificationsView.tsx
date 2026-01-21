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
    const [invitations, setInvitations] = useState<(Attendee & { appointments: { title: string, date: string, created_by: string }, profiles?: { full_name: string, avatar: string | null, observations?: string | null } })[]>([]);
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
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

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

                if (apps && apps.length > 0) {
                    const creatorIds = apps.map(a => a.created_by);
                    const { data: creatorProfiles } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar, observations')
                        .in('id', creatorIds);

                    // Map apps AND profiles to invites
                    enrichedInvitations = myInvites.map(inv => {
                        const app = apps.find(a => a.id === inv.appointment_id);
                        if (!app) return null;
                        const profile = creatorProfiles?.find(p => p.id === app.created_by);
                        return { ...inv, appointments: app, profiles: profile };
                    }).filter(Boolean);
                }
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
            setLastUpdated(new Date());

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

    const handleCancelAction = async (itemId: string, appointmentId?: string, attendeeUserId?: string) => {
        if (!window.confirm('Tem certeza que deseja cancelar esta solicitação/convite?')) return;
        setActionLoading(true);
        try {
            console.log('Tentando cancelar:', { itemId, appointmentId, attendeeUserId });

            // Try to delete using the most specific filters available
            let query = supabase.from('appointment_attendees').delete();

            if (appointmentId && attendeeUserId) {
                query = query.match({ appointment_id: appointmentId, user_id: attendeeUserId });
            } else if (itemId) {
                query = query.eq('id', itemId);
            } else {
                throw new Error('Informações insuficientes.');
            }

            // Using select() to see if any rows were affected
            const { data, error } = await query.select();

            if (error) throw error;

            if (!data || data.length === 0) {
                console.warn('Nenhum registro deletado via filtro primário. Tentando backup...');
                // Fallback: try by ID if we have it and haven't tried yet
                if (itemId && (appointmentId && attendeeUserId)) {
                    const { data: retryData, error: retryError } = await supabase
                        .from('appointment_attendees')
                        .delete()
                        .eq('id', itemId)
                        .select();

                    if (retryError) throw retryError;
                    if (!retryData || retryData.length === 0) {
                        throw new Error('Não foi possível localizar o registro para exclusão (pode já ter sido removido ou restrição de permissão).');
                    }
                } else {
                    throw new Error('Não foi possível localizar o registro para exclusão.');
                }
            }

            alert('Cancelado com sucesso!');
            await fetchNotifications();
        } catch (err: any) {
            console.error('Erro detalhado ao cancelar:', err);
            alert('Erro ao cancelar: ' + (err.message || 'Erro desconhecido'));
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
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Solicitações e Convites</p>
                                <span className="size-1 rounded-full bg-slate-300 hidden sm:block"></span>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sinc: {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
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
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-1 duration-400">
                            {/* Received Invitations & Requests */}
                            <section>
                                <div className="flex items-center gap-2 mb-4 px-1">
                                    <span className="material-symbols-outlined text-primary-dark text-lg">move_to_inbox</span>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Recebidos para Ação</h3>
                                    <span className="h-px bg-slate-200 flex-1 ml-2"></span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {invitations.map(inv => (
                                        <div key={inv.id} className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div className="flex flex-col gap-0.5 flex-1">
                                                    <span className="text-[10px] font-black text-primary-dark uppercase tracking-widest leading-none">
                                                        CONVITE
                                                    </span>
                                                    <span className="text-[9px] font-medium text-slate-500 italic leading-tight">
                                                        Para participar de um evento ou compromisso criado por outro usuário
                                                    </span>
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 pt-1.5 shrink-0 bg-slate-50/50 px-2 py-0.5 rounded-md border border-slate-100">
                                                    <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                    {new Date(inv.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                            <h4 className="text-sm font-black text-slate-900 group-hover:text-primary-dark transition-colors line-clamp-1 mb-1">{inv.appointments.title}</h4>
                                            <div className="flex flex-col gap-0.5 mb-4">
                                                <p className="text-[10px] text-slate-500 font-medium">De: <span className="font-bold text-slate-700">{inv.profiles?.full_name || 'Organizador'}</span></p>
                                                {inv.profiles?.observations && (
                                                    <p className="text-[9px] text-slate-400 italic line-clamp-1">"{inv.profiles.observations}"</p>
                                                )}
                                            </div>

                                            <div className="flex gap-2 pt-3 border-t border-slate-50">
                                                <button onClick={() => handleResponse(inv.id, 'accepted')} disabled={actionLoading} className="flex-1 h-9 bg-emerald-500 text-white rounded-xl text-[10px] font-black hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200">Aceitar</button>
                                                <button onClick={() => handleResponse(inv.id, 'declined')} disabled={actionLoading} className="flex-1 h-9 bg-rose-500 text-white rounded-xl text-[10px] font-black hover:bg-rose-600 transition-all shadow-sm shadow-rose-200">Recusar</button>
                                                <button onClick={() => onViewAppointment(inv.appointment_id)} className="flex-1 h-9 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all" title="Ver Detalhes"><span className="material-symbols-outlined text-[18px]">visibility</span></button>
                                            </div>
                                        </div>
                                    ))}

                                    {pendingRequests.map(req => (
                                        <div key={req.id} className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div className="flex flex-col gap-0.5 flex-1">
                                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none">
                                                        SOLICITAÇÃO
                                                    </span>
                                                    <span className="text-[9px] font-medium text-slate-500 italic leading-tight">
                                                        Para participar de um evento ou compromisso criado por você
                                                    </span>
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 pt-1.5 shrink-0 bg-slate-50/50 px-2 py-0.5 rounded-md border border-slate-100">
                                                    <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                    {new Date(req.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="size-10 rounded-xl bg-slate-100 bg-cover bg-center border border-white shadow-sm shrink-0" style={{ backgroundImage: req.profiles?.avatar ? `url(${req.profiles.avatar})` : 'none' }}>
                                                    {!req.profiles?.avatar && <span className="flex items-center justify-center h-full text-xs font-black text-slate-400">{req.profiles?.full_name?.charAt(0)}</span>}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-[11px] font-black text-slate-900 truncate uppercase">{req.profiles?.full_name}</h4>
                                                    <p className="text-[9px] text-slate-500 font-medium truncate">No evento: {req.appointments?.title}</p>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 pt-3 border-t border-slate-50">
                                                <button onClick={() => handleResponse(req.id, 'accepted')} disabled={actionLoading} className="flex-1 h-9 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200">Aprovar</button>
                                                <button onClick={() => handleResponse(req.id, 'declined')} disabled={actionLoading} className="flex-1 h-9 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all" title="Recusar"><span className="material-symbols-outlined text-[18px]">close</span></button>
                                                <button onClick={() => onNavigateToChat?.(req.user_id)} className="flex-1 h-9 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all" title="Chat"><span className="material-symbols-outlined text-[18px]">chat</span></button>
                                                <button onClick={() => onViewAppointment(req.appointment_id)} className="flex-1 h-9 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all" title="Ver Detalhes"><span className="material-symbols-outlined text-[18px]">visibility</span></button>
                                            </div>
                                        </div>
                                    ))}

                                    {(invitations.length === 0 && pendingRequests.length === 0) && (
                                        <div className="col-span-full py-12 flex flex-col items-center justify-center bg-white/40 rounded-3xl border border-dashed border-slate-200">
                                            <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">done_all</span>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma ação pendente</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* SENT TAB */}
                    {viewTab === 'sent' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-1 duration-400">
                            <div className="flex items-center gap-2 mb-4 px-1">
                                <span className="material-symbols-outlined text-amber-600 text-lg">send</span>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Aguardando Resposta</h3>
                                <span className="h-px bg-slate-200 flex-1 ml-2"></span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {/* Combine and display with distinctive tags */}
                                {sentRequests.map(req => (
                                    <div key={req.id} className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[9px] font-black uppercase rounded-md border border-amber-100">Meu Pedido</span>
                                            <span className="text-[9px] font-bold text-slate-400">{req.appointments?.date ? new Date(req.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}</span>
                                        </div>
                                        <h4 className="text-sm font-black text-slate-900 mb-1 truncate">{req.appointments?.title}</h4>
                                        <p className="text-[10px] text-slate-500 font-medium mb-4">Aguardando aprovação do organizador</p>

                                        <div className="flex gap-2 pt-3 border-t border-slate-50">
                                            <button onClick={() => onViewAppointment(req.appointment_id)} className="flex-1 h-8 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">visibility</span> Ver
                                            </button>
                                            <button onClick={() => handleCancelAction(req.id, req.appointment_id, req.user_id)} disabled={actionLoading} className="px-3 h-8 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-black hover:bg-rose-500 hover:text-white transition-all">Cancelar</button>
                                        </div>
                                    </div>
                                ))}

                                {sentInvitations.map(inv => (
                                    <div key={inv.id} className="bg-white/80 border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black uppercase rounded-md border border-blue-100">Meu Convite</span>
                                            <span className="text-[9px] font-bold text-slate-400">{inv.appointments?.date ? new Date(inv.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}</span>
                                        </div>

                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="size-10 rounded-xl bg-slate-100 bg-cover bg-center border border-slate-200 shrink-0" style={{ backgroundImage: inv.profiles?.avatar ? `url(${inv.profiles.avatar})` : 'none' }}>
                                                {!inv.profiles?.avatar && <span className="flex items-center justify-center h-full text-[10px] font-black text-slate-400">{inv.profiles?.full_name?.charAt(0)}</span>}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-[11px] font-black text-slate-900 truncate uppercase">{inv.profiles?.full_name}</h4>
                                                <p className="text-[9px] text-slate-500 font-medium truncate">No evento: {inv.appointments?.title}</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-3 border-t border-slate-50">
                                            <button onClick={() => onViewAppointment(inv.appointment_id)} className="flex-1 h-8 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">visibility</span> Ver
                                            </button>
                                            <button onClick={() => onNavigateToChat?.(inv.user_id)} className="size-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-all"><span className="material-symbols-outlined text-[18px]">chat</span></button>
                                            <button onClick={() => handleCancelAction(inv.id, inv.appointment_id, inv.user_id)} disabled={actionLoading} className="size-8 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"><span className="material-symbols-outlined text-[18px]">person_remove</span></button>
                                        </div>
                                    </div>
                                ))}

                                {(sentRequests.length === 0 && sentInvitations.length === 0) && (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center bg-white/40 rounded-3xl border border-dashed border-slate-200">
                                        <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">outbox</span>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum item enviado</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* HISTORY TAB */}
                    {viewTab === 'history' && (
                        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-1 duration-400">
                            <div className="flex items-center gap-2 mb-4 px-1">
                                <span className="material-symbols-outlined text-slate-500 text-lg">history</span>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Atividades Recentes</h3>
                                <span className="h-px bg-slate-200 flex-1 ml-2"></span>
                            </div>

                            {historyItems.length === 0 ? (
                                <div className="bg-white/40 border border-slate-200/60 rounded-3xl p-12 text-center">
                                    <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">history_toggle_off</span>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum registro histórico</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {historyItems.map(item => (
                                        <div key={item.id} className="bg-white/60 border border-slate-200/40 rounded-xl p-3 flex items-center gap-4 hover:bg-white hover:shadow-sm transition-all duration-300 group">
                                            <div className="size-8 rounded-lg bg-slate-100 bg-cover bg-center border border-slate-100 shrink-0" style={{ backgroundImage: item.profiles?.avatar ? `url(${item.profiles.avatar})` : 'none' }}>
                                                {!item.profiles?.avatar && <span className="flex items-center justify-center h-full text-[10px] font-black text-slate-400">{item.profiles?.full_name?.charAt(0)}</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded ${item.status === 'accepted' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                        {item.status === 'accepted' ? 'Aceito' : 'Recusado'}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-400">{new Date(item.appointments?.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-600 font-medium truncate mt-0.5">
                                                    {item.iAmOrganizer ? (
                                                        <>Você {item.status === 'accepted' ? 'aprovou' : 'negou'} <strong>{item.profiles?.full_name}</strong> para <strong>{item.appointments?.title}</strong></>
                                                    ) : (
                                                        <>{item.status === 'accepted' ? 'Seu pedido para' : 'Sua entrada em'} <strong>{item.appointments?.title}</strong> foi <strong>{item.status === 'accepted' ? 'aceito' : 'recusada'}</strong></>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <button
                                                    onClick={() => onViewAppointment(item.appointment_id)}
                                                    className="size-7 flex items-center justify-center bg-slate-100 text-slate-400 rounded-lg hover:bg-primary-dark hover:text-white transition-all shadow-sm"
                                                    title="Ver Evento"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                </button>
                                                {!item.iAmOrganizer && (
                                                    <button
                                                        onClick={() => onNavigateToChat?.(item.appointments?.created_by)}
                                                        className="size-7 flex items-center justify-center bg-slate-100 text-slate-400 rounded-lg hover:bg-primary-dark hover:text-white transition-all shadow-sm"
                                                        title="Chat"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">chat</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleCancelAction(item.id, item.appointment_id, item.user_id)}
                                                    className="size-7 flex items-center justify-center bg-rose-50 text-rose-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                                    title="Excluir do Histórico"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
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
