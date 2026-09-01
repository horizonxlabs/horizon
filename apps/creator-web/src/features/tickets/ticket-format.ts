const ticketDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function formatTicketLabel(value: string): string {
  const label = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "Not specified";
}

export function formatTicketDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : ticketDateFormatter.format(date);
}
