import React from 'react';

const Loading = () => (
    <div className="flex items-center justify-center h-screen w-screen bg-[#f0f2f5] dark:bg-[#0b141a] text-[#00a884]">
        <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
            <div className="relative">
                <div className="w-16 h-16 border-4 border-[#00a884]/20 border-t-[#00a884] rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#00a884] rounded-full" />
                </div>
            </div>
            <div className="flex flex-col items-center gap-1">
                <div className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#667781] dark:text-[#8696a0]">NovaChat</div>
                <div className="flex items-center gap-2 text-[10px] text-[#667781]/60 dark:text-[#8696a0]/60 uppercase tracking-widest">
                    <div className="w-1 h-1 rounded-full bg-current animate-pulse" />
                    End-to-end encrypted
                </div>
            </div>
        </div>
    </div>
);

export default Loading;
