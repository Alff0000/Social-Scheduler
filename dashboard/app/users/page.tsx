import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listUsers } from "@/lib/users";
import { UsersView } from "@/components/users-view";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.is_admin) {
    redirect("/");
  }
  const users = listUsers();
  return <UsersView initialUsers={users} currentUserId={user.id} />;
}
