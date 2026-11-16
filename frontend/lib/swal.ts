import Swal from "sweetalert2";

export function isDarkTheme(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      document.documentElement.classList.contains("dark") ||
      localStorage.getItem("hrms_chat_theme") === "dark"
    );
  } catch {
    return false;
  }
}

// Compact Bitrix24-Style Toast notification with instant close 'X' button
export const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  showCloseButton: true,
  timer: 3200,
  timerProgressBar: true,
  background: "#0f0e0eff", // Bitrix24 deep professional dark black
  color: "#f8fafc",      // Crisp slate-50
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

export const showSuccessToast = (title: string) => {
  return Toast.fire({
    icon: "success",
    title,
    iconColor: "#10b981",
  });
};

export const showErrorToast = (title: string) => {
  return Toast.fire({
    icon: "error",
    title,
    iconColor: "#f43f5e",
  });
};

export const showWarningToast = (title: string) => {
  return Toast.fire({
    icon: "warning",
    title,
    iconColor: "#f59e0b",
  });
};

export const showInfoToast = (title: string) => {
  return Toast.fire({
    icon: "info",
    title,
    iconColor: "#38bdf8",
  });
};

// Polished confirm dialog with clean, modern, professional styling
export const showConfirmDialog = async ({
  title = "Are you sure?",
  text = "You will not be able to recover this data.",
  confirmButtonText = "Yes, continue",
  cancelButtonText = "Cancel",
  icon = "question" as const,
  confirmButtonColor = "#ea580c",
  cancelButtonColor = "#64748b",
}: {
  title?: string;
  text?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  icon?: "warning" | "error" | "success" | "info" | "question";
  confirmButtonColor?: string;
  cancelButtonColor?: string;
}): Promise<boolean> => {
  const isDark = isDarkTheme();
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
    background: isDark ? "#182234" : "#ffffff",
    color: isDark ? "#f8fafc" : "#0f172a",
    iconColor: icon === "warning" ? "#d97706" : icon === "error" ? "#e11d48" : icon === "success" ? "#059669" : "#ea580c",
    customClass: {
      popup: `!rounded-2xl !border ${isDark ? "!border-slate-700 !bg-slate-900" : "!border-slate-200 !bg-white"} !p-6 !shadow-xl !max-w-[400px] !font-sans`,
      title: `!text-lg !font-extrabold ${isDark ? "!text-white" : "!text-slate-900"} !pt-1 !pb-0 tracking-tight`,
      htmlContainer: `!text-sm !font-medium ${isDark ? "!text-slate-300" : "!text-slate-600"} !pt-1 !pb-1 leading-relaxed`,
      actions: "!flex !items-center !justify-center !gap-3 !pt-3 !mt-1 !w-full",
      cancelButton: `!px-4.5 !py-2.5 !rounded-xl !border ${isDark ? "!border-slate-700 !bg-slate-800 hover:!bg-slate-700 !text-slate-200" : "!border-slate-200 !bg-slate-100 hover:!bg-slate-200 !text-slate-700"} !font-bold !text-sm !shadow-2xs transition-all cursor-pointer`,
      confirmButton: "!px-5 !py-2.5 !rounded-xl !font-bold !text-sm !text-white !shadow-xs transition-all cursor-pointer",
      icon: "!border-2 scale-[0.8] !my-1",
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
  const isDark = isDarkTheme();
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonColor: "#ea580c", // orange-600
    confirmButtonText,
    background: isDark ? "#182234" : "#ffffff",
    color: isDark ? "#f8fafc" : "#0f172a",
    iconColor: icon === "error" ? "#e11d48" : icon === "success" ? "#059669" : "#ea580c",
    customClass: {
      popup: `!rounded-2xl !border ${isDark ? "!border-slate-700 !bg-slate-900" : "!border-slate-200 !bg-white"} !p-6 !shadow-2xl !max-w-[400px] !font-sans`,
      title: `!text-base sm:!text-lg !font-bold ${isDark ? "!text-white" : "!text-slate-900"} !pt-2 !pb-0 tracking-tight`,
      htmlContainer: `!text-sm !font-medium ${isDark ? "!text-slate-300" : "!text-slate-600"} !pt-1.5 !pb-2 leading-relaxed`,
      confirmButton: "!px-6 !py-2.5 !rounded-xl !font-bold !text-sm !text-white !shadow-xs transition-all cursor-pointer",
      icon: "!border-2 scale-[0.8] !my-2",
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
    cancelButtonColor: "#64748b",
    confirmButtonText,
    cancelButtonText,
    background: "#ffffff",
    color: "#0f172a",
    customClass: {
      popup: "!rounded-2xl !border !border-slate-200 !bg-white !p-6 !shadow-2xl !max-w-[400px] !font-sans",
      title: "!text-base sm:!text-lg !font-bold !text-slate-900 !pt-2 !pb-0 tracking-tight",
      input: "!bg-slate-50 !text-slate-900 !border !border-slate-200 !text-sm !rounded-xl !px-3.5 !py-2.5",
      cancelButton: "!px-4.5 !py-2.5 !rounded-xl !border !border-slate-200 !bg-slate-100 hover:!bg-slate-200 !text-slate-700 !font-bold !text-sm !shadow-2xs transition-all cursor-pointer",
      confirmButton: "!px-6 !py-2.5 !rounded-xl !font-bold !text-sm !text-white !shadow-xs transition-all cursor-pointer",
    },
  });
  if (result.isConfirmed && result.value) {
    return result.value as string;
  }
  return null;
};

export default Swal;
