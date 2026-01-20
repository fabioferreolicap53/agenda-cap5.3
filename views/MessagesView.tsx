import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User, Message } from '../types';
import { STATUS_OPTIONS } from '../constants';

interface MessagesViewProps {
    currentUser: User | null;
    initialSelectedUserId?: string | null;
    onOpenModal: (userId?: string) => void;
    onToggleSidebar?: () => void;
    onBack?: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ currentUser, initialSelectedUserId, onOpenModal, onToggleSidebar, onBack }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});
    const [selectedUserId, setSelectedUserId] = useState<string | null>(initialSelectedUserId || null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchUsers();
        fetchUnreadCounts();
    }, [currentUser]);

    useEffect(() => {
        if (selectedUserId && currentUser) {
            fetchMessages(selectedUserId);
            const subscription = supabase
                .channel('messages')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${currentUser.id}`,
                }, async (payload) => {
                    const newMessage = payload.new as Message;
                    if (newMessage.sender_id === selectedUserId) {
                        setMessages(prev => [...prev, newMessage]);
                        scrollToBottom();

                        // Mark as read immediately since we are viewing this chat
                        await supabase
                            .from('messages')
                            .update({ read: true })
                            .eq('id', newMessage.id);
                    } else {
                        // Increment unread count for other users
                        setUnreadCounts(prev => ({
                            ...prev,
                            [newMessage.sender_id]: (prev[newMessage.sender_id] || 0) + 1
                        }));
                    }
                })
                .subscribe();

            return () => {
                subscription.unsubscribe();
            };
        }
    }, [selectedUserId, currentUser]);

    const fetchUsers = async () => {
        // Fetch all users except current
        const { data } = await supabase.from('profiles').select('*').neq('id', currentUser?.id || '').order('full_name');
        if (data) setUsers(data as User[]);
    };

    const fetchUnreadCounts = async () => {
        if (!currentUser) return;

        const { data } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', currentUser.id)
            .eq('read', false);

        if (data) {
            const counts: { [key: string]: number } = {};
            data.forEach((msg: any) => {
                counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
            });
            setUnreadCounts(counts);
        }
    };

    const fetchMessages = async (otherUserId: string) => {
        setLoading(true);
        if (!currentUser) return;

        const { data } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (data) {
            setMessages(data as Message[]);
            scrollToBottom();

            // Mark unread messages from this user as read
            const unreadIds = (data as Message[])
                .filter(m => m.sender_id === otherUserId && !m.read)
                .map(m => m.id);

            if (unreadIds.length > 0) {
                await supabase
                    .from('messages')
                    .update({ read: true })
                    .in('id', unreadIds);

                // Clear unread count locally
                setUnreadCounts(prev => ({
                    ...prev,
                    [otherUserId]: 0
                }));
            }
        }
        setLoading(false);
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedUserId || !currentUser) return;

        setSending(true);
        const { data, error } = await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: selectedUserId,
            content: newMessage.trim(),
        }).select().single();

        if (error) {
            alert('Erro ao enviar mensagem');
        } else if (data) {
            setMessages(prev => [...prev, data as Message]);
            setNewMessage('');
            scrollToBottom();
        }
        setSending(false);
    };

    const deleteMessage = async (messageId: string) => {
        if (!confirm('Deseja excluir esta mensagem?')) return;

        try {
            const { error } = await supabase
                .from('messages')
                .delete()
                .eq('id', messageId);

            if (error) throw error;

            // Remove from local state
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (err: any) {
            alert('Erro ao excluir mensagem: ' + err.message);
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="flex-1 flex h-full overflow-hidden bg-slate-50">
            {/* Sidebar: Users List */}
            <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
                <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors mr-2 mb-1"
                            title="Retornar aos detalhes do último evento visualizado"
                        >
                            <span className="material-symbols-outlined text-lg">arrow_back</span>
                            <span className="text-xs font-bold uppercase tracking-wide">Voltar ao Evento</span>
                        </button>
                    )}
                    <button
                        onClick={onToggleSidebar}
                        className="md:hidden size-10 flex items-center justify-center rounded-xl bg-primary-dark text-white shadow-lg active:scale-90 transition-all"
                    >
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Mensagens</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Equipe</p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {users.map(user => (
                        <button
                            key={user.id}
                            onClick={() => setSelectedUserId(user.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${selectedUserId === user.id ? 'bg-slate-100 shadow-sm' : 'hover:bg-slate-50'}`}
                        >
                            <div className="size-10 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                                {user.avatar ? (
                                    <img src={user.avatar} alt={user.full_name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-slate-500 font-bold text-sm">{user.full_name.charAt(0)}</span>
                                )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <div className="flex justify-between items-baseline">
                                    <p className={`text-sm font-bold truncate ${selectedUserId === user.id ? 'text-slate-900' : 'text-slate-700'}`}>{user.full_name}</p>
                                    {unreadCounts[user.id] > 0 && (
                                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                                            {unreadCounts[user.id] > 99 ? '99+' : unreadCounts[user.id]}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className={`size-1.5 rounded-full ${STATUS_OPTIONS.find(s => s.id === (user.status || 'online'))?.bgColor || 'bg-slate-300'}`} />
                                    <span className="text-[10px] uppercase font-bold text-slate-500 truncate">
                                        {STATUS_OPTIONS.find(s => s.id === (user.status || 'online'))?.label || 'Offline'}
                                    </span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main: Chat Area */}
            <div className="flex-1 flex flex-col bg-slate-50/50">
                {selectedUserId ? (
                    <>
                        {/* Header */}
                        <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6 justify-between shadow-sm z-10">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-slate-900 leading-none">{users.find(u => u.id === selectedUserId)?.full_name}</span>
                                    {users.find(u => u.id === selectedUserId)?.role === 'Administrador' && (
                                        <span className="px-1.5 py-0.5 bg-primary-dark/10 text-primary-dark text-[9px] font-black rounded uppercase tracking-wider">Admin</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <div className={`size-1.5 rounded-full ${STATUS_OPTIONS.find(s => s.id === (users.find(u => u.id === selectedUserId)?.status || 'online'))?.bgColor}`} />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                        {STATUS_OPTIONS.find(s => s.id === (users.find(u => u.id === selectedUserId)?.status || 'online'))?.label}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => onOpenModal(selectedUserId || undefined)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-dark text-white rounded-lg hover:bg-primary-light transition-colors text-xs font-bold shadow-sm"
                                title="Criar compromisso com este usuário"
                            >
                                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                <span>Agendar</span>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            {loading ? (
                                <div className="flex items-center justify-center h-full">
                                    <span className="size-6 border-2 border-slate-200 border-t-primary-dark rounded-full animate-spin" />
                                </div>
                            ) : (
                                messages.map(msg => {
                                    const isMe = msg.sender_id === currentUser?.id;
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                                            {isMe && (
                                                <button
                                                    onClick={() => deleteMessage(msg.id)}
                                                    className="self-center mr-2 p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-rose-50"
                                                    title="Excluir mensagem"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            )}
                                            <div className={`max-w-[70%] rounded-2xl p-4 shadow-sm ${isMe ? 'bg-primary-dark text-white rounded-br-none' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'}`}>
                                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                <p className={`text-[10px] font-bold mt-2 text-right ${isMe ? 'text-white/60' : 'text-slate-300'}`}>{formatTime(msg.created_at)}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 bg-white border-t border-slate-200">
                            <form onSubmit={sendMessage} className="flex gap-2 relative">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    className="flex-1 pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-dark/10 transition-all font-medium text-slate-700"
                                    placeholder="Digite sua mensagem..."
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !newMessage.trim()}
                                    className="bg-primary-dark hover:bg-primary-light disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-lg active:scale-95"
                                >
                                    <span className="material-symbols-outlined">send</span>
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
                        <div className="size-24 rounded-full bg-slate-200 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-4xl text-slate-400">chat</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-700">Bem-vindo ao Chat Interno</h3>
                        <p className="text-sm text-slate-500 max-w-xs mt-2">Selecione um membro da equipe à esquerda para iniciar uma conversa.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
