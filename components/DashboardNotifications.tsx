import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface DashboardNotificationsProps {
    user: User | null;
    onViewAppointment: (appointmentId: string) => void;
}

export const DashboardNotifications: React.FC<DashboardNotificationsProps> = ({ user, onViewAppointment }) => {
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchRequests = async () => {
        if (!user) return;

        // Fetch pending requests (where I am the organizer and others requested)
        const { data: reqData } = await supabase
            .from('appointment_attendees')
            .select('*, appointments!inner(title, date, created_by), profiles:user_id(full_name, avatar)')
            .eq('status', 'requested')
            .eq('appointments.created_by', user.id);

        if (reqData) {
            setPendingRequests(reqData);
        }
    };

    useEffect(() => {
        fetchRequests();

        const channel = supabase.channel('dashboard_requests')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'appointment_attendees'
            }, () => {
                fetchRequests();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const handleResponse = async (e: React.MouseEvent, invitationId: string, status: 'accepted' | 'declined') => {
        e.stopPropagation();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('appointment_attendees')
                .update({ status })
                .eq('id', invitationId);

            if (error) throw error;
            await fetchRequests();
        } catch (err: any) {
            alert('Erro ao processar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    if (pendingRequests.length === 0) return null;

    return (
        <div className="mx-4 md:mx-8 mt-6 mb-2">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 md:p-6 shadow-sm flex flex-col md:flex-row gap-4 md:gap-8 items-start md:items-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>

                <div className="flex items-center gap-4 shrink-0">
                    <div className="size-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-inner">
                        <span className="material-symbols-outlined text-2xl animate-pulse">group_add</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-indigo-900 uppercase tracking-wide mb-1">Solicitações Pendentes</h3>
                        <p className="text-xs text-indigo-600/80 font-medium">Você tem <strong className="text-indigo-700">{pendingRequests.length}</strong> pessoas aguardando aprovação para participar.</p>
                    </div>
                </div>

                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-x-auto pb-1 md:pb-0">
                    {pendingRequests.map(req => (
                        <div key={req.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-indigo-100 shadow-sm min-w-[280px]">
                            <div className="size-10 rounded-full bg-slate-100 bg-cover bg-center shrink-0 border border-slate-200" style={{ backgroundImage: req.profiles?.avatar ? `url(${req.profiles.avatar})` : 'none' }}>
                                {!req.profiles?.avatar && <span className="flex items-center justify-center h-full text-xs font-bold text-slate-400">{req.profiles?.full_name?.charAt(0)}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{req.profiles?.full_name}</p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">Em: <span className="font-semibold text-indigo-600">{req.appointments.title}</span></p>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={(e) => handleResponse(e, req.id, 'accepted')}
                                    disabled={loading}
                                    className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-500 hover:text-white transition-colors"
                                    title="Aceitar"
                                >
                                    <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                                </button>
                                <button
                                    onClick={(e) => handleResponse(e, req.id, 'declined')}
                                    disabled={loading}
                                    className="p-1.5 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
                                    title="Negar"
                                >
                                    <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
