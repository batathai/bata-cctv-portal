import type { IncidentTicket, TicketIssueType, TicketStatus } from "@/types/database";

export const TICKET_ISSUE_TYPES: TicketIssueType[] = [
  "Camera Failure",
  "Playback Failure",
  "HDD Failure",
  "NVR Offline",
  "Network Failure",
  "Hik-Connect Failure",
];

export const TICKET_STATUSES: TicketStatus[] = ["Open", "Assigned", "In Progress", "Waiting Parts", "Completed", "Closed"];

/** A ticket still being worked (not Completed or Closed). */
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["Open", "Assigned", "In Progress", "Waiting Parts"];

export function hasOpenTicket(storeId: string, tickets: IncidentTicket[]): boolean {
  return tickets.some((t) => t.store_id === storeId && OPEN_TICKET_STATUSES.includes(t.status));
}

export function ticketsForStore(storeId: string, tickets: IncidentTicket[]): IncidentTicket[] {
  return tickets
    .filter((t) => t.store_id === storeId)
    .sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));
}
