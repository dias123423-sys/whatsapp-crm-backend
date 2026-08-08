import { useNotifications } from '@/lib/store';
import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react';
import type { Notification } from '@/lib/store';

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertCircle,
};

const colorMap = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
};

const iconColorMap = {
  success: 'text-green-600',
  error: 'text-red-600',
  info: 'text-blue-600',
  warning: 'text-yellow-600',
};

export default function Notifications() {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => {
        const Icon = iconMap[notification.type];
        
        return (
          <div
            key={notification.id}
            className={`
              ${colorMap[notification.type]}
              border rounded-lg p-4 shadow-lg
              animate-in slide-in-from-right duration-300
            `}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 flex-shrink-0 ${iconColorMap[notification.type]}`} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{notification.title}</div>
                {notification.message && (
                  <div className="text-sm mt-1">{notification.message}</div>
                )}
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="flex-shrink-0 hover:opacity-70 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
