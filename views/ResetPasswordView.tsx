import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Footer } from '../components/Footer';

interface ResetPasswordViewProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ onSuccess, onCancel }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'As senhas não coincidem.' });
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            setMessage({ type: 'success', text: 'Sua senha foi redefinida com sucesso!' });
            setTimeout(() => {
                onSuccess();
            }, 2000);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Ocorreu um erro ao redefinir a senha' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-surface font-sans text-slate-900 min-h-screen flex flex-col">
            <div className="relative flex h-full grow flex-col overflow-x-hidden">
                <div className="layout-container flex h-full grow flex-col items-center justify-center p-6">
                    <div className="flex flex-col w-full max-w-[440px] bg-white p-8 md:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                        <div className="flex flex-col items-center mb-10">
                            <div className="mb-6">
                                <svg className="w-16 h-16 text-primary" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 15V17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                                    <path d="M19 11H5C3.89543 11 3 11.8954 3 13V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V13C21 11.8954 20.1046 11 19 11Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                                    <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                                </svg>
                            </div>
                            <h1 className="text-primary tracking-tight text-3xl font-bold leading-tight text-center">
                                Agenda CAP5.3
                            </h1>
                            <p className="text-slate-400 text-sm mt-3 font-medium text-center">
                                Redefina sua senha
                            </p>
                        </div>

                        {message && (
                            <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                                {message.text}
                            </div>
                        )}

                        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                            <div className="flex flex-col w-full">
                                <label className="flex flex-col w-full">
                                    <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">Nova Senha</span>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                                        <input
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="flex w-full rounded-xl text-slate-900 focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-primary h-14 placeholder:text-slate-400 pl-12 pr-4 text-sm font-medium transition-all"
                                            placeholder="••••••••"
                                            type="password"
                                            minLength={6}
                                        />
                                    </div>
                                </label>
                            </div>

                            <div className="flex flex-col w-full">
                                <label className="flex flex-col w-full">
                                    <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">Confirmar Nova Senha</span>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock_reset</span>
                                        <input
                                            required
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="flex w-full rounded-xl text-slate-900 focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-primary h-14 placeholder:text-slate-400 pl-12 pr-4 text-sm font-medium transition-all"
                                            placeholder="••••••••"
                                            type="password"
                                            minLength={6}
                                        />
                                    </div>
                                </label>
                            </div>

                            <button
                                disabled={loading}
                                className="mt-2 flex w-full items-center justify-center rounded-xl bg-primary h-14 px-4 text-white text-sm font-bold tracking-widest uppercase transition-all hover:bg-primary-light active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                type="submit"
                            >
                                {loading ? (
                                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : 'Redefinir Senha'}
                            </button>

                            <button
                                type="button"
                                onClick={onCancel}
                                className="text-slate-400 text-xs font-bold hover:text-slate-600 transition-colors text-center"
                            >
                                Cancelar
                            </button>
                        </form>

                        <div className="flex items-center my-10">
                            <div className="flex-grow border-t border-slate-100"></div>
                            <span className="px-4 text-[10px] text-slate-300 uppercase font-black tracking-[0.25em]">Acesso Seguro</span>
                            <div className="flex-grow border-t border-slate-100"></div>
                        </div>
                    </div>

                    <Footer />
                </div>
            </div>
        </div>
    );
};
