import React, { useMemo, useState } from 'react';
import { Space, Delete, Trash2, Copy, Check, Volume2, Sparkles } from 'lucide-react';

interface SentenceBuilderProps {
  sentence: string;
  onSentenceChange: (newSentence: string) => void;
  lastAddedChar?: string | null;
}

const COMMON_ASL_WORDS = [
  'HELLO', 'HELP', 'HERE', 'HEY', 'HOW', 'HAPPY', 'HOME', 'HAVE', 'HI',
  'THANK YOU', 'THANKS', 'THANK', 'THAT', 'THIS', 'THERE', 'TIME', 'TODAY', 'TOMORROW',
  'PLEASE', 'PEACE', 'PEOPLE',
  'GOOD', 'GREAT', 'GO', 'GOODBYE',
  'YES', 'YOU', 'YOUR',
  'NO', 'NAME', 'NICE', 'NEED', 'NIGHT', 'NOW',
  'WATER', 'WHAT', 'WHERE', 'WHEN', 'WHO', 'WHY', 'WELCOME', 'WAIT', 'WANT', 'WORK',
  'LOVE', 'I LOVE YOU', 'LIKE', 'LEARN', 'LOOK',
  'SORRY', 'STOP', 'SEE', 'SIGN', 'SCHOOL',
  'MORNING', 'FRIEND', 'FAMILY', 'FOOD', 'FINE', 'FINISH',
  'DRINK', 'EAT', 'COME', 'CARE', 'BYE', 'OK',
];

const STARTER_WORDS = ['HELLO', 'THANK YOU', 'PLEASE', 'HELP', 'GOOD', 'YES', 'NO', 'I LOVE YOU'];

export const SentenceBuilder: React.FC<SentenceBuilderProps> = ({
  sentence,
  onSentenceChange,
  lastAddedChar,
}) => {
  const [copied, setCopied] = useState(false);

  const { currentFragment, suggestions } = useMemo(() => {
    const trimmedRight = sentence;
    const lastSpaceIdx = trimmedRight.lastIndexOf(' ');
    const fragment = (lastSpaceIdx === -1 ? trimmedRight : trimmedRight.slice(lastSpaceIdx + 1)).toUpperCase();

    if (!fragment) {
      return { currentFragment: '', suggestions: STARTER_WORDS };
    }

    const prefixMatches = COMMON_ASL_WORDS.filter(
      (w) => w.startsWith(fragment) && w !== fragment
    );
    const containsMatches =
      prefixMatches.length < 6
        ? COMMON_ASL_WORDS.filter(
            (w) => !w.startsWith(fragment) && w.includes(fragment) && w !== fragment
          )
        : [];

    const combined = [...prefixMatches, ...containsMatches].slice(0, 7);
    return {
      currentFragment: fragment,
      suggestions: combined.length > 0 ? combined : STARTER_WORDS.slice(0, 5),
    };
  }, [sentence]);

  const handleApplySuggestion = (word: string) => {
    if (!currentFragment) {
      onSentenceChange(`${sentence}${word} `);
      return;
    }
    // Check if any word starts with fragment — if yes, replace partial fragment; otherwise append
    const matchesPartial = word.startsWith(currentFragment) || word.includes(currentFragment);
    if (matchesPartial) {
      const lastSpaceIdx = sentence.lastIndexOf(' ');
      const prefix = lastSpaceIdx === -1 ? '' : sentence.slice(0, lastSpaceIdx + 1);
      onSentenceChange(`${prefix}${word} `);
    } else {
      onSentenceChange(`${sentence.trimEnd()} ${word} `);
    }
  };

  const handleSpace = () => {
    onSentenceChange(sentence + ' ');
  };

  const handleDelete = () => {
    onSentenceChange(sentence.slice(0, -1));
  };

  const handleClear = () => {
    onSentenceChange('');
  };

  const handleCopy = async () => {
    if (!sentence) return;
    try {
      await navigator.clipboard.writeText(sentence);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSpeak = () => {
    if (!sentence || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-5 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Sentence Display Area */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>Constructed Sentence</span>
              {lastAddedChar && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-800 animate-pulse">
                  + {lastAddedChar === ' ' ? 'SPACE' : lastAddedChar.trim()}
                </span>
              )}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {sentence.length} {sentence.length === 1 ? 'char' : 'chars'}
            </span>
          </div>

          <div className="sentence-box relative overflow-x-auto select-all">
            {sentence ? (
              <span className="tracking-wide break-words">{sentence}</span>
            ) : (
              <span className="text-slate-400 italic font-normal text-base">
                (Hold a hand sign steady to append letters or ASL words...)
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-4">
          <button
            type="button"
            onClick={handleSpace}
            title="Append space"
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 transition-colors shadow-sm"
          >
            <Space className="w-4 h-4 text-slate-500" />
            <span>␣ Space</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            title="Delete last character"
            disabled={!sentence}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200 disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm border border-amber-200"
          >
            <Delete className="w-4 h-4 text-amber-600" />
            <span>⌫ Del</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            title="Clear all text"
            disabled={!sentence}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 active:bg-rose-200 disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm border border-rose-200"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            <span>🗑 Clear</span>
          </button>

          <div className="h-6 w-px bg-slate-200 hidden md:block" />

          <button
            type="button"
            onClick={handleCopy}
            title="Copy sentence to clipboard"
            disabled={!sentence}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors shadow-sm"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleSpeak}
            title="Speak aloud"
            disabled={!sentence}
            className="inline-flex items-center justify-center p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors shadow-sm border border-blue-200"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Word Autocomplete & Quick ASL Word Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
          <Sparkles className="w-3 h-3 text-blue-500" />
          <span>{currentFragment ? `Word Matches (${currentFragment}):` : 'Quick Words:'}</span>
        </span>
        {suggestions.map((word) => (
          <button
            key={word}
            type="button"
            onClick={() => handleApplySuggestion(word)}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50/70 text-blue-700 hover:bg-blue-100 border border-blue-200/70 transition-colors"
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
};
