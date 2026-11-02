/**
 * TelemetryPanel — Live hardware health monitor for GPU owners.
 *
 * Subscribes to `gpu:telemetry` and `gpu:safety_alert` socket events
 * and renders real-time gauges for temperature, GPU utilization,
 * power draw, VRAM, CPU, and RAM usage.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  Thermometer, Cpu, Zap, Activity, MemoryStick, HardDrive,
  Wifi, AlertTriangle, ShieldCheck, ShieldAlert, Clock, RefreshCw,
  X,
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtUptime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function safeNum(v, decimals = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(decimals) : '—';
}

// ─── sub-components ─────────────────────────────────────────────────────────

const LEVEL_COLOR = {
  ok:       { ring: '#22c55e', bg: 'rgba(34,197,94,0.12)',  text: '#4ade80' },
  warning:  { ring: '#f59e0b', bg: 'rgba(245,158,11,0.12)', text: '#fbbf24' },
  critical: { ring: '#ef4444', bg: 'rgba(239,68,68,0.12)',  text: '#f87171' },
};

function getSafety(snapshot) {
  const alerts = [];
  let level = 'ok';
  const warn = (message, critical = false) => {
    alerts.push(message);
    if (critical) level = 'critical';
    else if (level === 'ok') level = 'warning';
  };
  const gpuTemp = snapshot?.gpu_temp ?? snapshot?.temperature;
  const gpuPower = snapshot?.gpu_power_w ?? snapshot?.power_watts;
  if (gpuTemp >= 92) warn(`GPU temperature is critical (${gpuTemp}°C).`, true);
  else if (gpuTemp >= 80) warn(`GPU temperature is high (${gpuTemp}°C).`);
  if (snapshot?.cpu_temp >= 95) warn(`CPU temperature is critical (${snapshot.cpu_temp}°C).`, true);
  else if (snapshot?.cpu_temp >= 85) warn(`CPU temperature is high (${snapshot.cpu_temp}°C).`);
  if (gpuPower >= 350) warn(`GPU power draw is high (${Math.round(gpuPower)} W).`);
  if (snapshot?.ram_pct >= 90) warn(`System memory usage is high (${Math.round(snapshot.ram_pct)}%).`);
  return { level, alerts };
}

function getAlertKey(alert) {
  const alertKey = (alert.alerts ?? [])
    .map(message => message.replace(/\s*\(.*\)$/, ''))
    .join('|');
  return `${alert.level}-${alertKey}`;
}

function GaugeBar({ label, icon: Icon, value, max = 100, unit = '%', colorFn }) {
  const pct   = Math.min(100, Math.max(0, ((value ?? 0) / max) * 100));
  const color = colorFn ? colorFn(value) : (pct > 85 ? '#ef4444' : pct > 65 ? '#f59e0b' : '#22c55e');
  const display = value == null ? '—' : `${safeNum(value, unit === '°C' ? 0 : 1)}${unit}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 11 }}>
          {React.createElement(Icon, { size: 12 })}
          <span>{label}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color }}>{display}</span>
      </div>
      <div style={{ height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <Motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 9999, background: color }}
        />
      </div>
    </div>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 10,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      flex: '1 1 140px',
    }}>
      {React.createElement(Icon, { size: 14, style: { color: '#6366f1', flexShrink: 0 } })}
      <div>
        <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#e5e7eb', lineHeight: 1.4 }}>
          {value ?? '—'}
        </div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function TelemetryPanel({ socket, initialSnapshot }) {
  const [snapshot, setSnapshot]   = useState(initialSnapshot ?? null);
  const [alerts, setAlerts] = useState(() => {
    const safety = initialSnapshot?.safety ?? getSafety(initialSnapshot);
    return safety.level === 'ok' ? [] : [{ ...safety, key: getAlertKey(safety) }];
  });
  const [now, setNow] = useState(0);
  const alertTimers = useRef({});

  // Dismiss an alert after 30s
  const addAlert = useCallback((alert) => {
    const key = getAlertKey(alert);
    setAlerts(prev => {
      if (prev.find(a => a.key === key)) return prev;
      return [{ ...alert, key }, ...prev].slice(0, 5);
    });
    clearTimeout(alertTimers.current[key]);
    alertTimers.current[key] = setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.key !== key));
    }, 30_000);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onTelemetry = (data) => {
      const safety = data.safety ?? getSafety(data);
      setSnapshot({ ...data, safety });
      if (safety.level !== 'ok') addAlert(safety);
    };

    const onSafetyAlert = (data) => {
      addAlert(data);
    };

    socket.on('gpu:telemetry',    onTelemetry);
    socket.on('gpu:safety_alert', onSafetyAlert);
    return () => {
      socket.off('gpu:telemetry',    onTelemetry);
      socket.off('gpu:safety_alert', onSafetyAlert);
    };
  }, [socket, addAlert]);

  useEffect(() => () => {
    Object.values(alertTimers.current).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const safety = snapshot?.safety ?? getSafety(snapshot);
  const colors = LEVEL_COLOR[safety.level] ?? LEVEL_COLOR.ok;
  const hasData = snapshot != null;
  const snapshotTime = snapshot?.timestamp ?? snapshot?.updatedAt;
  const lastAt = snapshotTime ? new Date(snapshotTime) : null;

  const gpuTemp    = snapshot?.gpu_temp ?? snapshot?.temperature;
  const cpuTemp    = snapshot?.cpu_temp;
  const gpuUtil    = snapshot?.gpu_util;
  const gpuMemTotal = snapshot?.gpu_mem_total_mb ?? snapshot?.mem_total_mb;
  const gpuMemUsed = snapshot?.gpu_mem_used_mb ?? snapshot?.mem_used_mb;
  const gpuMemPct  = gpuMemTotal ? ((gpuMemUsed ?? 0) / gpuMemTotal) * 100 : null;
  const gpuPower   = snapshot?.gpu_power_w ?? snapshot?.power_watts;
  const gpuFan     = snapshot?.gpu_fan_pct;
  const cpuPct     = snapshot?.cpu_pct;
  const ramPct     = snapshot?.ram_pct;
  const uptime     = snapshot?.uptime_seconds;
  const isStale = lastAt != null && now - lastAt.getTime() > 45_000;

  return (
    <div style={{
      background: '#0d1117',
      border: `1px solid ${hasData ? colors.ring + '55' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 16,
      overflow: 'hidden',
      transition: 'border-color 0.4s',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        background: hasData ? colors.bg : 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.4s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {safety.level === 'ok'
            ? <ShieldCheck size={18} style={{ color: colors.text }} />
            : <ShieldAlert size={18} style={{ color: colors.text }} />}
          <span style={{ fontWeight: 700, fontSize: 13, color: '#f3f4f6' }}>
            Hardware Telemetry
          </span>
          {hasData && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px',
              borderRadius: 999, background: colors.bg,
              border: `1px solid ${colors.ring}55`, color: colors.text,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {safety.level}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastAt && (
            <span style={{ fontSize: 10, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={10} />
              {isStale ? 'Telemetry is stale' : `Updated ${lastAt.toLocaleTimeString()}`}
            </span>
          )}
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: hasData && !isStale ? colors.ring : '#374151',
            boxShadow: hasData && !isStale ? `0 0 6px ${colors.ring}` : 'none',
            animation: hasData && safety.level !== 'ok' ? 'pulse 1.5s infinite' : 'none',
          }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px' }}>
        <div aria-live="polite" className="fixed right-4 top-4 z-[1100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
          <AnimatePresence>
            {alerts.map(alert => (
              <Motion.div
                key={alert.key}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: alert.level === 'critical' ? '#3b1519' : '#382b12',
                  border: `1px solid ${alert.level === 'critical' ? '#ef444488' : '#f59e0b88'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                }}
              >
                <AlertTriangle size={15} style={{
                  color: alert.level === 'critical' ? '#f87171' : '#fbbf24',
                  flexShrink: 0, marginTop: 1,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: alert.level === 'critical' ? '#f87171' : '#fbbf24',
                    marginBottom: 3,
                  }}>
                    Hardware {alert.level}
                  </div>
                  {(alert.alerts ?? []).map((message, index) => (
                    <div key={index} style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 1.5 }}>{message}</div>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss hardware alert"
                  onClick={() => setAlerts(prev => prev.filter(item => item.key !== alert.key))}
                  style={{ color: '#9ca3af', padding: 2 }}
                >
                  <X size={14} />
                </button>
              </Motion.div>
            ))}
          </AnimatePresence>
        </div>
        {!hasData ? (
          <div style={{
            textAlign: 'center', padding: '32px 0',
            color: '#4b5563', fontSize: 13,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <Activity size={28} style={{ opacity: 0.4 }} />
            <span>Waiting for telemetry…<br />
              <span style={{ fontSize: 11 }}>Start the host agent to send updates every 15 seconds</span>
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* GPU Section */}
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                GPU
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <GaugeBar label="Temperature" icon={Thermometer} value={gpuTemp}
                  max={100} unit="°C"
                  colorFn={v => v >= 92 ? '#ef4444' : v >= 80 ? '#f59e0b' : '#22c55e'} />
                <GaugeBar label="Utilization" icon={Activity} value={gpuUtil}
                  max={100} unit="%" />
                <GaugeBar label="VRAM Usage" icon={MemoryStick} value={gpuMemPct}
                  max={100} unit="%" />
                {gpuPower != null && (
                  <GaugeBar label="Power Draw" icon={Zap} value={gpuPower}
                    max={400} unit="W"
                    colorFn={v => v >= 350 ? '#f59e0b' : '#22c55e'} />
                )}
                {gpuFan != null && (
                  <GaugeBar label="Fan Speed" icon={RefreshCw} value={gpuFan}
                    max={100} unit="%" />
                )}
              </div>
            </div>

            {/* CPU / RAM Section */}
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                System
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <GaugeBar label="CPU Usage" icon={Cpu} value={cpuPct}
                  max={100} unit="%" />
                {cpuTemp != null && (
                  <GaugeBar label="CPU Temp" icon={Thermometer} value={cpuTemp}
                    max={100} unit="°C"
                    colorFn={v => v >= 95 ? '#ef4444' : v >= 85 ? '#f59e0b' : '#22c55e'} />
                )}
                <GaugeBar label="RAM Usage" icon={HardDrive} value={ramPct}
                  max={100} unit="%" />
                {snapshot?.disk_used_pct != null && (
                  <GaugeBar label="Disk Usage" icon={HardDrive} value={snapshot.disk_used_pct}
                    max={100} unit="%" />
                )}
              </div>
            </div>

            {/* Stat pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <StatPill icon={Clock} label="Uptime" value={fmtUptime(uptime)} />
              <StatPill icon={MemoryStick} label="VRAM Used"
                value={gpuMemUsed != null && gpuMemTotal != null
                  ? `${Math.round(gpuMemUsed / 1024 * 10) / 10} / ${Math.round(gpuMemTotal / 1024 * 10) / 10} GB`
                  : null} />
              <StatPill icon={HardDrive} label="RAM Used"
                value={snapshot?.ram_used_mb
                  ? `${Math.round(snapshot.ram_used_mb / 1024)} / ${Math.round(snapshot.ram_total_mb / 1024)} GB`
                  : null} />
              <StatPill icon={Wifi} label="Network sent / received"
                value={snapshot?.net_sent_mb != null
                  ? `${safeNum(snapshot.net_sent_mb, 0)} / ${safeNum(snapshot.net_recv_mb, 0)} MB`
                  : null} />
              <StatPill icon={HardDrive} label="Disk Used"
                value={snapshot?.disk_used_gb != null && snapshot?.disk_total_gb != null
                  ? `${safeNum(snapshot.disk_used_gb, 1)} / ${safeNum(snapshot.disk_total_gb, 1)} GB`
                  : null} />
            </div>
          </div>
        )}
        {hasData && (
          <p style={{ marginTop: 14, fontSize: 10, lineHeight: 1.5, color: '#6b7280' }}>
            Updates every 15 seconds while the host agent is online. Alerts notify you but do not stop a job.
            NVIDIA readings require NVIDIA drivers; CPU temperature depends on an available system sensor.
          </p>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
