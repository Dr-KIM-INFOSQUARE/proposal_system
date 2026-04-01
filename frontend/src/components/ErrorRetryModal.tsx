import React, { useState, useEffect } from 'react';

interface ErrorRetryModalProps {
  isOpen: boolean;
  modelName: string;
  onRetry: () => void;
  onCancel: () => void;
}

export const ErrorRetryModal: React.FC<ErrorRetryModalProps> = ({ isOpen, modelName, onRetry, onCancel }) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(10);
      return;
    }
    
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, countdown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-surface rounded-[2rem] p-8 max-w-md w-full shadow-[0_24px_60px_-12px_rgba(0,0,0,0.15)] relative overflow-hidden">
        {/* 장식용 에러 아이콘 배경 */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-error/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-4 mb-6 relative">
          <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center shrink-0 border border-error/20">
            <span className="material-symbols-outlined text-error text-[28px] font-light">error</span>
          </div>
          <div>
            <h3 className="text-xl font-headline font-black text-on-surface tracking-tight">통신 오류 발생</h3>
            <p className="text-[13px] font-bold text-error/80 mt-0.5 tracking-wide">서버 부하 또는 연결 불안정</p>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-2xl p-5 mb-8 border border-outline-variant/20 relative">
          <p className="text-[13px] text-on-surface-variant leading-relaxed font-medium">
            구글 서버에서 <strong className="text-primary font-black tracking-wide">[{modelName}]</strong> 모델 사용량 이슈를 보고했습니다.<br /><br />
            {countdown > 0 
              ? <span className="text-error font-bold tracking-wide">재시작을 위해 {countdown}초 대기 중입니다...</span> 
              : <span className="text-primary font-bold tracking-wide">활성화 되었습니다. 다시 시도할 수 있습니다.</span>}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3.5 px-4 rounded-[1rem] font-bold text-[14px] bg-surface-container-highest hover:bg-surface-container-high text-on-surface transition-colors focus:ring-4 focus:ring-outline/10 outline-none"
          >
            취소
          </button>
          <button 
            onClick={onRetry}
            disabled={countdown > 0}
            className={`flex-1 py-3.5 px-4 rounded-[1rem] font-bold text-[14px] transition-all outline-none flex items-center justify-center gap-2 ${
              countdown > 0 
              ? 'bg-outline-variant/20 text-outline cursor-not-allowed opacity-70' 
              : 'bg-primary text-on-primary hover:shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.5)] active:scale-[0.98]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            재시작
          </button>
        </div>
      </div>
    </div>
  );
};
