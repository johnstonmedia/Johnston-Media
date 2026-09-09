/** Small hand-rolled validation — no schema library needed for these forms. */

export interface FieldErrors {
  [field: string]: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Trims, collapses whitespace and caps length to keep stored data sane. */
export function clean(value: unknown, maxLength = 500): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Same as clean() but preserves newlines for message/detail fields. */
export function cleanMultiline(value: unknown, maxLength = 4000): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export interface QuoteInput {
  name: string;
  email: string;
  phone: string;
  serviceType: string;
  projectName: string;
  date: string;
  location: string;
  budget: string;
  details: string;
  source: "media" | "web";
  /** Id of the package the client picked, when they picked one. */
  packageId?: string;
  /** Honeypot — must be empty. Bots fill it in. */
  company?: string;
}

export function validateQuote(body: Record<string, unknown>): {
  errors: FieldErrors;
  value: QuoteInput;
} {
  const value: QuoteInput = {
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 40),
    serviceType: clean(body.serviceType, 120),
    projectName: clean(body.projectName, 160),
    date: clean(body.date, 60),
    location: clean(body.location, 160),
    budget: clean(body.budget, 60),
    details: cleanMultiline(body.details, 4000),
    source: body.source === "web" ? "web" : "media",
    packageId: clean(body.packageId, 60) || undefined,
    company: clean(body.company, 100),
  };

  const errors: FieldErrors = {};
  if (!value.name) errors.name = "Please enter your name.";
  if (!value.email) errors.email = "Please enter your email.";
  else if (!isEmail(value.email)) errors.email = "That email doesn't look right.";
  if (!value.serviceType) errors.serviceType = "Please choose a service.";
  if (!value.projectName) errors.projectName = "Please name your project.";

  return { errors, value };
}

export interface ContactInput {
  name: string;
  email: string;
  message: string;
  company?: string;
}

export function validateContact(body: Record<string, unknown>): {
  errors: FieldErrors;
  value: ContactInput;
} {
  const value: ContactInput = {
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    message: cleanMultiline(body.message, 4000),
    company: clean(body.company, 100),
  };

  const errors: FieldErrors = {};
  if (!value.name) errors.name = "Please enter your name.";
  if (!value.email) errors.email = "Please enter your email.";
  else if (!isEmail(value.email)) errors.email = "That email doesn't look right.";
  if (!value.message) errors.message = "Please write a message.";
  else if (value.message.length < 10)
    errors.message = "Tell me a little more — at least 10 characters.";

  return { errors, value };
}
