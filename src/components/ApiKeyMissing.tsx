import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Settings, X } from 'lucide-react';
import { MissingApiKeyError } from '../lib/aiProvider';

interface Props {
  error: MissingApiKeyError;
  onDismiss: () => void;
}

export function ApiKeyMissing({ error, onDismiss }: Props) {
  const navigate = useNavigate();
  const isKie = error.provider === 'kie';
  const isFal = error.provider === 'fal';
  const bannerClass = isFal ? 'bg-violet-50' : isKie ? 'bg-emerald-50' : 'bg-indigo-50';
  const iconBgClass = isFal ? 'bg-violet-100' : isKie ? 'bg-emerald-100' : 'bg-indigo-100';
  const iconClass = isFal ? 'text-violet-600' : isKie ? 'text-emerald-600' : 'text-indigo-600';
  const providerName = isFal ? 'fal.ai' : isKie ? 'kie.ai' : 'Google Gemini';
  const message = isFal
    ? 'لم يتم إضافة مفتاح fal.ai API بعد. أضف المفتاح في الإعدادات لتتمكن من استخدام ميزات التوليد.'
    : isKie
      ? 'لم يتم إضافة مفتاح kie.ai API بعد. أضف المفتاح في الإعدادات لتتمكن من استخدام ميزات التوليد.'
      : 'لم يتم إضافة مفتاح Gemini API بعد. أضف المفتاح في الإعدادات لتتمكن من استخدام ميزات التوليد.';
  const buttonClass = isFal ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-500/20' : isKie ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20';

  return (
    <div data-testid="api-key-missing-banner" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/30 backdrop-blur-sm animate-in fade-in" onClick={onDismiss}>
      <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border/60 overflow-hidden animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
        <div className={`p-5 ${bannerClass}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBgClass}`}>
                <AlertTriangle className={`w-5 h-5 ${iconClass}`} />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">مفتاح API مطلوب</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{providerName}</p>
              </div>
            </div>
            <button onClick={onDismiss} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-card-foreground leading-relaxed">{message}</p>
          <button
            data-testid="go-to-settings-btn"
            onClick={() => { onDismiss(); navigate('/settings'); }}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-all active:scale-[0.98] ${buttonClass} shadow-lg`}
          >
            <Settings className="w-4 h-4" />
            اذهب للإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}
