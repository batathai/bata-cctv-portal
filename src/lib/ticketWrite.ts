import type { TicketIssueType, TicketStatus } from "@/types/database";

// See src/lib/importWrite.ts for why this is `any`.
type SupabaseClient = any;

export interface TicketFormInput {
  store_id: string;
  issue_type: TicketIssueType;
  description?: string | null;
}

export async function createIncidentTicketDb(supabase: SupabaseClient, input: TicketFormInput) {
  const { data, error } = await supabase
    .from("incident_tickets")
    .insert({
      store_id: input.store_id,
      issue_type: input.issue_type,
      description: input.description || null,
      status: "Open",
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create ticket: ${error.message}`);
  return data;
}

export async function updateIncidentTicketStatusDb(supabase: SupabaseClient, ticketId: string, status: TicketStatus) {
  const patch: Record<string, any> = { status };
  if (status === "Closed") patch.closed_at = new Date().toISOString();
  const { error } = await supabase.from("incident_tickets").update(patch).eq("id", ticketId);
  if (error) throw new Error(`Failed to update ticket: ${error.message}`);
}
