"use client";

import { useActionState, useRef, useState } from "react";
import { Paperclip, Camera, X } from "lucide-react";

import { createTicket } from "@/lib/support/actions";
import { ALL_CATEGORIES, ALL_PRIORITIES, CATEGORY_LABELS, MAX_ATTACHMENTS, PRIORITY_LABELS } from "@/lib/support/definitions";
import type { SupportTicketPriority } from "@/types/database.types";

const priorityStyles: Record<SupportTicketPriority, { selected: string; unselected: string }> = {
  low: { selected: "bg-gray-200 text-gray-700", unselected: "border border-gray-300 text-gray-500" },
  medium: { selected: "bg-amber-100 text-amber-800", unselected: "border border-amber-300 text-amber-700" },
  high: { selected: "bg-indigo-100 text-indigo-800", unselected: "border border-indigo-300 text-indigo-700" },
  urgent: { selected: "bg-red-100 text-red-800", unselected: "border border-red-300 text-red-700" },
};

export function NewTicketForm() {
  const [state, formAction, pending] = useActionState(createTicket, undefined);
  const [priority, setPriority] = useState<SupportTicketPriority>("medium");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setAttachments((prev) => [...prev, ...Array.from(fileList)].slice(0, MAX_ATTACHMENTS));
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);

    if (imageFiles.length > 0) {
      setAttachments((prev) => [...prev, ...imageFiles].slice(0, MAX_ATTACHMENTS));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.delete("attachments");
    attachments.forEach((file) => formData.append("attachments", file));
    formAction(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <label className="flex flex-col text-xs font-medium text-gray-600">
        Category
        <select
          name="category"
          defaultValue="question"
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        >
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-600">Priority</p>
        <input type="hidden" name="priority" value={priority} />
        <div className="flex gap-2">
          {ALL_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                priority === p ? priorityStyles[p].selected : priorityStyles[p].unselected
              }`}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col text-xs font-medium text-gray-600">
        Subject
        <input
          name="subject"
          placeholder="Brief summary of the issue"
          required
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />
        {state?.errors?.subject && <p className="mt-1 text-xs text-red-600">{state.errors.subject[0]}</p>}
      </label>

      <label className="flex flex-col text-xs font-medium text-gray-600">
        Description
        <textarea
          name="description"
          onPaste={handlePaste}
          placeholder="What happened, and what did you expect instead?"
          rows={4}
          required
          className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-accent)] focus:outline-none"
        />
        {state?.errors?.description && <p className="mt-1 text-xs text-red-600">{state.errors.description[0]}</p>}
        <span className="mt-1 text-[11px] text-gray-400">Tip: you can paste a screenshot directly into this box.</span>
      </label>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600">Attachments</p>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Paperclip className="h-3.5 w-3.5" /> Attach files
            </button>
            <button
              type="button"
              title="Attach a screenshot file"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Camera className="h-3.5 w-3.5" /> Screenshot
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          {attachments.length} of {MAX_ATTACHMENTS} attached
        </p>
        {attachments.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {attachments.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-xs text-gray-600"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-2 shrink-0 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[#06323A] hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
