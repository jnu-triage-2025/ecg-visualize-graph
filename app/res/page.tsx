"use client";

import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ScatterChart, Scatter } from 'recharts';
import { Activity, Settings, Wind, AlertCircle } from 'lucide-react';

type Mode = 'VC' | 'PC';
type FlowShape = 'Square' | 'Decelerating';

type SimParams = {
  rr: number;
  peep: number;
  tidalVolume: number;
  pressureControl: number;
  resistance: number;
  compliance: number;
  ieRatio: number;
  flowShape: FlowShape;
  triggerEffort: number;
  overdistension: boolean;
  autoPeep: boolean;
};

type GenerateParams = SimParams & { mode: Mode };

type ScalarPoint = {
  time: number;
  pressure: number;
  flow: number;
  volume: number;
};

type LoopPoint = {
  pressure: number;
  flow: number;
  volume: number;
};

type NumericParam =
  | 'rr'
  | 'peep'
  | 'tidalVolume'
  | 'pressureControl'
  | 'resistance'
  | 'compliance'
  | 'ieRatio'
  | 'triggerEffort';

type ToggleParam = 'overdistension' | 'autoPeep';

// --- 수학적 모델링 함수 ---

/**
 * 호흡 사이클 데이터를 생성하는 함수
 * @param {Object} params - 시뮬레이션 파라미터 (Mode, RR, Tidal Volume, PEEP 등)
 * @returns {Object} { scalars: [], loops: [] }
 */
