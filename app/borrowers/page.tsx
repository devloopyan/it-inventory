import { redirect } from "next/navigation";

export default function BorrowersRedirectPage() {
  redirect("/dashboard");
}
