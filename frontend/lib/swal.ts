import Swal from "sweetalert2";

// Toast notification for non-blocking alerts (top-right)
export const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  background: "#0f172a", // slate-900
  color: "#f8fafc",      // slate-50
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

export const showSuccessToast = (title: string) => {
  return Toast.fire({
    icon: "success",
    title,
  });
};

export const showErrorToast = (title: string) => {
  return Toast.fire({
    icon: "error",
    title,
  });
};

export const showWarningToast = (title: string) => {
  return Toast.fire({
    icon: "warning",
    title,
  });
};

export const showInfoToast = (title: string) => {
  return Toast.fire({
    icon: "info",
    title,
  });
};

// Polished confirm dialog with brand styling
export const showConfirmDialog = async ({
  title = "Are you sure?",
  text = "You will not be able to recover this data.",
  confirmButtonText = "Yes, delete",
  cancelButtonText = "Cancel",
  icon = "warning" as const,
  confirmButtonColor = "#dc2626", // rose-600
  cancelButtonColor = "#475569",  // slate-600
}: {
  title?: string;
  text?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  icon?: "warning" | "error" | "success" | "info" | "question";
  confirmButtonColor?: string;
  cancelButtonColor?: string;
}): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonColor,
    cancelButtonColor,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
    background: "#0f172a", // slate-900
    color: "#f8fafc",      // slate-50
    customClass: {
      popup: "rounded-3xl border border-slate-800 shadow-2xl",
      confirmButton: "px-5 py-2.5 rounded-xl font-bold text-xs shadow-md",
      cancelButton: "px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-700",
    },
  });
  return result.isConfirmed;
};

// Modal notification for important alerts
export const showNotification = ({
  title,
  text,
  icon = "info",
  confirmButtonText = "OK",
}: {
  title: string;
  text?: string;
  icon?: "success" | "error" | "warning" | "info";
  confirmButtonText?: string;
}) => {
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonColor: "#ea580c", // orange-600
    confirmButtonText,
    background: "#0f172a",
    color: "#f8fafc",
    customClass: {
      popup: "rounded-3xl border border-slate-800 shadow-2xl",
      confirmButton: "px-6 py-2.5 rounded-xl font-bold text-xs shadow-md",
    },
  });
};

// Polished input dialog replacing raw window.prompt()
export const showPromptDialog = async ({
  title,
  inputPlaceholder = "Enter value...",
  inputValue = "",
  confirmButtonText = "Submit",
  cancelButtonText = "Cancel",
}: {
  title: string;
  inputPlaceholder?: string;
  inputValue?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}): Promise<string | null> => {
  const result = await Swal.fire({
    title,
    input: "text",
    inputValue,
    inputPlaceholder,
    showCancelButton: true,
    confirmButtonColor: "#ea580c",
    cancelButtonColor: "#475569",
    confirmButtonText,
    cancelButtonText,
    background: "#0f172a",
    color: "#f8fafc",
    customClass: {
      popup: "rounded-3xl border border-slate-800 shadow-2xl",
      confirmButton: "px-6 py-2.5 rounded-xl font-bold text-xs shadow-md",
      cancelButton: "px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-700",
      input: "bg-slate-800 text-white border-slate-700 text-sm rounded-xl px-4 py-2",
    },
  });
  if (result.isConfirmed && result.value) {
    return result.value as string;
  }
  return null;
};

export default Swal;
