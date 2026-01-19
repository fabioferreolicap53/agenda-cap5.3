import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Sector } from '../types';
import { Footer } from '../components/Footer';

interface LoginViewProps {
  onLogin?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [observations, setObservations] = useState('');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot_password'>('login');
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  useEffect(() => {
    const fetchSectors = async () => {
      const { data, error } = await supabase.from('sectors').select('*').order('name');
      if (data) setSectors(data);
    };
    fetchSectors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else if (mode === 'forgot_password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password', // Redirect to the app after reset
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação!' });
      } else {
        const generatedUsername = fullName.trim().toLowerCase().replace(/\s+/g, '.');

        // Auth sign up - Profile will be created by database trigger
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              username: generatedUsername,
              sector_id: sectorId || null,
              observations: observations || null
            }
          }
        });
        if (authError) throw authError;

        setMessage({ type: 'success', text: 'Verifique seu e-mail para confirmar o cadastro!' });
        setMode('login');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Ocorreu um erro inesperado' });
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
                  <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                  <path d="M16 2V6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                  <path d="M8 2V6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                  <path d="M3 10H21" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path>
                  <path d="M12 11.5L8.5 18.5H10L10.75 16.8H13.25L14 18.5H15.5L12 11.5ZM11.15 15.6L12 13.8L12.85 15.6H11.15Z" fill="currentColor"></path>
                </svg>
              </div>
              <h1 className="text-primary tracking-tight text-3xl font-bold leading-tight text-center">
                Agenda CAP5.3
              </h1>
              <p className="text-slate-400 text-sm mt-3 font-medium text-center">
                {mode === 'login' ? 'Agendamento simplificado' : mode === 'signup' ? 'Crie sua conta corporativa' : 'Recupere seu acesso'}
              </p>
            </div>

            {message && (
              <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                {message.text}
              </div>
            )}

            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <>
                  <div className="flex flex-col w-full">
                    <label className="flex flex-col w-full">
                      <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">Nome do Usuário</span>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">person</span>
                        <input
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="flex w-full rounded-xl text-slate-900 focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-primary h-14 placeholder:text-slate-400 pl-12 pr-4 text-sm font-medium transition-all"
                          placeholder="Ex: João Silva"
                          type="text"
                        />
                      </div>
                    </label>
                  </div>
                  <div className="flex flex-col w-full">
                    <label className="flex flex-col w-full">
                      <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">Setor</span>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">work</span>
                        <select
                          required
                          value={sectorId}
                          onChange={(e) => setSectorId(e.target.value)}
                          className="flex w-full rounded-xl text-slate-900 focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-primary h-14 placeholder:text-slate-400 pl-12 pr-4 text-sm font-medium transition-all appearance-none cursor-pointer"
                        >
                          <option value="">Selecione seu setor</option>
                          {sectors.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                      </div>
                    </label>
                  </div>
                  <div className="flex flex-col w-full">
                    <label className="flex flex-col w-full">
                      <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">Observações</span>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">description</span>
                        <input
                          value={observations}
                          onChange={(e) => setObservations(e.target.value)}
                          className="flex w-full rounded-xl text-slate-900 focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-primary h-14 placeholder:text-slate-400 pl-12 pr-4 text-sm font-medium transition-all"
                          placeholder="Cargo, especialidade ou recado..."
                          type="text"
                        />
                      </div>
                    </label>
                  </div>
                </>
              )}
              <div className="flex flex-col w-full">
                <label className="flex flex-col w-full">
                  <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">E-mail</span>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">alternate_email</span>
                    <input
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="flex w-full rounded-xl text-slate-900 focus:outline-0 focus:ring-4 focus:ring-primary/10 border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-primary h-14 placeholder:text-slate-400 pl-12 pr-4 text-sm font-medium transition-all"
                      placeholder="nome@empresa.com"
                      type="email"
                    />
                  </div>
                </label>
              </div>

              {mode !== 'forgot_password' && (
                <div className="flex flex-col w-full">
                  <label className="flex flex-col w-full">
                    <span className="text-slate-600 text-xs font-bold uppercase tracking-wider leading-normal pb-2 ml-1">Senha</span>
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
              )}

              {mode === 'login' && (
                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => setMode('forgot_password')}
                    className="text-primary text-xs font-bold hover:text-primary-light transition-colors"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              )}

              <button
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-primary h-14 px-4 text-white text-sm font-bold tracking-widest uppercase transition-all hover:bg-primary-light active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                type="submit"
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Cadastrar' : 'Enviar Link de Recuperação'
                )}
              </button>
            </form>

            <div className="flex items-center my-10">
              <div className="flex-grow border-t border-slate-100"></div>
              <span className="px-4 text-[10px] text-slate-300 uppercase font-black tracking-[0.25em]">Acesso Restrito</span>
              <div className="flex-grow border-t border-slate-100"></div>
            </div>

            <div className="text-center">
              <p className="text-sm text-slate-400 font-medium">
                {mode === 'login' ? 'Ainda não tem conta?' : mode === 'signup' ? 'Já possui conta?' : 'Lembrou sua senha?'}
                <button
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-primary font-bold hover:underline ml-1"
                >
                  {mode === 'login' ? 'Criar conta' : 'Fazer login'}
                </button>
              </p>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    </div>
  );
};

