export type InternalRole = "manager" | "business_user";

export interface AuthenticatedUser {
  id: string;
  role: InternalRole;
}
