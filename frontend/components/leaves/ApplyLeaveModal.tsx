"use client";

import { useState, type FormEvent } from "react";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";

export type LeaveApplicationType = {
  id: number;
  name: string;
  daysAllowed: number;
};

export type EditingLeaveRequest = {
  id: number;
  leaveTypeId?: number;
  leaveType?: { id: number; name: string };
  startDate: string;
  endDate: string;
  totalDays?: number;
  halfDayPeriod?: "FIRST_HALF" | "SECOND_HALF" | null;
  reason: string;
};

type ApplyLeaveModalProps = {
  leaveTypes: LeaveApplicationType[];
  onClose: () => void;
  onSubmitted: () => Promise<void>;
  editingRequest?: EditingLeaveRequest | null;
};

const formatDateForInput = (dateStr?: string) => {
  if (!dateStr) return "";
  try {
    return dateStr.split("T")[0];
  } catch {
    return "";
  }
};

export function ApplyLeaveModal({
  leaveTypes,
  onClose,
  onSubmitted,
  editingRequest,
}: ApplyLeaveModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState(
    editingRequest
      ? String(editingRequest.leaveTypeId || editingRequest.leaveType?.id || (leaveTypes[0]?.id ?? ""))
      : leaveTypes.length ? String(leaveTypes[0].id) : ""
  );
  const [startDate, setStartDate] = useState(
    editingRequest ? formatDateForInput(editingRequest.startDate) : ""
  );
  const [endDate, setEndDate] = useState(
    editingRequest ? formatDateForInput(editingRequest.endDate) : ""
  );
  const [isHalfDay, setIsHalfDay] = useState(
    editingRequest ? Boolean(editingRequest.halfDayPeriod || editingRequest.totalDays === 0.5) : false
  );
  const [halfDayPeriod, setHalfDayPeriod] = useState<"FIRST_HALF" | "SECOND_HALF">(
    editingRequest?.halfDayPeriod || "FIRST_HALF"
  );
  const [reason, setReason] = useState(editingRequest?.reason || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTypeId || !startDate || (!isHalfDay && !endDate) || !reason.trim()) {
      setError("Complete all required fields before submitting.");
      return;
    }

    const requestEndDate = isHalfDay ? startDate : endDate;
    if (requestEndDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const isEdit = Boolean(editingRequest?.id);
      const url = isEdit
        ? `${getApiUrl()}/api/leaves/requests/${editingRequest!.id}`
        : `${getApiUrl()}/api/leaves/requests`;
      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leaveTypeId: Number(selectedTypeId),
          startDate,
          endDate: requestEndDate,
          isHalfDay,
          halfDayPeriod: isHalfDay ? halfDayPeriod : null,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `Failed to ${isEdit ? "update" : "submit"} leave request.`);
      }

      await onSubmitted();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : `Unable to ${editingRequest ? "update" : "submit"} the leave request.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-sm font-bold text-orange-600">
              📅
            </span>
            <h2 className="text-lg font-black text-slate-900">
              {editingRequest ? "Edit Leave Request" : "Apply for Leave"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leave application"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-6 overflow-y-auto">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label htmlFor="leaveType" className="mb-1 block text-xs font-bold text-slate-700">
              Leave Type
            </label>
            <select
              id="leaveType"
              value={selectedTypeId}
              onChange={(event) => setSelectedTypeId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              required
            >
              {leaveTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.daysAllowed} days/year)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="leaveStartDate" className="mb-1 block text-xs font-bold text-slate-700">
                Start Date
              </label>
              <input
                id="leaveStartDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-semibold focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                required
              />
            </div>
            {!isHalfDay ? (
              <div>
                <label htmlFor="leaveEndDate" className="mb-1 block text-xs font-bold text-slate-700">
                  End Date
                </label>
                <input
                  id="leaveEndDate"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-semibold focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>
            ) : (
              <div className="flex flex-col justify-end pb-2">
                <span className="text-xs font-bold text-slate-700">Duration</span>
                <span className="mt-1 text-xs font-semibold text-orange-700">Half day (0.5 day)</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={(event) => {
                  setIsHalfDay(event.target.checked);
                  setError(null);
                }}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 shrink-0 aspect-square items-center justify-center rounded-md border transition-all ${
                  isHalfDay
                    ? "border-[#F97316] bg-[#F97316] text-white shadow-xs"
                    : "border-slate-300 bg-white hover:border-slate-400"
                }`}
              >
                {isHalfDay && (
                  <svg className="h-2.5 w-2.5 fill-none stroke-current stroke-[3]" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span>Half-day leave</span>
            </label>
            {isHalfDay && (
              <fieldset className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 pb-2.5 pt-1">
                <legend className="px-1 text-xs font-bold text-slate-700">Which half of the day?</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`!mt-0 !flex !gap-2.5 cursor-pointer items-center rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${halfDayPeriod === "FIRST_HALF"
                      ? "border-orange-300 bg-white text-orange-800"
                      : "border-transparent text-slate-700 hover:border-orange-200 hover:bg-white/70"
                      }`}
                  >
                    <input
                      type="radio"
                      name="halfDayPeriod"
                      value="FIRST_HALF"
                      checked={halfDayPeriod === "FIRST_HALF"}
                      onChange={() => setHalfDayPeriod("FIRST_HALF")}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-4 w-4 shrink-0 aspect-square items-center justify-center rounded-full border-2 transition-all ${halfDayPeriod === "FIRST_HALF"
                        ? "border-[#F97316] bg-white"
                        : "border-slate-300 bg-white"
                        }`}
                    >
                      {halfDayPeriod === "FIRST_HALF" && (
                        <span className="h-2 w-2 rounded-full bg-[#F97316]" />
                      )}
                    </span>
                    First half
                  </label>
                  <label
                    className={`!mt-0 !flex !gap-2.5 cursor-pointer items-center rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${halfDayPeriod === "SECOND_HALF"
                      ? "border-orange-300 bg-white text-orange-800"
                      : "border-transparent text-slate-700 hover:border-orange-200 hover:bg-white/70"
                      }`}
                  >
                    <input
                      type="radio"
                      name="halfDayPeriod"
                      value="SECOND_HALF"
                      checked={halfDayPeriod === "SECOND_HALF"}
                      onChange={() => setHalfDayPeriod("SECOND_HALF")}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-4 w-4 shrink-0 aspect-square items-center justify-center rounded-full border-2 transition-all ${halfDayPeriod === "SECOND_HALF"
                        ? "border-[#F97316] bg-white"
                        : "border-slate-300 bg-white"
                        }`}
                    >
                      {halfDayPeriod === "SECOND_HALF" && (
                        <span className="h-2 w-2 rounded-full bg-[#F97316]" />
                      )}
                    </span>
                    Second half
                  </label>
                </div>
              </fieldset>
            )}
          </div>

          <div>
            <label htmlFor="leaveReason" className="mb-1 block text-xs font-bold text-slate-700">
              Reason for Leave
            </label>
            <textarea
              id="leaveReason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain reason for leave..."
              className="w-full rounded-xl border border-slate-300 p-3 text-xs font-semibold focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || leaveTypes.length === 0}
              className="cursor-pointer rounded-xl bg-[#F97316] px-5 py-2 text-xs font-extrabold text-white shadow-xs transition-all hover:bg-[#EA580C] disabled:opacity-50"
            >
              {submitting
                ? editingRequest
                  ? "Updating..."
                  : "Submitting..."
                : editingRequest
                  ? "Update Leave Request"
                  : "Submit Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
