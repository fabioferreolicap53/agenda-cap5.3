import React from 'react';
import { User } from '../types';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onNavigateToChat?: (userId: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onNavigateToChat }) => {
    if (!isOpen || !user) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-primary-dark">Perfil do Usuário</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-primary-dark transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Avatar and Name */}
                    <div className="flex flex-col items-center text-center">
                        <div
                            className="size-24 rounded-full bg-slate-100 bg-cover bg-center border-4 border-primary-dark/10 shadow-lg mb-4"
                            style={{ backgroundImage: user.avatar ? `url(${user.avatar})` : 'none' }}
                        >
                            {!user.avatar && (
                                <div className="flex items-center justify-center h-full text-3xl font-black text-slate-400 uppercase">
                                    {user.full_name ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U'}
                                </div>
                            )}
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-1">{user.full_name}</h3>
                        {user.username && (
                            <p className="text-sm text-slate-500 font-medium">@{user.username}</p>
                        )}
                    </div>

                    {/* User Details */}
                    <div className="space-y-3">
                        {user.role && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <span className="material-symbols-outlined text-primary-dark">badge</span>
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Função</p>
                                    <p className="text-sm font-bold text-slate-900">{user.role}</p>
                                </div>
                            </div>
                        )}

                        {user.observations && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <span className="material-symbols-outlined text-primary-dark">description</span>
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Observações</p>
                                    <p className="text-sm font-bold text-slate-900">{user.observations}</p>
                                </div>
                            </div>
                        )}

                        {user.phone && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <span className="material-symbols-outlined text-primary-dark">phone</span>
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telefone</p>
                                    <p className="text-sm font-bold text-slate-900">{user.phone}</p>
                                </div>
                            </div>
                        )}

                        {user.email && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <span className="material-symbols-outlined text-primary-dark">email</span>
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</p>
                                    <p className="text-sm font-bold text-slate-900 break-all">{user.email}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    {onNavigateToChat && (
                        <button
                            onClick={() => {
                                onNavigateToChat(user.id);
                                onClose();
                            }}
                            className="w-full px-4 py-3 bg-primary-dark hover:bg-primary-light text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-primary-dark/20 active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">chat</span>
                            Enviar Mensagem
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
