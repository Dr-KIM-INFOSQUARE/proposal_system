import React from 'react';

export interface ModelOption {
  id: string;
  name: string;
  inputPrice: string;
  outputPrice: string;
  description?: string;
}

export const MODELS: ModelOption[] = [
  { 
    id: "models/gemini-3-flash-preview", 
    name: "Gemini 3 Flash Preview", 
    inputPrice: "$0.50", 
    outputPrice: "$3.00",
    description: "최첨단 인텔리전스와 속도의 균형"
  },
  { 
    id: "models/gemini-3.1-flash-lite-preview", 
    name: "Gemini 3.1 Flash-Lite Preview", 
    inputPrice: "$0.25", 
    outputPrice: "$1.50",
    description: "가장 빠르고 경제적인 분석 모델"
  },
  { 
    id: "models/gemini-3.1-pro-preview", 
    name: "Gemini 3.1 Pro Preview", 
    inputPrice: "$2.00~$4.00", 
    outputPrice: "$12.00~$18.00",
    description: "복잡한 구조 파악을 위한 고성능 모델"
  },
  { 
    id: "models/gemini-2.5-flash", 
    name: "Gemini 2.5 Flash", 
    inputPrice: "$0.30", 
    outputPrice: "$2.50",
    description: "안정적인 처리 성능"
  },
  { 
    id: "models/gemini-2.5-pro", 
    name: "Gemini 2.5 Pro", 
    inputPrice: "$1.25~$2.50", 
    outputPrice: "$10.00~$15.00",
    description: "최고 수준의 지능형 분석"
  }
];

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, disabled }) => {
  return (
    <div className="flex flex-col gap-2 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-primary text-xl">psychology</span>
        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">분석 모델 선택</label>
      </div>
      
      <select 
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-surface border border-outline-variant/50 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {MODELS.map(model => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="bg-surface-container-highest/30 px-2 py-2 rounded-lg flex flex-col justify-center">
          <p className="text-[9px] text-outline font-bold uppercase leading-tight">입력 가격<br/>(1M TOKENS)</p>
          <p className="text-xs md:text-sm font-bold text-primary mt-1 break-all">{MODELS.find(m => m.id === selectedModel)?.inputPrice}</p>
        </div>
        <div className="bg-surface-container-highest/30 px-2 py-2 rounded-lg flex flex-col justify-center">
          <p className="text-[9px] text-outline font-bold uppercase leading-tight">출력 가격<br/>(1M TOKENS)</p>
          <p className="text-xs md:text-sm font-bold text-secondary mt-1 break-all">{MODELS.find(m => m.id === selectedModel)?.outputPrice}</p>
        </div>
      </div>
      
      <p className="text-[10px] text-outline-variant italic mt-1">
        * {MODELS.find(m => m.id === selectedModel)?.description}
      </p>
    </div>
  );
};
