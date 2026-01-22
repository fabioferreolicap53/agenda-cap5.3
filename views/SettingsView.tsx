import React, { useState, useEffect, useRef } from 'react';
import { User, Sector, AppointmentType, Location } from '../types';
import { supabase } from '../lib/supabase';

interface SettingsViewProps {
    user: User | null;
    appointmentTypes: AppointmentType[];
    onUpdateTypes: () => void;
    onToggleSidebar?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, appointmentTypes, onUpdateTypes, onToggleSidebar }) => {
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [newSectorName, setNewSectorName] = useState('');
    const [newLocationName, setNewLocationName] = useState('');
    const [newLocationColor, setNewLocationColor] = useState('#64748b');
    const [hasConflictControl, setHasConflictControl] = useState(false);
    const [loadingSectors, setLoadingSectors] = useState(false);
    const [loadingLocations, setLoadingLocations] = useState(false);

    // Appointment Type states
    const [newTypeLabel, setNewTypeLabel] = useState('');
    const [newTypeValue, setNewTypeValue] = useState('');
    const [newTypeColor, setNewTypeColor] = useState('#3b82f6');
    const [newTypeIcon, setNewTypeIcon] = useState('label');
    const [loadingTypes, setLoadingTypes] = useState(false);

    // Profile states
    const [avatar, setAvatar] = useState(user?.avatar || '');
    const [observations, setObservations] = useState(user?.observations || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [savingProfile, setSavingProfile] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.role === 'Administrador';

    useEffect(() => {
        if (isAdmin) {
            fetchSectors();
            fetchLocations();
        }
    }, [isAdmin]);

    useEffect(() => {
        if (user) {
            setAvatar(user.avatar || '');
            setObservations(user.observations || '');
            setPhone(user.phone || '');
        }
    }, [user]);

    const fetchSectors = async () => {
        setLoadingSectors(true);
        const { data } = await supabase.from('sectors').select('*').order('name');
        if (data) setSectors(data);
        setLoadingSectors(false);
    };

    const fetchLocations = async () => {
        setLoadingLocations(true);
        const { data } = await supabase.from('locations').select('*').order('name');
        if (data) setLocations(data as Location[]);
        setLoadingLocations(false);
    };

    const handleAddSector = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSectorName.trim()) return;

        const { error } = await supabase.from('sectors').insert({ name: newSectorName.trim() });
        if (error) {
            alert('Erro ao adicionar setor: ' + error.message);
        } else {
            setNewSectorName('');
            fetchSectors();
        }
    };

    const handleAddLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLocationName.trim()) return;

        const { error } = await supabase.from('locations').insert({
            name: newLocationName.trim(),
            color: newLocationColor,
            has_conflict_control: hasConflictControl
        });
        if (error) {
            alert('Erro ao adicionar local: ' + error.message);
        } else {
            setNewLocationName('');
            setHasConflictControl(false);
            fetchLocations();
        }
    };

    const handleDeleteSector = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este setor? Usuários vinculados a ele podem ser afetados.')) return;

        const { error } = await supabase.from('sectors').delete().eq('id', id);
        if (error) {
            alert('Erro ao excluir setor: ' + error.message);
        } else {
            fetchSectors();
        }
    };

    const handleDeleteLocation = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este local? Compromissos vinculados a ele podem ser afetados.')) return;

        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) {
            alert('Erro ao excluir local: ' + error.message);
        } else {
            fetchLocations();
        }
    };

    // ... rest of the file (handleAddType, handleDeleteType, handleAvatarUpload, handleUpdateProfile) ...

    const handleAddType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTypeLabel.trim() || !newTypeValue.trim()) return;

        setLoadingTypes(true);
        const { error } = await supabase.from('appointment_types').insert({
            label: newTypeLabel.trim(),
            value: newTypeValue.trim().toLowerCase().replace(/\s+/g, '_'),
            color: newTypeColor,
            icon: newTypeIcon.trim() || 'label'
        });

        if (error) {
            alert('Erro ao adicionar tipo de evento: ' + error.message);
        } else {
            setNewTypeLabel('');
            setNewTypeValue('');
            setNewTypeColor('#3b82f6');
            setNewTypeIcon('label');
            onUpdateTypes();
        }
        setLoadingTypes(false);
    };

    const handleDeleteType = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este tipo de evento? Compromissos existentes com este tipo podem ter problemas de exibição.')) return;

        const { error } = await supabase.from('appointment_types').delete().eq('id', id);
        if (error) {
            alert('Erro ao excluir tipo: ' + error.message);
        } else {
            onUpdateTypes();
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        // Check file type and size
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            alert('A imagem deve ter no máximo 2MB.');
            return;
        }

        setUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatar(publicUrl);

            // Auto-save the avatar URL to profile
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar: publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            onUpdateTypes(); // Refresh global user state
        } catch (err: any) {
            alert('Erro ao enviar imagem: ' + err.message);
        } finally {
            setUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveAvatar = async () => {
        if (!user || !avatar) return;
        if (!window.confirm('Tem certeza que deseja remover sua foto de perfil?')) return;

        setUploadingAvatar(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ avatar: null })
                .eq('id', user.id);

            if (error) throw error;

            setAvatar('');
            onUpdateTypes(); // Refresh global user state
        } catch (err: any) {
            alert('Erro ao remover imagem: ' + err.message);
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setSavingProfile(true);
        const { error } = await supabase
            .from('profiles')
            .update({
                avatar: avatar.trim(),
                observations: observations.trim(),
                phone: phone.trim()
            })
            .eq('id', user.id);

        if (error) {
            alert('Erro ao atualizar perfil: ' + error.message);
        } else {
            alert('Perfil atualizado com sucesso!');
            onUpdateTypes(); // This re-fetches user data in App.tsx
        }
        setSavingProfile(false);
    };

    return (
        <div className="flex-1 p-8 bg-slate-50 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto pb-20">
                <header className="mb-8 flex items-center gap-4">
                    <button
                        onClick={onToggleSidebar}
                        className="md:hidden size-12 flex items-center justify-center rounded-2xl bg-primary-dark text-white shadow-lg active:scale-95 transition-all shrink-0"
                    >
                        <span className="material-symbols-outlined text-2xl">menu</span>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 mb-1">Configurações</h1>
                        <p className="text-sm font-medium text-slate-500">Gerencie sua conta e as preferências do sistema.</p>
                    </div>
                </header>

                <div className="space-y-8">
                    {/* Perfil Section - code remains same */}
                    <section className="bg-white rounded-[24px] shadow-sm border border-slate-200/60 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary-dark">person</span>
                            <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs">Perfil do Usuário</h3>
                        </div>
                        <div className="p-6 space-y-8">
                            <form onSubmit={handleUpdateProfile} className="space-y-8">
                                <div className="flex items-center gap-6">
                                    <div className="size-20 rounded-2xl bg-slate-100 border-2 border-white shadow-sm relative overflow-hidden shrink-0 group/avatar flex items-center justify-center">
                                        {avatar ? (
                                            <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 font-black text-xl">
                                                {user?.full_name ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U'}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploadingAvatar}
                                            className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-white text-xl mb-1">camera_alt</span>
                                            <span className="text-white text-[8px] font-black uppercase tracking-widest">{uploadingAvatar ? '...' : 'Alterar'}</span>
                                        </button>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleAvatarUpload}
                                            className="hidden"
                                            accept="image/*"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-black text-slate-900 mb-1">{user?.full_name}</p>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{user?.role === 'Administrador' ? 'Administrador do Sistema' : 'Normal'}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {avatar && (
                                                    <button
                                                        type="button"
                                                        onClick={handleRemoveAvatar}
                                                        disabled={uploadingAvatar}
                                                        className="px-4 py-2 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-100 transition-all"
                                                    >
                                                        {uploadingAvatar ? '...' : 'Remover Foto'}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary-dark hover:bg-white hover:shadow-sm transition-all"
                                                >
                                                    Upload de Foto
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Ou cole uma URL do Avatar</label>
                                            <input
                                                type="text"
                                                value={avatar}
                                                onChange={(e) => setAvatar(e.target.value)}
                                                placeholder="https://exemplo.com/foto.jpg"
                                                className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 outline-none text-xs font-bold focus:border-primary-dark transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Nome de Usuário</label>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm">alternate_email</span>
                                            <input readOnly title="O nome de usuário não pode ser alterado" className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 outline-none text-sm font-bold cursor-not-allowed" value={user?.username || ''} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">E-mail Corporativo</label>
                                        <input readOnly title="O e-mail não pode ser alterado" className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 outline-none text-sm font-bold cursor-not-allowed" value={user?.email || ''} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Telefone de Contato</label>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm">call</span>
                                            <input
                                                type="text"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="(00) 00000-0000"
                                                className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 outline-none text-sm font-bold focus:border-primary-dark transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Observações</label>
                                        <textarea
                                            value={observations}
                                            onChange={(e) => setObservations(e.target.value)}
                                            rows={3}
                                            placeholder="Suas notas, especialidades ou avisos..."
                                            className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 outline-none text-sm font-bold focus:border-primary-dark transition-all resize-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={savingProfile}
                                        className="px-8 py-3 bg-primary-dark text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-dark/20 hover:bg-primary-light transition-all disabled:opacity-50"
                                    >
                                        {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </section>

                    {/* Admin: Event Type Management */}
                    {isAdmin && (
                        <section className="bg-white rounded-[24px] shadow-sm border border-slate-200/60 overflow-hidden animate-[fadeIn_0.5s]">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary-dark">category</span>
                                    <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs">Tipos de Evento</h3>
                                </div>
                                <span className="bg-primary-dark/10 text-primary-dark text-[10px] font-bold px-3 py-1 rounded-full border border-primary-dark/20 uppercase tracking-[0.1em]">Configuração Admin</span>
                            </div>
                            <div className="p-6 space-y-8">
                                <form onSubmit={handleAddType} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-slate-50/50 p-6 rounded-2xl border border-dashed border-slate-200">
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] ml-1">Nome do Tipo</label>
                                        <input
                                            type="text"
                                            value={newTypeLabel}
                                            onChange={(e) => {
                                                setNewTypeLabel(e.target.value);
                                                if (!newTypeValue) setNewTypeValue(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                            }}
                                            placeholder="Ex: Reunião Mensal"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:border-primary-dark transition-all outline-none text-sm font-bold"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] ml-1">Ícone (Material Symbol)</label>
                                        <div className="flex gap-2 items-center px-4 py-2 border border-slate-200 bg-white rounded-xl h-[46px]">
                                            <span className="material-symbols-outlined text-slate-400 text-lg">{newTypeIcon || 'label'}</span>
                                            <input
                                                type="text"
                                                value={newTypeIcon}
                                                onChange={(e) => setNewTypeIcon(e.target.value)}
                                                placeholder="event, work..."
                                                className="w-full bg-transparent outline-none text-[11px] font-bold text-slate-700"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] ml-1">Cor do Card</label>
                                        <div className="flex gap-3 items-center px-4 py-2 border border-slate-200 bg-white rounded-xl h-[46px]">
                                            <input
                                                type="color"
                                                value={newTypeColor}
                                                onChange={(e) => setNewTypeColor(e.target.value)}
                                                className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent"
                                            />
                                            <span className="text-[10px] font-mono text-slate-500 uppercase">{newTypeColor}</span>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loadingTypes}
                                        className="h-[46px] flex items-center justify-center gap-2 bg-primary-dark text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-dark/20 hover:bg-primary-light transition-all disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span>
                                        Criar
                                    </button>
                                </form>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {appointmentTypes.map(type => (
                                        <div key={type.id} className="group relative flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-200 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="size-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: type.color }}>
                                                    <span className="material-symbols-outlined text-[20px]">{type.icon || 'label'}</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 leading-none mb-1">{type.label}</p>
                                                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">slug: {type.value}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteType(type.id)}
                                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Admin: Location Management (NEW) */}
                    {isAdmin && (
                        <section className="bg-white rounded-[24px] shadow-sm border border-slate-200/60 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary-dark">location_on</span>
                                    <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs">Gerenciamento de Locais</h3>
                                </div>
                            </div>
                            <form onSubmit={handleAddLocation} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                <div className="md:col-span-2">
                                    <input
                                        type="text"
                                        value={newLocationName}
                                        onChange={(e) => setNewLocationName(e.target.value)}
                                        placeholder="Nome do local (ex: Sala de Reuniões 1)"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:border-primary-dark transition-all outline-none text-sm font-bold"
                                    />
                                </div>
                                <div>
                                    <div className="flex gap-3 items-center px-4 py-2 border border-slate-200 bg-white rounded-xl h-[46px]">
                                        <input
                                            type="color"
                                            value={newLocationColor}
                                            onChange={(e) => setNewLocationColor(e.target.value)}
                                            className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent"
                                        />
                                        <span className="text-[10px] font-mono text-slate-500 uppercase">{newLocationColor}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl h-[46px]">
                                    <input
                                        type="checkbox"
                                        id="hasConflictControl"
                                        checked={hasConflictControl}
                                        onChange={(e) => setHasConflictControl(e.target.checked)}
                                        className="size-4 rounded border-slate-300 text-primary-dark focus:ring-primary-dark"
                                    />
                                    <label htmlFor="hasConflictControl" className="text-[9px] font-black text-slate-500 uppercase leading-none cursor-pointer">
                                        Controle de Conflito
                                    </label>
                                </div>
                                <button type="submit" className="h-[46px] px-8 bg-primary-dark text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-dark/20 hover:bg-primary-light transition-all md:col-span-4">
                                    Adicionar
                                </button>
                            </form>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {locations.map(location => (
                                    <div key={location.id} className="flex items-center justify-between p-4 bg-white border border-slate-50 rounded-2xl hover:bg-slate-50/50 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: location.color }}>
                                                <span className="material-symbols-outlined text-[18px]">place</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-700">{location.name}</span>
                                                {location.has_conflict_control && (
                                                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter">Com Controle de Conflitos</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteLocation(location.id)}
                                            className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-50"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Admin: Sector Management */}
                    {isAdmin && (
                        <section className="bg-white rounded-[24px] shadow-sm border border-slate-200/60 overflow-hidden">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary-dark">lan</span>
                                    <h3 className="font-black text-slate-900 uppercase tracking-wider text-xs">Gerenciamento de Setores</h3>
                                </div>
                            </div>
                            <div className="p-6 space-y-6">
                                <form onSubmit={handleAddSector} className="flex gap-4 p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                    <input
                                        type="text"
                                        value={newSectorName}
                                        onChange={(e) => setNewSectorName(e.target.value)}
                                        placeholder="Nome do novo setor corporativo..."
                                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white focus:border-primary-dark transition-all outline-none text-sm font-bold"
                                    />
                                    <button type="submit" className="px-8 py-3 bg-primary-dark text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary-dark/20 hover:bg-primary-light transition-all">
                                        Adicionar
                                    </button>
                                </form>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {sectors.map(sector => (
                                        <div key={sector.id} className="flex items-center justify-between p-4 bg-white border border-slate-50 rounded-2xl hover:bg-slate-50/50 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                                                    <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
                                                </div>
                                                <span className="text-sm font-bold text-slate-700">{sector.name}</span>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSector(sector.id)}
                                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-50"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div >
    );
};
