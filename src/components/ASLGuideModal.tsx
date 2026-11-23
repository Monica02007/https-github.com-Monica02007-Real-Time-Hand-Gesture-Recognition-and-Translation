import React, { useState } from 'react';
import { X, BookOpen, Search } from 'lucide-react';
import { ASL_LETTERS, ASL_WORDS, GESTURE_DESCRIPTIONS } from '../utils/model';

interface ASLGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ASLGuideModal: React.FC<ASLGuideModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const filteredWords = ASL_WORDS.filter(
    (s) => s.toLowerCase().includes(q) || (GESTURE_DESCRIPTIONS[s] || '').toLowerCase().includes(q)
  );
  const filteredLetters = ASL_LETTERS.filter(
    (s) => s.toLowerCase().includes(q) || (GESTURE_DESCRIPTIONS[s] || '').toLowerCase().includes(q)
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                ASL Gesture Reference Guide (28 Signs)
              </h3>
              <p className="text-xs text-slate-500">
                24 static ASL alphabet letters + 4 static ASL words &amp; sentence controls
              </p>
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

        {/* Search */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search letters or words (e.g. ILY, GOOD, K, R)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-5">
          {filteredWords.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2.5">
                ASL Words &amp; Controls ({filteredWords.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredWords.map((sign) => (
                  <div
                    key={sign}
                    className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 transition-colors flex items-start gap-3"
                  >
                    <div className="px-2.5 h-10 rounded-lg bg-emerald-600 text-white flex-shrink-0 flex items-center justify-center font-black text-sm shadow-sm">
                      {sign}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">
                        {sign === 'SPACE'
                          ? '␣ SPACE (Word Break)'
                          : sign === 'ILY'
                          ? '🤟 ILY ("I Love You")'
                          : `Word "${sign}"`}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {GESTURE_DESCRIPTIONS[sign]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredLetters.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2.5">
                Static ASL Alphabet ({filteredLetters.length} Letters — J &amp; Z require motion)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredLetters.map((sign) => (
                  <div
                    key={sign}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/40 hover:border-blue-200 transition-colors flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex-shrink-0 flex items-center justify-center font-black text-lg shadow-sm">
                      {sign}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-sm">
                        {sign === 'F' ? 'Letter "F" (Also OK)' : `Letter "${sign}"`}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {GESTURE_DESCRIPTIONS[sign]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredWords.length === 0 && filteredLetters.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-8">
              No ASL gestures matched &quot;{query}&quot;.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>21 MediaPipe hand landmarks • J &amp; Z omitted (dynamic motion signs)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
