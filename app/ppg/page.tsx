"use client";

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Activity, Wind, Heart, Droplets, Zap, Info } from 'lucide-react';

/**
 * 가우스 함수 (Gaussian Function)
 * PPG의 부드러운 파형을 만들기 위해 사용
 */
type Params = {
  bpm: number;
  spO2: number;
  stiffness: number;
  perfusion: number;
  respRate: number;
  respAmp: number;
  noise: number;
  showRed: boolean;
  showIR: boolean;
};

type DataPoint = {
  time: number;
  ir: number;
  red: number;
};

const gaussian = (t: number, center: number, amp: number, width: number): number => {
  return amp * Math.exp(-Math.pow(t - center, 2) / (2 * width * width));
};

export default function PPGSimulator() {
  // 시뮬레이션 파라미터 상태 관리
  const [params, setParams] = useState<Params>({
    bpm: 70,            // 심박수 (Heart Rate)
    spO2: 98,           // 산소포화도 (Blood Oxygen)
    stiffness: 0.3,     // 동맥 경직도 (Arterial Stiffness) - 이완기 피크 위치/크기 영향
    perfusion: 1.0,     // 관류 지수 (Perfusion Index) - AC 성분의 크기
    respRate: 15,       // 호흡수 (Respiration Rate) - DC 성분 주파수
    respAmp: 0.2,       // 호흡성 변동 폭 (DC Component Amplitude)
    noise: 0.02,        // 노이즈 레벨
    showRed: true,      // Red 파형 표시 여부
    showIR: true        // IR 파형 표시 여부
  });

  const [data, setData] = useState<DataPoint[]>([]);
  const duration = 4; // 4초 동안의 데이터

  // 파라미터 변경 핸들러
  const handleParamChange = (key: keyof Omit<Params, 'showIR' | 'showRed'>, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    const generateData = () => {
      const samplingRate = 60; // Hz (부드러운 곡선을 위해)
      const totalPoints = duration * samplingRate;
      const newData: DataPoint[] = [];
      
      // 심박 간격 (초)
      const beatInterval = 60 / params.bpm;
      
      // SpO2에 따른 Red/IR 비율 계산 (Beer-Lambert Law 단순화 모델)
      // SpO2가 낮을수록(저산소), 환원 헤모글로빈이 많아져 Red 흡수가 늘어나고(AC 진폭 감소), 
      // 상대적으로 IR 대비 Red의 AC/DC 비율(R값)이 커짐.
      // 시각적 표현을 위해:
      // SpO2 100%: IR 진폭 > Red 진폭
      // SpO2 80%: Red 진폭이 상대적으로 커짐 (비율 변화)
      const irAmplitudeBase = 1.0;
      // R = (AC_red/DC_red) / (AC_ir/DC_ir). SpO2가 낮으면 R이 커짐.
      // 여기서는 시각화를 위해 단순 진폭 비율로 표현
      const rValue = 0.4 + (100 - params.spO2) * 0.03; 
      const redAmplitudeBase = irAmplitudeBase * rValue;

      for (let i = 0; i < totalPoints; i++) {
        const t = i / samplingRate;
        
        // 1. DC Component (Baseline) - 호흡(Respiration) 영향
        // 호흡은 보통 0.2~0.4Hz 정도의 저주파
        const respFreq = params.respRate / 60;
        const dcComponent = Math.sin(2 * Math.PI * respFreq * t) * params.respAmp;

        // 2. AC Component (Pulsatile) - 심장 박동
        // 현재 시간 t에서 가장 가까운 이전 박동 시간 찾기
        const beatIndex = Math.floor(t / beatInterval);
        const beatTime = t - (beatIndex * beatInterval); // 박동 내에서의 상대 시간 (0 ~ beatInterval)

        // 단일 박동 형태 생성 (Morphology)
        // Systolic Peak (수축기): 주 피크
        let acWave = gaussian(beatTime, 0.15, 1.0, 0.06);
        
        // Diastolic Peak (이완기) & Dicrotic Notch (중복맥 파임)
        // 동맥 경직도(stiffness)가 높을수록 반사파가 빨리 돌아와 수축기 피크에 가까워지고 커짐 (Augmentation Index 증가)
        const diaTime = 0.35 - (params.stiffness * 0.1); // 경직될수록 시간 단축
        const diaAmp = 0.3 + (params.stiffness * 0.4);   // 경직될수록 진폭 증가
        acWave += gaussian(beatTime, diaTime, diaAmp, 0.06);

        // 관류(Perfusion)가 약하면 AC 성분 전체가 작아짐
        acWave *= params.perfusion;

        // 3. Noise
        const noiseVal = (Math.random() - 0.5) * params.noise;

        // 4. 최종 파형 합성 (Red vs IR)
        // PPG는 흡광도를 측정하므로 혈액량이 많을수록(수축기) 빛이 적게 투과됨.
        // 보통 그래프는 반전시켜서 피크가 위로 가게 그림 (Inverted absorption).
        
        const irValue = dcComponent + (acWave * irAmplitudeBase) + noiseVal;
        const redValue = dcComponent + (acWave * redAmplitudeBase) + noiseVal;

        newData.push({
          time: parseFloat(t.toFixed(2)),
          ir: irValue,
          red: redValue
        });
      }
      setData(newData);
    };

    generateData();
  }, [params, duration]);

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-slate-50 rounded-xl shadow-lg border border-slate-200 font-sans">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Activity className="text-red-500" />
          광혈량측정(PPG) 시뮬레이터
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          혈액량 변화에 따른 빛 흡수량 차이를 수학적으로 모델링한 그래프입니다.
        </p>
      </div>

      {/* 그래프 영역 */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-inner border border-slate-200 relative">
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="time" type="number" domain={[0, duration]} hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: '1px solid #ddd' }}
                labelFormatter={(v) => `Time: ${v}s`}
              />
              <Legend verticalAlign="top" height={36}/>
              {params.showIR && (
                <Line 
                  name="Infrared (IR) - 기본 파형" 
                  type="monotone" 
                  dataKey="ir" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={false} 
                  isAnimationActive={false}
                />
              )}
              {params.showRed && (
                <Line 
                  name="Red Light - SpO2 비교용" 
                  type="monotone" 
                  dataKey="red" 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  strokeDasharray="5 5" 
                  dot={false} 
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 그래프 주석 (Feature Points) */}
        <div className="absolute bottom-4 right-4 text-xs text-slate-400 pointer-events-none">
          <div className="flex flex-col items-end gap-1">
            <span>AC Component: Pulsatile Peaks</span>
            <span>DC Component: Baseline Wander</span>
          </div>
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1. 기본 생체 신호 */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-4">
            <Heart className="w-5 h-5 text-pink-500" />
            심박 및 산소포화도
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>심박수 (Heart Rate)</span>
                <span>{params.bpm} BPM</span>
              </label>
              <input 
                type="range" min="40" max="180" step="1" 
                value={params.bpm} 
                onChange={(e) => handleParamChange('bpm', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>산소포화도 (SpO2)</span>
                <span>{params.spO2}%</span>
              </label>
              <input 
                type="range" min="80" max="100" step="1" 
                value={params.spO2} 
                onChange={(e) => handleParamChange('spO2', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                SpO2가 낮아지면 Red/IR 비율(R)이 증가하여 Red 파형의 진폭이 커집니다.
              </p>
            </div>
          </div>
        </div>

        {/* 2. 파형 형태 (혈관 건강) */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-4">
            <Zap className="w-5 h-5 text-yellow-500" />
            혈관 특성 (Feature Points)
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>동맥 경직도 (Stiffness)</span>
                <span>{params.stiffness.toFixed(1)}</span>
              </label>
              <input 
                type="range" min="0" max="1.0" step="0.1" 
                value={params.stiffness} 
                onChange={(e) => handleParamChange('stiffness', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                높을수록 이완기 피크(Diastolic Peak)가 커지고 중복맥 파임(Dicrotic Notch)이 사라집니다 (노화).
              </p>
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>관류 지수 (Perfusion Index)</span>
                <span>{params.perfusion.toFixed(1)}</span>
              </label>
              <input 
                type="range" min="0.2" max="2.0" step="0.1" 
                value={params.perfusion} 
                onChange={(e) => handleParamChange('perfusion', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                말초 혈류량이 많을수록 AC 성분(맥박 파형)의 진폭이 커집니다.
              </p>
            </div>
          </div>
        </div>

        {/* 3. 호흡 및 기타 */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-700 mb-4">
            <Wind className="w-5 h-5 text-blue-400" />
            호흡 및 설정 (DC Component)
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>호흡수 (Respiration Rate)</span>
                <span>{params.respRate} /min</span>
              </label>
              <input 
                type="range" min="5" max="30" step="1" 
                value={params.respRate} 
                onChange={(e) => handleParamChange('respRate', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-400"
              />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                <span>기저선 변동 (Baseline Wander)</span>
                <span>{params.respAmp.toFixed(1)}</span>
              </label>
              <input 
                type="range" min="0" max="1.0" step="0.1" 
                value={params.respAmp} 
                onChange={(e) => handleParamChange('respAmp', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-400"
              />
            </div>

            <div className="flex gap-4 pt-2">
               <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                 <input 
                   type="checkbox" 
                   checked={params.showIR}
                   onChange={(e) => setParams(p => ({...p, showIR: e.target.checked}))}
                   className="rounded text-green-500 focus:ring-green-500"
                 />
                 IR 파형 보기
               </label>
               <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                 <input 
                   type="checkbox" 
                   checked={params.showRed}
                   onChange={(e) => setParams(p => ({...p, showRed: e.target.checked}))}
                   className="rounded text-red-500 focus:ring-red-500"
                 />
                 Red 파형 보기
               </label>
            </div>
          </div>
        </div>

      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100 flex gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-1">
          <p><strong>그래프 해석 가이드:</strong></p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>AC Component (맥박):</strong> 뾰족하게 솟은 파형입니다. 수축기(Systolic) 피크와 이완기(Diastolic) 피크로 나뉩니다.</li>
            <li><strong>DC Component (기저선):</strong> 전체 그래프가 물결치듯 위아래로 움직이는 것은 호흡에 의한 혈류량 변화입니다.</li>
            <li><strong>Dicrotic Notch (중복맥 파임):</strong> 큰 피크 뒤에 오는 작은 함몰 부위로, 대동맥 판막이 닫힐 때 발생합니다. 혈관이 노화될수록(Stiffness 증가) 사라집니다.</li>
            <li><strong>SpO2 원리:</strong> 산소포화도가 100%에 가까울수록 IR(초록색)과 Red(빨간색) 파형의 진폭 차이가 큽니다. 포화도가 떨어지면 Red 파형이 커집니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
