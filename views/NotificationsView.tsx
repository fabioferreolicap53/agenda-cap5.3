import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Attendee, Appointment } from '../types';

interface NotificationsViewProps {
    user: User | null;
    onViewAppointment: (appointmentId: string) => void;
    onNavigateToChat?: (userId: string) => void;
    onToggleSidebar?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ user, onViewAppointment, onNavigateToChat, onToggleSidebar }) => {
    const [invitations, setInvitations] = useState<(Attendee & { appointments: { title: string, date: string, created_by: string } })[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchNotifications = async () => {
        if (!user) return;
        setLoading(true);

        try {
            // 1. Fetch invitations (where I am invited)
            const { data: invData, error: invError } = await supabase
                .from('appointment_attendees')
                .select('*, appointments(title, date, created_by)')
                .eq('user_id', user.id)
                .eq('status', 'pending');

            if (invError) throw invError;
            if (invData) {
                setInvitations(invData as any);
            }

            // 2. Fetch pending requests (where I am the organizer)
            // Fetch all specific requests visible due to RLS, then filter in memory for safety
            const { data: reqData, error: reqError } = await supabase
                .from('appointment_attendees')
                .select('*, appointments(title, date, created_by), profiles:user_id(full_name, avatar)')
                .eq('status', 'requested');

            if (reqError) throw reqError;
            if (reqData) {
                // Filter: only keep requests where I am the creator of the appointment
                const myRequests = reqData.filter((r: any) => r.appointments?.created_by === user.id);
                setPendingRequests(myRequests);
            }
        } catch (err: any) {
            console.error('Error fetching notifications:', err.message);
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
                        className="md:hidden size-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
                    >
                        <span className="material-symbols-outlined text-slate-600">menu</span>
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
                                <div key={inv.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-6 md:items-center group">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black text-primary-dark uppercase tracking-widest">Compromisso</span>
                                            <span className="text-[10px] text-slate-400">•</span>
                                            <span className="text-[10px] font-bold text-slate-400">{new Date(inv.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <h4 className="text-base font-black text-slate-900 mb-1 group-hover:text-primary-dark transition-colors">{inv.appointments.title}</h4>
                                        <p className="text-xs text-slate-500 font-medium">Você foi convidado para participar deste evento.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        <button
                                            onClick={() => onNavigateToChat?.(inv.appointments.created_by)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">chat</span>
                                            Chat
                                        </button>
                                        <button
                                            onClick={() => onViewAppointment(inv.appointment_id)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                                            Ver
                                        </button>
                                        <div className="w-px h-8 bg-slate-100 mx-1 hidden md:block"></div>
                                        <button
                                            onClick={() => handleResponse(inv.id, 'accepted')}
                                            disabled={actionLoading}
                                            className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                                        >
                                            Aceitar
                                        </button>
                                        <button
                                            onClick={() => handleResponse(inv.id, 'declined')}
                                            disabled={actionLoading}
                                            className="px-6 py-2 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50"
                                        >
                                            Recusar
                                        </button>
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
                                <div key={req.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-6 md:items-center group">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="size-12 rounded-2xl bg-slate-100 bg-cover bg-center shrink-0 border border-slate-200" style={{ backgroundImage: req.profiles?.avatar ? `url(${req.profiles.avatar})` : 'none' }}>
                                            {!req.profiles?.avatar && <span className="flex items-center justify-center h-full text-lg font-black text-slate-400">{req.profiles?.full_name?.charAt(0)}</span>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{req.profiles?.full_name}</h4>
                                            <p className="text-xs text-slate-500 font-medium truncate">Quer participar de: <span className="font-black text-slate-900">{req.appointments?.title}</span></p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        <button
                                            onClick={() => onNavigateToChat?.(req.user_id)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">chat</span>
                                            Conversar
                                        </button>
                                        <button
                                            onClick={() => onViewAppointment(req.appointment_id)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                                            Ver Evento
                                        </button>
                                        <div className="w-px h-8 bg-slate-100 mx-1 hidden md:block"></div>
                                        <button
                                            onClick={() => handleResponse(req.id, 'accepted')}
                                            disabled={actionLoading}
                                            className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                                        >
                                            Aprovar
                                        </button>
                                        <button
                                            onClick={() => handleResponse(req.id, 'declined')}
                                            disabled={actionLoading}
                                            className="px-6 py-2 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50"
                                        >
                                            Negar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
