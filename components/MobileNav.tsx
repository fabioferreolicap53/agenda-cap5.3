import React from 'react';
import { ViewState } from '../types';

interface MobileNavProps {
    currentView: ViewState;
    onChangeView: (view: ViewState) => void;
    unreadCount?: number;
    onToggleSidebar?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
    currentView,
    onChangeView,
    unreadCount = 0,
    onToggleSidebar
}) => {
    const navItem = (view: ViewState, icon: string, label: string) => {
        const isActive = currentView === view;
        return (
            <button
                onClick={() => onChangeView(view)}
                className={`flex flex-col items-center justify-center flex-1 gap-1 transition-all duration-200 ${isActive ? 'text-primary' : 'text-slate-400'
                    }`}
            >
                <div className="relative">
                    <span className={`material-symbols-outlined text-[24px] ${isActive ? 'filled' : ''}`}>
                        {icon}
                    </span>
                    {view === 'messages' && unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
            </button>
        );
    };

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 glass h-16 border-t border-slate-100 flex items-center justify-around px-2 pb-safe z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
            {navItem('calendar', 'calendar_month', 'Agenda')}
            {navItem('team', 'group', 'Equipe')}
            {navItem('messages', 'chat', 'Chat')}
            {navItem('performance', 'analytics', 'Stats')}
            <button
                onClick={onToggleSidebar}
                className="flex flex-col items-center justify-center flex-1 gap-1 text-slate-400 active:scale-90 transition-all"
            >
                <span className="material-symbols-outlined text-[24px]">more_horiz</span>
                <span className="text-[10px] font-bold uppercase tracking-wider">Mais</span>
            </button>
        </nav>
    );
};
