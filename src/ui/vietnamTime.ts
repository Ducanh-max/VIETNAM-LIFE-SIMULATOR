import { useEffect, useState } from 'react';

export const VIETNAM_TZ = 'Asia/Ho_Chi_Minh';

const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: VIETNAM_TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: VIETNAM_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** Fractional hour (0–24) in Vietnam, independent of the device's own time zone. */
export function vietnamHour(date = new Date()) {
  const [h, m] = hourFormat.format(date).split(':').map(Number);
  return (h % 24) + m / 60;
}

export function vietnamTimeOfDay(date = new Date()): 'day' | 'sunset' | 'night' {
  const hour = vietnamHour(date);
  if (hour >= 6 && hour < 17) return 'day';
  if ((hour >= 17 && hour < 19) || (hour >= 5 && hour < 6)) return 'sunset';
  return 'night';
}

export function greetingFor(date = new Date()) {
  const hour = vietnamHour(date);
  if (hour >= 4 && hour < 11) return 'Chào buổi sáng';
  if (hour >= 11 && hour < 13) return 'Chào buổi trưa';
  if (hour >= 13 && hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function useVietnamClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const date = dateFormat.format(now);
  return { now, time: timeFormat.format(now), date: date.charAt(0).toUpperCase() + date.slice(1) };
}
