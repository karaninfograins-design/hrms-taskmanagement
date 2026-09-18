"use client";

import { FormEvent, useState } from "react";
import { createAdmin } from "@/services/admin.service";

type CreateAdminFormProps = { token: string };

export function CreateAdminForm({ token }: CreateAdminFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    try {
      const response = await createAdmin({ name, email, password }, token);
      setMessage(`Administrator ${response.admin.email} was created successfully.`);
      setName(""); setEmail(""); setPassword("");
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : "Unable to create administrator");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <form className="form-card" onSubmit={handleSubmit}><div className="card-heading"><p className="eyebrow">TEAM ACCESS</p><h2>Create administrator</h2><p>New administrators are created with active status.</p></div><label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya Sharma" required /></label><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com" required /></label><label>Temporary password<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" required /></label>{message && <p className={message.includes("successfully") ? "success-message" : "error-message"} role="status">{message}</p>}<button className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Creating administrator..." : "Create administrator"}</button></form>;
}
