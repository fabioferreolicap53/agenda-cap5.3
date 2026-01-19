import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="py-4 px-8 bg-white/50 backdrop-blur-sm border-t border-slate-100 text-center shrink-0">
            <p className="text-[10px] font-medium text-slate-400">
                Desenvolvido por <span className="font-semibold text-slate-500">Fabio Ferreira de Oliveira</span> — DAPS/CAP5.3
            </p>
        </footer>
    );
};
