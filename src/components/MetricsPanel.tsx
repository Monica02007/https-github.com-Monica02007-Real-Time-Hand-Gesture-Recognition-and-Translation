import React from 'react';
import { Activity, Sparkles, HelpCircle } from 'lucide-react';
import { GESTURE_DESCRIPTIONS } from '../utils/model';

interface MetricsPanelProps {
  detectedChar: string | null;
  confidence: number;
  top3: { char: string; confidence: number }[];
  fps: number;
  holdCount: number;
  debounceFrames: number;
  confidenceThreshold: number;
  onOpenGuide: () => void;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  detectedChar,
  confidence,
  top3,
  fps,
  holdCount,
  debounceFrames,
  confidenceThreshold,
  onOpenGuide
}) => {
  const isConfident = Boolean(detectedChar && confidence >= confidenceThreshold);
  const holdPercentage = Math.min(100, (holdCount / debounceFrames) * 100);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span>Classification Metrics</span>
        </h3>
        <button
          type="button"
          onClick={onOpenGuide}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 hover:underline"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>ASL Guide</span>
        </button>
      </div>

      {/* Top-1 Current Sign Card */}
      <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-xl p-4 border border-blue-100/60 shadow-sm text-center relative overflow-hidden">
        <div className="absolute top-2 left-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Detected Sign
        </div>

        {isConfident && detectedChar ? (
          <div className="pt-2">
            <div className="pred-badge text-blue-600 animate-in fade-in zoom-in-95 duration-150">
              {detectedChar}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-1 truncate px-2" title={GESTURE_DESCRIPTIONS[detectedChar]}>
              {GESTURE_DESCRIPTIONS[detectedChar] || 'Hand sign recognized'}
            </p>
          </div>
        ) : (
          <div className="py-6 text-slate-400">
            <p className="text-base font-semibold">Waiting for gesture...</p>
            <p className="text-xs text-slate-400 mt-1">Show hand clearly in frame</p>
          </div>
        )}

        {/* Hold Accumulator Bar */}
        <div className="mt-3 pt-2 border-t border-slate-200/60">
          <div className="flex justify-between items-center text-[11px] text-slate-500 mb-1">
            <span className="font-medium">Debounce Hold</span>
            <span className="font-semibold text-slate-700">
              {holdCount} / {debounceFrames} frames
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 rounded-full ${
                holdCount >= debounceFrames ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${holdPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Confidence Score Bar */}
      <div>
        <div className="flex justify-between items-center text-xs mb-1">
          <span className="font-semibold text-slate-700">Recognition Confidence</span>
          <span className={`font-bold ${isConfident ? 'text-blue-700' : 'text-slate-500'}`}>
            {(confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
          <div
            className={`h-full transition-all duration-150 rounded-full ${
              isConfident ? 'bg-blue-600' : 'bg-slate-300'
            }`}
            style={{ width: `${Math.min(100, confidence * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>0%</span>
          <span className="text-amber-600 font-medium">Threshold: {(confidenceThreshold * 100).toFixed(0)}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Top 3 Ranked Candidates */}
      <div className="pt-1">
        <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Top Candidates</span>
        </div>
        {top3.length > 0 ? (
          <div className="space-y-2">
            {top3.map((item, idx) => {
              const pct = (item.confidence * 100).toFixed(1);
              return (
                <div key={item.char} className="text-xs">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="text-slate-400 text-[10px]">#{idx + 1}</span>
                      <span className="px-1.5 py-0.2 bg-slate-100 rounded font-mono text-blue-700">
                        {item.char}
                      </span>
                    </span>
                    <span className="font-mono text-slate-600">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-100 ${
                        idx === 0 ? 'bg-blue-500' : idx === 1 ? 'bg-slate-400' : 'bg-slate-300'
                      }`}
                      style={{ width: `${item.confidence * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No candidates detected</p>
        )}
      </div>

      {/* Live System Performance Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Feed: <strong className="text-slate-700">{fps.toFixed(1)} FPS</strong></span>
        </span>
        <span className="text-slate-400 font-mono">Input: 63 coords</span>
      </div>
    </div>
  );
};