const generateBreathData = (params: GenerateParams): { scalars: ScalarPoint[]; loops: LoopPoint[] } => {
  const {
    mode,           // 'VC' (Volume Control) or 'PC' (Pressure Control)
    rr,             // Respiratory Rate (회/분)
    peep,           // PEEP (cmH2O)
    tidalVolume,    // Target Volume for VC (mL)
    pressureControl,// Target Pressure for PC (cmH2O, above PEEP)
    resistance,     // Airway Resistance (cmH2O/L/s)
    compliance,     // Lung Compliance (mL/cmH2O)
    ieRatio,        // I:E Ratio (1:X의 X값)
    flowShape,      // 'Square' or 'Decelerating' (VC only)
    triggerEffort,  // 환자 흡기 노력 (cmH2O, 0이면 없음)
    overdistension, // 과팽창 여부 (Beak 현상 구현)
    autoPeep,       // AutoPEEP 구현 (호기 시간 부족)
  } = params;

  const dataPoints: ScalarPoint[] = [];
  const loopPoints: LoopPoint[] = [];
  
  // 시간 설정
  const cycleTime = 60 / rr; // 1회 호흡 시간 (초)
  const inspTime = cycleTime / (1 + ieRatio); // 흡기 시간
  const expTime = cycleTime - inspTime; // 호기 시간
  
  // 시뮬레이션 해상도 및 길이 (2 사이클)
  const dt = 0.02; 
  const totalTime = cycleTime * 2; 
  
  // 상태 변수 초기화
  let currentVol = 0; // L
  let currentFlow = 0; // L/s
  let currentPressure = peep; // cmH2O
  
  // AutoPEEP 시뮬레이션을 위한 잔여 용적 (이전 호흡에서 다 못 뱉은 양)
  let trappedVolume = autoPeep ? 0.1 : 0; 

  for (let t = 0; t < totalTime; t += dt) {
    const timeInCycle = t % cycleTime;
    const isInspiration = timeInCycle < inspTime;
    
    // 트리거링 시뮬레이션 (흡기 직전 음압 발생)
    const isTriggerPhase = timeInCycle > cycleTime - 0.15 || (timeInCycle < 0.1 && t > 0);
    let musclePressure = 0;
    if (triggerEffort > 0 && isTriggerPhase) {
        // 사인파 형태로 음압 생성
        musclePressure = -triggerEffort * Math.sin(Math.PI * (timeInCycle < 0.1 ? timeInCycle + 0.15 : timeInCycle - (cycleTime - 0.15)) / 0.25);
    }

    // --- 1. 유량(Flow) 및 압력(Pressure) 계산 ---
    
    if (mode === 'VC') {
      // Volume Control
      if (isInspiration) {
        // 흡기: 설정된 유량 패턴
        const targetVolL = tidalVolume / 1000;
        
        if (flowShape === 'Square') {
          currentFlow = targetVolL / inspTime;
        } else {
          // Decelerating Ramp
          // 면적(=용적)은 같아야 하므로 초기 유량은 Square의 2배에서 시작해 0으로 감
          const startFlow = (2 * targetVolL) / inspTime;
          currentFlow = startFlow * (1 - (timeInCycle / inspTime));
        }
      } else {
        // 호기: 수동적 반동 (Exponential Decay)
        // 시상수(Time Constant) = R * C
        const timeConstant = resistance * (compliance / 1000); 
        // AutoPEEP이 있으면 호기 시간이 짧아져 유량이 0이 되기 전 흡기 시작
        const expTimeElapsed = timeInCycle - inspTime;
        // 호기 시작 시점의 Peak Expiratory Flow
        const peakExpFlow = -(currentVol + trappedVolume) / timeConstant; 
        currentFlow = peakExpFlow * Math.exp(-expTimeElapsed / timeConstant);
      }
    } else {
      // Pressure Control
      if (isInspiration) {
        // 흡기: 일정한 압력 유지 -> 유량은 감소
        const targetPressure = peep + pressureControl;
        const timeConstant = resistance * (compliance / 1000);
        // Equation: Flow = (Delta P / R) * e^(-t/RC)
        currentFlow = (pressureControl / resistance) * Math.exp(-timeInCycle / timeConstant);
      } else {
        // 호기: VC와 동일한 메커니즘
        const timeConstant = resistance * (compliance / 1000);
        const expTimeElapsed = timeInCycle - inspTime;
        const peakExpFlow = -(currentVol + trappedVolume) / timeConstant;
        currentFlow = peakExpFlow * Math.exp(-expTimeElapsed / timeConstant);
      }
    }

    // --- 2. 용적(Volume) 적분 ---
    // V = Integral(Flow) dt
    if (isInspiration && timeInCycle < dt) {
        // 흡기 시작 시 리셋 (AutoPEEP 상황 제외하면 0)
        currentVol = trappedVolume; 
    }
    currentVol += currentFlow * dt;
    
    // 용적 하한선 보정 (물리적으로 0 미만 불가)
    if (currentVol < 0) currentVol = 0;


    // --- 3. 압력(Pressure) 계산 (운동 방정식) ---
    // P_vent = (Flow * R) + (Vol / C) + PEEP
    
    // 컴플라이언스 비선형성 (Overdistension/Beak 구현)
    // 용적이 일정 수준을 넘으면 컴플라이언스가 급격히 감소(=Elastance 증가)하여 압력 급상승
    let effectiveCompliance = compliance;
    if (overdistension && currentVol > 0.45) { // 450ml 이상에서 과팽창 발생 가정
        effectiveCompliance = compliance * (1 - (currentVol - 0.45) * 2); 
        if (effectiveCompliance < 5) effectiveCompliance = 5;
    }

    const resistivePressure = currentFlow * resistance;
    const elasticPressure = (currentVol * 1000) / effectiveCompliance; // mL 단위 변환
    
    // PC 모드에서는 흡기 시 압력이 설정값으로 고정(이상적 상황)되지만, 
    // 여기서는 계산된 값을 사용하여 그래픽의 일관성을 유지하거나, 
    // PC 모드 특유의 Square Pressure Waveform을 강제할 수 있음.
    // 시뮬레이터의 현실감을 위해 PC 흡기시는 강제 Square Wave 적용
    if (mode === 'PC' && isInspiration) {
        currentPressure = peep + pressureControl;
    } else {
        currentPressure = resistivePressure + elasticPressure + peep + musclePressure;
    }

    // 데이터 저장
    const displayTime = parseFloat(t.toFixed(2));
    
    dataPoints.push({
      time: displayTime,
      pressure: currentPressure,
      flow: currentFlow * 60, // L/min 변환
      volume: currentVol * 1000
    });

    // 루프 데이터는 한 사이클만 (또는 전체)
    loopPoints.push({
      pressure: currentPressure,
      flow: currentFlow * 60,
      volume: currentVol * 1000
    });
  }
  
  return { scalars: dataPoints, loops: loopPoints };
};

// --- 메인 컴포넌트 ---

