import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Attendee } from '../types';

interface NotificationCenterProps {
    user: User | null;
    onViewAppointment: (appointmentId: string) => void;
    onNavigateToChat?: (userId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ user, onViewAppointment, onNavigateToChat }) => {
    const [invitations, setInvitations] = useState<(Attendee & { appointments: { title: string, date: string, created_by: string } })[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedIds, setExpandedIds] = useState<string[]>([]);

    const [pendingRequests, setPendingRequests] = useState<any[]>([]);

    const fetchInvitations = async () => {
        if (!user) return;

        // 1. Fetch invitations (where I am invited)
        const { data: invData } = await supabase
            .from('appointment_attendees')
            .select('*, appointments(title, date, created_by)')
            .eq('user_id', user.id)
            .eq('status', 'pending');

        if (invData) {
            setInvitations(invData as any);
        }

        // 2. Fetch pending requests (where I am the organizer and others requested)
        const { data: reqData, error } = await supabase
            .from('appointment_attendees')
            .select('*, appointments!inner(title, date, created_by), profiles:user_id(full_name, avatar)')
            .eq('status', 'requested')
            .eq('appointments.created_by', user.id);

        if (error) {
            console.error('Error fetching requests:', error);
        }

        if (reqData) {
            setPendingRequests(reqData);
        }
    };

    useEffect(() => {
        fetchInvitations();

        // Realtime subscription for new invitations and requests
        const channel = supabase.channel('invitation_notifications')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'appointment_attendees'
                // Removed filter to catch all relevant changes since we need to check joined table
            }, () => {
                fetchInvitations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleResponse = async (e: React.MouseEvent, invitationId: string, status: 'accepted' | 'declined') => {
        e.stopPropagation();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('appointment_attendees')
                .update({ status })
                .eq('id', invitationId);

            if (error) throw error;

            // Refresh invitations locally
            await fetchInvitations();
        } catch (err: any) {
            alert('Erro ao responder: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (invitations.length === 0 && pendingRequests.length === 0) return null;

    return (
        <div className="mb-6 px-1 shrink-0 space-y-4">
            {/* Invitations Section */}
            {invitations.length > 0 && (
                <div className="bg-primary-dark rounded-xl p-3 shadow-lg border border-primary-light/20 flex flex-col max-h-[350px]">
                    <div className="flex items-center gap-2 mb-3 shrink-0">
                        <span className="material-symbols-outlined text-white text-sm animate-pulse">notifications</span>
                        <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Convites ({invitations.length})</h4>
                    </div>
                    <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar-light flex-1">
                        {invitations.map(invitation => {
                            const isExpanded = expandedIds.includes(invitation.id);
                            return (
                                <div
                                    key={invitation.id}
                                    className={`bg-white/10 rounded-lg border border-white/5 group hover:bg-white/15 transition-all overflow-hidden ${isExpanded ? 'ring-1 ring-primary-light/30' : ''}`}
                                >
                                    <div
                                        onClick={() => toggleExpand(invitation.id)}
                                        className="p-2.5 cursor-pointer"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-[11px] font-bold truncate group-hover:text-primary-light transition-colors">{invitation.appointments.title}</p>
                                                <p className="text-white/60 text-[9px]">{new Date(invitation.appointments.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                            </div>
                                            <span className={`material-symbols-outlined text-white/40 text-[18px] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                expand_more
                                            </span>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-2.5 pb-2.5 space-y-2 pt-1 border-t border-white/5 animate-[fadeIn_0.2s]">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => onNavigateToChat?.(invitation.appointments.created_by)}
                                                    className="flex-1 bg-white/10 hover:bg-white/20 text-white text-[9px] font-bold flex items-center justify-center gap-1 transition-colors py-1.5 rounded-md"
                                                    title="Enviar Mensagem"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">chat</span>
                                                    Mensagem
                                                </button>
                                                <button
                                                    onClick={() => onViewAppointment(invitation.appointment_id)}
                                                    className="flex-1 bg-white/10 hover:bg-white/20 text-white text-[9px] font-bold flex items-center justify-center gap-1 transition-colors py-1.5 rounded-md"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">visibility</span>
                                                    Ver Detalhes
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => handleResponse(e, invitation.id, 'accepted')}
                                                    disabled={loading}
                                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black py-1.5 rounded-md transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    Aceitar
                                                </button>
                                                <button
                                                    onClick={(e) => handleResponse(e, invitation.id, 'declined')}
                                                    disabled={loading}
                                                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black py-1.5 rounded-md transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    Recusar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Requests Section */}
            {pendingRequests.length > 0 && (
                <div className="bg-indigo-600 rounded-xl p-3 shadow-lg border border-indigo-400/20 flex flex-col max-h-[350px]">
                    <div className="flex items-center gap-2 mb-3 shrink-0">
                        <span className="material-symbols-outlined text-white text-sm animate-pulse">group_add</span>
                        <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Solicitações ({pendingRequests.length})</h4>
                    </div>
                    <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar-light flex-1">
                        {pendingRequests.map(req => {
                            const isExpanded = expandedIds.includes(req.id);
                            return (
                                <div
                                    key={req.id}
                                    className={`bg-white/10 rounded-lg border border-white/5 group hover:bg-white/15 transition-all overflow-hidden ${isExpanded ? 'ring-1 ring-indigo-300/30' : ''}`}
                                >
                                    <div
                                        onClick={() => toggleExpand(req.id)}
                                        className="p-2.5 cursor-pointer"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="size-4 rounded-full bg-indigo-200 bg-cover bg-center" style={{ backgroundImage: req.profiles?.avatar ? `url(${req.profiles.avatar})` : 'none' }}></div>
                                                    <p className="text-white text-[11px] font-bold truncate">{req.profiles?.full_name}</p>
                                                </div>
                                                <p className="text-white/70 text-[9px] truncate">Solicitou participar de: <span className="text-white font-bold">{req.appointments.title}</span></p>
                                            </div>
                                            <span className={`material-symbols-outlined text-white/40 text-[18px] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                expand_more
                                            </span>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-2.5 pb-2.5 space-y-2 pt-1 border-t border-white/5 animate-[fadeIn_0.2s]">
                                            <button
                                                onClick={() => onViewAppointment(req.appointment_id)}
                                                className="w-full bg-white/10 hover:bg-white/20 text-white text-[9px] font-bold flex items-center justify-center gap-1 transition-colors py-1.5 rounded-md"
                                            >
                                                <span className="material-symbols-outlined text-[12px]">visibility</span>
                                                Ver Detalhes do Evento
                                            </button>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => handleResponse(e, req.id, 'accepted')}
                                                    disabled={loading}
                                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black py-1.5 rounded-md transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    Aceitar
                                                </button>
                                                <button
                                                    onClick={(e) => handleResponse(e, req.id, 'declined')}
                                                    disabled={loading}
                                                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black py-1.5 rounded-md transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    Negar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
