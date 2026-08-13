export type InternalRole = "manager";

export interface AuthenticatedUser {
  id: string;
  role: InternalRole;
}
