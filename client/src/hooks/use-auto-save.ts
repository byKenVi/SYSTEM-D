import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave(formId: number | null, interval = 30000) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const dataRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedRef = useRef<string>("");

  const save = useCallback(async () => {
    if (!formId || !dataRef.current) return;
    const json = JSON.stringify(dataRef.current);
    if (json === lastSavedRef.current) return;

    setStatus("saving");
    try {
      await apiRequest("PUT", `/api/forms/${formId}`, { data: dataRef.current });
      lastSavedRef.current = json;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [formId]);

  const setData = useCallback((data: any) => {
    dataRef.current = data;
  }, []);

  useEffect(() => {
    if (!formId) return;
    timerRef.current = setInterval(save, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [formId, interval, save]);

  return { status, setData, save };
}