export default function VentilatorGraphics() {
  // --- 상태 관리 (Controls) ---
  const [mode, setMode] = useState<Mode>('VC'); // VC, PC
  const [params, setParams] = useState<SimParams>({
    rr: 15,
    peep: 5,
    tidalVolume: 500, // for VC
    pressureControl: 15, // for PC
    resistance: 10, // Normal ~5-10
    compliance: 50, // Normal ~50-100
    ieRatio: 2, // 1:2
    flowShape: 'Decelerating', // Square, Decelerating
    triggerEffort: 0, // 0: None, >0: Patient Trigger
    overdistension: false,
    autoPeep: false,
  });

  // 데이터 생성
  const { scalars, loops } = useMemo(() => {
    return generateBreathData({ mode, ...params });
  }, [mode, params]);

  // 핸들러
  const handleChange = (key: NumericParam, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const toggleCheck = (key: ToggleParam) => {
    setParams(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 bg-gray-50 rounded-xl shadow-lg font-sans">
      {/* 헤더 */}
      <div className="mb-6 border-b pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Activity className="text-blue-600" />
            Ventilator Graphics Simulator
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            문서 "Ventilator Graphics Made Easy" 기반 파형 및 루프 시뮬레이션
          </p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => setMode('VC')}
                className={`px-4 py-2 rounded-lg font-bold transition-colors ${mode === 'VC' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
            >
                Volume Control (VC)
            </button>
            <button 
                onClick={() => setMode('PC')}
                className={`px-4 py-2 rounded-lg font-bold transition-colors ${mode === 'PC' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
            >
                Pressure Control (PC)
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* --- 컨트롤 패널 (좌측) --- */}
        <div className="lg:col-span-1 space-y-6 bg-white p-4 rounded-lg border shadow-sm h-fit">
          <div className="flex items-center gap-2 font-semibold text-gray-700 border-b pb-2">
            <Settings className="w-5 h-5" />
            Ventilator Settings
          </div>

          {/* 공통 설정 */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500">Respiratory Rate (RR): {params.rr} bpm</label>
              <input type="range" min="10" max="40" value={params.rr} onChange={(e) => handleChange('rr', Number(e.target.value))} className="w-full accent-blue-600" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">PEEP: {params.peep} cmH2O</label>
              <input type="range" min="0" max="20" value={params.peep} onChange={(e) => handleChange('peep', Number(e.target.value))} className="w-full accent-blue-600" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">I:E Ratio (1:{params.ieRatio})</label>
              <input type="range" min="1" max="4" step="0.5" value={params.ieRatio} onChange={(e) => handleChange('ieRatio', Number(e.target.value))} className="w-full accent-blue-600" />
            </div>
          </div>

          {/* 모드별 설정 */}
          <div className="pt-2 border-t">
            {mode === 'VC' ? (
                <>
                    <div className="mb-4">
                        <label className="text-xs font-medium text-gray-500">Tidal Volume: {params.tidalVolume} mL</label>
                        <input type="range" min="300" max="800" step="50" value={params.tidalVolume} onChange={(e) => handleChange('tidalVolume', Number(e.target.value))} className="w-full accent-green-600" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Flow Pattern</label>
                        <select 
                            value={params.flowShape} 
                          onChange={(e) => setParams(p => ({...p, flowShape: e.target.value as FlowShape}))}
                            className="w-full p-2 border rounded text-sm"
                        >
                            <option value="Square">Square (Constant)</option>
                            <option value="Decelerating">Decelerating Ramp</option>
                        </select>
                    </div>
                </>
            ) : (
                <div className="mb-4">
                    <label className="text-xs font-medium text-gray-500">Pressure Control: {params.pressureControl} cmH2O</label>
                    <input type="range" min="5" max="30" value={params.pressureControl} onChange={(e) => handleChange('pressureControl', Number(e.target.value))} className="w-full accent-green-600" />
                </div>
            )}
          </div>

          {/* 환자 상태 (Lung Mechanics) */}
          <div className="pt-4 border-t space-y-4">
            <div className="flex items-center gap-2 font-semibold text-gray-700">
                <Wind className="w-5 h-5" />
                Patient Mechanics
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Resistance (Raw): {params.resistance}</label>
              <input type="range" min="5" max="50" value={params.resistance} onChange={(e) => handleChange('resistance', Number(e.target.value))} className="w-full accent-orange-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Compliance (Cst): {params.compliance}</label>
              <input type="range" min="10" max="100" value={params.compliance} onChange={(e) => handleChange('compliance', Number(e.target.value))} className="w-full accent-orange-500" />
            </div>
          </div>

          {/* 시나리오 (Scenarios) */}
          <div className="pt-4 border-t space-y-3">
             <div className="flex items-center gap-2 font-semibold text-gray-700">
                <AlertCircle className="w-5 h-5" />
                Scenarios
            </div>
            
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Trigger Effort</span>
                <select 
                    value={params.triggerEffort} 
                    onChange={(e) => handleChange('triggerEffort', Number(e.target.value))}
                    className="text-sm border rounded p-1"
                >
                    <option value="0">None (Time Trigger)</option>
                    <option value="2">Normal (-2 cmH2O)</option>
                    <option value="8">High Work (-8 cmH2O)</option>
                </select>
            </div>

            <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-600">Overdistension (Beak)</span>
                <input type="checkbox" checked={params.overdistension} onChange={() => toggleCheck('overdistension')} className="w-4 h-4" />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-600">AutoPEEP (Air Trapping)</span>
                <input type="checkbox" checked={params.autoPeep} onChange={() => toggleCheck('autoPeep')} className="w-4 h-4" />
            </label>
          </div>
        </div>

        {/* --- 그래프 영역 (우측) --- */}
        <div className="lg:col-span-3 grid grid-cols-1 gap-6">
            
            {/* 1. Scalars (Time-based waveforms) */}
            <div className="bg-white p-4 rounded-lg border shadow-sm">
                <h3 className="text-sm font-bold text-gray-500 mb-2">Scalars (Pressure, Flow, Volume vs Time)</h3>
                
                {/* Pressure */}
                <div className="h-32 mb-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={scalars}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <YAxis domain={[0, 40]} hide />
                            <Tooltip labelFormatter={() => ''} formatter={(value) => [`${value.toFixed(1)} cmH2O`, 'Pressure']} />
                            <Line type="monotone" dataKey="pressure" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <div className="text-xs text-yellow-600 font-bold -mt-6 ml-2">Pressure (cmH2O)</div>
                </div>

                {/* Flow */}
                <div className="h-32 mb-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={scalars}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <YAxis domain={[-60, 60]} hide />
                            <Tooltip labelFormatter={() => ''} formatter={(value) => [`${value.toFixed(1)} L/min`, 'Flow']} />
                            <Line type="monotone" dataKey="flow" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                            {/* Baseline */}
                            <Line type="monotone" dataKey={() => 0} stroke="#9ca3af" strokeDasharray="3 3" dot={false} strokeWidth={1} />
                        </LineChart>
                    </ResponsiveContainer>
                    <div className="text-xs text-green-600 font-bold -mt-6 ml-2">Flow (L/min)</div>
                </div>

                {/* Volume */}
                <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={scalars}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <YAxis domain={[0, 800]} hide />
                            <Tooltip labelFormatter={() => ''} formatter={(value) => [`${value.toFixed(0)} mL`, 'Volume']} />
                            <Line type="monotone" dataKey="volume" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <div className="text-xs text-blue-600 font-bold -mt-6 ml-2">Volume (mL)</div>
                </div>
            </div>

            {/* 2. Loops */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Pressure-Volume Loop */}
                <div className="bg-white p-4 rounded-lg border shadow-sm aspect-square relative">
                    <h3 className="text-sm font-bold text-gray-500 mb-2 absolute top-4 left-4">Pressure-Volume Loop</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid />
                            <XAxis type="number" dataKey="pressure" name="Pressure" unit="cmH2O" domain={[0, 40]} />
                            <YAxis type="number" dataKey="volume" name="Volume" unit="mL" domain={[0, 800]} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="PV Loop" data={loops} fill="#8884d8" line={{ stroke: '#3b82f6', strokeWidth: 2 }} shape={() => null} isAnimationActive={false} />
                        </ScatterChart>
                    </ResponsiveContainer>
                    {params.overdistension && <div className="absolute top-1/4 right-1/4 text-xs text-red-500 font-bold bg-white/80 px-1">Beak (Overdistension)</div>}
                </div>

                {/* Flow-Volume Loop */}
                <div className="bg-white p-4 rounded-lg border shadow-sm aspect-square relative">
                    <h3 className="text-sm font-bold text-gray-500 mb-2 absolute top-4 left-4">Flow-Volume Loop</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid />
                            {/* X축이 Volume, Y축이 Flow인 것이 표준 */}
                            <XAxis type="number" dataKey="volume" name="Volume" unit="mL" domain={[0, 800]} />
                            <YAxis type="number" dataKey="flow" name="Flow" unit="L/min" domain={[-60, 60]} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="FV Loop" data={loops} fill="#8884d8" line={{ stroke: '#22c55e', strokeWidth: 2 }} shape={() => null} isAnimationActive={false} />
                        </ScatterChart>
                    </ResponsiveContainer>
                    {params.resistance > 30 && <div className="absolute bottom-1/4 left-1/3 text-xs text-orange-500 font-bold bg-white/80 px-1">Scooped (Obstruction)</div>}
                </div>

            </div>
        </div>

      </div>
    </div>
  );
}
