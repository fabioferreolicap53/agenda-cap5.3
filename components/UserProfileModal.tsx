import React from 'react';
import { User } from '../types';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onNavigateToChat?: (userId: string) => void;
    sectorName?: string;
    currentUser?: User | null;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
    isOpen,
    onClose,
    user,
    onNavigateToChat,
    sectorName,
    currentUser
}) => {
    if (!isOpen || !user) return null;

    // Helper for status colors
    const getStatusColor = (status: string | undefined) => {
        const colors: Record<string, string> = {
            'online': 'bg-emerald-500',
            'busy': 'bg-rose-500',
            'away': 'bg-amber-500',
            'meeting': 'bg-purple-500',
            'lunch': 'bg-blue-500',
            'vacation': 'bg-indigo-500',
            'out_of_office': 'bg-slate-500'
        };
        return colors[status || 'online'] || 'bg-emerald-500';
    };

    const getStatusText = (status: string | undefined) => {
        const texts: Record<string, string> = {
            'online': 'Disponível',
            'busy': 'Ocupado',
            'away': 'Ausente',
            'meeting': 'Em Reunião',
            'lunch': 'Almoço',
            'vacation': 'Férias',
            'out_of_office': 'Em atividade externa'
        };
        return texts[status || 'online'] || 'Disponível';
    };

    const getStatusTextColor = (status: string | undefined) => {
        const colors: Record<string, string> = {
            'online': 'text-emerald-500',
            'busy': 'text-rose-500',
            'away': 'text-amber-500',
            'meeting': 'text-purple-500',
            'lunch': 'text-blue-500',
            'vacation': 'text-indigo-500',
            'out_of_office': 'text-slate-500'
        };
        return colors[status || 'online'] || 'text-emerald-500';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div
                className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-[zoomIn_0.3s_ease-out] relative border border-slate-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header/Background */}
                <div className="h-32 bg-gradient-to-br from-primary-dark to-primary-light relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 size-8 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors z-10"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Profile Info */}
                <div className="px-8 pb-10 pt-0 flex flex-col items-center -mt-16 relative">
                    <div
                        className="size-32 rounded-full border-4 border-white bg-cover bg-center shadow-2xl mb-4 bg-slate-100 flex items-center justify-center text-4xl font-black text-slate-300 uppercase relative"
                        style={{ backgroundImage: user.avatar ? `url('${user.avatar}')` : 'none' }}
                    >
                        {!user.avatar && (user.full_name ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U')}
                        <div
                            className={`absolute bottom-3 right-3 size-6 border-4 border-white rounded-full z-20 shadow-sm ${getStatusColor(user.status)}`}
                            title={getStatusText(user.status)}
                        ></div>
                    </div>

                    <h2 className="text-xl font-black text-slate-900 mb-0.5 text-center">{user.full_name}</h2>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${getStatusTextColor(user.status)}`}>
                        {getStatusText(user.status)}
                    </p>
                    {user.username && (
                        <span className="text-xs font-bold text-primary-dark bg-primary-dark/5 px-2.5 py-0.5 rounded-full mb-4">
                            @{user.username}
                        </span>
                    )}

                    <div className="w-full space-y-4 text-center mt-2">
                        {sectorName && (
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Setor</span>
                                <p className="text-xs font-bold text-slate-700">
                                    {sectorName}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Perfil</span>
                            <p className="text-xs font-bold text-slate-700">{user.role === 'Administrador' ? '🚀 Administrador' : '👥 Membro Normal'}</p>
                        </div>

                        {user.phone && (
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Telefone</span>
                                <p className="text-xs font-bold text-primary-dark flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">call</span>
                                    {user.phone}
                                </p>
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-100 w-full">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Observações</span>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl text-left italic">
                                {user.observations || 'Nenhuma observação detalhada para este membro.'}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="mt-8 w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95"
                    >
                        Fechar Perfil
                    </button>
                    {onNavigateToChat && user.id !== currentUser?.id && (
                        <button
                            onClick={() => {
                                onNavigateToChat(user.id);
                                onClose();
                            }}
                            className="mt-2 w-full bg-white hover:bg-slate-50 text-primary-dark border-2 border-primary-dark/20 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">chat</span>
                            Conversar agora
                        </button>
                    )}
                </div>
            </div>
            {/* Backdrop click to close */}
            <div className="absolute inset-0 -z-10" onClick={onClose}></div>
        </div>
    );
};
