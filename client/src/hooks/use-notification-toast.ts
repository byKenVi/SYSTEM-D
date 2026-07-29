import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import type { Notification } from "@shared/schema";

export function useNotificationToast(enabled: boolean) {
  const [, navigate] = useLocation();
  const seenIdsRef = useRef<Set<number> | null>(null);

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/portal/notifications"],
    enabled,
    refetchInterval: 8_000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!notifications) return;

    const unread = notifications.filter((n) => !n.isRead);

    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(unread.map((n) => n.id));
      return;
    }

    const newNotifications = unread.filter((n) => !seenIdsRef.current!.has(n.id));

    newNotifications.forEach((n) => {
      seenIdsRef.current!.add(n.id);
      toast({
        title: n.title,
        description: n.message,
        duration: 6000,
        onClick: () => navigate("/portal/notifications"),
      });
    });
  }, [notifications, navigate]);
}
