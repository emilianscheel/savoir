import { createClient } from "@butterbase/sdk";

export const butterbase = createClient({
  appId: process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID!,
  apiUrl: process.env.NEXT_PUBLIC_BUTTERBASE_API_URL!,
});

export interface Account {
  id: string;
  email: string;
  plan: string;
  status: string;
  created_at: string;
}
