import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("polki_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((d) => (d && typeof d.msg === "string" ? d.msg : JSON.stringify(d))).join(" ");
  if (typeof detail?.msg === "string") return detail.msg;
  return String(detail);
}

export const ct = (v) => Number(v || 0).toFixed(2);
export const pct = (v) => `${Number(v || 0).toFixed(2)}%`;
export const today = () => new Date().toISOString().slice(0, 10);

// Keeps a weight input to at most 2 decimal places while typing.
export const dec2 = (v) => {
  const s = String(v ?? "");
  if (s === "") return "";
  const m = s.match(/^\d*(?:\.\d{0,2})?/);
  return m ? m[0] : "";
};
