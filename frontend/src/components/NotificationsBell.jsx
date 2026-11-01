import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const backendUrl = () =>
  (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

const NotificationsBell = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef([]);

  useEffect(() => {
    if (!token) return undefined;
    api.get("/notifications").then(({ data }) => {
      const current = notificationsRef.current;
      const incoming = new Map(data.notifications.map((item) => [item._id, item]));
      current.forEach((item) => {
        if (!incoming.has(item._id)) incoming.set(item._id, item);
        else if (item.readAt) incoming.get(item._id).readAt = item.readAt;
      });
      const merged = [...incoming.values()]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
      notificationsRef.current = merged;
      setNotifications(merged);
      const receivedIds = new Set(data.notifications.map((item) => item._id));
      const newerUnread = current.filter(
        (item) => !item.readAt && !receivedIds.has(item._id)
      ).length;
      setUnreadCount(data.unreadCount + newerUnread);
    }).catch((error) => {
      console.error("Failed to load notifications:", error);
    });
    const socket = io(backendUrl(), { auth: { token } });
    socket.on("notification:new", (notification) => {
      if (notificationsRef.current.some((item) => item._id === notification._id)) return;
      const next = [notification, ...notificationsRef.current].slice(0, 50);
      notificationsRef.current = next;
      setNotifications(next);
      setUnreadCount((count) => count + 1);
    });
    socket.on("connect_error", (error) => {
      console.error("Notification connection failed:", error.message);
    });
    return () => socket.disconnect();
  }, [token]);

  const markRead = async (notification) => {
    if (!notification.readAt) {
      try {
        const { data } = await api.patch(`/notifications/${notification._id}/read`);
        const next = notificationsRef.current.map((item) =>
          item._id === notification._id ? data.notification : item
        );
        notificationsRef.current = next;
        setNotifications(next);
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        return;
      }
    }
    setOpen(false);
    if (notification.job) navigate("/jobs");
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      const next = notificationsRef.current.map((item) => ({
        ...item,
        readAt: item.readAt || new Date().toISOString(),
      }));
      notificationsRef.current = next;
      setNotifications(next);
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="app-icon-button relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-text-dim hover:bg-white/10 hover:text-white"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[200] w-[min(24rem,90vw)] overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">Notifications</h2>
              <p className="text-[11px] text-text-dim">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!unreadCount}
              className="flex items-center gap-1 text-[11px] text-primary hover:text-white disabled:opacity-40"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div className="max-h-[24rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-text-dim">You’re all caught up.</p>
            ) : notifications.map((notification) => (
              <button
                type="button"
                key={notification._id}
                onClick={() => markRead(notification)}
                className={`block w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 ${notification.readAt ? "opacity-65" : ""}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold text-white">{notification.title}</span>
                  {!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-text-dim">{notification.message}</span>
                <span className="mt-1 block text-[10px] text-text-dim/70">
                  {new Date(notification.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
