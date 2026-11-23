import React, { useState } from 'react';
import { X, Cpu, Play, CheckCircle2, Award, Zap, BarChart3 } from 'lucide-react';
import { ASL_CLASSES } from '../utils/model';

interface ModelTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelTrainingModal: React.FC<ModelTrainingModalProps> = ({ isOpen, onClose }) => {
  const [isTraining, setIsTraining] = useState(false);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [totalEpochs] = useState(35);
  const [trainLoss, setTrainLoss] = useState<number>(1.84);
  const [trainAcc, setTrainAcc] = useState<number>(0.22);
  const [valLoss, setValLoss] = useState<number>(1.79);
  const [valAcc, setValAcc] = useState<number>(0.28);
  const [isCompleted, setIsCompleted] = useState(false);
  const [trainingLogs, setTrainingLogs] = useState<string[]>([]);

  if (!isOpen) return null;

  const startTraining = () => {
    setIsTraining(true);
    setIsCompleted(false);
    setCurrentEpoch(0);
    setTrainingLogs([
      '[Data] Loading dataset from: dataset/asl_landmarks.csv',
      `[Data] Dataset shape: (${ASL_CLASSES.length * 120}, 64) - ${ASL_CLASSES.length} gesture classes`,
      '[Preprocessing] Wrist-relative scale normalization applied (63 coords)',
      `[Architecture] ASLMLP: Linear(63->128) -> BN -> ReLU -> Linear(128->64) -> Linear(64->${ASL_CLASSES.length})`,
      '[Optimizer] Adam (lr=0.001, weight_decay=1e-4) | Scheduler: ReduceLROnPlateau'
    ]);

    let epoch = 0;
    const interval = setInterval(() => {
      epoch++;
      setCurrentEpoch(epoch);

      const progress = epoch / totalEpochs;
      const curTrainLoss = Math.max(0.04, 1.9 * Math.exp(-progress * 3.8) + (Math.random() - 0.5) * 0.02);
      const curTrainAcc = Math.min(0.995, 0.2 + 0.78 * (1 - Math.exp(-progress * 4.2)) + (Math.random() - 0.5) * 0.01);
      const curValLoss = Math.max(0.06, 1.8 * Math.exp(-progress * 3.6) + (Math.random() - 0.5) * 0.02);
      const curValAcc = Math.min(0.988, 0.25 + 0.73 * (1 - Math.exp(-progress * 4.0)) + (Math.random() - 0.5) * 0.015);

      setTrainLoss(curTrainLoss);
      setTrainAcc(curTrainAcc);
      setValLoss(curValLoss);
      setValAcc(curValAcc);

      setTrainingLogs((prev) => [
        ...prev.slice(-8),
        `Epoch [${String(epoch).padStart(2, '0')}/${totalEpochs}] | Train Loss: ${curTrainLoss.toFixed(4)} Acc: ${(curTrainAcc * 100).toFixed(1)}% | Val Acc: ${(curValAcc * 100).toFixed(1)}%`
      ]);

      if (epoch >= totalEpochs) {
        clearInterval(interval);
        setIsTraining(false);
        setIsCompleted(true);
        setTrainingLogs((prev) => [
          ...prev,
          `[Training Complete] Checkpoint saved: models/asl_mlp_model.pth (Accuracy: ${(curValAcc * 100).toFixed(2)}%)`,
          `[Label Encoder] Saved classes: [${ASL_CLASSES.join(', ')}]`
        ]);
      }
    }, 90);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">PyTorch Model Training Pipeline</h3>
              <p className="text-xs text-slate-500">Train ASL MLP Neural Network on 63-D Landmark Features</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Architecture Spec Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Network Architecture Specification</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Input Dimension</span>
                <span className="font-mono font-bold text-slate-800">63 (21 × 3D)</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Hidden Layers</span>
                <span className="font-mono font-bold text-slate-800">128 → 64 (ReLU)</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Dropout / Norm</span>
                <span className="font-mono font-bold text-slate-800">0.2 + BatchNorm</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Output Classes</span>
                <span className="font-mono font-bold text-slate-800">{ASL_CLASSES.length} Gestures</span>
              </div>
            </div>
          </div>

          {/* Current Metrics during / after training */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold text-blue-700 block mb-0.5">Epoch</span>
              <span className="text-xl font-black text-blue-900 font-mono">
                {currentEpoch} / {totalEpochs}
              </span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold text-emerald-700 block mb-0.5">Validation Acc</span>
              <span className="text-xl font-black text-emerald-900 font-mono">
                {(valAcc * 100).toFixed(1)}%
              </span>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold text-indigo-700 block mb-0.5">Train Loss</span>
              <span className="text-xl font-black text-indigo-900 font-mono">
                {trainLoss.toFixed(4)}
              </span>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
              <span className="text-[11px] font-semibold text-violet-700 block mb-0.5">Validation Loss</span>
              <span className="text-xl font-black text-violet-900 font-mono">
                {valLoss.toFixed(4)}
              </span>
            </div>
          </div>

          {/* Training Logs Terminal */}
          <div>
            <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                <span>Training Pipeline Logs (train.py simulation):</span>
              </span>
              {isCompleted && (
                <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Best Checkpoint Saved
                </span>
              )}
            </div>
            <div className="bg-slate-900 rounded-xl p-3 font-mono text-[11px] text-slate-300 h-36 overflow-y-auto space-y-1">
              {trainingLogs.length === 0 ? (
                <p className="text-slate-500 italic">Click &quot;Start Training&quot; to begin training loop...</p>
              ) : (
                trainingLogs.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    <span className="text-blue-400">&gt;</span> {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            disabled={isTraining}
            onClick={startTraining}
            className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isTraining ? 'Training in progress...' : isCompleted ? 'Retrain Model' : 'Start Training'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
