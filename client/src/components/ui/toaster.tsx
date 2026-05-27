import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, onClick, ...props }) {
        const content = (
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && (
              <ToastDescription>{description}</ToastDescription>
            )}
          </div>
        )

        return (
          <Toast key={id} {...props}>
            {onClick ? (
              <button
                className="grid gap-1 text-left flex-1 min-w-0"
                onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
                data-testid="button-notification-toast"
              >
                {content}
              </button>
            ) : content}
            {action}
            <ToastClose onClick={(e) => e.stopPropagation()} />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
